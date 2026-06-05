import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export type Currency = "USD" | "CDF";

type CurrencyContextValue = {
  currency: Currency;
  rate: number;          // 1 USD = rate CDF
  setCurrency: (c: Currency) => void;
  /** Formate un montant USD dans la devise active */
  fmt: (usd: number) => string;
  /** Retourne le montant numérique converti */
  convert: (usd: number) => number;
  /** Recharge le taux depuis Supabase (après modification admin) */
  reloadRate: () => Promise<number>;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);
const STORAGE_KEY = "livroto.currency";
const DEFAULT_RATE = 2800;

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Currency) ?? "USD";
    } catch {
      return "USD";
    }
  });
  const [rate, setRate] = useState(DEFAULT_RATE);

  const reloadRate = async (): Promise<number> => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "cdf_rate")
      .maybeSingle();
    const r = Number(data?.value) || DEFAULT_RATE;
    setRate(r);
    return r;
  };

  // Charger le taux depuis Supabase
  useEffect(() => {
    reloadRate();
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  };

  const convert = (usd: number): number =>
    currency === "USD" ? usd : Math.round(usd * rate);

  const fmt = (usd: number): string => {
    if (currency === "USD") return `$${usd.toFixed(2)}`;
    const cdf = Math.round(usd * rate);
    return `${cdf.toLocaleString("fr-CD")} FC`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, rate, setCurrency, fmt, convert, reloadRate }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be inside <CurrencyProvider>");
  return ctx;
}
