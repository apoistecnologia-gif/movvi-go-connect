import { supabase } from "@/integrations/supabase/client";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export type ProfilePhotoUploadResult = {
  path: string;
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
 * Stores file at `{userId}/avatar-{timestamp}.{ext}` and returns a long-lived signed URL.
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
    console.error("[MOVVI PHOTO] upload error:", up.error.message);
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
