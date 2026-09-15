/** Detalhe de uma importacao: o que chegou, o que a limpeza fez e o que entrou.
 *
 *  A ordem das secoes segue o caminho do dado — arquivo, volume, qualidade —
 *  porque a pergunta que traz alguem aqui e "por que o numero nao bate com o
 *  Protheus", e ela se responde descendo o funil.
 */

import { useCarga, type DetalheCarga as Detalhe } from "@entidades/carga";
import { TriangleAlertIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@compartilhado/ui/atomos/dialog";
import { Spinner } from "@compartilhado/ui/atomos/spinner";
import { Erro } from "@compartilhado/ui";
import { competencia, inteiro, percentual } from "@compartilhado/lib/formato";
import { Situacao } from "./Situacao";
import { dataHora, duracao, tamanho } from "../modelo/formato";

const ESTRATEGIAS: Record<string, string> = {
  snapshot: "Fotografia do dia (substitui a carga da mesma data)",
  periodo: "Substituição da competência inteira",
  upsert: "Atualização por chave (upsert)",
};

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t pt-3">
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

export function ConteudoDetalhe({ carga }: { carga: Detalhe }) {
  const a = carga.auditoria;
  const invalidos = [
    ...Object.entries(a.numeros_invalidos ?? {}).map(([c, n]) => `${c}: ${inteiro(n)} números`),
    ...Object.entries(a.datas_invalidas ?? {}).map(([c, n]) => `${c}: ${inteiro(n)} datas`),
  ];

  return (
    <div className="flex flex-col gap-3">
      {carga.mensagem && <Erro mensagem={carga.mensagem} />}

      {carga.avisos.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-status-atencao/40 bg-status-atencao/10 p-3 text-sm">
          {carga.avisos.map((aviso) => (
            <li key={aviso} className="flex gap-2">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {aviso}
            </li>
          ))}
        </ul>
      )}

      <Bloco titulo="Arquivo">
        <Linha rotulo="Situação">
          <Situacao status={carga.status} />
        </Linha>
        <Linha rotulo="Nome enviado">{carga.nome_original || "—"}</Linha>
        <Linha rotulo="Tamanho">{tamanho(carga.tamanho_bytes)}</Linha>
        <Linha rotulo="SHA-256">
          <code className="font-mono text-xs">{carga.sha256 || "—"}</code>
        </Linha>
        <Linha rotulo="Enviado por">
          {carga.usuario ?? "—"} ({carga.origem === "upload" ? "tela" : "linha de comando"})
        </Linha>
        <Linha rotulo="Data">{dataHora(carga.criado_em)}</Linha>
        <Linha rotulo="Duração">{duracao(carga.duracao_ms)}</Linha>
        <Linha rotulo="Competências">
          {carga.competencias.length ? carga.competencias.map(competencia).join(", ") : "—"}
        </Linha>
        {carga.mesmo_lote.length > 0 && (
          <Linha rotulo="Mesmo envio">
            {carga.mesmo_lote.map((o) => `${o.arquivo} (${o.status})`).join(", ")}
          </Linha>
        )}
      </Bloco>

      <Bloco titulo="Volume">
        <Linha rotulo="Linhas no CSV">{a.linhas_brutas != null ? inteiro(a.linhas_brutas) : "—"}</Linha>
        <Linha rotulo="Obrigatória vazia">
          {inteiro(a.descartadas_obrigatorias ?? 0)}
          {a.colunas_obrigatorias?.length ? ` (${a.colunas_obrigatorias.join(", ")})` : ""}
        </Linha>
        <Linha rotulo="Duplicatas">{inteiro(a.duplicatas_removidas ?? 0)}</Linha>
        <Linha rotulo="Linhas válidas">{inteiro(carga.linhas_lidas)}</Linha>
        <Linha rotulo="Linhas gravadas">{inteiro(carga.linhas_gravadas)}</Linha>
        {a.linhas_substituidas != null && (
          <Linha rotulo="Substituídas">{inteiro(a.linhas_substituidas)}</Linha>
        )}
        {a.estrategia && <Linha rotulo="Estratégia">{ESTRATEGIAS[a.estrategia] ?? a.estrategia}</Linha>}
      </Bloco>

      <Bloco titulo="Qualidade">
        <Linha rotulo="Colunas ausentes">
          {a.colunas_ausentes?.length ? a.colunas_ausentes.join(", ") : "nenhuma"}
        </Linha>
        <Linha rotulo="Opcionais ausentes">
          {a.opcionais_ausentes?.length ? a.opcionais_ausentes.join(", ") : "nenhuma"}
        </Linha>
        <Linha rotulo="Valores inválidos">{invalidos.length ? invalidos.join("; ") : "nenhum"}</Linha>
        {a.sem_competencia != null && (
          <Linha rotulo="Sem competência">{inteiro(a.sem_competencia)}</Linha>
        )}
        {a.divergencia_aritmetica && (
          <Linha rotulo="Divergência de total">
            {inteiro(a.divergencia_aritmetica.linhas)} linhas (
            {percentual(a.divergencia_aritmetica.proporcao)} — limite{" "}
            {percentual(a.divergencia_aritmetica.limite)})
          </Linha>
        )}
        {a.linhas_quantidade_zero != null && (
          <Linha rotulo="Quantidade zero">
            {inteiro(a.linhas_quantidade_zero)} (fora da conferência)
          </Linha>
        )}
      </Bloco>
    </div>
  );
}

export function DetalheCarga({ id, aoFechar }: { id: number; aoFechar: () => void }) {
  const { data, isLoading, error } = useCarga(id);

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importação {data ? `${data.arquivo} #${data.id}` : ""}</DialogTitle>
          <DialogDescription>Auditoria do arquivo recebido e do que entrou no BI.</DialogDescription>
        </DialogHeader>
        {isLoading && <Spinner />}
        {error && <Erro mensagem={error.message} />}
        {data && <ConteudoDetalhe carga={data} />}
      </DialogContent>
    </Dialog>
  );
}
