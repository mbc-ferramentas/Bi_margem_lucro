import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";

import { iniciarTema } from "@compartilhado/lib/tema";

import { Provedores } from "./provedores";
import { Rotas } from "./rotas";
import "./index.css";

// Antes do render: aplicar o data-theme so depois da primeira pintura faria a
// tela piscar no tema errado a cada carregamento.
iniciarTema();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provedores>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Rotas />
      </BrowserRouter>
    </Provedores>
  </React.StrictMode>,
);
