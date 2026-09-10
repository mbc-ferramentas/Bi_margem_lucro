import { Badge as BadgeUi } from "@compartilhado/ui/atomos/badge";

const VARIANTE_BADGE = {
  neutro: "secondary",
  info: "outline",
  bom: "outline",
  atencao: "outline",
  critico: "destructive",
} as const;

const COR_BADGE: Record<keyof typeof VARIANTE_BADGE, string> = {
  neutro: "",
  info: "border-primary/30 bg-primary/10 text-primary",
  bom: "border-status-bom/30 bg-status-bom/10 text-delta-bom",
  atencao: "border-status-atencao/40 bg-status-atencao/15 text-foreground",
  critico: "",
};

export function Badge({
  children,
  tom = "neutro",
}: {
  children: React.ReactNode;
  tom?: keyof typeof VARIANTE_BADGE;
}) {
  return (
    <BadgeUi variant={VARIANTE_BADGE[tom]} className={COR_BADGE[tom]}>
      {children}
    </BadgeUi>
  );
}
