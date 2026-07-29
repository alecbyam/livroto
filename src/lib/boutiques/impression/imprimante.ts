// ============================================================================
// Transport d'impression + configuration PAR APPAREIL.
//
// La config imprimante est stockée en localStorage (pas en base) : c'est une
// propriété du TERMINAL de caisse (cette tablette-ci est branchée à cette
// imprimante-là), pas de la boutique — deux caisses de la même boutique
// peuvent avoir des imprimantes différentes.
//
// Modes de connexion et réalité navigateur :
//   - usb        : WebUSB (Chrome/Edge desktop + Android). Douchettes et
//                  imprimantes USB directes.
//   - bluetooth  : Web Bluetooth (Chrome/Edge + Android). Le cas le plus
//                  courant à Bunia (imprimantes thermiques 58mm Bluetooth).
//   - reseau     : Wi-Fi/Ethernet port 9100 — IMPOSSIBLE depuis un navigateur
//                  (pas de socket TCP brut). Nécessitera le pont natif
//                  Capacitor (l'app Android/iOS existe déjà dans le repo) —
//                  option affichée mais désactivée avec explication.
//   - navigateur : fenêtre d'impression du navigateur (window.print). Marche
//                  avec N'IMPORTE QUELLE imprimante installée dans l'OS (y
//                  compris thermiques via leur pilote Windows/Android) et
//                  couvre le format A4. C'est aussi le fallback universel.
// ============================================================================
import { construireRecu, type DonneesRecu, type LargeurPapier } from "./escpos";
import { echapperHtml } from "@/lib/boutiques/html-escape";

export type ConfigImpression = {
  type: "escpos" | "navigateur";
  connexion: "usb" | "bluetooth";
  largeur: LargeurPapier | "A4";
};

const KEY = "livroto.boutique.impression.config";

export const CONFIG_DEFAUT: ConfigImpression = {
  type: "navigateur",
  connexion: "bluetooth",
  largeur: 58,
};

export function chargerConfigImpression(): ConfigImpression {
  if (typeof window === "undefined") return CONFIG_DEFAUT;
  try {
    const brut = localStorage.getItem(KEY);
    return brut ? { ...CONFIG_DEFAUT, ...JSON.parse(brut) } : CONFIG_DEFAUT;
  } catch {
    return CONFIG_DEFAUT;
  }
}

export function enregistrerConfigImpression(config: ConfigImpression): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {}
}

// ---------------------------------------------------------------------------
// Transport WebUSB — on garde le périphérique autorisé entre deux impressions
// (getDevices) pour ne pas rouvrir le sélecteur à chaque reçu.
// ---------------------------------------------------------------------------
async function envoyerViaUsb(octets: Uint8Array): Promise<void> {
  const usb = (navigator as any).usb;
  if (!usb) throw new Error("WebUSB non supporté par ce navigateur (utilise Chrome ou Edge).");

  let peripherique = (await usb.getDevices())[0];
  if (!peripherique) {
    peripherique = await usb.requestDevice({ filters: [] });
  }

  await peripherique.open();
  if (peripherique.configuration === null) await peripherique.selectConfiguration(1);

  // Trouve la première interface avec un endpoint OUT (sortie bulk).
  let numInterface = -1;
  let numEndpoint = -1;
  for (const iface of peripherique.configuration.interfaces) {
    for (const alt of iface.alternates) {
      const ep = alt.endpoints.find((e: any) => e.direction === "out");
      if (ep) {
        numInterface = iface.interfaceNumber;
        numEndpoint = ep.endpointNumber;
        break;
      }
    }
    if (numInterface >= 0) break;
  }
  if (numInterface < 0)
    throw new Error("Aucune sortie d'impression trouvée sur ce périphérique USB.");

  await peripherique.claimInterface(numInterface);
  try {
    await peripherique.transferOut(numEndpoint, octets);
  } finally {
    await peripherique.releaseInterface(numInterface).catch(() => {});
    await peripherique.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Transport Web Bluetooth — services GATT série des imprimantes thermiques
// courantes (18F0/2AF1 = la plupart des modèles chinois ; FFE0/FFE1 et
// E7810A71... = variantes fréquentes). Écriture par petits paquets (BLE
// limite ~180 octets utiles par write).
// ---------------------------------------------------------------------------
const SERVICES_IMPRIMANTE = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

async function envoyerViaBluetooth(octets: Uint8Array): Promise<void> {
  const bluetooth = (navigator as any).bluetooth;
  if (!bluetooth)
    throw new Error(
      "Web Bluetooth non supporté par ce navigateur (utilise Chrome ou Edge, ou Android).",
    );

  const peripherique = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICES_IMPRIMANTE,
  });
  const serveur = await peripherique.gatt.connect();

  let caracteristique: any = null;
  for (const uuidService of SERVICES_IMPRIMANTE) {
    try {
      const service = await serveur.getPrimaryService(uuidService);
      const caracteristiques = await service.getCharacteristics();
      caracteristique = caracteristiques.find(
        (c: any) => c.properties.write || c.properties.writeWithoutResponse,
      );
      if (caracteristique) break;
    } catch {
      /* service absent sur ce modèle, on essaie le suivant */
    }
  }
  if (!caracteristique) {
    serveur.disconnect();
    throw new Error("Imprimante Bluetooth non reconnue (service d'impression introuvable).");
  }

  try {
    const TAILLE_PAQUET = 120;
    for (let i = 0; i < octets.length; i += TAILLE_PAQUET) {
      const paquet = octets.slice(i, i + TAILLE_PAQUET);
      if (caracteristique.properties.writeWithoutResponse) {
        await caracteristique.writeValueWithoutResponse(paquet);
      } else {
        await caracteristique.writeValue(paquet);
      }
    }
  } finally {
    serveur.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Fallback navigateur : reçu HTML stylé à la largeur du papier, envoyé à la
// boîte de dialogue d'impression (fonctionne avec toute imprimante installée
// dans l'OS — thermique via son pilote, laser A4, ou "imprimer en PDF").
// ---------------------------------------------------------------------------
function imprimerViaNavigateur(donnees: DonneesRecu, largeur: LargeurPapier | "A4"): void {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Fenêtre d'impression bloquée par le navigateur.");
  const largeurCss = largeur === "A4" ? "210mm" : `${largeur}mm`;
  const paiement: Record<string, string> = {
    cash: "Cash",
    mobile_money: "Mobile Money",
    carte: "Carte",
    paiement_livraison: "À la livraison",
  };
  const e = echapperHtml;
  w.document.write(`
    <html><head><title>Reçu ${e(donnees.numero ?? "")}</title>
    <style>
      @page { size: ${largeur === "A4" ? "A4" : `${largeurCss} auto`}; margin: ${largeur === "A4" ? "20mm" : "2mm"}; }
      body { font-family: ${largeur === "A4" ? "sans-serif" : "monospace"}; width: ${largeur === "A4" ? "auto" : largeurCss}; font-size: ${largeur === "A4" ? "12pt" : "9pt"}; }
      .centre { text-align: center; }
      .titre { font-size: ${largeur === "A4" ? "16pt" : "11pt"}; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 1px 0; vertical-align: top; }
      td:last-child { text-align: right; white-space: nowrap; }
      hr { border: none; border-top: 1px dashed #000; }
      .total { font-weight: bold; font-size: ${largeur === "A4" ? "14pt" : "10pt"}; }
    </style></head><body>
    <div class="centre">
      <div class="titre">${e(donnees.boutique.nom)}</div>
      ${donnees.boutique.adresse ? `<div>${e(donnees.boutique.adresse)}</div>` : ""}
      ${donnees.boutique.telephone ? `<div>${e(donnees.boutique.telephone)}</div>` : ""}
    </div>
    <div>${donnees.numero ? `Reçu ${e(donnees.numero)}` : "Reçu (hors ligne — à synchroniser)"}</div>
    <div>${donnees.date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</div>
    <hr/>
    <table>
      ${donnees.lignes.map((l) => `<tr><td>${e(l.nom)}<br/>&nbsp;&nbsp;${l.quantite} × ${l.prix_unitaire_usd.toFixed(2)}</td><td>${(l.prix_unitaire_usd * l.quantite).toFixed(2)}</td></tr>`).join("")}
    </table>
    <hr/>
    <table>
      <tr><td>Sous-total</td><td>${donnees.sous_total_usd.toFixed(2)} ${donnees.devise}</td></tr>
      ${donnees.remise_usd > 0 ? `<tr><td>Remise</td><td>-${donnees.remise_usd.toFixed(2)} ${donnees.devise}</td></tr>` : ""}
      <tr class="total"><td>TOTAL</td><td>${donnees.total_usd.toFixed(2)} ${donnees.devise}</td></tr>
      <tr><td>Paiement</td><td>${e(paiement[donnees.mode_paiement] ?? donnees.mode_paiement)}</td></tr>
    </table>
    <p class="centre">Merci de votre visite !</p>
    <script>window.onload = () => { window.print(); }</script>
    </body></html>
  `);
  w.document.close();
}

/** Point d'entrée unique : imprime un reçu selon la config de CE terminal. */
export async function imprimerRecu(donnees: DonneesRecu, config?: ConfigImpression): Promise<void> {
  const cfg = config ?? chargerConfigImpression();

  if (cfg.type === "navigateur" || cfg.largeur === "A4") {
    imprimerViaNavigateur(donnees, cfg.largeur);
    return;
  }

  const octets = construireRecu(donnees, cfg.largeur);
  if (cfg.connexion === "usb") await envoyerViaUsb(octets);
  else await envoyerViaBluetooth(octets);
}
