import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasCookieConsent, setCookieConsent } from "@/lib/cookie-consent";

// Bannière de consentement — lit/écrit le localStorage, donc ne peut décider
// de s'afficher qu'après hydratation (jamais pendant le rendu serveur, pour
// éviter tout flash/mismatch). Voir /cookies pour le détail de ce qui est stocké.
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasCookieConsent()) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = () => {
    setCookieConsent();
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-border bg-card/95 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="container mx-auto flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand-dark)]" />
          <p className="text-sm text-muted-foreground">
            JuntoxShop utilise uniquement des cookies/stockage <strong className="text-foreground">essentiels</strong>{" "}
            (panier, connexion, préférences) — pas de publicité, pas de traceur tiers.{" "}
            <Link to="/cookies" className="underline hover:text-foreground">
              En savoir plus
            </Link>
          </p>
        </div>
        <Button onClick={accept} size="sm" className="w-full shrink-0 sm:w-auto">
          J'ai compris
        </Button>
      </div>
    </div>
  );
}
