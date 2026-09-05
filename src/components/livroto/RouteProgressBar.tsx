import { useRouterState } from "@tanstack/react-router";

// Fine barre de progression en haut de l'écran pendant une navigation.
// Sur le réseau lent de Bunia (2G/3G), taper un lien sans AUCUN retour visuel
// pendant 1-2s donne l'impression que l'app est gelée/plantée — un des réflexes
// psychologiques clés identifiés pour ce public (confiance = feedback immédiat).
// Pas de librairie externe : TanStack Router expose déjà `status: 'pending'`
// pendant le chargement du loader de la route suivante.
export function RouteProgressBar() {
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[100] h-0.5 origin-left bg-[color:var(--amber)] transition-opacity duration-300"
      style={{
        opacity: isLoading ? 1 : 0,
        animation: isLoading ? "lv-route-progress 1.4s ease-out forwards" : "none",
      }}
    />
  );
}
