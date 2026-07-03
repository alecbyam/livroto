import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { genericWhatsAppUrl } from "@/lib/whatsapp";

/**
 * Bouton flottant toujours "fixed" au même endroit de l'écran : sur mobile, du
 * contenu (prix, CTA "Commander vite", liens catégorie...) passe forcément
 * dessous pendant le défilement et se retrouve masqué. Se cache pendant un
 * scroll vers le bas (le contenu qui défile juste en dessous), réapparaît dès
 * qu'on remonte ou qu'on est en haut de page — pattern standard des widgets
 * de chat, évite de bloquer les CTA sans jamais rendre le bouton inaccessible.
 */
export function WhatsAppFab() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y <= 80) setHidden(false);
        else if (y > lastY.current + 4) setHidden(true);
        else if (y < lastY.current - 4) setHidden(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href={genericWhatsAppUrl()}
      target="_blank"
      rel="noreferrer"
      aria-label="WhatsApp Livroto"
      className={`fixed bottom-20 right-5 md:bottom-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--whatsapp)] text-white shadow-lg shadow-emerald-900/30 transition-all duration-200 hover:scale-105 active:scale-95 ${
        hidden ? "translate-y-24 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      }`}
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
