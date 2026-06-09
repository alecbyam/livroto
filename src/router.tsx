import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Réutilise les données ~1 min avant de re-fetch (moins de data à Bunia)
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        // Réseau lent/instable : 1 seule tentative, pas de re-fetch au focus
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Précharge le code de la route au survol / 1er contact tactile -> navigation quasi instantanée
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};
