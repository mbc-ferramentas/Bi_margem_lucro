import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { entrar } from "../api/cliente";

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
    <div className="login">
      <form onSubmit={submeter}>
        <div style={{ marginBottom: 8 }}>
          <h1>Margem de Lucro</h1>
          <p className="subtitulo" style={{ margin: "2px 0 0" }}>
            Margem bruta · fase 1
          </p>
        </div>

        <div className="campo">
          <label htmlFor="usuario">Usuário</label>
          <input
            id="usuario"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>

        {erro && (
          <div role="alert" style={{ color: "var(--status-critical)", fontSize: 13 }}>
            {erro}
          </div>
        )}

        <button className="principal" type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
