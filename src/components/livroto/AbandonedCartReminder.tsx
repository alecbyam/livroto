import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ShoppingCart, X, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart";

const DISMISS_KEY = "livroto.cartReminder.dismissed";

/**
 * Relance panier abandonné « au retour » — réflexe Shopify adapté Bunia : pas d'envoi
 * externe (canaux SMS/WhatsApp pas encore actifs), un rappel in-app à la session suivante.
 * Aversion à la perte : on rappelle les articles laissés + invite à finaliser.
 * Masqué sur /cart, /order, /auth ; rejetable pour la session.
 */
export function AbandonedCartReminder() {
  const { count, subtotal } = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [dismissed, setDismissed] = useState(true); // par défaut caché (évite le flash SSR/hydratation)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const hiddenRoute = /^\/(cart|order|auth)/.test(pathname);
  if (dismissed || count === 0 || hiddenRoute) return null;

  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-[68px] z-30 px-3 md:bottom-4 animate-in slide-in-from-bottom-2">
      <div className="container mx-auto max-w-md">
        <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--brand-dark)]/20 bg-card p-3 shadow-lg">
          <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--brand-light)] text-[color:var(--brand-dark)]">
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-[color:var(--brand-dark)] px-1 text-[10px] font-bold text-white">
              {count}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">⏰ Ta commande t'attend !</p>
            <p className="text-xs text-muted-foreground">
              {count} article{count > 1 ? "s" : ""} · ${subtotal.toFixed(2)} — finalise avant rupture de stock.
            </p>
          </div>
          <Link
            to="/cart"
            onClick={close}
            className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[color:var(--brand-dark)] px-3 py-2 text-xs font-bold text-white transition hover:brightness-110"
          >
            Reprendre <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
