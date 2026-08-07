import { supabase } from "@/integrations/supabase/client";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
// Signed URL curta — a UI pode revalidar sob demanda quando expirar.
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora

export type ProfilePhotoUploadResult = {
  /** Path do arquivo no bucket privado. Persistir apenas isto no banco. */
  path: string;
  /** URL assinada curta para exibir imediatamente após o upload. Não persistir. */
  signedUrl: string;
};

export function validateProfilePhotoFile(file: File): string | null {
  const type = (file.type || "").toLowerCase();
  if (!ALLOWED.includes(type)) {
    return "Formato inválido. Envie JPG, JPEG, PNG ou WEBP.";
  }
  if (file.size > MAX_BYTES) {
    return "A foto deve ter no máximo 5 MB.";
  }
  if (file.size === 0) return "Arquivo vazio.";
  return null;
}

function extFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const t = (file.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Upload a profile photo for the currently authenticated user.
 * Persistir apenas `path` no banco. `signedUrl` é curto (1 h) e serve só para
 * exibir a foto recém-enviada; para revalidar, use `refreshProfilePhotoUrl`.
 */
export async function uploadProfilePhoto(
  userId: string,
  file: File,
): Promise<ProfilePhotoUploadResult> {
  const err = validateProfilePhotoFile(file);
  if (err) throw new Error(err);

  const ext = extFromFile(file);
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const up = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
  if (up.error) {
    console.error("[APOIS PHOTO] upload error:", up.error.message);
    throw new Error("Falha ao enviar a foto. Tente novamente.");
  }

  const signed = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error("Foto enviada, mas não foi possível gerar o link.");
  }

  return { path, signedUrl: signed.data.signedUrl };
}

/** Refresh a signed URL for a stored photo path (works for any authenticated user). */
export async function refreshProfilePhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const signed = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return signed.data?.signedUrl ?? null;
}

