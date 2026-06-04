export type ProductCategory =
  | "phone_accessories"
  | "local_food"
  | "delivery_service"
  | "home_tools"
  | "beauty"
  | "jewelry"
  | "watches"
  | "computers"
  | "electronics";

export type SampleProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  price_usd: number;
  emoji: string;
  description: string;
  stock: number;
};

export const sampleProducts: SampleProduct[] = [
  { id: "p1", name: "Chargeur rapide Type-C", category: "phone_accessories", price_usd: 6, emoji: "🔌", description: "Charge ton smartphone en moins d'une heure.", stock: 25 },
  { id: "p2", name: "Écouteurs filaires basse", category: "phone_accessories", price_usd: 4, emoji: "🎧", description: "Son clair pour appels WhatsApp et musique.", stock: 40 },
  { id: "p3", name: "Coque silicone universelle", category: "phone_accessories", price_usd: 3, emoji: "📱", description: "Protège ton téléphone des chutes.", stock: 30 },
  { id: "p4", name: "Power bank 10 000 mAh", category: "phone_accessories", price_usd: 15, emoji: "🔋", description: "Recharge 3 fois ton téléphone.", stock: 12 },
  { id: "p5", name: "Câble USB renforcé", category: "phone_accessories", price_usd: 2, emoji: "🪢", description: "Solide, ne casse pas vite.", stock: 0 },
  { id: "p6", name: "Fundi maison (1 part)", category: "local_food", price_usd: 3, emoji: "🥜", description: "Pâte d'arachide locale, fraîchement préparée.", stock: 50 },
  { id: "p7", name: "Beignets sucrés (x6)", category: "local_food", price_usd: 1.5, emoji: "🍩", description: "Croustillants, encore chauds.", stock: 60 },
  { id: "p8", name: "Jus de bissap 1L", category: "local_food", price_usd: 2, emoji: "🧃", description: "Jus naturel d'hibiscus, sans conservateur.", stock: 20 },
  { id: "p9", name: "Riz au poulet (assiette)", category: "local_food", price_usd: 5, emoji: "🍛", description: "Plat complet, prêt à manger.", stock: 18 },
  { id: "p10", name: "Course express (colis)", category: "delivery_service", price_usd: 3, emoji: "🛵", description: "On va chercher et on livre, en ville.", stock: 99 },
  { id: "p11", name: "Livraison bureau / ONG", category: "delivery_service", price_usd: 10, emoji: "📦", description: "Livraison professionnelle, sur rendez-vous.", stock: 99 },
  { id: "p12", name: "Livraison urgente", category: "delivery_service", price_usd: 8, emoji: "⚡", description: "Sous 1h, n'importe où dans Bunia.", stock: 99 },
];

export const categoryMeta: Record<ProductCategory, { emoji: string; key: string }> = {
  phone_accessories: { emoji: "📱", key: "categories.phone.title" },
  local_food: { emoji: "🥜", key: "categories.food.title" },
  delivery_service: { emoji: "🛵", key: "categories.delivery.title" },
  home_tools: { emoji: "🔧", key: "categories.home.title" },
  beauty: { emoji: "💄", key: "categories.beauty.title" },
  jewelry: { emoji: "💍", key: "categories.jewelry.title" },
  watches: { emoji: "⌚", key: "categories.watches.title" },
  computers: { emoji: "💻", key: "categories.computers.title" },
  electronics: { emoji: "📺", key: "categories.electronics.title" },
};

// Source unique pour la nav catégories (catalogue + page d'accueil)
export const CATEGORY_LIST: { id: ProductCategory; label: string; emoji: string; desc: string }[] = [
  { id: "phone_accessories", label: "Téléphone", emoji: "📱", desc: "Chargeurs, écouteurs, coques, power banks." },
  { id: "local_food",        label: "Cuisine",   emoji: "🥜", desc: "Plats, beignets, jus, fundi maison." },
  { id: "delivery_service",  label: "Livraison", emoji: "🛵", desc: "Course express, colis, livraison repas." },
  { id: "home_tools",        label: "Maison",    emoji: "🔧", desc: "Outillage, électroménager, cuisine, déco." },
  { id: "beauty",            label: "Beauté",   emoji: "💄", desc: "Parfums, soins, maquillage, cheveux." },
  { id: "jewelry",           label: "Bijoux",    emoji: "💍", desc: "Colliers, bracelets, bagues, parures." },
  { id: "watches",           label: "Montres",   emoji: "⌚", desc: "Femme, homme, connectées, enfants." },
  { id: "computers",         label: "Ordinateurs", emoji: "💻", desc: "Portables, pièces, réseau, périphériques." },
  { id: "electronics",       label: "Électronique", emoji: "📺", desc: "TV, audio, consoles, solaire, drones." },
];