import { Navigate, Route, Routes } from "react-router";

import { Protegido } from "./guarda";

import { Layout } from "@widgets/layout";
import { Armazens } from "@paginas/armazens";
import { CadastroUsuario } from "@paginas/cadastro-usuario";
import { Canais } from "@paginas/canais";
import { Carteira } from "@paginas/carteira";
import { Login } from "@paginas/login";
import { PedidoDetalhe } from "@paginas/pedido-detalhe";
import { Pedidos } from "@paginas/pedidos";
import { SkuDetalhe } from "@paginas/sku-detalhe";
import { Skus } from "@paginas/skus";
import { Uploads } from "@paginas/uploads";
import { Usuarios } from "@paginas/usuarios";
import { Vendedores } from "@paginas/vendedores";
import { VisaoGeral } from "@paginas/visao-geral";

export function Rotas() {
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
