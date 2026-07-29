// Échappement HTML minimal pour les templates imprimés via document.write().
// Nécessaire partout où du texte (nom client, adresse de livraison saisie par
// un invité, nom de produit...) est interpolé dans du HTML brut — sans ça, un
// champ texte peut injecter un <script>/onerror= qui s'exécute dans la
// session authentifiée du staff au moment de l'impression (bon de livraison,
// étiquettes QR, reçu de caisse).
export function echapperHtml(valeur: unknown): string {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
