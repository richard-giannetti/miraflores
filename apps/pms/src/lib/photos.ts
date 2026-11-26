import { supabase } from "./supabase";

const BUCKET = "issue-photos";

// Phone photos are large: shrink to 1600 px on the long side and save as JPEG before uploading.
async function shrink(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo"))), "image/jpeg", 0.82));
}

// Uploads a photo for an issue and returns its storage path.
export async function uploadPhoto(issueId: string, file: File) {
  const path = `${issueId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, await shrink(file), { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

// The bucket is private: photos are shown through links that expire after an hour.
export async function photoUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : []))) as Record<string, string>;
}
