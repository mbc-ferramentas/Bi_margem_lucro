import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { ErroApi } from "./api/cliente";
import { iniciarTema } from "./tema";
import "./styles.css";

// Antes do render: aplicar o data-theme so depois da primeira pintura faria a
// tela piscar no tema errado a cada carregamento.
iniciarTema();

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // 401 e 403 sao decisao do servidor sobre permissao: repetir nao ajuda e
      // ainda mascara um cadastro incompleto de vendedor.
      retry: (tentativas, erro) =>
        erro instanceof ErroApi && [401, 403, 400].includes(erro.status)
          ? false
          : tentativas < 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
