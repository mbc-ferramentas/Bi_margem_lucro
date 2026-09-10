/** A porta da area logada.
 *
 *  Separado das rotas porque e a unica decisao de autorizacao no roteamento, e
 *  ela decide o acesso a arvore inteira — misturada no meio do mapa de rotas,
 *  passava batido na leitura. */

import { Navigate, Outlet } from "react-router";

import { tokens } from "@compartilhado/api/cliente";

export function Protegido() {
  return tokens.access ? <Outlet /> : <Navigate to="/login" replace />;
}
