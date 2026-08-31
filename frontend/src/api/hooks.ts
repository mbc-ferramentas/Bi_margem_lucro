import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { buscar, enviar, escrever, paraQuery } from "./cliente";
import {
  armazensSchema,
  carteiraFiltrosSchema,
  carteiraSchema,
  detalheSchema,
  euSchema,
  filtrosSchema,
  kpisSchema,
  pedidoSchema,
  pedidosSchema,
  serieSchema,
  skusSchema,
  uploadsSchema,
  usuarioSchema,
  usuariosSchema,
  vendedoresSchema,
  type Filtros,
  type FormularioUsuario,
} from "./tipos";

export function useEu() {
  return useQuery({
    queryKey: ["eu"],
    queryFn: () => buscar("/auth/eu", euSchema),
    staleTime: Infinity,
  });
}

export function useKpis(f: Filtros) {
  return useQuery({
    queryKey: ["kpis", f],
    queryFn: () => buscar(`/kpis${paraQuery(f)}`, kpisSchema),
  });
}

export function useSerie(f: Filtros, granularidade: "dia" | "mes") {
  return useQuery({
    queryKey: ["serie", f, granularidade],
    queryFn: () =>
      buscar(
        `/margem/serie${paraQuery({ ...f, granularidade } as Filtros)}`,
        serieSchema,
      ),
  });
}

export function useVendedores(f: Filtros, ordenar: string) {
  return useQuery({
    queryKey: ["vendedores", f, ordenar],
    queryFn: () =>
      buscar(
        `/margem/vendedor${paraQuery({ ...f, ordenar } as Filtros)}`,
        vendedoresSchema,
      ),
  });
}

export function useArmazens(f: Filtros, ordenar: string) {
  return useQuery({
    queryKey: ["armazens", f, ordenar],
    queryFn: () =>
      buscar(
        `/margem/armazem${paraQuery({ ...f, ordenar } as Filtros)}`,
        armazensSchema,
      ),
  });
}

export function useSkus(f: Filtros, ordenar: string, offset: number, limite: number) {
  return useQuery({
    queryKey: ["skus", f, ordenar, offset, limite],
    queryFn: () =>
      buscar(
        `/margem/sku${paraQuery({
          ...f,
          ordenar,
          limite: String(limite),
          offset: String(offset),
        } as Filtros)}`,
        skusSchema,
      ),
  });
}

/** Pedidos faturados do drill-down de `Por armazem`. O armazem entra como mais um
 *  filtro: a rota so decide o que a tela mostra, o recorte continua sendo o mesmo
 *  de todas as telas de margem. */
export function usePedidos(
  f: Filtros,
  ordenar: string,
  offset: number,
  limite: number,
) {
  return useQuery({
    queryKey: ["pedidos", f, ordenar, offset, limite],
    queryFn: () =>
      buscar(
        `/margem/pedidos${paraQuery({
          ...f,
          ordenar,
          limite: String(limite),
          offset: String(offset),
        } as Filtros)}`,
        pedidosSchema,
      ),
  });
}

/** Um pedido. Os filtros seguem junto de proposito: o detalhe mostra o mesmo
 *  recorte da lista, e informa quantas linhas ficaram de fora dele. */
export function usePedido(chave: string, f: Filtros) {
  return useQuery({
    queryKey: ["pedido", chave, f],
    queryFn: () =>
      buscar(
        `/margem/pedidos/${encodeURIComponent(chave)}${paraQuery(f)}`,
        pedidoSchema,
      ),
  });
}

export function useCarteira(
  f: Filtros,
  ordenar: string,
  offset: number,
  limite: number,
) {
  return useQuery({
    queryKey: ["carteira", f, ordenar, offset, limite],
    queryFn: () =>
      buscar(
        `/carteira${paraQuery({
          ...f,
          ordenar,
          limite: String(limite),
          offset: String(offset),
        } as Filtros)}`,
        carteiraSchema,
      ),
  });
}

/** Filtros proprios da carteira: os valores diferem dos da margem, porque a
 *  carteira tem pedidos fora da janela do SD2. */
export function useOpcoesCarteira(f: Filtros = {}) {
  return useQuery({
    queryKey: ["carteira-filtros", f],
    queryFn: () => buscar(`/carteira/filtros${paraQuery(f)}`, carteiraFiltrosSchema),
    staleTime: 5 * 60 * 1000,
  });
}

/** As opcoes sao recortadas pelos filtros ativos (cascata armazem > grupo), por
 *  isso os filtros entram na chave: sem eles a lista ficaria congelada na
 *  primeira consulta e o select de grupo nunca reagiria ao armazem. */
export function useOpcoes(f: Filtros = {}) {
  return useQuery({
    queryKey: ["filtros", f],
    queryFn: () => buscar(`/filtros${paraQuery(f)}`, filtrosSchema),
    staleTime: 5 * 60 * 1000,
  });
}

/** Carga dos CSVs do Protheus. Sincrona: a promessa so resolve quando o ETL
 *  terminou, por isso a tela precisa exibir estado de processamento.
 *
 *  Ao concluir, invalida tudo — a carga reescreve as materialized views, entao
 *  qualquer numero em cache na tela passou a estar desatualizado. */
export function useUploads() {
  const cliente = useQueryClient();
  return useMutation({
    // A tela chama-se Uploads, mas o endpoint continua /carga: o caminho da API
    // nao aparece para o usuario e renomea-lo custaria migracao de contrato.
    mutationFn: (arquivos: FormData) =>
      enviar("/carga", arquivos, uploadsSchema),
    onSuccess: () => cliente.invalidateQueries(),
  });
}

// --------------------------------------------------------------------------
// Cadastro de usuarios (somente admin)
// --------------------------------------------------------------------------

export function useUsuarios() {
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: () => buscar("/usuarios", usuariosSchema),
  });
}

/** Cria ou edita. Sem `id` e criacao — e so na criacao que a senha e obrigatoria.
 *
 *  Invalida apenas a lista: nada aqui muda os numeros do BI. A excecao e o
 *  proprio usuario logado, cujo perfil vem de /auth/eu — por isso `eu` tambem
 *  cai fora do cache. */
export function useSalvarUsuario() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: FormularioUsuario & { id?: number }) =>
      id
        ? escrever(`/usuarios/${id}`, "PATCH", dados, usuarioSchema)
        : escrever("/usuarios", "POST", dados, usuarioSchema),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ["usuarios"] });
      cliente.invalidateQueries({ queryKey: ["eu"] });
    },
  });
}

export function useRemoverUsuario() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      escrever(`/usuarios/${id}`, "DELETE", undefined, z.null()),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["usuarios"] }),
  });
}

/** Reset feito pelo admin: nao pede a senha atual, porque o caso de uso e
 *  exatamente o de quem a esqueceu. */
export function useRedefinirSenha() {
  return useMutation({
    mutationFn: ({ id, senha }: { id: number; senha: string }) =>
      escrever(`/usuarios/${id}/senha`, "POST", { senha }, detalheSchema),
  });
}
