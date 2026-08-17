import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { tokens } from "./api/cliente";
import { Layout } from "./componentes/Layout";
import { Canais } from "./paginas/Canais";
import { Login } from "./paginas/Login";
import { Skus } from "./paginas/Skus";
import { Uploads } from "./paginas/Uploads";
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
          <Route path="vendedores" element={<Vendedores />} />
          <Route path="skus" element={<Skus />} />
          <Route path="canais" element={<Canais />} />
          <Route path="uploads" element={<Uploads />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
