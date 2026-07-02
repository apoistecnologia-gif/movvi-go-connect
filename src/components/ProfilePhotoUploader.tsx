import { useRef, useState } from "react";
import { Loader2, Camera } from "lucide-react";
import { Avatar } from "./Avatar";
import { uploadProfilePhoto, validateProfilePhotoFile } from "@/lib/profilePhoto";
import { compressImageToSquare } from "@/lib/imageCompress";

type Props = {
  userId: string;
  name?: string | null;
  currentUrl: string | null;
  /** Called with `{ signedUrl, path }` after a successful upload. */
  onUploaded: (result: { signedUrl: string; path: string }) => void | Promise<void>;
  size?: number;
  /** When true, renders a "obrigatória" hint. */
  required?: boolean;
  label?: string;
};

export function ProfilePhotoUploader({
  userId,
  name,
  currentUrl,
  onUploaded,
  size = 96,
  required,
  label = "Foto de perfil",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const v = validateProfilePhotoFile(file);
    if (v) {
      setError(v);
      return;
    }
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    try {
      const compressed = await compressImageToSquare(file, { size: 512, quality: 0.85 });
      const res = await uploadProfilePhoto(userId, compressed);
      await onUploaded(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a foto.");
      setPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const shown = preview ?? currentUrl;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar src={shown} name={name} size={size} />
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-card transition hover:brightness-110 disabled:opacity-60"
          aria-label="Alterar foto"
        >
          <Camera className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </p>
        <p className="text-[10px] text-muted-foreground">JPG, PNG ou WEBP · até 5 MB</p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/15 px-2 py-1 text-[11px] text-destructive ring-1 ring-destructive/30">
          {error}
        </p>
      )}
    </div>
  );
}
