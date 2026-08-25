// Contexte React exposant la config de la boutique résolue (logo, thème,
// coordonnées) à toute la vitrine ET au backoffice — sans prop-drilling, et
// sans jamais mentionner "JuntoxShop" nulle part dans l'UI descendante.
import { createContext, useContext, type ReactNode } from "react";
import type { BoutiqueTenant } from "@/lib/boutiques/tenant.server";

const BoutiqueContext = createContext<BoutiqueTenant | null>(null);

export function BoutiqueProvider({ boutique, children }: { boutique: BoutiqueTenant; children: ReactNode }) {
  return <BoutiqueContext.Provider value={boutique}>{children}</BoutiqueContext.Provider>;
}

// Lève une erreur si utilisé hors de l'arborescence _boutique : mieux vaut un
// crash explicite en dev qu'un écran qui affiche silencieusement "null".
export function useBoutique(): BoutiqueTenant {
  const ctx = useContext(BoutiqueContext);
  if (!ctx) throw new Error("useBoutique() doit être utilisé sous <BoutiqueProvider> (arborescence /_boutique).");
  return ctx;
}
