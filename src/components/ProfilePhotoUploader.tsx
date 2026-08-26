import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Camera, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";
import {
  loadOwnProfilePhotoUrl,
  refreshProfilePhotoUrl,
  uploadProfilePhoto,
  validateProfilePhotoFile,
} from "@/lib/profilePhoto";
import { compressImageToSquare } from "@/lib/imageCompress";

type Props = {
  userId: string;
  name?: string | null;
  currentUrl: string | null;
  onUploaded: (result: { signedUrl: string; path: string }) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  size?: number;
  required?: boolean;
  label?: string;
};

function safeRemotePhotoUrl(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
}

function friendlyPhotoError(error: unknown, fallback: string) {
  if (import.meta.env.DEV) console.warn("[APOIS FOTO]", error);
  return fallback;
}

export function ProfilePhotoUploader({
  userId,
  name,
  currentUrl,
  onUploaded,
  onRemove,
  size = 96,
  required,
  label = "Foto de perfil",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const loadSequenceRef = useRef(0);
  const localPreviewRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resolvedCurrentUrl, setResolvedCurrentUrl] = useState<string | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  const safeUserId = userId.trim();
  const safeLabel = label.trim() || "Foto de perfil";
  const safeSize = Number.isFinite(size) ? Math.min(160, Math.max(72, Math.round(size))) : 96;
  const busy = uploading || removing;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
        localPreviewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const sequence = ++loadSequenceRef.current;
    let cancelled = false;
    setLoadingCurrent(true);

    void (async () => {
      try {
        let resolved: string | null = null;
        const direct = safeRemotePhotoUrl(currentUrl);
        if (direct) {
          resolved = direct;
        } else if (currentUrl?.trim()) {
          resolved = await refreshProfilePhotoUrl(currentUrl.trim());
        }
        if (!resolved) resolved = await loadOwnProfilePhotoUrl();
        if (!cancelled && mountedRef.current && sequence === loadSequenceRef.current) {
          setResolvedCurrentUrl(safeRemotePhotoUrl(resolved));
        }
      } catch (loadError) {
        if (!cancelled && mountedRef.current && sequence === loadSequenceRef.current) {
          setResolvedCurrentUrl(null);
          if (import.meta.env.DEV) console.warn("[APOIS FOTO] falha ao carregar foto atual", loadError);
        }
      } finally {
        if (!cancelled && mountedRef.current && sequence === loadSequenceRef.current) setLoadingCurrent(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUrl, safeUserId]);

  async function handleFile(file: File) {
    if (busy) return;
    setError(null);
    setStatusMessage(null);
    if (!safeUserId) {
      setError("Sua sessão não está pronta para enviar a foto. Entre novamente e tente de novo.");
      return;
    }

    const validation = validateProfilePhotoFile(file);
    if (validation) {
      setError(validation);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    const localPreview = URL.createObjectURL(file);
    localPreviewRef.current = localPreview;
    setPreview(localPreview);

    try {
      const compressed = await compressImageToSquare(file, { size: 512, quality: 0.85 });
      const compressedValidation = validateProfilePhotoFile(compressed);
      if (compressedValidation) throw new Error("compressed_photo_invalid");

      const result = await uploadProfilePhoto(safeUserId, compressed);
      const signedUrl = safeRemotePhotoUrl(result.signedUrl);
      if (!signedUrl || !result.path?.trim()) throw new Error("invalid_upload_result");

      setResolvedCurrentUrl(signedUrl);
      setPreview(signedUrl);
      try {
        await onUploaded({ ...result, signedUrl });
        if (mountedRef.current) setStatusMessage("Foto atualizada com sucesso.");
      } catch (callbackError) {
        if (mountedRef.current) {
          setError(friendlyPhotoError(callbackError, "A foto foi enviada, mas o perfil não confirmou a atualização. Tente novamente."));
        }
      }
    } catch (uploadError) {
      if (mountedRef.current) {
        setError(friendlyPhotoError(uploadError, "Não foi possível enviar a foto. Verifique a imagem e tente novamente."));
        setPreview(null);
      }
    } finally {
      if (localPreviewRef.current === localPreview) {
        URL.revokeObjectURL(localPreview);
        localPreviewRef.current = null;
      }
      if (mountedRef.current) setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!onRemove || busy) return;
    setError(null);
    setStatusMessage(null);
    if (!window.confirm("Remover sua foto de perfil?")) return;
    setRemoving(true);
    try {
      await onRemove();
      if (!mountedRef.current) return;
      setResolvedCurrentUrl(null);
      setPreview(null);
      setStatusMessage("Foto removida.");
    } catch (removeError) {
      if (mountedRef.current) {
        setError(friendlyPhotoError(removeError, "Não foi possível remover a foto. Tente novamente."));
      }
    } finally {
      if (mountedRef.current) setRemoving(false);
    }
  }

  const shown = preview ?? resolvedCurrentUrl;
  const hasPhoto = Boolean(shown || currentUrl?.trim());
  const helpId = useMemo(() => `profile-photo-help-${safeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "photo"}`, [safeLabel]);

  return (
    <div className="flex min-w-0 flex-col items-center gap-2" aria-busy={busy || loadingCurrent}>
      <div className="relative" style={{ width: safeSize, height: safeSize }}>
        <Avatar src={shown} name={name?.trim() || "Motorista"} size={safeSize} />
        {(uploading || loadingCurrent) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55" role="status" aria-label={uploading ? "Enviando foto" : "Carregando foto"}>
            <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || loadingCurrent || !safeUserId}
          className="absolute -bottom-1 -right-1 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-card transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={hasPhoto ? "Alterar foto de perfil" : "Adicionar foto de perfil"}
          aria-describedby={helpId}
        >
          <Camera className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="sr-only"
        aria-label={`Selecionar ${safeLabel.toLowerCase()}`}
        aria-describedby={helpId}
        disabled={busy || !safeUserId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="min-w-0 max-w-full text-center">
        <p className="break-words text-[12px] font-semibold uppercase leading-4 tracking-wider text-muted-foreground">
          {safeLabel}
          {required && <span className="ml-1 text-destructive" aria-label="obrigatória">*</span>}
        </p>
        <p id={helpId} className="mt-0.5 break-words text-[12px] leading-4 text-muted-foreground">
          JPG, PNG ou WEBP · até 5 MB
        </p>
      </div>

      {onRemove && hasPhoto && !uploading && (
        <button
          type="button"
          disabled={busy || loadingCurrent}
          onClick={() => void handleRemove()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
          {removing ? "Removendo…" : "Remover foto"}
        </button>
      )}

      <div className="min-h-5 max-w-full text-center" aria-live="polite" aria-atomic="true">
        {error ? (
          <p role="alert" className="break-words rounded-md bg-destructive/15 px-3 py-2 text-[12px] leading-4 text-destructive ring-1 ring-destructive/30">
            {error}
          </p>
        ) : statusMessage ? (
          <p className="break-words text-[12px] font-medium leading-4 text-primary">{statusMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
