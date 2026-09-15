/** Uploads.
 *
 *  Entrada de dados do BI: o administrador envia os exports do Protheus e ve na
 *  hora o que foi aceito. A validacao acontece no servidor antes de gravar, entao
 *  um arquivo com coluna faltando falha inteiro em vez de entrar pela metade.
 *
 *  O processamento e sincrono e leva alguns segundos — o estado de "processando"
 *  nao e enfeite: sem ele o usuario reenvia achando que travou.
 */

import { ResultadoArquivo, useUploads } from "@entidades/carga";
import { useState } from "react";

import { ErroApi } from "@compartilhado/api/cliente";
import { Button } from "@compartilhado/ui/atomos/button";
import { Field, FieldGroup, FieldLabel } from "@compartilhado/ui/atomos/field";
import { Input } from "@compartilhado/ui/atomos/input";
import { Spinner } from "@compartilhado/ui/atomos/spinner";
import { Tabela, type Coluna } from "@compartilhado/ui/organismos/Tabela";
import { CabecalhoPagina, Erro, Secao } from "@compartilhado/ui";
import { inteiro } from "@compartilhado/lib/formato";
import { AcoesCarga } from "./componentes/AcoesCarga";
import { DetalheCarga } from "./componentes/DetalheCarga";
import { HistoricoCargas } from "./componentes/HistoricoCargas";
import { Situacao } from "./componentes/Situacao";

const CAMPOS = [
  { nome: "SB2", rotulo: "SB2 — Saldos e custo de estoque" },
  { nome: "SC5", rotulo: "SC5 — Cabecalho dos pedidos" },
  { nome: "SC6", rotulo: "SC6 — Itens dos pedidos (carteira em aberto)" },
  { nome: "SD1", rotulo: "SD1 — Itens de notas de entrada" },
  { nome: "SD2", rotulo: "SD2 — Itens faturados" },
] as const;

export function Uploads() {
  const [arquivos, setArquivos] = useState<Record<string, File>>({});
  const envio = useUploads();
  const [detalhe, setDetalhe] = useState<number | null>(null);

  // Colunas dentro do componente: a acao abre o detalhe, que e estado da tela.
  const COLUNAS: readonly Coluna<ResultadoArquivo>[] = [
    { chave: null, rotulo: "Arquivo", fixa: true, celula: (l) => l.arquivo },
    {
      chave: null,
      rotulo: "Situação",
      celula: (l) => (
        <div>
          <Situacao status={l.status} />
          {/* Mensagem de erro inteira alargava a coluna e espremia as numericas;
              o texto completo fica no title e no detalhe. */}
          {l.mensagem && (
            <div className="max-w-60 truncate text-xs text-muted-foreground" title={l.mensagem}>
              {l.mensagem}
            </div>
          )}
        </div>
      ),
    },
    { chave: null, rotulo: "Linhas lidas", num: true, celula: (l) => inteiro(l.linhas_lidas) },
    {
      chave: null,
      rotulo: "Linhas gravadas",
      num: true,
      celula: (l) => inteiro(l.linhas_gravadas),
    },
    { chave: null, rotulo: "Competência", celula: (l) => l.competencia ?? "—" },
    {
      chave: null,
      rotulo: "Ações",
      acao: true,
      celula: (l) => <AcoesCarga arquivo={l.arquivo} aoVerDetalhes={() => setDetalhe(l.id)} />,
    },
  ];

  const selecionados = Object.keys(arquivos);
  const erro =
    envio.error instanceof ErroApi
      ? envio.error.message
      : envio.error
        ? "Falha inesperada ao carregar os arquivos."
        : null;

  function escolher(nome: string, arquivo: File | undefined) {
    setArquivos((atual) => {
      const proximo = { ...atual };
      if (arquivo) proximo[nome] = arquivo;
      else delete proximo[nome];
      return proximo;
    });
  }

  function enviar() {
    const dados = new FormData();
    for (const [nome, arquivo] of Object.entries(arquivos)) {
      dados.append(nome, arquivo);
    }
    envio.mutate(dados);
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Uploads"
        descricao="Envie os arquivos exportados do Protheus. Você pode mandar um, dois ou os cinco — o que não for enviado permanece como está. O envio substitui a competência inteira contida no arquivo, então reenviar o mesmo mês é seguro."
      />

      <div>
        <Secao titulo="Arquivos do Protheus">
          {/* Largura toda, alinhada ao historico: os campos se repartem em grade para
              nao virar cinco inputs de 1.200 px com o botao "Escolher" perdido. */}
          <FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
            {CAMPOS.map((campo) => (
              <Field key={campo.nome}>
                <FieldLabel htmlFor={`arquivo-${campo.nome}`}>{campo.rotulo}</FieldLabel>
                <Input
                  id={`arquivo-${campo.nome}`}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={envio.isPending}
                  onChange={(e) => escolher(campo.nome, e.target.files?.[0])}
                />
              </Field>
            ))}
          </FieldGroup>

          <div className="mt-5 flex flex-col gap-2">
            <Button
              onClick={enviar}
              disabled={selecionados.length === 0 || envio.isPending}
              className="w-fit"
            >
              {envio.isPending && <Spinner data-icon="inline-start" />}
              {envio.isPending
                ? "Processando… isso leva alguns segundos"
                : `Enviar ${selecionados.length || ""} arquivo${
                    selecionados.length === 1 ? "" : "s"
                  }`}
            </Button>

            {envio.isPending && (
              <p className="text-xs text-muted-foreground" role="status">
                Validando, gravando no banco e atualizando os indicadores. Não feche a
                página.
              </p>
            )}
          </div>
        </Secao>
      </div>

      {erro && (
        <div className="mt-4">
          <Erro mensagem={erro} />
        </div>
      )}

      {envio.data && (
        <div className="mt-5">
          <Secao titulo="Resultado">
            <Tabela
              linhas={envio.data.arquivos}
              colunas={COLUNAS}
              chaveLinha={(l) => l.arquivo}
              rotuloAcessivel="Resultado do envio por arquivo"
            />
          </Secao>
        </div>
      )}

      <div className="mt-5">
        <Secao titulo="Histórico de importações">
          <HistoricoCargas aoVerDetalhes={setDetalhe} />
        </Secao>
      </div>

      {detalhe !== null && <DetalheCarga id={detalhe} aoFechar={() => setDetalhe(null)} />}
    </>
  );
}
