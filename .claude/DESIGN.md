# DESIGN.md — o padrão visual deste BI, em forma reproduzível

Este documento descreve o sistema de design do BI de Margem de Lucro de um jeito que
possa ser **reimplantado em outro projeto** sem copiar o código deste. Não é um relato
do que existe: é a receita, com os *porquês* que impedem de refazer os mesmos erros.

A regra que organiza todas as outras: **a tela é um instrumento de leitura de números**.
Cada decisão abaixo responde a "isso ajuda alguém a ler um número certo e rápido?".
O que não responde, sai.

---

## 1. Fundações

### 1.1 Duas famílias de cor que não se misturam

A maior fonte de confusão em BI é usar a mesma paleta para vestir a interface e para
codificar dado. Aqui são **três famílias separadas por função**, todas em `oklch` e
todas declaradas como custom properties na raiz:

| Família | Tokens | Função | Pode virar a outra? |
|---|---|---|---|
| **Interface** | `--background --foreground --card --popover --primary --secondary --muted --accent --destructive --border --input --ring --sidebar-*` | veste o chrome: superfícies, botões, bordas | — |
| **Dado** | `--chart-1..5`, `--grid`, `--axis` | séries categóricas em gráfico | **nunca** vira chrome |
| **Estado** | `--status-bom --status-atencao --status-serio --status-critico`, `--delta-bom` | gravidade: bom / atenção / sério / crítico | **nunca** vira "série 6" |
| **Marca** | `--marca --marca-acento --marca-contraste` | cromo: item ativo, logo, login, sidebar | **nunca** vira dado nem estado |

Só a família de **dado** e a de **estado** carregam significado. A marca é decoração
com identidade; a interface é o papel. Misturar as quatro é o que faz um painel parecer
colorido e não dizer nada.

**Reproduzindo:** copie o bloco `@theme inline` + `:root` + `.dark` de
`frontend/src/app/index.css` e troque apenas os três tokens de marca. Os cinco slots de
série e os quatro de status vêm de uma paleta validada — veja 1.2.

### 1.2 A ordem dos slots é mecanismo de segurança, não estética

`--chart-1..5` são azul, laranja, aqua, amarelo, magenta, **nessa ordem**. A ordem foi
validada para distinguibilidade sob daltonismo: as duas primeiras séries (o caso mais
comum) são o par mais separado possível. Trocar a ordem, ou ciclar para uma sexta série,
quebra a garantia em silêncio.

Regras que vêm junto e não são negociáveis:

- **Nunca cicle.** Precisa de mais de 5 categorias? Agrupe em "Outros" ou quebre em
  pequenos múltiplos.
- **Aqua, amarelo e magenta ficam abaixo de 3:1** sobre a superfície clara, por
  construção da paleta. A contrapartida obrigatória é a **regra de relevo**: todo gráfico
  traz rótulo direto na ponta da série e uma alternativa em tabela. Sem isso a paleta
  deixa de ser acessível.
- **Cor nunca carrega significado sozinha.** Status sempre acompanha rótulo; variação
  sempre traz seta + sinal + texto (ver 3.4).
- **Status não muda entre temas.** Os quatro degraus são idênticos em claro e escuro: um
  vermelho de "crítico" que mudasse de tom deixaria de ser reconhecível como o mesmo
  estado. Já `--chart-*` **muda** — os mesmos matizes em degraus escolhidos para a faixa
  escura, validados como conjunto, nunca um "flip" automático.
- Ao alterar qualquer valor, rode o validador da paleta **nos dois modos**.

### 1.3 Superfícies

O plano da página fica **meio tom abaixo** do cartão. Isso faz o cartão existir sem
sombra pesada — a elevação vem da diferença de superfície, não de um `box-shadow` que
suja a tela em modo escuro.

- Claro: fundo `oklch(0.9816 …)` quase neutro e quente, cartão `oklch(0.9908 …)`.
- Escuro: fundo no matiz da marca com croma baixo, cartão um degrau acima. O azul da
  marca cabe como superfície no escuro justamente porque ali ele não disputa com dado.
- A **sidebar** segue o tema; no escuro é a única superfície que assume o azul da marca
  cheio.

### 1.4 Tipografia e raio

- Uma família só (`Geist Variable`, `system-ui` como queda). Títulos e corpo dividem a
  mesma fonte: hierarquia se faz com tamanho, peso e cor, não com uma segunda tipografia.
- `--radius: 0.625rem` (10px) como base; `--radius-sm..4xl` são derivados por multiplicação
  dessa base, então mudar o raio do produto inteiro é **uma linha**.
- **Figuras tabulares são um utilitário, não uma regra global.** `.num-tabular` entra em
  coluna de tabela e em eixo, onde os dígitos precisam alinhar verticalmente. Um KPI
  solto usa figura proporcional — ele não alinha com nada, e tabular ali só deixa o
  número feio.

### 1.5 Tema claro/escuro/sistema

- Uma classe `.dark` na raiz (é o que o Tailwind enxerga) **mais** `color-scheme`, para
  que os controles nativos acompanhem.
- O primeiro frame vem de um **script inline no `<head>`**. Sem ele a tela pisca clara a
  cada carregamento — inaceitável e trivial de evitar.
- Três estados no seletor: claro, escuro, **sistema**. "Sistema" é o padrão.

---

## 2. Arquitetura da UI

### 2.1 Camadas (FSD + Atomic Design)

```
app/            entrada, rotas, provedores, guarda de sessão, index.css (tokens)
paginas/        uma fatia por tela, com componentes/ e modelo/ próprios
widgets/        blocos que buscam dados e são reusados entre telas (layout, barra de filtros)
entidades/      domínio: modelo/tipos.ts (schema) + api/hooks.ts + index.ts
compartilhado/  ui/{atomos,moleculas,organismos}, grafico/, lib/, api/, config/
```

Direção única: `app → paginas → widgets → entidades → compartilhado`. Cada camada importa
só das de baixo e **nunca lateralmente** — uma página não conhece outra página, uma
entidade não conhece outra entidade. Fatias se importam pelo `index.ts`, nunca por caminho
interno.

**Isso precisa ser fiscalizado por lint**, não por disciplina (`eslint-plugin-boundaries`).
E ao configurar: **plante uma violação deliberada e confirme que o lint reprova** — sem
`import/resolver`, os aliases passam por "pacote externo" e a regra fica muda enquanto
parece funcionar.

O alias nomeia a camada (`@compartilhado/…`, `@entidades/…`, `@widgets/…`): é isso que
torna uma violação visível na leitura, antes do lint.

### 2.2 Átomos vendorizados vs. código da casa

- `ui/atomos/` é **território do shadcn**, em inglês, atualizado por
  `shadcn add <item> --diff`. Não se reescreve à mão. Cada tela importa o átomo pelo
  caminho direto.
- De `moleculas/` para cima é código da casa, nomeado no idioma do produto, exportado por
  um **barril** (`@compartilhado/ui`). O barril é o contrato: se um componente migra de
  molécula para organismo, nenhuma tela muda.

### 2.3 Vocabulário compartilhado em módulo próprio

O conjunto de gravidade (`Tom = neutro | bom | atencao | critico`) e seus mapas de classe
moram num arquivo só (`ui/tom.ts`), consumido por cartão, painel de insight e tabela. Se
cada componente declarasse o seu, "atenção" significaria duas cores diferentes na mesma
tela — e ninguém notaria.

---

## 3. O kit: componentes e as decisões dentro deles

### 3.1 Moldura da aplicação

Sidebar colapsável para ícone + `main` com `max-w` generoso (~1760px) e respiro lateral
crescente por breakpoint. Três pontos:

- A moldura existe **igual nos três estados** (carregando, erro, pronto). O provedor da
  sidebar envolve todos — se ele envolvesse só o estado pronto, a barra apareceria depois
  do dado e deslocaria a página inteira.
- O menu é **agrupado por natureza da tarefa** (Análise / Operação / Administração). Numa
  lista plana, "Uploads" fica na mesma sequência visual de "Por SKU".
- Itens restritos escondem-se por **grupo**, não por item — assim nunca sobra um título
  sem itens. E esconder **não é a proteção**: a API recusa; a UI só evita oferecer um 403.

### 3.2 Cabeçalho de página

Título + descrição + (opcional) contexto em chips + seletor de tema. A marca aparece
**uma vez por tela**, como um filete de 4px na cor de acento à esquerda do título — no
ponto onde a leitura começa. Não há logo repetido, faixa colorida, nem cor de marca em
mais nenhum lugar do conteúdo.

### 3.3 Cartão de KPI

O componente mais copiado de um BI, e o que mais erra. As decisões que importam:

- **Faixa de tom de 3px na borda esquerda**, não fundo colorido. A cor reforça o número a
  dois centímetros dali; não o substitui.
- **Lavagem de fundo** (gradiente da mesma cor de tom, opacidade ~0.07–0.09, morrendo em
  40%) é acabamento preso à mesma variável da faixa, para nunca divergir dela. Opacidade
  baixa de propósito: não pode alterar o contraste do texto.
- **Ritmo vertical fixo**: rótulo, valor e apoio têm cada um a sua altura reservada
  (`h-4`, `h-7`, `min-h-8`). Sem isso, um apoio que quebra em duas linhas estica a linha
  inteira da grade e o espaço entre valor e legenda muda de cartão para cartão.
- **Tamanho do número escalona por breakpoint, nunca por `vw`.** A largura do cartão vem
  da grade, não da janela: um `clamp` em `vw` faz o número vazar exatamente na tela larga,
  onde a grade tem mais colunas e menos espaço por coluna.
- **Cartão clicável é `<button>`**, com elevação no hover (ring + shadow) em vez de troca
  de cor de borda — a borda já é da faixa de tom.

### 3.4 Delta (variação contra o período anterior)

- **Seta + sinal + texto.** Cor nunca sozinha.
- **Ponto percentual para taxa, percentual para valor.** Margem que sobe de 24% para 26%
  subiu **2 p.p.**, não 2%. Trocar as duas unidades é o jeito mais comum de um painel mentir.
- **`inverter` para custo e desconto**: subir é ruim lá, e pintar de verde um custo que
  cresceu é pior do que não pintar nada.
- **Banda morta de estabilidade**: abaixo de ~0,1% (ou 0,05 p.p.) a leitura é "estável".
  Meio ponto de variação num faturamento de milhões é ruído de arredondamento, não notícia.
- Base zerada **não** vira variação infinita: sem denominador, o componente some.
- Altura reservada mesmo sem delta, senão cartões com e sem base de comparação desalinham.

### 3.5 Seção

O cartão que embrulha um gráfico ou uma tabela: título (pequeno, `text-sm`), nota
opcional, e uma `ação` **na mesma linha do título**. A ação fica ali, e não acima, porque
em toda tela onde ela existe (seletor de métrica, alternador gráfico/tabela) ela é um
recorte do que a seção mostra — não um comando da página.

### 3.6 Grades

- **KPIs**: 4 colunas no desktop, 2 no tablet, 1 no celular — com a contagem de colunas
  parametrizável. Um bloco de 3 cartões numa grade de 4 deixa o último órfão.
  Um KPI espremido a um terço de largura corta o número, que é a única coisa que ele tem.
- **Insights**: `auto-fit, minmax(210px, 1fr)` — aqui a quantidade é variável e a grade
  se resolve sozinha.

### 3.7 Tabela

Um único componente; nunca `<table>` à mão. O que varia de verdade entre telas é só a
lista de colunas, declarada como dados:

```ts
type Coluna<T> = {
  chave: string | null;      // chave de ordenação da API; null = não ordenável
  rotulo: string;
  num?: boolean;             // alinha à direita + figuras tabulares
  celula: (linha: T) => ReactNode;
  negativo?: (linha: T) => boolean;  // pinta com a cor de erro
  truncar?: number;          // largura máx.; acima disso trunca e ganha title
  ordenarPor?: (linha: T) => number; // obrigatório para ordenar no cliente
  fixa?: boolean;            // coluna de identidade, congelada na rolagem
  acao?: boolean;            // não encolhe, não quebra linha
};
```

Duas coisas que parecem detalhe e não são:

- **Ordenação é uma string no formato da API** (`"margem"` / `"-margem"`), porque quem
  ordena é o banco. O componente traduz para o estado interno da tabela, mas o contrato
  público continua sendo a string — é o que vai na query e o que mora na URL.
- **Dinheiro chega como string** (ver 4.1). Ordenar no cliente pela string crua dá ordem
  alfabética: "9" depois de "10". Por isso `ordenarPor` é obrigatório para ordenação local.
- Paginação com modo `"servidor"` / `"cliente"` explícito, `aria-sort` no cabeçalho,
  e coluna de identidade fixa à esquerda — numa tabela de doze colunas, é ela que diz de
  quem é a linha.

### 3.8 Estados: erro, vazio, aviso de escopo

Três componentes que quase toda tela precisa, morando **fora** do shell da aplicação —
senão a tabela passa a depender do layout só para dizer "nada para mostrar".

O **aviso de escopo** é o mais importante e o mais esquecido: quando o número exibido não
conta a história inteira (aqui: comissão de marketplace ainda não lançada), o rótulo é
obrigatório na tela. Sem ele o número engana, e o painel perde a confiança de uma vez.

---

## 4. Dados na tela

### 4.1 Dinheiro é string até a borda de exibição

O backend serializa `Decimal` como **texto** — float perde centavos. A conversão para
`Number` acontece num único módulo de formatação, **na borda de exibição**, nunca em
cálculo. Isso é uma regra de arquitetura com consequência visual direta (ver 3.7).

### 4.2 Formatação centralizada

Um módulo, instâncias de `Intl.NumberFormat` criadas **uma vez** no topo (não por render),
e `—` como representação universal de vazio. Moeda, moeda compacta, inteiro, percentual —
e a convenção de que a API entrega taxa como fração (`0.258444`), não como `25.8`.

Rótulos de tempo merecem pensamento:

- Dia/semana → `01/07`; mês → `jul/26`. O nome do mês se lê de relance; `07/2026` obriga a
  decodificar dois números — e ao lado de `01/07` num eixo diário, o mesmo par de dígitos
  significa coisas diferentes.
- Semana vira `S1, S2…` **numeradas dentro do recorte**: a data da segunda-feira não diz
  ao leitor que aquilo é uma semana, e a semana ISO do ano não casa com o que ele acabou
  de filtrar. A data cheia continua no tooltip e na tabela, que é onde alguém vai atrás dela.

### 4.3 O recorte mora na URL

Filtros vivem em query params, não em `useState`. Isso faz o filtro sobreviver à ida ao
detalhe e à volta, e de quebra torna cada tela linkável — o modo como um BI é realmente
compartilhado dentro de uma empresa.

Listas de filtro vêm em **cascata**: cada dimensão é recortada pelas outras, nunca por si
mesma. E cada filtro ativo aparece como **chip removível**, para que nenhum número na tela
seja explicado por um recorte invisível.

---

## 5. Gráficos

### 5.1 Ler token de cor por função, nunca por `var()`

O renderizador SVG do ECharts **não resolve `var(--x)`** dentro de uma string de cor:
passar `"var(--grid)"` produz uma marca sem cor, silenciosamente. Existe uma função
`token(nome)` que lê da raiz já resolvido, e **todo** acesso a cor passa por ela.

### 5.2 Um hook que injeta o tema nas dependências

`token()` e a base do tema leem `getComputedStyle`: são **valores capturados no render**,
não referências vivas. Um `useMemo` que esquecesse o tema deixaria o gráfico com as cores
do modo anterior até algum outro filtro mudar — um bug que só aparece ao alternar
claro/escuro. A solução é um hook `useOpcaoGrafico(fabrica, deps)` que anexa o tema
resolvido às deps: **não dá para esquecer**.

### 5.3 Moldura padrão de todo gráfico

- **Sem linha de eixo, sem tick.** A grade horizontal já dá o piso da leitura; duas
  molduras competindo com a marca é exatamente o excesso a remover.
- **Grade só no eixo de valor**, na cor `--grid`, recessiva de propósito — ela orienta,
  não compete. Não substituir por `--border`.
- **Animação curta e desacelerando** (~450ms, `cubicOut`). Acima de ~500ms vira espera; o
  padrão do ECharts (1s, com atraso por ponto) faz a tela "montar" a cada filtro.
- **Tooltip = superfície flutuante da mesma família** dos cartões: fundo `--popover`,
  borda `--border`, raio 10, a mesma sombra. Não é uma caixa de outro sistema.
- **Tooltip anexado ao `body`**, com `transitionDuration: 0`. Dentro do cartão ele é filho
  absoluto de uma caixa `overflow-hidden` arredondada: mover essa caixa a cada pixel do
  mouse faz o navegador deixar de repintar o SVG por baixo, e o gráfico "some" no rastro
  do cursor. A animação de deslizar é justamente o que arrasta a área suja do repaint.
- **Legenda no topo à esquerda**, `roundRect` pequeno, em `--muted-foreground`.

### 5.4 Degradê sim, segunda cor não

Barras e áreas ganham um degradê vertical a partir da cor da própria série (opacidade
1 → 0.55). O matiz **nunca** muda: quem lê continua identificando a série pelo mesmo slot.
A direção acompanha o crescimento da barra — numa barra horizontal, um degradê vertical
atravessaria a espessura, que é o lado que não significa nada.

Nota técnica: `color-mix` não serve (o SVGRenderer não resolve função de cor do CSS).
Como os tokens são `oklch`, a opacidade entra pela sintaxe `/ alpha` do próprio `oklch`,
que o navegador entrega já resolvida em `getComputedStyle`.

---

## 6. Checklist para levar isso a um projeto novo

1. Copiar `index.css`: `@theme inline` + `:root` + `.dark`. Trocar **só** os três tokens
   de marca. Revalidar a paleta nos dois modos se mexer em `--chart-*`.
2. Script inline de tema no `<head>` + módulo de tema publicando `.dark` e `color-scheme`.
3. Criar as cinco camadas e **ligar o lint de fronteiras**, testando com uma violação
   deliberada antes de confiar nele.
4. Instalar os átomos do shadcn necessários; escrever moléculas/organismos da casa e
   exportá-los por um barril.
5. Módulo `tom.ts` com o vocabulário de gravidade antes do primeiro componente colorido.
6. Módulo de formatação com `Intl` no topo e `—` para vazio, antes da primeira tela.
7. `token()` + `useOpcaoGrafico()` + base de tema do gráfico antes do primeiro gráfico.
8. Tabela única, colunas como dados, ordenação como string da API.
9. Filtros na URL, facetas em cascata, chips removíveis.
10. Estados (erro / vazio / aviso de escopo) fora do shell.

## 7. O que nunca fazer

- Usar cor de série para chrome, ou cor de status como sexta série.
- Ciclar a paleta categórica.
- Deixar a cor carregar significado sozinha.
- Misturar % e p.p.
- `var()` dentro de string de cor do ECharts.
- `<table>` à mão.
- Escrever átomo do shadcn na mão em vez de `--diff`.
- Escalar tipografia de número por `vw`.
- Guardar recorte de filtro em `useState`.
- Converter dinheiro para `Number` antes da borda de exibição.
- Exibir número parcial sem o aviso de escopo ao lado.
