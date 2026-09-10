import { Navigate, Outlet, Route, Routes } from "react-router";

import { tokens } from "@compartilhado/api/cliente";
import { Layout } from "@widgets/layout";
import { Armazens } from "./paginas/Armazens";
import { CadastroUsuario } from "./paginas/CadastroUsuario";
import { Canais } from "./paginas/Canais";
import { Carteira } from "./paginas/Carteira";
import { Login } from "./paginas/Login";
import { PedidoDetalhe } from "./paginas/PedidoDetalhe";
import { Pedidos } from "./paginas/Pedidos";
import { SkuDetalhe } from "./paginas/SkuDetalhe";
import { Skus } from "./paginas/Skus";
import { Uploads } from "./paginas/Uploads";
import { Usuarios } from "./paginas/Usuarios";
import { Vendedores } from "./paginas/Vendedores";
import { VisaoGeral } from "./paginas/VisaoGeral";

function Protegido() {
  return tokens.access ? <Outlet /> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protegido />}>
        <Route element={<Layout />}>
          <Route index element={<VisaoGeral />} />
          <Route path="armazens" element={<Armazens />} />
          {/* Drill-down de Por armazem: nao entra no menu, so se chega por ela. */}
          <Route path="armazens/:armazem/pedidos" element={<Pedidos />} />
          <Route
            path="armazens/:armazem/pedidos/:chave"
            element={<PedidoDetalhe />}
          />
          <Route path="vendedores" element={<Vendedores />} />
          {/* Mesmo drill-down, outra dimensao travada pela rota. */}
          <Route path="vendedores/:vendedor/pedidos" element={<Pedidos />} />
          <Route
            path="vendedores/:vendedor/pedidos/:chave"
            element={<PedidoDetalhe />}
          />
          <Route path="skus" element={<Skus />} />
          {/* Drill-down de Por SKU: o item, seus pedidos e suas notas. */}
          <Route path="skus/:sku" element={<SkuDetalhe />} />
          <Route path="skus/:sku/pedidos/:chave" element={<PedidoDetalhe />} />
          <Route path="canais" element={<Canais />} />
          <Route path="carteira" element={<Carteira />} />
          <Route path="uploads" element={<Uploads />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="usuarios/novo" element={<CadastroUsuario />} />
          <Route path="usuarios/:id" element={<CadastroUsuario />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
