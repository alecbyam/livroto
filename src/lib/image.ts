import { supabase } from "@/integrations/supabase/client";

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

/**
 * Compresse une image, l'envoie dans le bucket `products` sous le dossier de
 * l'utilisateur, et renvoie une URL signée (5 ans). Source unique partagée par
 * les trois uploaders du panneau vendeur (photo produit ×2, logo/couverture) —
 * avant, cette séquence compress→upload→URL signée était copiée-collée.
 *
 * @param opts.maxSize   côté le plus long après compression (défaut 1280)
 * @param opts.pathPrefix si fourni, chemin déterministe `<prefix>-<timestamp>`
 *                        (logo/couverture, réécrivables) ; sinon UUID aléatoire
 * @param opts.upsert     autorise l'écrasement (défaut false)
 */
export async function uploadProductImage(
  file: File,
  opts: { maxSize?: number; pathPrefix?: string; upsert?: boolean } = {},
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Non connecté");

  const compressed = await compressImage(file, opts.maxSize ? { maxSize: opts.maxSize } : {});
  const ext = compressed.name.split(".").pop()?.toLowerCase() || "jpg";
  const name = opts.pathPrefix ? `${opts.pathPrefix}-${Date.now()}.${ext}` : `${crypto.randomUUID()}.${ext}`;
  const path = `${session.user.id}/${name}`;

  const { error: upErr } = await supabase.storage.from("products").upload(path, compressed, {
    cacheControl: "31536000",
    upsert: opts.upsert ?? false,
    contentType: compressed.type,
  });
  if (upErr) throw upErr;

  const { data: signed, error: sErr } = await supabase.storage
    .from("products")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 ans
  if (sErr || !signed) throw sErr ?? new Error("URL impossible");
  return signed.signedUrl;
}
