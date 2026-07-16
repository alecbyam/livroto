// Normalisation des numéros de téléphone — une seule source de vérité.
// Deux formats coexistent selon le destinataire :
//   - digits seuls : wa.me, CallMeBot, FlexPay, API Meta (jamais de "+" ni d'espace)
//   - E.164 avec "+" : Africa's Talking (SMS)
// Avant, chaque appelant réécrivait `replace(/[^\d]/g, "")` à la main (8 sites),
// avec de légères variantes — risque de divergence.

/** Chiffres uniquement, sans "+", espaces ni séparateurs. */
export function phoneDigits(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/**
 * Format E.164 : garde le numéro tel quel s'il commence déjà par "+",
 * sinon préfixe les chiffres d'un "+". (Comportement identique à l'ancien
 * `to.startsWith("+") ? to : "+" + digits` de sms.functions.ts.)
 */
export function phoneE164(raw: string): string {
  return raw.startsWith("+") ? raw : `+${phoneDigits(raw)}`;
}
