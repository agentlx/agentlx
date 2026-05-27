"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Command, FileText, Search, Zap } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { searchTmuxQuickActions, type TmuxQuickAction } from "@/lib/tmux-quick-actions";
import { cn } from "@/lib/utils";

type TemplateQuickAction = {
  id: string;
  name: string;
  description: string;
  command: string;
  risk: "low" | "medium" | "high";
};

type TerminalQuickActionsProps = {
  canExecute: boolean;
  tmuxState: "active" | "inactive" | "unknown";
  onExecute: (sequence: string) => boolean | void;
  templates?: TemplateQuickAction[];
  onExecuteTemplate?: (template: TemplateQuickAction) => boolean | void | Promise<boolean | void>;
  onStartTmux: () => boolean | void;
  onFocusTerminal?: () => void;
  className?: string;
};

export function TerminalQuickActions({
  canExecute,
  tmuxState,
  onExecute,
  templates = [],
  onExecuteTemplate,
  onStartTmux,
  onFocusTerminal,
  className,
}: TerminalQuickActionsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tmuxOpen, setTmuxOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastActionName, setLastActionName] = useState("");
  const [tmuxStartPending, setTmuxStartPending] = useState(false);
  const [templateExecutionPending, setTemplateExecutionPending] = useState(false);
  const [pendingHighRiskTemplate, setPendingHighRiskTemplate] =
    useState<TemplateQuickAction | null>(null);
  const [flyoutSide, setFlyoutSide] = useState<"right" | "left">("right");
  const tmuxStartTimeoutRef = useRef<number | null>(null);

  const filteredTmuxActions = useMemo(() => searchTmuxQuickActions(query), [query]);
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return templates;
    }

    return templates.filter((template) =>
      [template.name, template.description, template.command, template.risk]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, templates]);
  const tmuxActive = tmuxState === "active";
  const tmuxInactive = tmuxState === "inactive";
  const tmuxUnknown = tmuxState === "unknown";
  const tmuxReady = tmuxActive;
  const canStartTmux = canExecute && !tmuxActive && !tmuxStartPending;

  const showFeedback = (message: string, tone: "info" | "success" | "error" = "info") => {
    if (tone === "success") {
      toast.success(message);
      return;
    }
    if (tone === "error") {
      toast.error(message);
      return;
    }
    toast(message);
  };

  useEffect(() => {
    if (tmuxActive) {
      if (tmuxStartTimeoutRef.current !== null) {
        window.clearTimeout(tmuxStartTimeoutRef.current);
        tmuxStartTimeoutRef.current = null;
      }
      setTmuxStartPending(false);
      return;
    }

    if (!tmuxStartPending) {
      return;
    }

    if (tmuxStartTimeoutRef.current !== null) {
      window.clearTimeout(tmuxStartTimeoutRef.current);
    }

    tmuxStartTimeoutRef.current = window.setTimeout(() => {
      setTmuxStartPending(false);
      showFeedback("O tmux ainda nao ficou ativo. Confira se o comando abriu a sessao.");
      tmuxStartTimeoutRef.current = null;
    }, 6_000);

    return () => {
      if (tmuxStartTimeoutRef.current !== null) {
        window.clearTimeout(tmuxStartTimeoutRef.current);
        tmuxStartTimeoutRef.current = null;
      }
    };
  }, [tmuxActive, tmuxStartPending]);

  useEffect(() => {
    return () => {
      if (tmuxStartTimeoutRef.current !== null) {
        window.clearTimeout(tmuxStartTimeoutRef.current);
        tmuxStartTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setTmuxOpen(false);
        setTemplateOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateFlyoutSide = () => {
      const rootBounds = rootRef.current?.getBoundingClientRect();
      if (!rootBounds) {
        return;
      }

      const baseMenuWidth = 188;
      const detailPanelWidth = tmuxOpen ? 320 : templateOpen ? 360 : 0;
      const totalFlyoutWidth = baseMenuWidth + (detailPanelWidth > 0 ? detailPanelWidth + 8 : 0);
      const availableSpaceRight = window.innerWidth - rootBounds.left;
      const availableSpaceLeft = rootBounds.right;

      if (totalFlyoutWidth > availableSpaceRight && availableSpaceLeft > availableSpaceRight) {
        setFlyoutSide("left");
        return;
      }

      setFlyoutSide("right");
    };

    updateFlyoutSide();
    window.addEventListener("resize", updateFlyoutSide);
    return () => {
      window.removeEventListener("resize", updateFlyoutSide);
    };
  }, [open, templateOpen, tmuxOpen]);

  const executeAction = (actionItem: TmuxQuickAction) => {
    if (!canExecute) {
      showFeedback("Conecte o shell antes de disparar uma acao rapida.", "error");
      return;
    }

    if (tmuxStartPending) {
      showFeedback("Aguarde o tmux terminar de abrir antes de usar os atalhos.");
      return;
    }

    if (!tmuxActive) {
      showFeedback("Ative o tmux nesta sessao antes de usar os atalhos.");
      return;
    }

    const result = onExecute(actionItem.sequence);
    if (result === false) {
      showFeedback("A acao nao foi enviada porque o shell remoto nao esta conectado.", "error");
      return;
    }

    setLastActionName(actionItem.name);
    showFeedback(`Acao enviada: ${actionItem.name}`, "success");
    onFocusTerminal?.();
  };

  const startTmux = () => {
    if (!canExecute) {
      showFeedback("Conecte o shell antes de iniciar o tmux.", "error");
      return;
    }

    const result = onStartTmux();
    if (result === false) {
      showFeedback("Nao foi possivel enviar o comando para iniciar o tmux.", "error");
      return;
    }

    setTmuxStartPending(true);
    onFocusTerminal?.();
  };

  const runTemplate = (template: TemplateQuickAction) => {
    if (!canExecute) {
      showFeedback("Conecte o shell antes de executar um template.", "error");
      return;
    }

    if (!onExecuteTemplate) {
      showFeedback("Os templates nao estao disponiveis neste terminal.", "error");
      return;
    }

    setTemplateExecutionPending(true);
    void Promise.resolve(onExecuteTemplate(template))
      .then((result) => {
        if (result === false) {
          showFeedback(
            "Nao foi possivel enviar o template porque o shell remoto nao esta conectado.",
            "error",
          );
          return;
        }

        setLastActionName(template.name);
        showFeedback(`Template enviado: ${template.name}`, "success");
        onFocusTerminal?.();
      })
      .catch(() => {
        showFeedback("Nao foi possivel executar o template agora.", "error");
      })
      .finally(() => {
        setTemplateExecutionPending(false);
      });
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex flex-col gap-2 pt-1 text-xs font-mono sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <button
        className={cn(
          "inline-flex h-8 w-full items-center justify-center gap-2 rounded border px-3 py-1.5 font-medium transition-colors sm:w-auto",
          open
            ? "border-border bg-secondary text-foreground"
            : "border-border/70 bg-background/70 text-foreground hover:bg-secondary",
        )}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (!next) {
              setTmuxOpen(false);
              setTemplateOpen(false);
            }
            return next;
          });
        }}
        type="button"
      >
        <Zap className="size-3.5 text-primary" />
        Acoes rapidas
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <div className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-right">
        {canExecute ? "shell pronto" : "conecte o shell"}
      </div>

      {open ? (
        <div
          className={cn(
            "absolute bottom-full z-30 mb-2 grid w-[min(calc(100vw-2rem),560px)] gap-2 md:flex md:items-end",
            flyoutSide === "left" ? "right-0 md:flex-row-reverse" : "left-0",
          )}
        >
          <div className="w-full overflow-hidden rounded-lg border border-border/80 bg-neutral-900/95 p-1.5 shadow-2xl backdrop-blur md:w-[188px]">
            <button
              className={cn(
                "flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs transition-colors",
                tmuxOpen ? "bg-white/10 text-foreground" : "text-foreground hover:bg-white/8",
              )}
              type="button"
              onClick={() => {
                setQuery("");
                setTemplateOpen(false);
                setTmuxOpen((current) => !current);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Command className="size-3.5 text-muted-foreground" />
                <span className="truncate">Tmux</span>
              </span>
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  tmuxOpen && "translate-x-0.5",
                )}
              />
            </button>

            <button
              className={cn(
                "mt-1 flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs transition-colors",
                templateOpen ? "bg-white/10 text-foreground" : "text-foreground hover:bg-white/8",
              )}
              type="button"
              onClick={() => {
                setQuery("");
                setTmuxOpen(false);
                setTemplateOpen((current) => !current);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="truncate">Template</span>
              </span>
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  templateOpen && "translate-x-0.5",
                )}
              />
            </button>
          </div>

          {tmuxOpen ? (
            <div className="w-full overflow-hidden rounded-lg border border-border/80 bg-neutral-900/95 p-2 shadow-2xl backdrop-blur md:w-[320px]">
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Tmux
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {tmuxActive
                      ? "Tmux ativo"
                      : tmuxStartPending
                        ? "Abrindo sessao do tmux..."
                        : tmuxInactive
                          ? "Tmux nao ativo"
                          : "Tmux indisponivel ou verificando estado..."}
                  </div>
                </div>
                {lastActionName ? (
                  <div className="max-w-[120px] truncate rounded bg-white/8 px-2 py-1 text-[10px] text-muted-foreground">
                    {lastActionName}
                  </div>
                ) : null}
              </div>

              <div className="relative px-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar acao do tmux..."
                  className="h-8 rounded border-white/10 bg-white/6 pl-9 text-xs text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <ScrollArea className="mt-2 h-[min(46vh,240px)] pr-1">
                <div className="space-y-1 px-1">
                  {!tmuxActive ? (
                    <button
                      type="button"
                      disabled={!canStartTmux}
                      onClick={startTmux}
                      className="w-full rounded bg-white/8 px-3 py-2 text-left transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-[11px] leading-4 text-foreground">
                          {tmuxStartPending
                            ? "Aguardando a sessao do tmux ficar pronta..."
                            : "Iniciar ou reanexar tmux nesta sessao"}
                        </div>
                        <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[9px] text-primary">
                          {tmuxStartPending ? "aguarde" : "tmux"}
                        </span>
                      </div>
                    </button>
                  ) : null}

                  {filteredTmuxActions.length > 0 ? (
                    filteredTmuxActions.map((actionItem) => (
                      <button
                        key={actionItem.id}
                        type="button"
                        disabled={!canExecute || !tmuxReady}
                        onClick={() => executeAction(actionItem)}
                        className="w-full rounded px-3 py-2 text-left transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="truncate text-[11px] leading-4 text-foreground">
                          {actionItem.description}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhuma funcao do tmux encontrada para esse filtro.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : null}

          {templateOpen ? (
            <div className="w-full overflow-hidden rounded-lg border border-border/80 bg-neutral-900/95 p-2 shadow-2xl backdrop-blur md:w-[360px]">
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Template
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {templates.length > 0
                      ? "Execute um template imediatamente neste shell."
                      : "Nenhum template disponivel no momento."}
                  </div>
                </div>
                {lastActionName ? (
                  <div className="max-w-[120px] truncate rounded bg-white/8 px-2 py-1 text-[10px] text-muted-foreground">
                    {lastActionName}
                  </div>
                ) : null}
              </div>

              <div className="relative px-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar template..."
                  className="h-8 rounded border-white/10 bg-white/6 pl-9 text-xs text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <ScrollArea className="mt-2 h-[min(46vh,240px)] pr-1">
                <div className="space-y-1 px-1">
                  {filteredTemplates.length > 0 ? (
                    filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        disabled={!canExecute || templateExecutionPending}
                        onClick={() => {
                          if (template.risk === "high") {
                            setPendingHighRiskTemplate(template);
                            return;
                          }

                          runTemplate(template);
                        }}
                        className="w-full rounded px-3 py-2 text-left transition-colors hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium leading-4 text-foreground">
                              {template.name}
                            </div>
                            <div className="truncate pr-1 text-[10px] leading-4 text-muted-foreground">
                              {template.description || template.command}
                            </div>
                          </div>
                          <span className="shrink-0 whitespace-nowrap rounded bg-white/8 px-2 py-0.5 text-[9px] uppercase leading-none text-primary">
                            {template.risk}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded border border-dashed border-white/10 px-3 py-6 text-center text-xs text-muted-foreground">
                      {templates.length > 0
                        ? "Nenhum template encontrado para esse filtro."
                        : "Nenhum template disponivel para executar."}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={pendingHighRiskTemplate !== null}
        title="Executar template de alto risco"
        description={
          <>
            O template{" "}
            <span className="font-medium text-foreground">{pendingHighRiskTemplate?.name}</span>{" "}
            sera enviado para um shell privilegiado.
          </>
        }
        tone="danger"
        confirmLabel="Executar template"
        busy={templateExecutionPending}
        onClose={() => {
          setPendingHighRiskTemplate(null);
          showFeedback("Execucao de alto risco cancelada.");
        }}
        onConfirm={() => {
          const template = pendingHighRiskTemplate;
          setPendingHighRiskTemplate(null);
          if (template) {
            runTemplate(template);
          }
        }}
      />
    </div>
  );
}
