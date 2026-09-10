import type { ZodSchema } from "zod";

import type { Filtros } from "@/api/tipos";

const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";
const CHAVE_ACCESS = "bi.access";
const CHAVE_REFRESH = "bi.refresh";

export class ErroApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(CHAVE_ACCESS);
  },
  get refresh() {
    return localStorage.getItem(CHAVE_REFRESH);
  },
  guardar(access: string, refresh?: string) {
    localStorage.setItem(CHAVE_ACCESS, access);
    if (refresh) localStorage.setItem(CHAVE_REFRESH, refresh);
  },
  limpar() {
    localStorage.removeItem(CHAVE_ACCESS);
    localStorage.removeItem(CHAVE_REFRESH);
  },
};

async function renovar(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;

  const resposta = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!resposta.ok) {
    tokens.limpar();
    return false;
  }
  const dados = await resposta.json();
  tokens.guardar(dados.access, dados.refresh);
  return true;
}

export function paraQuery(filtros: Filtros = {}): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    // Dimensao multi-valor (grupo) vai separada por virgula: `_lista` na API ja
    // quebra tanto isso quanto `?chave=a&chave=b`, e a virgula encurta a URL.
    if (Array.isArray(valor)) {
      if (valor.length) busca.set(chave, valor.join(","));
    } else if (valor) {
      busca.set(chave, valor);
    }
  }
  const texto = busca.toString();
  return texto ? `?${texto}` : "";
}

/** GET autenticado com validacao de schema.
 *
 *  Um 401 dispara uma unica tentativa de renovacao antes de desistir — evita
 *  deslogar o usuario no meio de um dashboard so porque o access expirou. */
export async function buscar<T>(
  caminho: string,
  schema: ZodSchema<T>,
  tentouRenovar = false,
): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: tokens.access
      ? { Authorization: `Bearer ${tokens.access}` }
      : undefined,
  });

  if (resposta.status === 401 && !tentouRenovar) {
    if (await renovar()) return buscar(caminho, schema, true);
  }

  if (!resposta.ok) {
    let detalhe = `Falha ao carregar (${resposta.status})`;
    try {
      const corpo = await resposta.json();
      detalhe = corpo.detail ?? corpo.non_field_errors?.[0] ?? detalhe;
    } catch {
      /* resposta sem corpo JSON */
    }
    throw new ErroApi(detalhe, resposta.status);
  }

  return schema.parse(await resposta.json());
}

/** POST multipart autenticado, com o mesmo retry de 401 do `buscar`.
 *
 *  O `Content-Type` e deixado a cargo do browser de proposito: definido na mao,
 *  o boundary do multipart nao entra no header e o Django nao acha os arquivos. */
export async function enviar<T>(
  caminho: string,
  corpo: FormData,
  schema: ZodSchema<T>,
  tentouRenovar = false,
): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: "POST",
    headers: tokens.access
      ? { Authorization: `Bearer ${tokens.access}` }
      : undefined,
    body: corpo,
  });

  if (resposta.status === 401 && !tentouRenovar) {
    if (await renovar()) return enviar(caminho, corpo, schema, true);
  }

  if (!resposta.ok) {
    let detalhe = `Falha ao enviar (${resposta.status})`;
    try {
      const corpoErro = await resposta.json();
      detalhe = corpoErro.detail ?? corpoErro.non_field_errors?.[0] ?? detalhe;
    } catch {
      /* resposta sem corpo JSON */
    }
    throw new ErroApi(detalhe, resposta.status);
  }

  return schema.parse(await resposta.json());
}

/** Requisicao JSON autenticada (POST/PATCH/DELETE), com o mesmo retry de 401.
 *
 *  O erro do DRF vem de duas formas: `{detail: "..."}` nas permissoes e
 *  `{campo: ["..."]}` na validacao. As duas viram uma frase legivel, senao a tela
 *  mostraria "Falha (400)" para um problema que o servidor explicou. */
export async function escrever<T>(
  caminho: string,
  metodo: "POST" | "PATCH" | "DELETE",
  corpo: unknown,
  schema: ZodSchema<T>,
  tentouRenovar = false,
): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      ...(tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  if (resposta.status === 401 && !tentouRenovar) {
    if (await renovar()) return escrever(caminho, metodo, corpo, schema, true);
  }

  if (!resposta.ok) {
    throw new ErroApi(await mensagemDeErro(resposta), resposta.status);
  }

  // 204 (remocao) nao tem corpo: o schema desses casos e `z.null()`.
  if (resposta.status === 204) return schema.parse(null);
  return schema.parse(await resposta.json());
}

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = await resposta.json();
    if (typeof corpo?.detail === "string") return corpo.detail;
    const partes = Object.values(corpo ?? {})
      .flat()
      .filter((v): v is string => typeof v === "string");
    if (partes.length) return partes.join(" ");
  } catch {
    /* resposta sem corpo JSON */
  }
  return `Falha na operação (${resposta.status})`;
}

export async function entrar(username: string, password: string): Promise<void> {
  const resposta = await fetch(`${BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!resposta.ok) {
    throw new ErroApi("Usuario ou senha invalidos.", resposta.status);
  }
  const dados = await resposta.json();
  tokens.guardar(dados.access, dados.refresh);
}
