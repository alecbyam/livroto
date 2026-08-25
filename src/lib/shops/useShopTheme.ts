// ============================================================================
// Thème visuel PAR BOUTIQUE — chaque boutique peut définir sa propre palette
// (stockée dans shops.config.theme) qui REMPLACE la palette JuntoxShop tant que
// la page boutique est affichée. Appliqué sur <html> (pas un simple wrapper)
// pour que les portails Radix (Sheet/Dialog — panier, dialogues staff...)
// héritent aussi du thème, puisqu'ils sont montés dans <body>, pas dans
// l'arbre React de la page. Restauré à la sortie de la page.
// ============================================================================
import { useEffect } from "react";

// Liste fermée : seuls ces tokens (déjà utilisés partout dans l'app via
// var(--x)) peuvent être redéfinis par la config d'une boutique — évite
// qu'un champ JSON arbitraire n'injecte une variable CSS inattendue.
const THEMABLE_VARS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground",
  "muted", "muted-foreground", "accent", "accent-foreground",
  "border", "input", "ring", "radius",
  "brand", "brand-dark", "brand-light", "amber", "amber-foreground", "whatsapp",
] as const;

export type ShopTheme = Partial<Record<(typeof THEMABLE_VARS)[number], string>>;

export function useShopTheme(theme: ShopTheme | null | undefined) {
  useEffect(() => {
    if (!theme || typeof document === "undefined") return;
    const root = document.documentElement;
    const applied: string[] = [];
    for (const key of THEMABLE_VARS) {
      const value = theme[key];
      if (typeof value === "string" && value.length > 0 && value.length < 200) {
        root.style.setProperty(`--${key}`, value);
        applied.push(key);
      }
    }
    return () => { for (const key of applied) root.style.removeProperty(`--${key}`); };
  }, [theme]);
}
