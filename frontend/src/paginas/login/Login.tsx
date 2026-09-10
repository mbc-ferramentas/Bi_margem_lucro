import { useState } from "react";
import { useNavigate } from "react-router";

import { entrar } from "@compartilhado/api/cliente";
import { Alert, AlertDescription } from "@compartilhado/ui/atomos/alert";
import { Button } from "@compartilhado/ui/atomos/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@compartilhado/ui/atomos/card";
import { Field, FieldGroup, FieldLabel } from "@compartilhado/ui/atomos/field";
import { Input } from "@compartilhado/ui/atomos/input";
import { Spinner } from "@compartilhado/ui/atomos/spinner";

export function Login() {
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(usuario, senha);
      navegar("/", { replace: true });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    // Esta tela fica fora do Layout: sem sessao nao ha menu nem perfil.
    // Unica tela em que o azul da marca e superficie cheia: sem menu e sem
    // dado na tela, nao ha nada com que ele possa competir.
    <div className="grid min-h-screen place-items-center bg-marca p-5">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-marca-acento" />
            Margem de Lucro
          </CardTitle>
          <CardDescription className="ml-3.5">Margem bruta · fase 1</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submeter}>
            <FieldGroup>
              <Field data-invalid={erro ? true : undefined}>
                <FieldLabel htmlFor="usuario">Usuário</FieldLabel>
                <Input
                  id="usuario"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                  autoFocus
                  aria-invalid={erro ? true : undefined}
                />
              </Field>

              <Field data-invalid={erro ? true : undefined}>
                <FieldLabel htmlFor="senha">Senha</FieldLabel>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  aria-invalid={erro ? true : undefined}
                />
              </Field>

              {erro && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{erro}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={enviando} className="w-full">
                {enviando && <Spinner data-icon="inline-start" />}
                {enviando ? "Entrando…" : "Entrar"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
