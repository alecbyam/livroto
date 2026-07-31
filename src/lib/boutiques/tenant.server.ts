// Résolution du tenant (boutique) à partir de la requête HTTP entrante.
//
// TanStack Start n'a pas de middleware.ts façon Next.js : la résolution se
// fait dans le beforeLoad du layout _boutique (cf. routes/_boutique/route.tsx),
// qui appelle resolveBoutiqueTenant() via un serverFn. Deux méthodes, dans
// l'ordre :
//   1) Domaine exact (boutiques.domaine) — le cas nominal une fois le DNS
//      d'une boutique cliente branché sur l'app.
//   2) Paramètre ?boutique=<slug> — filet de secours tant qu'aucun domaine
//      n'est configuré (dev local, preview Railway, ou avant la mise en
//      ligne DNS d'une nouvelle boutique). Sans risque : le catalogue d'une
//      boutique est public par nature, ce n'est pas une donnée sensible.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export type BoutiqueTenant = {
  id: string;
  slug: string;
  nom: string;
  slogan: string | null;
  logo_url: string | null;
  theme: Json;
  devise: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  id_national: string | null;
};

const COLONNES = "id,slug,nom,slogan,logo_url,theme,devise,adresse,telephone,email,rccm,id_national";

export async function resolveBoutiqueTenant(host: string | null, slugParam: string | null): Promise<BoutiqueTenant | null> {
  const domaine = (host ?? "").split(":")[0].trim().toLowerCase();

  if (domaine) {
    const { data } = await supabaseAdmin
      .from("boutiques")
      .select(COLONNES)
      .eq("domaine", domaine)
      .eq("actif", true)
      .maybeSingle();
    if (data) return data as BoutiqueTenant;
  }

  if (slugParam) {
    const { data } = await supabaseAdmin
      .from("boutiques")
      .select(COLONNES)
      .eq("slug", slugParam.trim().toLowerCase())
      .eq("actif", true)
      .maybeSingle();
    if (data) return data as BoutiqueTenant;
  }

  return null;
}
