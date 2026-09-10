import { SeletorTema } from "@widgets/seletor-tema";

export function CabecalhoPagina({
  titulo,
  descricao,
  voltar,
  contexto,
}: {
  titulo: string;
  descricao: string;
  voltar?: React.ReactNode;
  contexto?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {voltar}
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{descricao}</p>
        {contexto && <div className="mt-2.5 flex flex-wrap gap-1.5">{contexto}</div>}
      </div>
      <SeletorTema />
    </div>
  );
}
