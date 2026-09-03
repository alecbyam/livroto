// Sérialisation sûre pour injecter du JSON-LD dans un <script type="application/ld+json">
// via dangerouslySetInnerHTML.
//
// JSON.stringify() n'échappe PAS "<" — si le JSON contient la séquence littérale
// "</script>" (ex : un nom de produit ou une description saisie par un vendeur
// contenant "</script><script>...</script>"), le parseur HTML du navigateur ferme
// le tag <script> en plein milieu du JSON et exécute le script injecté juste
// après, pour TOUS les visiteurs de la page — XSS stocké classique. Cf. la même
// mitigation utilisée par Next.js/autres frameworks pour ce pattern précis.
//
// Fix : échapper chaque "<" en la séquence unicode "<" avant injection.
// Inoffensif pour le JSON-LD (les parseurs le décodent normalement en "<"),
// mais le scanner HTML ne voit plus "</script>" en clair dans le flux d'octets.
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
