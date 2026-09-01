import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { entrar } from "../api/cliente";
import { Alert, AlertDescription } from "@/componentes/ui/alert";
import { Button } from "@/componentes/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/componentes/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/componentes/ui/field";
import { Input } from "@/componentes/ui/input";
import { Spinner } from "@/componentes/ui/spinner";

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
    <div className="grid min-h-screen place-items-center p-5">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Margem de Lucro</CardTitle>
          <CardDescription>Margem bruta · fase 1</CardDescription>
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
