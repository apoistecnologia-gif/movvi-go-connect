import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
  Loader2,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { compressDocumentImage } from "@/lib/imageCompress";

type Props = {
  id: string;
  label: string;
  helper?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  camera?: boolean;
  facing?: "user" | "environment";
  accept?: string;
};

const DEFAULT_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,application/pdf";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]);

function resetInput(input: HTMLInputElement | null) {
  if (input) input.value = "";
}

export function DriverDocumentField({
  id,
  label,
  helper,
  file,
  onChange,
  camera = true,
  facing = "environment",
  accept = DEFAULT_ACCEPT,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreviewFailed(false);
    if (!file || file.type === "application/pdf") {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handle(raw: File | null | undefined) {
    if (processing) return;
    setError(null);
    resetInput(cameraRef.current);
    resetInput(galleryRef.current);
    if (!raw) return;
    if (raw.size === 0) {
      setError("O arquivo selecionado está vazio. Escolha outro arquivo.");
      return;
    }
    if (raw.size > MAX_BYTES) {
      setError("O arquivo ultrapassa o limite de 8 MB. Escolha um arquivo menor.");
      return;
    }
    if (!ALLOWED_TYPES.has(raw.type.toLowerCase())) {
      setError("Formato não aceito. Use JPG, PNG, WEBP ou PDF.");
      return;
    }

    setProcessing(true);
    try {
      const out = await compressDocumentImage(raw, { maxSize: 1600, quality: 0.85 });
      if (!out || out.size <= 0) {
        setError("Não foi possível preparar este arquivo. Tente selecionar novamente.");
        return;
      }
      if (out.size > MAX_BYTES) {
        setError("O arquivo processado ainda ultrapassa 8 MB. Escolha uma imagem menor.");
        return;
      }
      onChange(out);
    } catch {
      setError("Não foi possível processar o arquivo. Tente novamente com outra imagem ou PDF.");
    } finally {
      setProcessing(false);
      resetInput(cameraRef.current);
      resetInput(galleryRef.current);
    }
  }

  const done = !!file && !processing;
  const statusText = processing
    ? "Processando arquivo"
    : file
      ? `${file.name || "Documento"} selecionado`
      : "Nenhum documento selecionado";

  return (
    <div
      className={`min-w-0 rounded-xl border p-3 transition ${done ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-muted/20"}`}
      aria-busy={processing}
      aria-describedby={`${id}-status${error ? ` ${id}-error` : ""}`}
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-5 text-foreground">
            {label} <span className="text-destructive" aria-hidden="true">*</span><span className="sr-only">obrigatório</span>
          </p>
          {helper && <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{helper}</p>}
        </div>
        {done && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
      </div>

      <div className="flex min-w-0 items-start gap-3 max-[339px]:flex-col">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border">
          {preview && !previewFailed ? (
            <img
              src={preview}
              alt={`Prévia de ${label}`}
              className="h-full w-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          ) : file?.type === "application/pdf" ? (
            <FileText className="h-8 w-8 text-primary" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          )}
          {processing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60" role="status" aria-label="Processando arquivo">
              <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap gap-2 max-[339px]:w-full">
          {camera && (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={processing}
              className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium leading-5 text-primary-foreground shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 max-[339px]:flex-1"
            >
              <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
              {file ? "Nova foto" : "Câmera"}
            </button>
          )}
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={processing}
            className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-medium leading-5 text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 max-[339px]:flex-1"
          >
            <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {file ? "Outro arquivo" : "Galeria"}
          </button>
          {file && (
            <>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={processing}
                className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-center text-sm font-medium leading-5 text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 max-[339px]:flex-1"
              >
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
                Trocar
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setPreviewFailed(false);
                  setError(null);
                }}
                disabled={processing}
                className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm font-medium leading-5 text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/70 max-[339px]:flex-1"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Remover
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={cameraRef}
        id={`${id}-camera`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={facing}
        className="sr-only"
        aria-label={`Tirar foto para ${label}`}
        disabled={processing}
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={`Selecionar arquivo para ${label}`}
        disabled={processing}
        onChange={(e) => void handle(e.target.files?.[0])}
      />

      <p id={`${id}-status`} className="mt-2 break-words text-xs leading-5 text-muted-foreground" aria-live="polite">
        {statusText}
      </p>

      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 break-words rounded-md bg-destructive/15 px-2 py-2 text-xs leading-5 text-destructive ring-1 ring-destructive/30">
          {error}
        </p>
      )}
    </div>
  );
}
