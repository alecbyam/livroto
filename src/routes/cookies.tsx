import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, LegalSection } from "@/components/livroto/LegalPage";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Politique cookies — JuntoxShop" },
      { name: "description", content: "Ce que JuntoxShop stocke dans ton navigateur, et pourquoi." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: CookiesPage,
});

const ROWS: { name: string; purpose: string; duration: string; type: "Essentiel" | "Préférence" }[] = [
  { name: "Session de connexion (Supabase)", purpose: "Te garder connecté à ton compte", duration: "Jusqu'à déconnexion / expiration", type: "Essentiel" },
  { name: "Panier", purpose: "Mémoriser les articles ajoutés au panier", duration: "Jusqu'à vidage ou commande", type: "Essentiel" },
  { name: "Favoris", purpose: "Mémoriser tes produits favoris", duration: "Persistant, jusqu'à suppression manuelle", type: "Essentiel" },
  { name: "Langue", purpose: "Mémoriser ta langue choisie (fr/sw/ln/en)", duration: "Persistant", type: "Préférence" },
  { name: "Thème", purpose: "Mémoriser le mode clair/sombre choisi", duration: "Persistant", type: "Préférence" },
  { name: "Consentement cookies", purpose: "Mémoriser ton choix sur cette bannière", duration: "1 an", type: "Essentiel" },
  { name: "File d'attente hors-ligne", purpose: "Conserver une commande passée sans réseau jusqu'à la reconnexion", duration: "Jusqu'à synchronisation", type: "Essentiel" },
];

function CookiesPage() {
  return (
    <LegalLayout
      title="Politique cookies"
      updated="septembre 2026"
      intro="JuntoxShop n'affiche aucune publicité et n'utilise aucun cookie de suivi publicitaire ou de mesure d'audience tierce. Ce que nous stockons dans ton navigateur sert uniquement à faire fonctionner le site."
    >
      <LegalSection title="Ce que nous stockons">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[560px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-1 py-2 font-semibold">Nom</th>
                <th className="px-1 py-2 font-semibold">À quoi ça sert</th>
                <th className="px-1 py-2 font-semibold">Durée</th>
                <th className="px-1 py-2 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name} className="border-b border-border/50 align-top">
                  <td className="px-1 py-2 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="px-1 py-2 text-muted-foreground">{r.purpose}</td>
                  <td className="px-1 py-2 text-muted-foreground whitespace-nowrap">{r.duration}</td>
                  <td className="px-1 py-2 whitespace-nowrap">{r.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Un mot sur la technologie utilisée">
        <p>
          Par souci de précision : la plupart de ces éléments sont techniquement stockés via le
          « stockage local » de ton navigateur (localStorage), pas via de vrais cookies HTTP
          classiques — mais ils remplissent le même rôle et suivent les mêmes bonnes pratiques de
          transparence.
        </p>
      </LegalSection>

      <LegalSection title="Comment les effacer">
        <p>
          Tous ces éléments étant essentiels ou liés à tes préférences (jamais publicitaires), tu
          peux à tout moment les effacer via les réglages de ton navigateur (« Effacer les données
          de navigation ») — cela déconnectera ton compte et videra ton panier local.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
