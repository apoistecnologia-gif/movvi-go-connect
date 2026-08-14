import { supabase } from "@/integrations/supabase/client";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ProfilePhotoUploadResult = {
  path: string;
  signedUrl: string;
};

export function validateProfilePhotoFile(file: File): string | null {
  const type = (file.type || "").toLowerCase();
  if (!ALLOWED.includes(type)) return "Formato inválido. Envie JPG, JPEG, PNG ou WEBP.";
  if (file.size > MAX_BYTES) return "A foto deve ter no máximo 5 MB.";
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

async function currentAuthUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("Sua sessão expirou. Entre novamente para alterar a foto.");
  return data.user.id;
}

async function persistOwnProfilePhoto(path: string) {
  const { data, error } = await (supabase as any).rpc("set_own_profile_photo", {
    _storage_path: path,
  });
  if (error) throw new Error(error.message || "Não foi possível vincular a foto ao perfil.");
  if (!data?.ok) throw new Error("Não foi possível vincular a foto ao perfil.");

  const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_path: path } });
  if (metadataError) throw new Error("Foto salva, mas não foi possível atualizar os dados da conta.");
}

/**
 * Uploads into a private bucket using the authenticated Auth UID as the first
 * folder segment. The previous implementation trusted a caller-provided id;
 * screens that passed public.users.id produced an RLS denial because Storage
 * policies intentionally require storage.foldername(name)[1] = auth.uid().
 */
export async function uploadProfilePhoto(
  _userId: string,
  file: File,
): Promise<ProfilePhotoUploadResult> {
  const validationError = validateProfilePhotoFile(file);
  if (validationError) throw new Error(validationError);

  const authUserId = await currentAuthUserId();
  const ext = extFromFile(file);
  const path = `${authUserId}/avatar-${Date.now()}.${ext}`;

  const up = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
  if (up.error) {
    console.error("[APOIS PHOTO] upload error:", up.error.message);
    throw new Error(`Falha ao enviar a foto: ${up.error.message}`);
  }

  try {
    await persistOwnProfilePhoto(path);
  } catch (error) {
    await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([path]);
    throw error;
  }

  const signed = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error("Foto salva, mas não foi possível gerar a visualização.");
  }

  return { path, signedUrl: signed.data.signedUrl };
}

/** Refresh a signed URL for a stored private profile-photo path. */
export async function refreshProfilePhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const signed = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return signed.data?.signedUrl ?? null;
}

/** Resolves the authenticated user's canonical profile photo without trusting screen-specific ids. */
export async function loadOwnProfilePhotoUrl(): Promise<string | null> {
  const authUserId = await currentAuthUserId();
  const { data, error } = await (supabase as any)
    .from("users")
    .select("avatar_url")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data?.avatar_url) return null;
  return refreshProfilePhotoUrl(String(data.avatar_url));
}
