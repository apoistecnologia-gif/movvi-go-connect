/**
 * Client-side image compression for profile photos.
 * Target: 512x512 square, JPEG, reasonable quality.
 */

export type CompressOptions = {
  size?: number; // output square size (default 512)
  quality?: number; // JPEG quality 0..1 (default 0.85)
  mimeType?: "image/jpeg" | "image/webp";
};

export async function compressImageToSquare(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const size = opts.size ?? 512;
  const quality = opts.quality ?? 0.85;
  const mimeType = opts.mimeType ?? "image/jpeg";

  // Only compress raster images.
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await loadBitmap(file);
  try {
    // center-crop to square
    const src = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - src) / 2;
    const sy = (bitmap.height - src) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, src, src, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, quality),
    );
    if (!blob) return file;

    const ext = mimeType === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${base}.${ext}`, { type: mimeType, lastModified: Date.now() });
  } finally {
    if ("close" in bitmap) (bitmap as ImageBitmap).close();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}

/**
 * Compress a document image (CNH, CRLV, selfie doc) preserving aspect ratio.
 * Fits within maxSize (default 1600px on the longest side), JPEG.
 * Skips non-image files (e.g. PDFs) — returned as-is.
 */
export async function compressDocumentImage(
  file: File,
  opts: { maxSize?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const maxSize = opts.maxSize ?? 1600;
  const quality = opts.quality ?? 0.85;

  const bitmap = await loadBitmap(file);
  try {
    const w = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth;
    const h = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight;
    if (!w || !h) return file;
    const scale = Math.min(1, maxSize / Math.max(w, h));
    const outW = Math.round(w * scale);
    const outH = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    // Skip replacement if compression made it larger.
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "documento";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    if ("close" in bitmap) (bitmap as ImageBitmap).close();
  }
}
