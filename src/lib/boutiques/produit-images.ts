// Upload des photos produit (bucket public `boutiques-produits`, RLS
// staff admin+vendeur en écriture, cf. migration 47). Même compression
// navigateur que le marketplace (compressImage) — essentiel sur le réseau
// de Bunia, aussi bien pour l'upload par le staff que pour le chargement du
// catalogue par les clients.
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image";

export const MAX_PHOTOS_PRODUIT = 8;

export async function televerserPhotoProduit(
  file: File,
  boutiqueId: string,
  produitId: string,
): Promise<string> {
  const compresse = await compressImage(file, { maxSize: 1280 });
  const ext = compresse.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${boutiqueId}/${produitId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("boutiques-produits")
    .upload(path, compresse, { cacheControl: "31536000", contentType: compresse.type });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("boutiques-produits").getPublicUrl(path);
  return data.publicUrl;
}
