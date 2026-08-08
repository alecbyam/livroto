// Horaires d'ouverture par boutique — stockés dans shops.config.hours (pas de
// colonne dédiée, config JSON déjà flexible). Forme : { mon: {open,close} | null, ... }
// "open"/"close" au format "HH:MM" en heure locale (Bunia = heure du client, pas de
// fuseau à gérer côté serveur pour ce cas d'usage).
export type DayHours = { open: string; close: string } | null;
export type ShopHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  mon: "Lundi", tue: "Mardi", wed: "Mercredi", thu: "Jeudi", fri: "Vendredi", sat: "Samedi", sun: "Dimanche",
};

export function computeOpenStatus(hours: ShopHours | undefined | null, now = new Date()): { isOpen: boolean; label: string } {
  if (!hours) return { isOpen: true, label: "Horaires non renseignés" };
  const key = DAY_KEYS[now.getDay()];
  const today = hours[key];
  if (!today) return { isOpen: false, label: "Fermé aujourd'hui" };
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = today.open.split(":").map(Number);
  const [ch, cm] = today.close.split(":").map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const isOpen = closeMin > openMin ? minutesNow >= openMin && minutesNow < closeMin : (minutesNow >= openMin || minutesNow < closeMin);
  return { isOpen, label: isOpen ? `Ouvert · ferme à ${today.close}` : `Fermé · ouvre à ${today.open}` };
}

export const ORDERED_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
