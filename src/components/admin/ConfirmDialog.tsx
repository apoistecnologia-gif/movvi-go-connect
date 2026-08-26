import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DSInput, DSLabel } from "@/design-system";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** If set, user must type this exact string to enable confirm. */
  confirmWord?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Two-step confirmation modal for sensitive admin actions.
 * Optional `confirmWord` requires the admin to type a word (e.g. "EXCLUIR")
 * before the destructive action is enabled.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  confirmWord,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const inputId = useId();
  const errorId = useId();
  const normalizedConfirmWord = String(confirmWord ?? "").trim();
  const ready = !normalizedConfirmWord || typed.trim() === normalizedConfirmWord;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      busyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setError(null);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    setTyped("");
    setError(null);
  }, [open, normalizedConfirmWord]);

  async function handleConfirm(event: MouseEvent) {
    event.preventDefault();
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      if (!aliveRef.current) return;
      setTyped("");
      onOpenChange(false);
    } catch (cause) {
      if (!aliveRef.current) return;
      setError("Não foi possível concluir esta ação. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Admin] confirmação sensível falhou", cause);
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && busyRef.current) return;
    if (!nextOpen) {
      setTyped("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="apois-admin-theme max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-24px)] w-[calc(100vw-24px)] max-w-lg overflow-x-hidden overflow-y-auto border-border bg-card"
        aria-busy={busy}
      >
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription asChild>
              <div className="min-w-0 break-words text-sm leading-6">{description}</div>
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {normalizedConfirmWord ? (
          <div className="min-w-0 space-y-2">
            <DSLabel htmlFor={inputId} className="break-words text-sm text-muted-foreground">
              Digite{" "}
              <span className="break-all font-mono font-semibold text-foreground">
                {normalizedConfirmWord}
              </span>{" "}
              para confirmar
            </DSLabel>
            <DSInput
              id={inputId}
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value.slice(0, Math.max(64, normalizedConfirmWord.length + 16)));
                setError(null);
              }}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              className="min-h-11 text-base"
              aria-invalid={Boolean(typed.trim()) && !ready}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        ) : null}

        {error ? (
          <p
            id={errorId}
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={busy} className="min-h-11">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!ready || busy}
            aria-busy={busy}
            className={`min-h-11 ${
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : ""
            }`}
          >
            {busy ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : null}
            {busy ? "Processando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
