// Source unique pour les catégories du catalogue.
// Les catégories vivent en base (table `categories`) et non plus dans un enum
// figé : en ajouter une nouvelle ne demande qu'une ligne SQL, pas un déploiement.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sort_order: number;
};

/** Requête brute réutilisable côté serveur (loader de route) — voir catalog.tsx. */
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,slug,name,icon,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
}

// `initialData` optionnel : permet à une route avec loader SSR (catalog.tsx) de seeder le
// cache dès le premier rendu, sans flash de chargement des pastilles de catégorie — sans
// impact sur les autres appelants (VendorPanel, index.tsx), le paramètre est facultatif.
export function useCategories(initialData?: Category[]) {
  return useQuery({
    queryKey: ["categories"],
    staleTime: 10 * 60_000,
    initialData,
    queryFn: fetchCategories,
  });
}
