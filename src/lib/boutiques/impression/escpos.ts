// ============================================================================
// Générateur de commandes ESC/POS — le standard de fait des imprimantes
// thermiques de caisse (~90% du parc des commerces, y compris les modèles
// chinois 58mm Bluetooth très répandus à Bunia).
//
// Produit un Uint8Array de commandes brutes, envoyé tel quel à l'imprimante
// par un des transports (WebUSB / Web Bluetooth — cf. imprimante.ts).
//
// Accents : les imprimantes bon marché gèrent mal les pages de codes (CP858
// souvent absente) — on translittère systématiquement vers l'ASCII
// (é→e, à→a...) plutôt que de parier sur le support d'une code page. Un reçu
// lisible partout vaut mieux qu'un reçu accentué qui imprime des symboles
// aléatoires sur la moitié du parc.
// ============================================================================

export type LargeurPapier = 58 | 80;

// 58mm ≈ 32 caractères par ligne, 80mm ≈ 48 (police A standard 12x24).
export function caracteresParLigne(largeur: LargeurPapier): number {
  return largeur === 58 ? 32 : 48;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function ascii(texte: string): number[] {
  // Translittération : décomposition Unicode puis suppression des diacritiques.
  const plat = texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const out: number[] = [];
  for (const c of plat) {
    const code = c.charCodeAt(0);
    out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f); // hors ASCII imprimable -> '?'
  }
  return out;
}

export class EscPosBuilder {
  private octets: number[] = [];
  readonly largeurLigne: number;

  constructor(largeur: LargeurPapier) {
    this.largeurLigne = caracteresParLigne(largeur);
    this.octets.push(ESC, 0x40); // ESC @ : init
  }

  aligner(mode: "gauche" | "centre" | "droite"): this {
    this.octets.push(ESC, 0x61, mode === "gauche" ? 0 : mode === "centre" ? 1 : 2);
    return this;
  }

  gras(actif: boolean): this {
    this.octets.push(ESC, 0x45, actif ? 1 : 0);
    return this;
  }

  /** Double hauteur+largeur (titres). */
  grand(actif: boolean): this {
    this.octets.push(GS, 0x21, actif ? 0x11 : 0x00);
    return this;
  }

  ligne(texte = ""): this {
    this.octets.push(...ascii(texte), LF);
    return this;
  }

  /** Ligne "gauche ... droite" remplie d'espaces (ex: article / prix). */
  ligneDouble(gauche: string, droite: string): this {
    const g = gauche.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const d = droite.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const espace = this.largeurLigne - g.length - d.length;
    if (espace >= 1) {
      this.octets.push(...ascii(g + " ".repeat(espace) + d), LF);
    } else {
      // Trop long pour tenir sur une ligne : gauche sur sa ligne, droite alignée à droite dessous.
      this.ligne(g);
      this.octets.push(...ascii(" ".repeat(Math.max(0, this.largeurLigne - d.length)) + d), LF);
    }
    return this;
  }

  separateur(): this {
    return this.ligne("-".repeat(this.largeurLigne));
  }

  sauterLignes(n: number): this {
    this.octets.push(ESC, 0x64, n); // ESC d n
    return this;
  }

  couper(): this {
    this.octets.push(GS, 0x56, 66, 0); // GS V 66 0 : coupe partielle avec avance
    return this;
  }

  construire(): Uint8Array {
    return new Uint8Array(this.octets);
  }
}

export type DonneesRecu = {
  boutique: { nom: string; adresse?: string | null; telephone?: string | null; logo_url?: string | null };
  numero: string | null; // null = vente hors ligne pas encore synchronisée
  date: Date;
  lignes: Array<{ nom: string; quantite: number; prix_unitaire_usd: number }>;
  sous_total_usd: number;
  remise_usd: number;
  total_usd: number;
  mode_paiement: string;
  devise: string;
};

const LIBELLE_PAIEMENT: Record<string, string> = {
  cash: "Cash", mobile_money: "Mobile Money", carte: "Carte", paiement_livraison: "A la livraison",
};

export function construireRecu(donnees: DonneesRecu, largeur: LargeurPapier): Uint8Array {
  const b = new EscPosBuilder(largeur);

  b.aligner("centre").grand(true).gras(true).ligne(donnees.boutique.nom).grand(false).gras(false);
  if (donnees.boutique.adresse) b.ligne(donnees.boutique.adresse);
  if (donnees.boutique.telephone) b.ligne(donnees.boutique.telephone);
  b.ligne();

  b.aligner("gauche");
  b.ligne(donnees.numero ? `Recu ${donnees.numero}` : "Recu (hors ligne - a synchroniser)");
  b.ligne(donnees.date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }));
  b.separateur();

  for (const l of donnees.lignes) {
    const totalLigne = (l.prix_unitaire_usd * l.quantite).toFixed(2);
    b.ligneDouble(`${l.nom.slice(0, b.largeurLigne - 10)}`, "");
    b.ligneDouble(`  ${l.quantite} x ${l.prix_unitaire_usd.toFixed(2)}`, totalLigne);
  }

  b.separateur();
  b.ligneDouble("Sous-total", `${donnees.sous_total_usd.toFixed(2)} ${donnees.devise}`);
  if (donnees.remise_usd > 0) b.ligneDouble("Remise", `-${donnees.remise_usd.toFixed(2)} ${donnees.devise}`);
  b.gras(true).ligneDouble("TOTAL", `${donnees.total_usd.toFixed(2)} ${donnees.devise}`).gras(false);
  b.ligneDouble("Paiement", LIBELLE_PAIEMENT[donnees.mode_paiement] ?? donnees.mode_paiement);

  b.ligne();
  b.aligner("centre").ligne("Merci de votre visite !");
  b.sauterLignes(3).couper();

  return b.construire();
}
