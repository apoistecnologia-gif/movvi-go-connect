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
  const type = (file.type || "").toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function safeStoragePath(value: unknown): string | null {
  const path = String(value ?? "").trim();
  if (!path || path.length > 512 || path.startsWith("/") || path.includes("\\") || path.includes("..")) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
}

async function currentAuthUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("Sua sessão expirou. Entre novamente para alterar a foto.");
  return data.user.id;
}

async function persistOwnProfilePhoto(path: string) {
  const safePath = safeStoragePath(path);
  if (!safePath) throw new Error("O caminho da foto não é válido.");

  const { data, error } = await (supabase as any).rpc("set_own_profile_photo", {
    _storage_path: safePath,
  });
  if (error || !data?.ok) {
    if (error && import.meta.env.DEV) console.warn("[APOIS PHOTO] falha ao vincular foto", error);
    throw new Error("Não foi possível vincular a foto ao perfil.");
  }

  // public.users.avatar_url é o registro canônico. Auth metadata é apenas um
  // espelho auxiliar; falhar aqui não pode apagar o arquivo que o RPC já vinculou.
  const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_path: safePath } });
  if (metadataError && import.meta.env.DEV) {
    console.warn("[APOIS PHOTO] metadata auxiliar não atualizada", metadataError);
  }
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

  const upload = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
  if (upload.error) {
    if (import.meta.env.DEV) console.warn("[APOIS PHOTO] falha no upload", upload.error);
    throw new Error("Não foi possível enviar a foto agora. Tente novamente.");
  }

  try {
    await persistOwnProfilePhoto(path);
  } catch (error) {
    const { error: cleanupError } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([path]);
    if (cleanupError && import.meta.env.DEV) console.warn("[APOIS PHOTO] falha ao limpar upload não vinculado", cleanupError);
    throw error;
  }

  const signed = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    if (signed.error && import.meta.env.DEV) console.warn("[APOIS PHOTO] falha ao gerar visualização", signed.error);
    throw new Error("Foto salva com sucesso, mas a visualização ainda não está disponível. Reabra a tela em instantes.");
  }

  return { path, signedUrl: signed.data.signedUrl };
}

/** Refresh a signed URL for a stored private profile-photo path. */
export async function refreshProfilePhotoUrl(path: string): Promise<string | null> {
  const raw = String(path ?? "").trim();
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^http:\/\//i.test(raw)) return null;
  const safePath = safeStoragePath(raw);
  if (!safePath) return null;

  const signed = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .createSignedUrl(safePath, SIGNED_URL_TTL_SECONDS);
  if (signed.error) {
    if (import.meta.env.DEV) console.warn("[APOIS PHOTO] falha ao renovar visualização", signed.error);
    return null;
  }
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
  if (error) {
    if (import.meta.env.DEV) console.warn("[APOIS PHOTO] perfil canônico indisponível", error);
    return null;
  }
  if (!data?.avatar_url) return null;
  return refreshProfilePhotoUrl(String(data.avatar_url));
}
