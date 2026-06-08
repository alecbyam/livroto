/**
 * Compression d'image côté navigateur AVANT upload.
 * Essentiel pour Bunia : réduit la data consommée par le vendeur (upload)
 * ET par chaque client qui charge le catalogue (download) sur réseau 2G/3G.
 *
 * Redimensionne à `maxSize` px (côté le plus long) et ré-encode en WebP.
 * Si la compression n'aide pas ou échoue, renvoie le fichier d'origine.
 */
export async function compressImage(
  file: File,
  opts: { maxSize?: number; quality?: number; mime?: string } = {},
): Promise<File> {
  const { maxSize = 1280, quality = 0.82, mime = "image/webp" } = opts;

  // Ne pas toucher aux non-images ni aux GIF (animation perdue par le canvas)
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxSize / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    );
    // Garde l'original si le navigateur ne sait pas encoder ou si ça n'aide pas
    if (!blob || blob.size >= file.size) return file;

    const ext = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], name, { type: mime, lastModified: Date.now() });
  } catch {
    return file;
  }
}
