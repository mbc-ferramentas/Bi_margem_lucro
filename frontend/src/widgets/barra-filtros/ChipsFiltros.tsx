import { XIcon } from "lucide-react";

import type { Filtros } from "@/api/tipos";
import { dataLonga } from "@compartilhado/lib/formato";
import { Badge as BadgeUi } from "@compartilhado/ui/atomos/badge";
import { Button } from "@compartilhado/ui/atomos/button";

const ROTULOS_FILTRO: Partial<Record<keyof Filtros, string>> = {
  data_inicio: "De",
  data_fim: "Até",
  canal: "Canal",
  armazem: "Armazém",
  vendedor: "Vendedores",
  grupo: "Grupos",
  situacao: "Situação",
  busca: "Busca",
};

/** O valor do chip como o usuario escreveu na tela: a data vai em ISO para a API,
 *  mas ninguem le "2026-07-01" como 1o de julho. */
function textoDoChip(chave: keyof Filtros, item: string | string[]): string {
  if (Array.isArray(item)) return item.join(", ");
  return chave === "data_inicio" || chave === "data_fim" ? dataLonga(item) : item;
}

export function ChipsFiltros({ valor, aoMudar }: { valor: Filtros; aoMudar: (filtros: Filtros) => void }) {
  const ativos = Object.entries(valor).filter(([, item]) =>
    Array.isArray(item) ? item.length > 0 : Boolean(item),
  ) as [keyof Filtros, string | string[]][];
  if (!ativos.length) return null;

  function remover(chave: keyof Filtros) {
    const seguintes = { ...valor };
    delete seguintes[chave];
    // Trocar de armazem invalida o grupo escolhido: o recorte novo pode nao
    // conter nenhum, e a tela ficaria vazia sem explicar por que.
    if (chave === "armazem") seguintes.grupo = [];
    aoMudar(seguintes);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
      aria-label={`${ativos.length} filtros ativos`}
    >
      <span>Filtros ativos</span>
      {ativos.map(([chave, item]) => (
        <BadgeUi
          key={chave}
          variant="outline"
          render={
            <button type="button" onClick={() => remover(chave)} aria-label={`Remover filtro ${ROTULOS_FILTRO[chave] ?? chave}`} />
          }
          className="cursor-pointer gap-1 hover:border-ring"
        >
          <span className="font-semibold text-foreground">{ROTULOS_FILTRO[chave] ?? chave}:</span>
          <span className="max-w-40 truncate">{textoDoChip(chave, item)}</span>
          <XIcon aria-hidden="true" />
        </BadgeUi>
      ))}
      <Button type="button" variant="link" size="sm" onClick={() => aoMudar({})}>
        Limpar tudo
      </Button>
    </div>
  );
}
