import { useCargas, type ExecucaoCarga } from "@entidades/carga";
import { useState } from "react";

import { Badge, Erro } from "@compartilhado/ui";
import { Tabela, type Coluna } from "@compartilhado/ui/organismos/Tabela";
import { inteiro } from "@compartilhado/lib/formato";
import { AcoesCarga } from "./AcoesCarga";
import { Situacao } from "./Situacao";
import { dataHora } from "../modelo/formato";

export function HistoricoCargas({ aoVerDetalhes }: { aoVerDetalhes: (id: number) => void }) {
  const [itensPorPagina, setItensPorPagina] = useState(25);
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useCargas(itensPorPagina, offset);

  const colunas: readonly Coluna<ExecucaoCarga>[] = [
    { chave: null, rotulo: "Data", largura: 140, celula: (l) => dataHora(l.criado_em) },
    { chave: null, rotulo: "Arquivo", largura: 90, fixa: true, celula: (l) => l.arquivo },
    { chave: null, rotulo: "Situação", largura: 120, celula: (l) => <Situacao status={l.status} /> },
    { chave: null, rotulo: "Linhas gravadas", largura: 140, num: true, celula: (l) => inteiro(l.linhas_gravadas) },
    {
      chave: null,
      rotulo: "Alertas",
      largura: 120,
      celula: (l) =>
        l.alertas ? (
          <Badge tom="atencao">
            {l.alertas} alerta{l.alertas === 1 ? "" : "s"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">nenhum</span>
        ),
    },
    {
      chave: null,
      rotulo: "Enviado por",
      celula: (l) => l.usuario ?? (l.origem === "cli" ? "linha de comando" : "—"),
    },
    {
      chave: null,
      rotulo: "Ações",
      acao: true,
      celula: (l) => <AcoesCarga arquivo={l.arquivo} aoVerDetalhes={() => aoVerDetalhes(l.id)} />,
    },
  ];

  if (error) return <Erro mensagem={error.message} />;

  return (
    <Tabela
      linhas={data?.linhas ?? []}
      colunas={colunas}
      chaveLinha={(l) => String(l.id)}
      rotuloAcessivel="Histórico de importações"
      carregando={isLoading}
      vazio="Nenhuma importação registrada."
      paginacao={{
        modo: "servidor",
        total: data?.total ?? 0,
        offset,
        itensPorPagina,
        aoMudarOffset: setOffset,
        aoMudarItensPorPagina: (quantidade) => {
          setItensPorPagina(quantidade);
          setOffset(0);
        },
      }}
    />
  );
}
