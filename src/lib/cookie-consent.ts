// Consentement cookies/stockage — tout ce que JuntoxShop stocke est essentiel
// ou lié aux préférences (voir /cookies), donc pas de choix granulaire à
// proposer : juste un accusé de lecture, mémorisé 1 an comme annoncé dans la
// politique cookies.
const KEY = "juntoxshop.cookie_consent";
const TTL_DAYS = 365;

export function hasCookieConsent(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const { at } = JSON.parse(raw) as { at: number };
    return Date.now() - at < TTL_DAYS * 86_400_000;
  } catch {
    return false; // stockage indisponible (navigation privée stricte, etc.) → on réaffiche, sans casser le site
  }
}

export function setCookieConsent(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    /* best-effort */
  }
}
