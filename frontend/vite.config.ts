import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Sem polling o HMR nao enxerga edicao nenhuma: o projeto e montado por bind
    // mount a partir do Windows, e o inotify do container nao recebe os eventos
    // do sistema de arquivos do host. O sintoma e traicoeiro — a tela continua
    // servindo o bundle antigo e a mudanca parece nao ter efeito.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": { target: "http://bi-margem-lucro-api:8000", changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
