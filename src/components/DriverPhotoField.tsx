import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, RotateCcw, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { compressImageToSquare } from "@/lib/imageCompress";
import { validateProfilePhotoFile } from "@/lib/profilePhoto";

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  name?: string | null;
};

/**
 * Registration profile-photo picker.
 * - Camera capture (mobile) and gallery.
 * - Compresses to 512x512 JPEG.
 * - Preview, replace, remove before final submit.
 */
export function DriverPhotoField({ file, onChange, name }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
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
    const v = validateProfilePhotoFile(raw);
    if (v) {
      setError(v);
      return;
    }
    setProcessing(true);
    try {
      const compressed = await compressImageToSquare(raw, { size: 512, quality: 0.85 });
      onChange(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar a imagem.");
    } finally {
      setProcessing(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Foto de perfil <span className="text-destructive">*</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Obrigatória. Use uma foto nítida do seu rosto.
          </p>
        </div>
        {file && !processing && <CheckCircle2 className="h-5 w-5 text-primary" />}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar src={preview} name={name} size={88} />
          {processing && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            {file ? "Nova foto" : "Câmera"}
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={processing}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
          >
            <ImageIcon className="h-4 w-4" />
            Galeria
          </button>
          {file && (
            <>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                title="Substituir"
              >
                <RotateCcw className="h-4 w-4" />
                Trocar
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setError(null);
                }}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/15 disabled:opacity-60"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
                Remover
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />

      {error && (
        <p className="mt-3 rounded-md bg-destructive/15 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/30">
          {error}
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Ajustada automaticamente para 512×512 · JPG · até 5 MB.
      </p>
    </div>
  );
}
