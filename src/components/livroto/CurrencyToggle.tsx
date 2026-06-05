import { useCurrency } from "@/lib/currency";

export function CurrencyToggle() {
  const { currency, rate, setCurrency } = useCurrency();

  return (
    <button
      type="button"
      onClick={() => setCurrency(currency === "USD" ? "CDF" : "USD")}
      title={`Taux : 1 USD = ${rate.toLocaleString("fr-CD")} FC`}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold transition-colors hover:bg-[color:var(--brand-light)] hover:border-[color:var(--brand-dark)]"
    >
      <span className={currency === "USD" ? "text-[color:var(--brand-dark)]" : "text-muted-foreground"}>
        $
      </span>
      <span className="text-muted-foreground">/</span>
      <span className={currency === "CDF" ? "text-[color:var(--brand-dark)]" : "text-muted-foreground"}>
        FC
      </span>
    </button>
  );
}
