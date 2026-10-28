"use client";

import type { MediaPart } from "@/lib/ai/types";

export const MEDIA_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf";
export const isMediaFile = (name: string) => /\.(png|jpe?g|webp|gif|pdf)$/i.test(name);

const MAX_EDGE = 1568; // Claude's recommended long edge; bigger only costs more tokens
const MAX_PDF = 10 * 1024 * 1024;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Reads an image (downscaled when large) or PDF into a media part for the AI request. */
export async function readMedia(file: File): Promise<MediaPart> {
  if (/\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF) throw new Error(`${file.name} is over 10 MB.`);
    return { name: file.name, mediaType: "application/pdf", data: await toBase64(file) };
  }
  const type = (file.type || "image/png") as MediaPart["mediaType"];
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 3 * 1024 * 1024 && type !== "image/gif") {
    bitmap.close();
    return { name: file.name, mediaType: type, data: await toBase64(file) };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // PNG keeps logos crisp and exact colours; photos/screens go to JPEG to stay small.
  const keepPng = type === "image/png" && canvas.width * canvas.height < 1_200_000;
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read the image."))), keepPng ? "image/png" : "image/jpeg", 0.9));
  return { name: file.name, mediaType: keepPng ? "image/png" : "image/jpeg", data: await toBase64(blob) };
}
