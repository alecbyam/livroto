import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Barre de recherche persistante (Navbar) — réflexe Amazon/Jumia : la recherche
 * est accessible depuis toutes les pages. Soumet vers /catalog?q=... où la
 * recherche locale + filtres prennent le relais.
 */
export function NavSearch({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    navigate({ to: "/catalog", search: { cat: "all", sub: "all", q } as any });
  };

  return (
    <form onSubmit={submit} role="search" className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("catalog.search")}
        aria-label={t("catalog.search")}
        enterKeyHint="search"
        className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-9 text-sm outline-none transition-colors focus:border-[color:var(--brand-dark)] focus:ring-2 focus:ring-[color:var(--brand-dark)]/20 min-h-[40px]"
      />
      {value && (
        <button
          type="button"
          aria-label="Effacer"
          onClick={() => setValue("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
