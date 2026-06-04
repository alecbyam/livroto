import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPWA() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Ne pas afficher si déjà installé en standalone
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    try {
      if (localStorage.getItem("livroto.pwa.dismissed")) {
        setDismissed(true);
        return;
      }
    } catch {}

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null);
  };

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("livroto.pwa.dismissed", "1"); } catch {}
  };

  if (!prompt || dismissed || installed) return null;

  return (
    <div className="fixed bottom-[72px] left-4 right-4 z-50 md:hidden">
      <div className="rounded-2xl border border-[color:var(--brand-dark)]/30 bg-[color:var(--brand-dark)] text-white shadow-xl px-4 py-3 flex items-center gap-3">
        <div className="shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-white/20">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Installe Livroto</p>
          <p className="text-xs text-white/75">Ajouter sur ton écran d'accueil</p>
        </div>
        <button
          onClick={install}
          className="shrink-0 rounded-xl bg-[color:var(--amber)] px-4 py-2 text-xs font-bold text-[color:var(--amber-foreground)]"
        >
          Installer
        </button>
        <button onClick={dismiss} className="shrink-0 grid h-7 w-7 place-items-center rounded-full hover:bg-white/20">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
