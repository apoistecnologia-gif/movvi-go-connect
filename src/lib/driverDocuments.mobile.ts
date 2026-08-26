import { supabase } from "@/integrations/supabase/client";

export type DriverDocumentSlot = "selfie" | "cnh_front" | "cnh_back" | "crlv" | "vehicle_photo";

export interface DriverDocumentUpdateResult {
  ok: true;
  driverId: string;
  slot: DriverDocumentSlot;
  documentsStatus: string;
  approvalStatus: string;
  complete: boolean;
}

const BUCKET_BY_SLOT: Record<DriverDocumentSlot, string> = {
  selfie: "driver-selfies",
  cnh_front: "driver-cnh",
  cnh_back: "driver-cnh",
  crlv: "vehicle-documents",
  vehicle_photo: "vehicle-documents",
};

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const MAX_BYTES = 10 * 1024 * 1024;

type RpcErrorLike = { code?: string; message: string };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("driver_document_invalid_response");
  return value;
}

async function cleanupUploadedObject(bucket: string, objectPath: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([objectPath]);
  if (error) {
    console.warn("[APOIS Driver Documents] orphan cleanup failed", {
      bucket,
      objectPath,
      message: error.message,
    });
  }
}

export async function uploadDriverDocument(
  slot: DriverDocumentSlot,
  file: File,
): Promise<DriverDocumentUpdateResult> {
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("Use JPG, PNG, WebP ou PDF.");
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error("O arquivo deve ter no máximo 10 MB.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");

  const bucket = BUCKET_BY_SLOT[slot];
  const suffix = `${slot}-${Date.now()}.${extension}`;
  const objectPath = `${authData.user.id}/${suffix}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (uploadError) {
    console.error("[APOIS Driver Documents] upload failed", uploadError);
    throw new Error("Não foi possível enviar o documento agora.");
  }

  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("driver_update_document", {
    _slot: slot,
    _storage_path: objectPath,
  });
  if (error) {
    console.error("[APOIS Driver Documents] review update failed", {
      code: error.code,
      message: error.message,
    });
    await cleanupUploadedObject(bucket, objectPath);
    throw new Error("O arquivo não pôde ser colocado em análise. Tente novamente.");
  }
  if (!isRecord(data) || data["ok"] !== true) {
    await cleanupUploadedObject(bucket, objectPath);
    throw new Error("driver_document_invalid_response");
  }

  const responseSlot = readString(data, "slot") as DriverDocumentSlot;
  if (!(responseSlot in BUCKET_BY_SLOT)) {
    await cleanupUploadedObject(bucket, objectPath);
    throw new Error("driver_document_invalid_response");
  }

  return {
    ok: true,
    driverId: readString(data, "driver_id"),
    slot: responseSlot,
    documentsStatus: readString(data, "documents_status"),
    approvalStatus: readString(data, "approval_status"),
    complete: data["complete"] === true,
  };
}
