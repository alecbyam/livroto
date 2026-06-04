import { useState, useEffect } from "react";
import { X, Gift, Copy, Check } from "lucide-react";

const STORAGE_KEY = "livroto.welcome.dismissed";

export function WelcomeBanner() {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {}
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText("BIENVENUE");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (!visible) return null;

  return (
    <div className="relative mx-4 mt-3 mb-1 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="shrink-0 grid h-9 w-9 place-items-center rounded-full bg-white/20">
          <Gift className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight">🎁 -$2 sur ta 1ère commande !</p>
          <p className="text-xs text-white/85 mt-0.5">
            Utilise le code{" "}
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 font-bold tracking-wider hover:bg-white/30 transition-colors"
            >
              BIENVENUE
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
            {" "}dès $10 d'achat
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="shrink-0 grid h-7 w-7 place-items-center rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
