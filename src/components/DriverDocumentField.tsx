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
  /** Include camera capture button. */
  camera?: boolean;
  /** Facing mode for camera capture. */
  facing?: "user" | "environment";
  /** Accepts JPG/PNG/WEBP. PDFs also accepted (skipped from compression). */
  accept?: string;
};

const DEFAULT_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,application/pdf";
const MAX_BYTES = 8 * 1024 * 1024; // 8MB pre-compression

/**
 * Registration-time document picker (no upload yet).
 * Supports camera + gallery, preview, replace and remove.
 * Compresses images (keeps aspect ratio) before final submit.
 */
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
    <div
      className={`rounded-xl border p-3 transition ${done ? "border-primary/40 bg-primary/5" : "border-dashed border-border bg-muted/20"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {label} <span className="text-destructive">*</span>
          </p>
          {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
        </div>
        {done && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border">
          {preview ? (
            <img src={preview} alt={label} className="h-full w-full object-cover" />
          ) : file?.type === "application/pdf" ? (
            <FileText className="h-8 w-8 text-primary" />
          ) : (
            <ImageIcon className="h-7 w-7 text-muted-foreground" />
          )}
          {processing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-wrap gap-2">
          {camera && (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={processing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" />
              {file ? "Nova foto" : "Câmera"}
            </button>
          )}
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={processing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Galeria
          </button>
          {file && (
            <>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={processing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Trocar
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setError(null);
                }}
                disabled={processing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/15 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
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
        className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />

      {error && (
        <p className="mt-2 rounded-md bg-destructive/15 px-2 py-1 text-[11px] text-destructive ring-1 ring-destructive/30">
          {error}
        </p>
      )}
    </div>
  );
}
