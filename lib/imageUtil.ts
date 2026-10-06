// Shrinks an image (file or remote URL, fetched through the same-origin proxy) to a small JPEG data URL so it
// can be stored with the event and never expires like Facebook CDN links do.
export async function toThumbDataUrl(source: File | string, maxSide = 360): Promise<string> {
  const blob = typeof source !== "string"
    ? source
    : source.startsWith("data:")
      ? await (await fetch(source)).blob()
      : await (await fetch(`/api/proxy?url=${encodeURIComponent(source)}`)).blob();
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

