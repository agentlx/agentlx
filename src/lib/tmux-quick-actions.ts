export type TmuxQuickAction = {
  id: string;
  name: string;
  shortcut: string;
  description: string;
  sequence: string;
  tags: string[];
};

const TMUX_PREFIX = "\u0002";
const ESC = "\u001b";
const CTRL = {
  b: "\u0002",
  o: "\u000f",
  z: "\u001a",
} as const;

const ARROW = {
  up: `${ESC}[A`,
  down: `${ESC}[B`,
  right: `${ESC}[C`,
  left: `${ESC}[D`,
} as const;

const MODIFIED_ARROW = {
  ctrlUp: `${ESC}[1;5A`,
  ctrlDown: `${ESC}[1;5B`,
  ctrlRight: `${ESC}[1;5C`,
  ctrlLeft: `${ESC}[1;5D`,
  altUp: `${ESC}[1;3A`,
  altDown: `${ESC}[1;3B`,
  altRight: `${ESC}[1;3C`,
  altLeft: `${ESC}[1;3D`,
} as const;

const PAGE_UP = `${ESC}[5~`;

function alt(value: string) {
  return `${ESC}${value}`;
}

function tmuxShortcut(keySequence: string) {
  return `${TMUX_PREFIX}${keySequence}`;
}

function action(
  id: string,
  name: string,
  shortcut: string,
  description: string,
  keySequence: string,
  tags: string[],
): TmuxQuickAction {
  return {
    id,
    name,
    shortcut,
    description,
    sequence: tmuxShortcut(keySequence),
    tags,
  };
}

const numberedWindowActions = Array.from({ length: 10 }, (_, index) =>
  action(
    `select-window-${index}`,
    `select-window-${index}`,
    `Ctrl+b ${index}`,
    `Troca para a janela ${index}.`,
    String(index),
    ["window", "janela", "select", "indice", String(index)],
  ),
);

const layoutActions: TmuxQuickAction[] = [
  action(
    "layout-even-horizontal",
    "layout-even-horizontal",
    "Ctrl+b Alt+1",
    "Aplica o layout even-horizontal.",
    alt("1"),
    ["layout", "even-horizontal", "horizontal"],
  ),
  action(
    "layout-even-vertical",
    "layout-even-vertical",
    "Ctrl+b Alt+2",
    "Aplica o layout even-vertical.",
    alt("2"),
    ["layout", "even-vertical", "vertical"],
  ),
  action(
    "layout-main-horizontal",
    "layout-main-horizontal",
    "Ctrl+b Alt+3",
    "Aplica o layout main-horizontal.",
    alt("3"),
    ["layout", "main-horizontal", "horizontal"],
  ),
  action(
    "layout-main-horizontal-mirrored",
    "layout-main-horizontal-mirrored",
    "Ctrl+b Alt+4",
    "Aplica o layout main-horizontal-mirrored.",
    alt("4"),
    ["layout", "main-horizontal-mirrored", "horizontal"],
  ),
  action(
    "layout-main-vertical",
    "layout-main-vertical",
    "Ctrl+b Alt+5",
    "Aplica o layout main-vertical.",
    alt("5"),
    ["layout", "main-vertical", "vertical"],
  ),
  action(
    "layout-main-vertical-mirrored",
    "layout-main-vertical-mirrored",
    "Ctrl+b Alt+6",
    "Aplica o layout main-vertical-mirrored.",
    alt("6"),
    ["layout", "main-vertical-mirrored", "vertical"],
  ),
  action("layout-tiled", "layout-tiled", "Ctrl+b Alt+7", "Aplica o layout tiled.", alt("7"), [
    "layout",
    "tiled",
  ]),
  action(
    "next-layout",
    "next-layout",
    "Ctrl+b Space",
    "Avanca para o proximo layout predefinido.",
    " ",
    ["layout", "next", "space"],
  ),
];

const paneActions: TmuxQuickAction[] = [
  action(
    "split-window-vertical",
    "split-window-vertical",
    "Ctrl+b %",
    "Divide o pane atual em esquerda e direita.",
    "%",
    ["split", "pane", "vertical", "direita", "esquerda"],
  ),
  action(
    "split-window-horizontal",
    "split-window-horizontal",
    'Ctrl+b "',
    "Divide o pane atual em cima e baixo.",
    '"',
    ["split", "pane", "horizontal", "cima", "baixo"],
  ),
  action(
    "display-panes",
    "display-panes",
    "Ctrl+b q",
    "Mostra os indices dos panes para navegacao rapida.",
    "q",
    ["pane", "display", "indice"],
  ),
  action(
    "select-pane-next",
    "select-pane-next",
    "Ctrl+b o",
    "Seleciona o proximo pane da janela.",
    "o",
    ["pane", "next", "proximo"],
  ),
  action(
    "last-pane",
    "last-pane",
    "Ctrl+b ;",
    "Volta para o pane selecionado anteriormente.",
    ";",
    ["pane", "last", "anterior"],
  ),
  action(
    "select-pane-up",
    "select-pane-up",
    "Ctrl+b Up",
    "Seleciona o pane acima do atual.",
    ARROW.up,
    ["pane", "up", "acima"],
  ),
  action(
    "select-pane-down",
    "select-pane-down",
    "Ctrl+b Down",
    "Seleciona o pane abaixo do atual.",
    ARROW.down,
    ["pane", "down", "abaixo"],
  ),
  action(
    "select-pane-left",
    "select-pane-left",
    "Ctrl+b Left",
    "Seleciona o pane a esquerda do atual.",
    ARROW.left,
    ["pane", "left", "esquerda"],
  ),
  action(
    "select-pane-right",
    "select-pane-right",
    "Ctrl+b Right",
    "Seleciona o pane a direita do atual.",
    ARROW.right,
    ["pane", "right", "direita"],
  ),
  action(
    "swap-pane-up",
    "swap-pane-up",
    "Ctrl+b {",
    "Troca o pane atual com o pane anterior.",
    "{",
    ["swap", "pane", "anterior"],
  ),
  action(
    "swap-pane-down",
    "swap-pane-down",
    "Ctrl+b }",
    "Troca o pane atual com o proximo pane.",
    "}",
    ["swap", "pane", "proximo"],
  ),
  action("toggle-pane-zoom", "toggle-pane-zoom", "Ctrl+b z", "Alterna o zoom do pane atual.", "z", [
    "zoom",
    "pane",
    "maximizar",
  ]),
  action("mark-pane", "mark-pane", "Ctrl+b m", "Marca ou desmarca o pane atual.", "m", [
    "mark",
    "pane",
    "marcar",
  ]),
  action(
    "clear-marked-pane",
    "clear-marked-pane",
    "Ctrl+b M",
    "Limpa a marcacao atual do pane.",
    "M",
    ["mark", "pane", "clear", "limpar"],
  ),
  action(
    "rotate-window-forward",
    "rotate-window-forward",
    "Ctrl+b Ctrl+o",
    "Rotaciona os panes da janela para frente.",
    CTRL.o,
    ["rotate", "pane", "forward"],
  ),
  action(
    "rotate-window-backward",
    "rotate-window-backward",
    "Ctrl+b Alt+o",
    "Rotaciona os panes da janela para tras.",
    alt("o"),
    ["rotate", "pane", "backward", "tras"],
  ),
  action("kill-pane", "kill-pane", "Ctrl+b x", "Fecha o pane atual.", "x", [
    "kill",
    "pane",
    "fechar",
  ]),
  action("break-pane", "break-pane", "Ctrl+b !", "Move o pane atual para uma nova janela.", "!", [
    "break",
    "pane",
    "janela",
  ]),
];

const resizeActions: TmuxQuickAction[] = [
  action(
    "resize-pane-up-small",
    "resize-pane-up-small",
    "Ctrl+b Ctrl+Up",
    "Redimensiona o pane atual 1 linha para cima.",
    MODIFIED_ARROW.ctrlUp,
    ["resize", "pane", "up", "1"],
  ),
  action(
    "resize-pane-down-small",
    "resize-pane-down-small",
    "Ctrl+b Ctrl+Down",
    "Redimensiona o pane atual 1 linha para baixo.",
    MODIFIED_ARROW.ctrlDown,
    ["resize", "pane", "down", "1"],
  ),
  action(
    "resize-pane-left-small",
    "resize-pane-left-small",
    "Ctrl+b Ctrl+Left",
    "Redimensiona o pane atual 1 coluna para a esquerda.",
    MODIFIED_ARROW.ctrlLeft,
    ["resize", "pane", "left", "1"],
  ),
  action(
    "resize-pane-right-small",
    "resize-pane-right-small",
    "Ctrl+b Ctrl+Right",
    "Redimensiona o pane atual 1 coluna para a direita.",
    MODIFIED_ARROW.ctrlRight,
    ["resize", "pane", "right", "1"],
  ),
  action(
    "resize-pane-up-large",
    "resize-pane-up-large",
    "Ctrl+b Alt+Up",
    "Redimensiona o pane atual 5 linhas para cima.",
    MODIFIED_ARROW.altUp,
    ["resize", "pane", "up", "5"],
  ),
  action(
    "resize-pane-down-large",
    "resize-pane-down-large",
    "Ctrl+b Alt+Down",
    "Redimensiona o pane atual 5 linhas para baixo.",
    MODIFIED_ARROW.altDown,
    ["resize", "pane", "down", "5"],
  ),
  action(
    "resize-pane-left-large",
    "resize-pane-left-large",
    "Ctrl+b Alt+Left",
    "Redimensiona o pane atual 5 colunas para a esquerda.",
    MODIFIED_ARROW.altLeft,
    ["resize", "pane", "left", "5"],
  ),
  action(
    "resize-pane-right-large",
    "resize-pane-right-large",
    "Ctrl+b Alt+Right",
    "Redimensiona o pane atual 5 colunas para a direita.",
    MODIFIED_ARROW.altRight,
    ["resize", "pane", "right", "5"],
  ),
];

const windowActions: TmuxQuickAction[] = [
  action("new-window", "new-window", "Ctrl+b c", "Cria uma nova janela.", "c", [
    "window",
    "janela",
    "criar",
  ]),
  action(
    "choose-tree-window",
    "choose-tree-window",
    "Ctrl+b w",
    "Abre o seletor de janelas.",
    "w",
    ["window", "chooser", "janela", "lista"],
  ),
  action("last-window", "last-window", "Ctrl+b l", "Volta para a ultima janela usada.", "l", [
    "window",
    "last",
    "ultima",
  ]),
  action("next-window", "next-window", "Ctrl+b n", "Vai para a proxima janela.", "n", [
    "window",
    "next",
    "proxima",
  ]),
  action("previous-window", "previous-window", "Ctrl+b p", "Volta para a janela anterior.", "p", [
    "window",
    "previous",
    "anterior",
  ]),
  action(
    "window-with-activity-next",
    "window-with-activity-next",
    "Ctrl+b Alt+n",
    "Vai para a proxima janela com atividade ou bell.",
    alt("n"),
    ["window", "activity", "next", "bell"],
  ),
  action(
    "window-with-activity-prev",
    "window-with-activity-prev",
    "Ctrl+b Alt+p",
    "Vai para a janela anterior com atividade ou bell.",
    alt("p"),
    ["window", "activity", "previous", "bell"],
  ),
  action(
    "choose-window-by-index",
    "choose-window-by-index",
    "Ctrl+b '",
    "Abre o prompt para ir a uma janela pelo indice.",
    "'",
    ["window", "indice", "prompt", "janela"],
  ),
  action(
    "rename-window",
    "rename-window",
    "Ctrl+b ,",
    "Abre o prompt para renomear a janela atual.",
    ",",
    ["window", "rename", "janela", "nome"],
  ),
  action(
    "move-window",
    "move-window",
    "Ctrl+b .",
    "Abre o prompt para mover a janela atual para outro indice.",
    ".",
    ["window", "move", "indice", "janela"],
  ),
  action("kill-window", "kill-window", "Ctrl+b &", "Fecha a janela atual.", "&", [
    "window",
    "kill",
    "fechar",
  ]),
  ...numberedWindowActions,
];

const sessionActions: TmuxQuickAction[] = [
  action(
    "rename-session",
    "rename-session",
    "Ctrl+b $",
    "Abre o prompt para renomear a sessao atual.",
    "$",
    ["session", "sessao", "rename", "nome"],
  ),
  action(
    "choose-tree-session",
    "choose-tree-session",
    "Ctrl+b s",
    "Abre o seletor de sessoes.",
    "s",
    ["session", "sessao", "chooser", "lista"],
  ),
  action(
    "switch-client-last-session",
    "switch-client-last-session",
    "Ctrl+b L",
    "Troca para a ultima sessao usada pelo client.",
    "L",
    ["session", "sessao", "last", "client"],
  ),
  action(
    "switch-client-prev-session",
    "switch-client-prev-session",
    "Ctrl+b (",
    "Troca o client para a sessao anterior.",
    "(",
    ["session", "sessao", "previous", "client"],
  ),
  action(
    "switch-client-next-session",
    "switch-client-next-session",
    "Ctrl+b )",
    "Troca o client para a proxima sessao.",
    ")",
    ["session", "sessao", "next", "client"],
  ),
  action(
    "detach-client",
    "detach-client",
    "Ctrl+b d",
    "Destaca o client atual e deixa a sessao rodando.",
    "d",
    ["session", "sessao", "detach", "client"],
  ),
  action(
    "choose-client",
    "choose-client",
    "Ctrl+b D",
    "Abre o seletor de clients para destacar um deles.",
    "D",
    ["session", "sessao", "client", "chooser", "detach"],
  ),
  action(
    "suspend-client",
    "suspend-client",
    "Ctrl+b Ctrl+z",
    "Suspende o client atual do tmux.",
    CTRL.z,
    ["session", "sessao", "client", "suspend"],
  ),
];

const copyActions: TmuxQuickAction[] = [
  action("copy-mode", "copy-mode", "Ctrl+b [", "Entra no modo de copia.", "[", [
    "copy",
    "history",
    "scrollback",
  ]),
  action(
    "copy-mode-page-up",
    "copy-mode-page-up",
    "Ctrl+b PageUp",
    "Entra no modo de copia e sobe uma pagina.",
    PAGE_UP,
    ["copy", "history", "pageup", "scrollback"],
  ),
  action("paste-buffer", "paste-buffer", "Ctrl+b ]", "Cola o buffer mais recente do tmux.", "]", [
    "paste",
    "buffer",
    "colar",
  ]),
  action(
    "choose-buffer",
    "choose-buffer",
    "Ctrl+b =",
    "Abre o seletor de buffers para colagem.",
    "=",
    ["buffer", "paste", "choose", "colar"],
  ),
  action("list-buffers", "list-buffers", "Ctrl+b #", "Lista todos os buffers do tmux.", "#", [
    "buffer",
    "list",
    "lista",
  ]),
  action("delete-buffer", "delete-buffer", "Ctrl+b -", "Apaga o buffer mais recente.", "-", [
    "buffer",
    "delete",
    "apagar",
  ]),
];

const infoActions: TmuxQuickAction[] = [
  action("command-prompt", "command-prompt", "Ctrl+b :", "Abre o prompt de comando do tmux.", ":", [
    "command",
    "prompt",
    "tmux",
  ]),
  action(
    "send-prefix",
    "send-prefix",
    "Ctrl+b Ctrl+b",
    "Envia o proprio Ctrl+b para a aplicacao dentro do pane.",
    CTRL.b,
    ["prefix", "tmux", "ctrl b"],
  ),
  action("find-window", "find-window", "Ctrl+b f", "Abre o prompt de busca nas janelas.", "f", [
    "find",
    "search",
    "window",
    "janela",
  ]),
  action(
    "display-message-pane-info",
    "display-message-pane-info",
    "Ctrl+b i",
    "Mostra informacoes sobre a janela e o pane atuais.",
    "i",
    ["info", "window", "pane"],
  ),
  action("clock-mode", "clock-mode", "Ctrl+b t", "Exibe o relogio do tmux.", "t", [
    "clock",
    "time",
    "relogio",
  ]),
  action("list-keys", "list-keys", "Ctrl+b ?", "Lista os atalhos ativos do tmux.", "?", [
    "keys",
    "list",
    "help",
    "atalhos",
  ]),
  action(
    "show-messages",
    "show-messages",
    "Ctrl+b ~",
    "Mostra as mensagens anteriores do tmux.",
    "~",
    ["messages", "log", "mensagens"],
  ),
  action("refresh-client", "refresh-client", "Ctrl+b r", "Redesenha o client atual.", "r", [
    "refresh",
    "client",
    "redraw",
  ]),
];

export const tmuxQuickActions: TmuxQuickAction[] = [
  ...infoActions,
  ...windowActions,
  ...sessionActions,
  ...paneActions,
  ...resizeActions,
  ...layoutActions,
  ...copyActions,
];

export function searchTmuxQuickActions(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return tmuxQuickActions;
  }

  return tmuxQuickActions.filter((actionItem) => {
    const haystack = [
      actionItem.name,
      actionItem.shortcut,
      actionItem.description,
      ...actionItem.tags,
    ].join(" ");
    return haystack.toLowerCase().includes(normalizedQuery);
  });
}

export function getTmuxQuickActionById(id: string) {
  return tmuxQuickActions.find((actionItem) => actionItem.id === id) ?? null;
}
