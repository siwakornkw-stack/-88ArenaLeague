import { put } from "@vercel/blob";

const MAX_BYTES = 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function uploadImage(prefix: string, file: unknown): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!IMAGE_TYPES.has(file.type)) throw new Error("รองรับเฉพาะ PNG/JPEG/WebP");
  if (file.size > MAX_BYTES) throw new Error("ไฟล์ต้องไม่เกิน 1MB");
  const blob = await put(prefix, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return blob.url;
}
