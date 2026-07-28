import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { resolveBoutiqueTenant } from "@/lib/boutiques/tenant.server";

// Pas de middleware d'auth : la résolution de tenant doit fonctionner pour un
// visiteur anonyme (vitrine publique). L'isolation des données reste garantie
// par la RLS de chaque table (boutique_id), pas par cette étape.
export const resolveBoutiqueTenantFn = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().max(60).optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const request = getRequest();
    const host = request?.headers.get("host") ?? null;
    const boutique = await resolveBoutiqueTenant(host, data.slug ?? null);
    return { boutique };
  });
