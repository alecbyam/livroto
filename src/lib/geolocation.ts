// Capture de position GPS — partagée par le checkout panier (cart.tsx), l'achat direct
// (order.$productId.tsx) et le partage de position en direct du livreur (RiderPanel.tsx).
// Extrait le 6/08/2026 : la logique était dupliquée 3 fois avec des qualités différentes
// (LandmarkPicker utilisait alert() + texte libre au lieu de coordonnées structurées, aucun
// des trois ne distinguait permission refusée / position indisponible / timeout — trois causes
// très différentes qui appellent des messages différents pour l'utilisateur).

export type GeoCoords = { lat: number; lng: number; accuracy: number };

/** Version Promise de getCurrentPosition, coordonnées arrondies à 6 décimales (~11 cm, largement assez précis). */
export function captureGeolocation(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => reject(err),
      options,
    );
  });
}

/**
 * Classe une erreur de géolocalisation par cause — "denied" (réglages navigateur à changer,
 * réessayer ne sert à rien), "timeout"/"unavailable" (transitoire, réessayer a du sens).
 * Avant cette classification, les 3 causes affichaient le même message générique partout.
 */
export function classifyGeoError(error: unknown): "denied" | "unavailable" | "timeout" | "unsupported" {
  if (error instanceof Error && error.message === "unsupported") return "unsupported";
  const code = (error as GeolocationPositionError)?.code;
  if (code === 1) return "denied"; // PERMISSION_DENIED
  if (code === 3) return "timeout"; // TIMEOUT
  return "unavailable"; // POSITION_UNAVAILABLE (code 2) ou inconnu
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}
