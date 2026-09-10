import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@compartilhado/ui/atomos/card";

/** Secao de conteudo: o cartao que agrupa um grafico ou uma tabela.
 *
 *  `acao` fica na mesma linha do titulo, e nao acima dele, porque em toda tela
 *  onde ela existe (o seletor de metrica do ranking, o alternador grafico/
 *  tabela) ela e um recorte do que a secao mostra — nao um comando da pagina. */
export function Secao({
  titulo,
  nota,
  acao,
  children,
}: {
  titulo: string;
  nota?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{titulo}</CardTitle>
        {nota && <CardDescription className="text-xs">{nota}</CardDescription>}
        {acao && <CardAction>{acao}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
