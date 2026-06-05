/**
 * Repères géographiques connus de Bunia, Ituri, RDC.
 * Utilisés comme suggestions pour les adresses de livraison.
 */

export type Landmark = {
  name: string;
  zone: string;
  hint?: string;
};

export const BUNIA_LANDMARKS: Landmark[] = [
  // Centre-ville
  { name: "Marché Central de Bunia", zone: "Centre-ville", hint: "Grand marché principal" },
  { name: "Cathédrale Notre-Dame de Bunia", zone: "Centre-ville" },
  { name: "Hôtel Ituri", zone: "Centre-ville" },
  { name: "Carrefour Avenue Ango", zone: "Centre-ville" },
  { name: "Bureau de la MONUSCO", zone: "Centre-ville" },
  { name: "Banque du Congo (BCC) Bunia", zone: "Centre-ville" },
  { name: "Hôtel de Ville de Bunia", zone: "Centre-ville" },
  { name: "Parquet de Grande Instance", zone: "Centre-ville" },
  { name: "Brasserie de Bunia", zone: "Centre-ville" },

  // Sayo
  { name: "Carrefour Sayo", zone: "Sayo", hint: "Intersection principale de Sayo" },
  { name: "Marché de Sayo", zone: "Sayo" },
  { name: "École Primaire de Sayo", zone: "Sayo" },
  { name: "Église de Sayo", zone: "Sayo" },

  // Lumumba
  { name: "Carrefour Lumumba", zone: "Lumumba", hint: "Grand carrefour du quartier" },
  { name: "Marché de Lumumba", zone: "Lumumba" },
  { name: "Centre de Santé Lumumba", zone: "Lumumba" },

  // Bankoko
  { name: "Marché de Bankoko", zone: "Bankoko" },
  { name: "Carrefour Bankoko", zone: "Bankoko" },
  { name: "École de Bankoko", zone: "Bankoko" },

  // Mudzipela / Mudzi Pela
  { name: "Carrefour Mudzipela", zone: "Mudzi Pela", hint: "Principal carrefour de Mudzipela" },
  { name: "Marché de Mudzipela", zone: "Mudzi Pela" },
  { name: "Église Saint-Joseph Mudzipela", zone: "Mudzi Pela" },

  // Nyakasansa
  { name: "Carrefour Nyakasansa", zone: "Nyakasansa" },
  { name: "Marché de Nyakasansa", zone: "Nyakasansa" },

  // Bigo
  { name: "Carrefour Bigo", zone: "Bigo" },
  { name: "Marché de Bigo", zone: "Bigo" },
  { name: "Centre de Santé de Bigo", zone: "Bigo" },

  // Sukisa
  { name: "Marché de Sukisa", zone: "Sukisa" },
  { name: "Carrefour Sukisa", zone: "Sukisa" },

  // Hôpitaux & santé
  { name: "Hôpital Général de Référence (HGR) de Bunia", zone: "Centre-ville", hint: "Principal hôpital de Bunia" },
  { name: "Hôpital Militaire de Bunia", zone: "Centre-ville" },
  { name: "Clinique Fomulac", zone: "Centre-ville" },
  { name: "Pharmacie ARCHE", zone: "Centre-ville" },

  // Éducation
  { name: "Université de Bunia (UB)", zone: "Centre-ville" },
  { name: "Institut Supérieur de Commerce (ISC) Bunia", zone: "Centre-ville" },
  { name: "Lycée de Bunia", zone: "Centre-ville" },
  { name: "Complexe Scolaire APADER", zone: "Centre-ville" },

  // Transport
  { name: "Aéroport International de Bunia", zone: "Centre-ville", hint: "À côté de l'aéroport" },
  { name: "Gare routière de Bunia", zone: "Centre-ville" },
  { name: "Terminal de bus Oicha", zone: "Centre-ville" },

  // Religieux
  { name: "Mosquée Centrale de Bunia", zone: "Centre-ville" },
  { name: "Église Catholique Saint-Pierre", zone: "Centre-ville" },
  { name: "Temple de l'ECC Bunia", zone: "Centre-ville" },

  // Institutions
  { name: "Gouvernorat de l'Ituri", zone: "Centre-ville" },
  { name: "Camp Militaire de Bunia", zone: "Centre-ville" },
  { name: "Bureau de la DGI Bunia", zone: "Centre-ville" },
  { name: "Maison communale de Bunia", zone: "Centre-ville" },
];

/** Recherche de repères par texte (pour autocomplete) */
export function searchLandmarks(query: string): Landmark[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return BUNIA_LANDMARKS.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.zone.toLowerCase().includes(q) ||
      (l.hint?.toLowerCase().includes(q) ?? false)
  ).slice(0, 6);
}
