import { useState, useRef, useEffect } from "react";
import { MapPin, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { searchLandmarks, type Landmark } from "@/lib/bunia-landmarks";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
};

export function LandmarkPicker({
  value,
  onChange,
  label = "Adresse exacte",
  required = false,
  placeholder = "Ex: En face du Marché de Sayo, maison rouge, 2e rue à gauche",
}: Props) {
  const [suggestions, setSuggestions] = useState<Landmark[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    const results = searchLandmarks(v);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  };

  const selectLandmark = (l: Landmark) => {
    onChange(`Près de : ${l.name} (${l.zone})${l.hint ? ` — ${l.hint}` : ""}`);
    setShowSuggestions(false);
  };

  // Le partage GPS structuré vit maintenant uniquement dans le bloc dédié sous ce champ
  // (cart.tsx / order.$productId.tsx, src/lib/geolocation.ts) — avant le 6/08/2026, ce
  // composant avait SA PROPRE version (alert() + coordonnées mushées en texte libre dans le
  // champ adresse au lieu de customer_lat/customer_lng structurés), redondante et de moins
  // bonne qualité que celle juste en dessous dans le même formulaire. Un seul mécanisme
  // maintenant, plus clair pour l'utilisateur.

  return (
    <div ref={containerRef} className="relative">
      <Label className="mb-1.5 block">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      <div className="relative">
        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <textarea
          required={required}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => value.length >= 2 && setSuggestions(searchLandmarks(value))}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-xl border border-input bg-background pl-9 pr-9 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none min-h-[80px]"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setSuggestions([]); }}
            className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Conseils */}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Commence à taper un repère (marché, hôpital, carrefour…) pour des suggestions.
      </p>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b">
            Repères connus à Bunia
          </p>
          <ul>
            {suggestions.map((l, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => selectLandmark(l)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-[color:var(--brand-light)] transition-colors"
                >
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                  <div>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.zone}{l.hint ? ` · ${l.hint}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
