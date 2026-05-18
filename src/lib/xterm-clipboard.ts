import type { Terminal } from "@xterm/xterm";

type SetupTerminalClipboardInput = {
  terminal: Terminal;
  container: HTMLElement;
  sendInput: (text: string) => void;
};

export function setupTerminalClipboard({
  terminal,
  container,
  sendInput,
}: SetupTerminalClipboardInput) {
  const shouldForwardShortcutToTerminal = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.altKey || event.metaKey)) {
      return false;
    }

    const key = event.key.toLowerCase();
    if (key === "control" || key === "shift" || key === "alt" || key === "meta") {
      return false;
    }

    const wantsPaste = (event.ctrlKey || event.metaKey) && !event.altKey && key === "v";
    if (wantsPaste) {
      return false;
    }

    const wantsCopy = (event.ctrlKey || event.metaKey) && !event.altKey && key === "c";
    if (wantsCopy && terminal.hasSelection()) {
      return false;
    }

    return true;
  };

  const pasteText = (text: string) => {
    if (!text) {
      return;
    }

    terminal.focus();
    sendInput(text);
  };

  const pasteFromClipboard = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      pasteText(text);
    } catch {
      // Ignore clipboard access errors.
    }
  };

  const copySelectionToClipboard = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }

    const selection = terminal.getSelection();
    if (!selection) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(selection);
      return true;
    } catch {
      return false;
    }
  };

  terminal.attachCustomKeyEventHandler((event) => {
    const key = event.key.toLowerCase();
    const wantsCopy = (event.ctrlKey || event.metaKey) && !event.altKey && key === "c";

    if (wantsCopy && terminal.hasSelection()) {
      event.preventDefault();
      void copySelectionToClipboard();
      return false;
    }

    if (shouldForwardShortcutToTerminal(event)) {
      // Keep browser and app shortcuts from stealing tmux and shell chords
      // while still letting xterm translate and send the key sequence.
      event.preventDefault();
    }

    return true;
  });

  const handleKeyDownCapture = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const wantsPaste = (event.ctrlKey || event.metaKey) && !event.altKey && key === "v";
    if (!wantsPaste) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void pasteFromClipboard();
  };

  const handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    void pasteFromClipboard();
  };

  const handlePaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text) {
      return;
    }

    event.preventDefault();
    pasteText(text);
  };

  container.addEventListener("keydown", handleKeyDownCapture, true);
  container.addEventListener("contextmenu", handleContextMenu);
  container.addEventListener("paste", handlePaste);

  return () => {
    container.removeEventListener("keydown", handleKeyDownCapture, true);
    container.removeEventListener("contextmenu", handleContextMenu);
    container.removeEventListener("paste", handlePaste);
  };
}
