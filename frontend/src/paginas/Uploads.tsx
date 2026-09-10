/** Uploads.
 *
 *  Entrada de dados do BI: o administrador envia os exports do Protheus e ve na
 *  hora o que foi aceito. A validacao acontece no servidor antes de gravar, entao
 *  um arquivo com coluna faltando falha inteiro em vez de entrar pela metade.
 *
 *  O processamento e sincrono e leva alguns segundos — o estado de "processando"
 *  nao e enfeite: sem ele o usuario reenvia achando que travou.
 */

import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { ErroApi } from "@compartilhado/api/cliente";
import { useUploads } from "../api/hooks";
import type { ResultadoArquivo } from "../api/tipos";
import { Button } from "@compartilhado/ui/atomos/button";
import { Field, FieldGroup, FieldLabel } from "@compartilhado/ui/atomos/field";
import { Input } from "@compartilhado/ui/atomos/input";
import { Spinner } from "@compartilhado/ui/atomos/spinner";
import { Erro } from "../componentes/Layout";
import { Tabela, type Coluna } from "../componentes/Tabela";
import { Secao } from "@compartilhado/ui";
import { CabecalhoPagina } from "@widgets/cabecalho-pagina";
import { inteiro } from "@compartilhado/lib/formato";

const CAMPOS = [
  { nome: "SB2", rotulo: "SB2 — Saldos e custo de estoque" },
  { nome: "SC5", rotulo: "SC5 — Cabecalho dos pedidos" },
  { nome: "SC6", rotulo: "SC6 — Itens dos pedidos (carteira em aberto)" },
  { nome: "SD1", rotulo: "SD1 — Itens de notas de entrada" },
  { nome: "SD2", rotulo: "SD2 — Itens faturados" },
] as const;

const COLUNAS: readonly Coluna<ResultadoArquivo>[] = [
  { chave: null, rotulo: "Arquivo", fixa: true, celula: (l) => l.arquivo },
  {
    chave: null,
    rotulo: "Situação",
    // Icone + rotulo, nunca a cor sozinha: no modo claro o verde de sucesso
    // fica abaixo de 3:1 contra o cartao.
    celula: (l) => (
      <div>
        <span
          className={
            l.status === "sucesso"
              ? "flex items-center gap-1 text-delta-bom"
              : "flex items-center gap-1 text-destructive"
          }
        >
          {l.status === "sucesso" ? (
            <CheckIcon className="size-4" aria-hidden="true" />
          ) : (
            <XIcon className="size-4" aria-hidden="true" />
          )}
          {l.status === "sucesso" ? "Carregado" : "Erro"}
        </span>
        {l.mensagem && <div className="text-xs text-muted-foreground">{l.mensagem}</div>}
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
];

export function Uploads() {
  const [arquivos, setArquivos] = useState<Record<string, File>>({});
  const envio = useUploads();

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

      <div className="max-w-2xl">
        <Secao titulo="Arquivos do Protheus">
          <FieldGroup>
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
    </>
  );
}
