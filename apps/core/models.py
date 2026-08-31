"""Models de cadastro — as regras de negocio que o time ajusta pelo Admin.

Nada aqui participa da agregacao analitica: a margem e calculada em SQL sobre as
materialized views. Estes models existem para parametrizar esse calculo.
"""

from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models

# Codigo do vendedor no Protheus que representa o integrador de marketplace.
# Nao e uma pessoa: concentra Amazon, Magalu, Shopee e Mercado Livre.
CODIGO_INTEGRADOR_MARKETPLACE = "72"

GRUPO_SEM_CLASSIFICACAO = "Sem grupo"

# Armazem e a dimensao de fora da hierarquia (armazem > grupo). Dois vazios
# diferentes: a linha sem armazem preenchido e o armazem que existe no Protheus
# mas ninguem nomeou ainda — este continua visivel, com o codigo cru, para nao
# sumir da tela somando receita em silencio.
ARMAZEM_SEM_CODIGO = "Sem armazem"
SUFIXO_SEM_CADASTRO = " - sem cadastro"


class Usuario(AbstractUser):
    """Usuario do BI.

    Customizado desde a primeira migration porque trocar AUTH_USER_MODEL depois
    exige recriar o banco.
    """

    protegido = models.BooleanField(
        "protegido",
        default=False,
        help_text=(
            "Conta administrativa de emergencia. Nao pode ser alterada nem removida "
            "pela interface — so por acesso direto ao banco."
        ),
    )

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"

    def __str__(self) -> str:
        return self.get_full_name() or self.username

    def delete(self, *args, **kwargs):
        # Barreira no ORM, nao so no Admin: um script ou shell tambem nao remove.
        if self.protegido:
            raise ValidationError(
                f"O usuario '{self.username}' e protegido e nao pode ser removido "
                f"pela aplicacao. Altere direto no banco se for realmente necessario."
            )
        return super().delete(*args, **kwargs)


class Canal(models.TextChoices):
    MARKETPLACE = "Marketplace", "Marketplace"
    VENDA_INTERNA = "Venda interna", "Venda interna"
    BALCAO_PDV = "Balcao-PDV", "Balcao / PDV"
    SEM_CADASTRO = "(pedido sem cadastro)", "Pedido sem cadastro"


class ParamOutlier(models.Model):
    """Regra 2 — corte de quarentena de outlier de custo.

    Linhas com margem percentual abaixo do limite saem do KPI consolidado, mas
    continuam gravadas e no faturamento. O default -1.0 significa "custo maior que
    o dobro do preco", que em 07/2026 isola 215 linhas (0,3% da receita) — quase
    todas erro de cadastro, nao prejuizo real.

    Margem entre o limite e zero PERMANECE no KPI: prejuizo plausivel (queima de
    estoque, promocao) precisa ficar visivel.
    """

    limite = models.DecimalField(
        "limite de margem",
        max_digits=6,
        decimal_places=4,
        default=Decimal("-1.0"),
        help_text="Margem percentual minima aceita. -1.0 = custo maior que o dobro do preco.",
    )
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "parametro de outlier"
        verbose_name_plural = "parametro de outlier"

    def __str__(self) -> str:
        return f"corte em {self.limite:.0%}"

    def save(self, *args, **kwargs):
        # Singleton: um unico registro, sempre pk=1.
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("O parametro de outlier nao pode ser removido.")

    @classmethod
    def limite_atual(cls) -> Decimal:
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj.limite


class MapaGrupo(models.Model):
    """Rotulo de negocio para o codigo de grupo do Protheus.

    'agrupa_em' consolida caudas: o Protheus separa 0129 (acessorios de
    e-commerce) de 0128, e o negocio quer os dois no mesmo balde. A fusao mora
    aqui, e nao no SQL, porque grupo novo do ERP aparece sem aviso — cadastrar
    e rodar refresh_views resolve, sem migration.
    """

    codigo = models.CharField("codigo", max_length=10, primary_key=True)
    rotulo = models.CharField("rotulo", max_length=80)
    agrupa_em = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subgrupos",
        verbose_name="agrupar em",
        help_text=(
            "Grupo dentro do qual este deve ser somado no BI. Em branco = grupo "
            "proprio. Um nivel so: o destino nao pode estar agrupado em outro."
        ),
    )
    ativo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "grupo"
        verbose_name_plural = "grupos"
        ordering = ["codigo"]

    def __str__(self) -> str:
        return f"{self.codigo} — {self.rotulo}"

    def clean(self) -> None:
        # A view resolve um unico salto. Sem esta guarda, uma cadeia
        # A -> B -> C somaria A em B e ninguem perceberia que C foi ignorado.
        if self.agrupa_em_id is None:
            return
        if self.agrupa_em_id == self.codigo:
            raise ValidationError({"agrupa_em": "Um grupo nao pode agrupar em si mesmo."})
        destino = MapaGrupo.objects.filter(codigo=self.agrupa_em_id).first()
        if destino is not None and destino.agrupa_em_id:
            raise ValidationError(
                {
                    "agrupa_em": (
                        f"{destino.codigo} ja esta agrupado em {destino.agrupa_em_id}; "
                        "aponte direto para o grupo final."
                    )
                }
            )
        if self.subgrupos.exists():
            raise ValidationError(
                {"agrupa_em": "Outros grupos ja apontam para este; ele precisa ser o grupo final."}
            )


class MapaArmazem(models.Model):
    """Rotulo de negocio para o codigo de armazem do Protheus.

    O armazem e a dimensao externa da leitura do BI (armazem > grupo): o mesmo
    grupo aparece em varios armazens, entao grupo sozinho nao organiza a analise.

    Codigo com dois digitos ('01', '02', '13'), padronizado no ETL — o CSV manda
    '1' e '2'. Armazem sem cadastro aqui continua aparecendo nas telas como
    '20 - sem cadastro'; nomear e trabalho de Admin, nao de deploy.
    """

    codigo = models.CharField("codigo", max_length=10, primary_key=True)
    rotulo = models.CharField("rotulo", max_length=80)
    ativo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "armazem"
        verbose_name_plural = "armazens"
        ordering = ["codigo"]

    def __str__(self) -> str:
        return f"{self.codigo} — {self.rotulo}"


class ReclassificacaoSKU(models.Model):
    """Reclassificacao manual de SKU sem grupo no Protheus.

    Em 07/2026 sao 2.251 linhas de venda (R$ 1.126.245 = 11,5% da receita) sem
    grupo preenchido. Elas aparecem como '(sem classificacao)' ate que alguem do
    negocio as classifique aqui — nunca sao somadas silenciosamente em outro grupo.
    """

    sku = models.CharField("SKU", max_length=30, primary_key=True)
    grupo = models.ForeignKey(MapaGrupo, on_delete=models.PROTECT, verbose_name="grupo")
    observacao = models.CharField("observacao", max_length=200, blank=True)
    classificado_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True
    )
    classificado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "reclassificacao de SKU"
        verbose_name_plural = "reclassificacoes de SKU"
        ordering = ["sku"]

    def __str__(self) -> str:
        return f"{self.sku} -> {self.grupo_id}"


class MapaTES(models.Model):
    """Tipo de saida do Protheus (D2_TES) -> a linha conta como venda ou nao.

    O export de 07/2026 traz 32 codigos. O 600 concentra 71% da receita; os demais
    podem ser remessa, bonificacao, transferencia ou industrializacao — que nao sao
    venda e nao deveriam entrar na margem.

    Nada e excluido por suposicao: todo TES nasce com `gera_receita=True` e continua
    somando no faturamento ate que alguem do negocio o desmarque aqui. E o mesmo
    principio da Regra 4 (grupo vazio nunca vira Agricola em silencio) aplicado ao
    tipo de saida.
    """

    codigo = models.CharField("codigo", max_length=10, primary_key=True)
    descricao = models.CharField("descricao", max_length=120, blank=True)
    gera_receita = models.BooleanField(
        "conta como venda",
        default=True,
        help_text=(
            "Desmarque para tirar do KPI de margem as saidas que nao sao venda "
            "(remessa, bonificacao, transferencia). Exige refresh_views."
        ),
    )

    class Meta:
        verbose_name = "tipo de saida (TES)"
        verbose_name_plural = "tipos de saida (TES)"
        ordering = ["codigo"]

    def __str__(self) -> str:
        return f"{self.codigo} — {self.descricao or 'sem descricao'}"


class MapaCanal(models.Model):
    """Codigo de vendedor do Protheus -> canal de venda.

    Regra 1: canal e vendedor sao dimensoes distintas. O codigo 72 e o integrador
    Lexos (marketplace), responsavel por 94% dos pedidos e 68,5% da receita — nao
    e uma pessoa e nao entra em ranking de vendedor.
    """

    codigo_vendedor = models.CharField("codigo do vendedor", max_length=10, primary_key=True)
    canal = models.CharField("canal", max_length=30, choices=Canal.choices)
    observacao = models.CharField("observacao", max_length=200, blank=True)

    class Meta:
        verbose_name = "mapa de canal"
        verbose_name_plural = "mapa de canais"
        ordering = ["codigo_vendedor"]

    def __str__(self) -> str:
        return f"{self.codigo_vendedor} -> {self.canal}"


class Vendedor(models.Model):
    """Vendedor do Protheus, opcionalmente ligado a um usuario do BI.

    O vinculo com `usuario` e o que sustenta o RBAC: o perfil 'vendedor' so
    enxerga linhas cujo codigo esteja ligado ao seu proprio usuario.
    """

    codigo = models.CharField("codigo", max_length=10, primary_key=True)
    nome = models.CharField("nome", max_length=120)
    usuario = models.OneToOneField(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vendedor",
        verbose_name="usuario do BI",
        help_text="Vinculo que define o que o perfil 'vendedor' enxerga.",
    )
    ativo = models.BooleanField(default=True)

    class Meta:
        verbose_name = "vendedor"
        verbose_name_plural = "vendedores"
        ordering = ["nome"]

    def __str__(self) -> str:
        return f"{self.codigo} — {self.nome}"

    @property
    def e_integrador(self) -> bool:
        return self.codigo == CODIGO_INTEGRADOR_MARKETPLACE


class ExecucaoCarga(models.Model):
    """Auditoria de cada execucao do ETL.

    Serve para responder "de onde veio esse numero" quando o negocio questionar.
    """

    class Status(models.TextChoices):
        SUCESSO = "sucesso", "Sucesso"
        ERRO = "erro", "Erro"

    arquivo = models.CharField("arquivo", max_length=10)
    competencia = models.DateField("competencia", null=True, blank=True)
    dt_carga = models.DateField("data da carga")
    linhas_lidas = models.IntegerField("linhas lidas", default=0)
    linhas_gravadas = models.IntegerField("linhas gravadas", default=0)
    status = models.CharField(max_length=10, choices=Status.choices)
    mensagem = models.TextField("mensagem", blank=True)
    caminho_parquet = models.CharField("parquet", max_length=300, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "execucao de carga"
        verbose_name_plural = "execucoes de carga"
        ordering = ["-criado_em"]
        indexes = [models.Index(fields=["arquivo", "-criado_em"])]

    def __str__(self) -> str:
        return f"{self.arquivo} {self.competencia or ''} — {self.status}"
