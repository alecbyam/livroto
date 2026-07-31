// Petites règles d'affichage partagées entre le catalogue (index.tsx) et la
// fiche produit (produit.tsx) — évite que les deux dérivent avec des seuils
// différents.
const NOUVEAU_JOURS = 14;
export function estNouveau(created_at: string): boolean {
  return Date.now() - new Date(created_at).getTime() < NOUVEAU_JOURS * 24 * 60 * 60 * 1000;
}

// Signal de rareté GENUINE (basé sur le vrai stock, jamais un chiffre
// inventé) — le seuil de 3 est intentionnellement bas pour ne créer une
// urgence que quand elle est réelle, pas systématiquement affichée.
const SEUIL_STOCK_BAS = 3;
export function stockBas(quantite: number): boolean {
  return quantite > 0 && quantite <= SEUIL_STOCK_BAS;
}
