import { useEffect, useRef, useState } from "react";

type Opcao = { codigo: string; rotulo: string | null; sem_movimento: boolean };

type Props = {
  opcoes: Opcao[] | undefined;
  valor: string[] | undefined;
  aoMudar: (grupos: string[]) => void;
  /** Prefixo dos ids: a mesma barra aparece em telas diferentes. */
  idPrefixo: string;
};

/** Grupo e a unica dimensao com multi-selecao: comparar "Ecommerce + Fabricacao
 *  propria" ou olhar so os grupos de consumo interno e leitura corriqueira, e um
 *  <select> obrigaria a uma tela por grupo.
 *
 *  Menu suspenso e nao uma fila de botoes: a lista de grupos cresce conforme o
 *  Protheus, e deixar todos visiveis empurraria o resto da barra de filtros para
 *  fora da tela. Fechado, o campo resume o que esta marcado.
 *
 *  Os grupos `sem_movimento` vem do cadastro e nao tem linha no recorte atual.
 *  Aparecem assim mesmo — a lista tambem serve para conferir a classificacao —
 *  mas apagados, para ninguem marcar um deles e concluir que o BI zerou. */
export function SeletorGrupos({ opcoes, valor, aoMudar, idPrefixo }: Props) {
  const marcados = valor ?? [];
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Clique fora e Esc fecham: sem isso o menu ficaria por cima da tabela.
  useEffect(() => {
    if (!aberto) return;
    function fora(evento: MouseEvent) {
      if (!caixa.current?.contains(evento.target as Node)) setAberto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function alternar(codigo: string) {
    aoMudar(
      marcados.includes(codigo)
        ? marcados.filter((c) => c !== codigo)
        : [...marcados, codigo],
    );
  }

  const rotuloDe = (codigo: string) =>
    opcoes?.find((g) => g.codigo === codigo)?.rotulo ?? codigo;

  // Fechado o campo precisa dizer o recorte sem depender de abrir: um nome
  // quando e um so, a contagem quando sao varios.
  const resumo =
    marcados.length === 0
      ? "Todos"
      : marcados.length === 1
        ? rotuloDe(marcados[0])
        : `${marcados.length} grupos`;

  return (
    <div className="campo campo-grupos" ref={caixa}>
      <label htmlFor={`${idPrefixo}-grupo`}>Grupo</label>
      <button
        type="button"
        id={`${idPrefixo}-grupo`}
        className="seletor-menu"
        aria-haspopup="true"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
      >
        <span>{resumo}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {aberto && (
        <div className="menu" role="group" aria-label="Grupos">
          <label className="menu-item menu-todos">
            <input
              type="checkbox"
              checked={marcados.length === 0}
              onChange={() => aoMudar([])}
            />
            <span>Todos</span>
          </label>
          {opcoes?.map((g) => (
            <label
              key={g.codigo}
              className={`menu-item${g.sem_movimento ? " menu-item-vazio" : ""}`}
              title={g.sem_movimento ? "Sem linhas no recorte atual" : undefined}
            >
              <input
                type="checkbox"
                checked={marcados.includes(g.codigo)}
                onChange={() => alternar(g.codigo)}
              />
              <span>{g.rotulo ?? g.codigo}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
