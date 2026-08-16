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
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file || file.type === "application/pdf") {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handle(raw: File | null | undefined) {
    setError(null);
    if (!raw) return;
    if (raw.size === 0) {
      setError("Arquivo vazio.");
      return;
    }
    if (raw.size > MAX_BYTES) {
      setError("Arquivo muito grande (máx. 8 MB).");
      return;
    }
    setProcessing(true);
    try {
      const out = await compressDocumentImage(raw, { maxSize: 1600, quality: 0.85 });
      onChange(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar o arquivo.");
    } finally {
      setProcessing(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  const done = !!file && !processing;

  return (
    <div className={`min-w-0 rounded-xl border p-3 transition ${done ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-muted/20"}`} aria-busy={processing}>
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-5 text-foreground">
            {label} <span className="text-destructive" aria-hidden="true">*</span>
          </p>
          {helper && <p className="mt-0.5 break-words text-[11px] leading-4 text-muted-foreground">{helper}</p>}
        </div>
        {done && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-label="Documento selecionado" />}
      </div>

      <div className="flex min-w-0 items-start gap-3 max-[339px]:flex-col">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border">
          {preview ? (
            <img src={preview} alt={`Prévia de ${label}`} className="h-full w-full object-cover" />
          ) : file?.type === "application/pdf" ? (
            <FileText className="h-8 w-8 text-primary" aria-hidden="true" />
          ) : (
            <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          )}
          {processing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60" role="status" aria-label="Processando arquivo">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap gap-2 max-[339px]:w-full">
          {camera && (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={processing}
              className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-center text-xs font-medium leading-4 text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60 max-[339px]:flex-1"
            >
              <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {file ? "Nova foto" : "Câmera"}
            </button>
          )}
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={processing}
            className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-center text-xs font-medium leading-4 text-foreground transition hover:bg-muted disabled:opacity-60 max-[339px]:flex-1"
          >
            <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Galeria
          </button>
          {file && (
            <>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={processing}
                className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-center text-xs font-medium leading-4 text-foreground transition hover:bg-muted disabled:opacity-60 max-[339px]:flex-1"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Trocar
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setError(null);
                }}
                disabled={processing}
                className="inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs font-medium leading-4 text-destructive transition hover:bg-destructive/15 disabled:opacity-60 max-[339px]:flex-1"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
        accept="image/*"
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

      {error && (
        <p role="alert" className="mt-2 break-words rounded-md bg-destructive/15 px-2 py-2 text-[11px] leading-4 text-destructive ring-1 ring-destructive/30">
          {error}
        </p>
      )}
    </div>
  );
}
