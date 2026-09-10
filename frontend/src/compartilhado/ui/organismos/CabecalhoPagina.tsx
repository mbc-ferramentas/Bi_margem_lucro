import { SeletorTema } from "@compartilhado/ui/moleculas/SeletorTema";

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
        {/* Filete laranja a esquerda do titulo: a marca aparece uma vez por
            tela, no lugar onde a leitura comeca. */}
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span aria-hidden="true" className="h-5 w-1 rounded-full bg-marca-acento" />
          {titulo}
        </h1>
        <p className="mt-1 ml-3.5 max-w-3xl text-sm text-muted-foreground">{descricao}</p>
        {contexto && <div className="mt-2.5 ml-3.5 flex flex-wrap gap-1.5">{contexto}</div>}
      </div>
      <SeletorTema />
    </div>
  );
}
