/** Uploads.
 *
 *  Entrada de dados do BI: o administrador envia os exports do Protheus e ve na
 *  hora o que foi aceito. A validacao acontece no servidor antes de gravar, entao
 *  um arquivo com coluna faltando falha inteiro em vez de entrar pela metade.
 *
 *  O processamento e sincrono e leva alguns segundos — o estado de "processando"
 *  nao e enfeite: sem ele o usuario reenvia achando que travou.
 */

import { useState } from "react";

import { ErroApi } from "../api/cliente";
import { useUploads } from "../api/hooks";
import type { ResultadoArquivo } from "../api/tipos";
import { Erro } from "../componentes/Layout";
import { SeletorTema } from "../componentes/SeletorTema";
import { inteiro } from "../formato";

const CAMPOS = [
  { nome: "SB2", rotulo: "SB2 — Saldos e custo de estoque" },
  { nome: "SC5", rotulo: "SC5 — Cabecalho dos pedidos" },
  { nome: "SD1", rotulo: "SD1 — Itens de notas de entrada" },
  { nome: "SD2", rotulo: "SD2 — Itens faturados" },
] as const;

function Resultado({ linhas }: { linhas: ResultadoArquivo[] }) {
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th>Arquivo</th>
          <th>Situação</th>
          <th style={{ textAlign: "right" }}>Linhas lidas</th>
          <th style={{ textAlign: "right" }}>Linhas gravadas</th>
          <th>Competência</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.arquivo}>
            <td>{l.arquivo}</td>
            <td>
              <span
                style={{
                  color:
                    l.status === "sucesso"
                      ? "var(--status-good)"
                      : "var(--status-critical)",
                }}
              >
                {l.status === "sucesso" ? "✓ Carregado" : "✕ Erro"}
              </span>
              {l.mensagem && (
                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {l.mensagem}
                </div>
              )}
            </td>
            <td style={{ textAlign: "right" }}>{inteiro(l.linhas_lidas)}</td>
            <td style={{ textAlign: "right" }}>{inteiro(l.linhas_gravadas)}</td>
            <td>{l.competencia ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Uploads() {
  const [arquivos, setArquivos] = useState<Record<string, File>>({});
  const envio = useUploads();

  const selecionados = Object.keys(arquivos);
  const erro =
    envio.error instanceof ErroApi
      ? envio.error.message
      : envio.error
        ? "Falha inesperada ao carregar os arquivos."
        : null;

  function escolher(nome: string, arquivo: File | undefined) {
    setArquivos((atual) => {
      const proximo = { ...atual };
      if (arquivo) proximo[nome] = arquivo;
      else delete proximo[nome];
      return proximo;
    });
  }

  function enviar() {
    const dados = new FormData();
    for (const [nome, arquivo] of Object.entries(arquivos)) {
      dados.append(nome, arquivo);
    }
    envio.mutate(dados);
  }

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Uploads</h1>
          <p style={{ color: "var(--text-secondary)", maxWidth: 640 }}>
            Envie os arquivos exportados do Protheus. Você pode mandar um, dois ou
            os quatro — o que não for enviado permanece como está. O envio substitui
            a competência inteira contida no arquivo, então reenviar o mesmo mês é
            seguro.
          </p>
        </div>
        <SeletorTema />
      </div>

      <div className="cartao" style={{ maxWidth: 640 }}>
        {CAMPOS.map((campo) => (
          <div key={campo.nome} style={{ marginBottom: 16 }}>
            <label
              htmlFor={`arquivo-${campo.nome}`}
              style={{ display: "block", marginBottom: 4, fontWeight: 560 }}
            >
              {campo.rotulo}
            </label>
            <input
              id={`arquivo-${campo.nome}`}
              type="file"
              accept=".csv,text/csv"
              disabled={envio.isPending}
              onChange={(e) => escolher(campo.nome, e.target.files?.[0])}
            />
          </div>
        ))}

        <button
          className="botao"
          onClick={enviar}
          disabled={selecionados.length === 0 || envio.isPending}
        >
          {envio.isPending
            ? "Processando… isso leva alguns segundos"
            : `Enviar ${selecionados.length || ""} arquivo${
                selecionados.length === 1 ? "" : "s"
              }`}
        </button>

        {envio.isPending && (
          <p style={{ color: "var(--text-muted)", marginBottom: 0 }} role="status">
            Validando, gravando no banco e atualizando os indicadores. Não feche a
            página.
          </p>
        )}
      </div>

      {erro && <Erro mensagem={erro} />}

      {envio.data && (
        <div style={{ marginTop: 20 }}>
          <h2>Resultado</h2>
          <Resultado linhas={envio.data.arquivos} />
        </div>
      )}
    </>
  );
}
