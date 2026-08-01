import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Minus, Percent, Plus, ScanLine, Search, Tag, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueEncaisserVente,
  boutiqueListerProduitsPos,
  boutiqueRechercherProduitPos,
} from "@/lib/boutiques/pos.functions";
import { boutiqueListerCategories } from "@/lib/boutiques/categories.functions";
import { boutiqueListerClients, boutiqueTrouverOuCreerClient } from "@/lib/boutiques/clients.functions";
import { posOfflineQueue, isOnline } from "@/lib/boutiques/pos-offline-queue";
import { PosOfflineBanner } from "@/components/boutiques/PosOfflineBanner";
import { ConfigImpressionDialog } from "@/components/boutiques/ConfigImpressionDialog";
import { imprimerRecu } from "@/lib/boutiques/impression/imprimante";
import { getPrixEffectif } from "@/lib/boutiques/prix-promo";

export const Route = createFileRoute("/boutique/admin/pos")({
  component: PosPage,
});

type ProduitGrille = {
  id: string;
  nom: string;
  prix_usd: number;
  prix_promo_usd: number | null;
  promo_actif: boolean | null;
  promo_debut: string | null;
  promo_fin: string | null;
  prix_achat_usd: number | null;
  prix_limite_vente_usd: number | null;
  quantite: number;
  image_url: string | null;
  categorie_id: string | null;
  boutique_categories: { id: string; nom: string; icone: string | null } | null;
  taille: string | null;
  couleur: string | null;
};
type LigneCaisse = {
  produit_id: string;
  nom: string;
  prix_usd: number; // prix réellement appliqué (peut être remisé)
  // Prix catalogue/promo normal au moment de l'ajout — référence pour
  // détecter/annuler une remise. Jamais recalculé après l'ajout au panier
  // (comme le reste du panier, le serveur revalide tout à l'encaissement).
  prix_catalogue_usd: number;
  // prix_limite_vente_usd ?? prix_achat_usd ?? null, résolu à l'ajout —
  // null = aucune remise possible pour cette ligne (aucun plancher/coût connu).
  prix_plancher_usd: number | null;
  quantite: number;
};

function PosPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const listerFn = useServerFn(boutiqueListerProduitsPos);
  const rechercherFn = useServerFn(boutiqueRechercherProduitPos);
  const encaisserFn = useServerFn(boutiqueEncaisserVente);

  const { data, isLoading } = useQuery({
    queryKey: ["boutique-pos-produits", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id } }),
  });
  const produits = (data?.produits ?? []) as ProduitGrille[];

  const listerCategoriesFn = useServerFn(boutiqueListerCategories);
  const { data: categoriesData } = useQuery({
    queryKey: ["boutique-categories", boutique.id],
    queryFn: () => listerCategoriesFn({ data: { boutique_id: boutique.id } }),
  });
  const categories = categoriesData?.categories ?? [];

  const [cart, setCart] = useState<LigneCaisse[]>([]);
  const [scan, setScan] = useState("");
  const [filtre, setFiltre] = useState("");
  const [categorieId, setCategorieId] = useState<string>("tous");
  const [modePaiement, setModePaiement] = useState<"cash" | "mobile_money" | "carte" | "credit">("cash");
  const [codePromo, setCodePromo] = useState("");
  const [clientCredit, setClientCredit] = useState<{ id: string; nom: string } | null>(null);
  const [dateEcheance, setDateEcheance] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  // Grille filtrée côté client : catalogue d'une seule boutique, pas besoin
  // d'un aller-retour serveur à chaque frappe — tape et ça filtre, instantané.
  const produitsFiltres = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return produits.filter((p) => {
      if (categorieId !== "tous" && p.categorie_id !== categorieId) return false;
      if (!q) return true;
      return (
        p.nom.toLowerCase().includes(q) ||
        p.taille?.toLowerCase().includes(q) ||
        p.couleur?.toLowerCase().includes(q)
      );
    });
  }, [produits, categorieId, filtre]);

  function ajouterAuPanier(p: {
    id: string;
    nom: string;
    prix_usd: number;
    prix_promo_usd?: number | null;
    promo_actif?: boolean | null;
    promo_debut?: string | null;
    promo_fin?: string | null;
    prix_achat_usd?: number | null;
    prix_limite_vente_usd?: number | null;
  }) {
    // Prix affiché dans le panier caisse = prix effectif (promo si en cours)
    // — l'encaissement recalcule de toute façon côté serveur, mais autant que
    // le sous-total visible avant validation soit déjà le bon.
    const prixEffectif = getPrixEffectif(p).prix;
    const plancher = p.prix_limite_vente_usd ?? p.prix_achat_usd ?? null;
    setCart((prev) => {
      const existe = prev.find((l) => l.produit_id === p.id);
      if (existe) {
        return prev.map((l) => (l.produit_id === p.id ? { ...l, quantite: l.quantite + 1 } : l));
      }
      return [
        ...prev,
        {
          produit_id: p.id,
          nom: p.nom,
          prix_usd: prixEffectif,
          prix_catalogue_usd: prixEffectif,
          prix_plancher_usd: plancher,
          quantite: 1,
        },
      ];
    });
    toast.success(`${p.nom} ajouté`);
  }

  // Remise manuelle négociée à la caisse : le prix ne peut jamais descendre
  // sous le plancher résolu à l'ajout au panier (prix_limite_vente_usd, ou à
  // défaut prix_achat_usd) — le serveur revalide de toute façon strictement
  // à l'encaissement, ceci n'est qu'un retour immédiat pour le staff.
  const [remiseOuvertePour, setRemiseOuvertePour] = useState<string | null>(null);
  const [remiseValeur, setRemiseValeur] = useState("");

  function ouvrirRemise(l: LigneCaisse) {
    setRemiseOuvertePour(l.produit_id);
    setRemiseValeur(String(l.prix_usd));
  }

  function appliquerRemise(produitId: string) {
    const ligne = cart.find((l) => l.produit_id === produitId);
    if (!ligne) return;
    const nouveauPrix = Number(remiseValeur);
    // Rejeté -> le champ reste ouvert pour corriger, jamais fermé sur un prix
    // refusé (sinon le staff doit rouvrir la remise pour corriger sa saisie).
    if (!Number.isFinite(nouveauPrix) || nouveauPrix < 0) {
      toast.error("Prix invalide.");
      return;
    }
    if (ligne.prix_plancher_usd != null && nouveauPrix < ligne.prix_plancher_usd) {
      toast.error(`Le prix ne peut pas descendre sous ${ligne.prix_plancher_usd} $.`);
      return;
    }
    if (nouveauPrix > ligne.prix_catalogue_usd) {
      toast.error("Impossible d'augmenter le prix au-delà du prix catalogue depuis ce contrôle.");
      return;
    }
    setCart((prev) =>
      prev.map((l) =>
        l.produit_id === produitId ? { ...l, prix_usd: Math.round(nouveauPrix * 100) / 100 } : l,
      ),
    );
    setRemiseOuvertePour(null);
  }

  function annulerRemise(produitId: string) {
    setCart((prev) =>
      prev.map((l) => (l.produit_id === produitId ? { ...l, prix_usd: l.prix_catalogue_usd } : l)),
    );
  }

  // Douchette USB : se comporte comme un clavier qui tape très vite puis
  // valide par Entrée. On capte la valeur au submit du formulaire de scan.
  async function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valeur = scan.trim();
    setScan("");
    if (!valeur) return;
    try {
      const { produits: trouves } = await rechercherFn({
        data: { boutique_id: boutique.id, qr_code_data: valeur },
      });
      if (trouves.length === 0) {
        toast.error("Produit introuvable pour ce QR.");
        return;
      }
      ajouterAuPanier(trouves[0]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      scanInputRef.current?.focus();
    }
  }

  // Scan caméra : progressive enhancement via l'API native BarcodeDetector
  // (Chrome/Edge/Android). Pas de dépendance ajoutée pour ça — si l'API est
  // absente (Safari, vieux navigateurs), on retombe sur douchette/grille.
  async function demarrerScanCamera() {
    const BD = (window as any).BarcodeDetector;
    if (!BD) {
      toast.error(
        "Scan caméra non supporté sur ce navigateur — utilise la douchette ou la grille.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamActive(true);
      const detector = new BD({ formats: ["qr_code"] });
      const boucle = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          if (camActive) requestAnimationFrame(boucle);
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            arreterScanCamera(stream);
            const { produits: trouves } = await rechercherFn({
              data: { boutique_id: boutique.id, qr_code_data: codes[0].rawValue },
            });
            if (trouves.length === 0) toast.error("Produit introuvable pour ce QR.");
            else ajouterAuPanier(trouves[0]);
            return;
          }
        } catch {
          /* frame illisible, on continue */
        }
        requestAnimationFrame(boucle);
      };
      requestAnimationFrame(boucle);
    } catch {
      toast.error("Accès caméra refusé ou indisponible.");
    }
  }

  function arreterScanCamera(stream?: MediaStream) {
    setCamActive(false);
    (stream ?? (videoRef.current?.srcObject as MediaStream | null))
      ?.getTracks()
      .forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  const sousTotal = cart.reduce((s, l) => s + l.prix_usd * l.quantite, 0);

  // Impression du reçu — best-effort : un souci d'imprimante (débranchée,
  // Bluetooth hors de portée) ne doit jamais bloquer ni annuler la vente déjà
  // encaissée. Le reçu reste réimprimable depuis la liste des factures.
  function imprimerRecuVente(lignes: LigneCaisse[], numero: string | null, totalUsd: number) {
    const st = lignes.reduce((s, l) => s + l.prix_usd * l.quantite, 0);
    imprimerRecu({
      boutique: { nom: boutique.nom, adresse: boutique.adresse, telephone: boutique.telephone },
      numero,
      date: new Date(),
      lignes: lignes.map((l) => ({
        nom: l.nom,
        quantite: l.quantite,
        prix_unitaire_usd: l.prix_usd,
      })),
      sous_total_usd: st,
      remise_usd: Math.max(0, Math.round((st - totalUsd) * 100) / 100),
      total_usd: totalUsd,
      mode_paiement: modePaiement,
      devise: boutique.devise,
    }).catch((e) => toast.error(`Impression échouée : ${(e as Error).message}`));
  }

  async function encaisser() {
    if (cart.length === 0) {
      toast.error("Le panier est vide.");
      return;
    }
    // Une vente à crédit doit toujours être liée à un client ET une échéance
    // — jamais l'un sans l'autre. Le mode hors-ligne n'est volontairement pas
    // supporté pour le crédit (il faut le client_id résolu côté serveur avant
    // d'ouvrir la dette), contrairement aux autres modes de paiement.
    if (modePaiement === "credit") {
      if (!clientCredit) {
        toast.error("Sélectionne ou crée un client pour une vente à crédit.");
        return;
      }
      if (!dateEcheance) {
        toast.error("Indique une échéance de paiement.");
        return;
      }
      if (!isOnline()) {
        toast.error("Vente à crédit impossible hors ligne — reconnecte-toi.");
        return;
      }
    }
    setEnCours(true);
    const horsLigneId = crypto.randomUUID();
    const payload = {
      boutique_id: boutique.id,
      hors_ligne_id: horsLigneId,
      mode_paiement: modePaiement,
      client_id: modePaiement === "credit" ? clientCredit!.id : undefined,
      date_echeance: modePaiement === "credit" ? dateEcheance : undefined,
      code_promo: codePromo.trim() || undefined,
      // Le prix n'est envoyé que si effectivement remisé — sinon le serveur
      // recalcule normalement depuis le catalogue/promo en vigueur (plus
      // fiable si le prix a changé pendant que la caisse était ouverte).
      lignes: cart.map((l) => ({
        produit_id: l.produit_id,
        quantite: l.quantite,
        ...(l.prix_usd !== l.prix_catalogue_usd ? { prix_unitaire_usd: l.prix_usd } : {}),
      })),
    };

    const lignesVendues = [...cart]; // instantané avant vidage du panier (pour le reçu)

    if (!isOnline()) {
      // modePaiement ne peut pas valoir "credit" ici : le bloc plus haut
      // retourne systématiquement dès que le crédit est hors-ligne — la file
      // (QueuedVente) ne sait de toute façon pas porter client_id/date_echeance.
      posOfflineQueue.add({
        id: horsLigneId,
        createdAt: new Date().toISOString(),
        boutique_id: boutique.id,
        mode_paiement: modePaiement as Exclude<typeof modePaiement, "credit">,
        code_promo: codePromo.trim() || null,
        lignes: cart.map((l) => ({
          produit_id: l.produit_id,
          nom: l.nom,
          quantite: l.quantite,
          prix_unitaire_usd: l.prix_usd,
          prix_catalogue_usd: l.prix_catalogue_usd,
        })),
      });
      toast.success("Hors ligne : vente enregistrée localement, sera envoyée à la reconnexion.");
      // Reçu sans numéro (attribué à la synchro) ni remise promo (validée serveur).
      imprimerRecuVente(lignesVendues, null, sousTotal);
      setCart([]);
      setCodePromo("");
      setEnCours(false);
      return;
    }

    try {
      const { vente } = await encaisserFn({ data: payload });
      toast.success(`Vente ${vente.numero} encaissée — ${vente.total_usd} $`);
      imprimerRecuVente(lignesVendues, vente.numero, Number(vente.total_usd));
      setCart([]);
      setCodePromo("");
      setClientCredit(null);
      setDateEcheance("");
      qc.invalidateQueries({ queryKey: ["boutique-pos-produits", boutique.id] });
    } catch (err) {
      if (modePaiement === "credit") {
        // Le crédit n'est jamais mis en file hors-ligne (le format de la file
        // ne sait pas porter client_id/date_echeance, et on ne veut surtout
        // pas rejouer une ouverture de dette sans garantie de lien client) —
        // on laisse le panier intact pour que le staff puisse réessayer.
        toast.error(`Échec d'envoi (${(err as Error).message}) — réessaie, le panier est conservé.`);
        setEnCours(false);
        return;
      }
      // Échec réseau en cours de route (pas juste "hors ligne" détecté à
      // l'avance) : on ne perd pas la vente, on la met en file elle aussi.
      posOfflineQueue.add({
        id: horsLigneId,
        createdAt: new Date().toISOString(),
        boutique_id: boutique.id,
        mode_paiement: modePaiement,
        code_promo: codePromo.trim() || null,
        lignes: cart.map((l) => ({
          produit_id: l.produit_id,
          nom: l.nom,
          quantite: l.quantite,
          prix_unitaire_usd: l.prix_usd,
          prix_catalogue_usd: l.prix_catalogue_usd,
        })),
      });
      toast.error(
        `Échec d'envoi (${(err as Error).message}) — vente mise en attente, sera réessayée.`,
      );
      imprimerRecuVente(lignesVendues, null, sousTotal);
      setCart([]);
      setCodePromo("");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="container mx-auto grid gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Caisse — {boutique.nom}</h1>
          <ConfigImpressionDialog
            boutique={{
              nom: boutique.nom,
              adresse: boutique.adresse,
              telephone: boutique.telephone,
              devise: boutique.devise,
            }}
          />
        </div>

        <div className="mt-4">
          <PosOfflineBanner />
        </div>

        {/* Scan douchette / caméra — reste le chemin le plus rapide pour un
            article déjà étiqueté QR. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <form onSubmit={onScanSubmit} className="flex flex-1 gap-2">
            <Input
              ref={scanInputRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Scanner le QR (douchette) ou coller le code..."
              className="flex-1"
            />
            <Button type="submit" variant="outline">
              <ScanLine className="h-4 w-4" />
            </Button>
          </form>
          <Button
            type="button"
            variant="outline"
            onClick={() => (camActive ? arreterScanCamera() : demarrerScanCamera())}
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>

        {camActive && (
          <div className="mt-2 overflow-hidden rounded-xl border">
            <video ref={videoRef} autoPlay playsInline muted className="w-full" />
          </div>
        )}

        {/* Grille produits façon Odoo POS : on tape directement sur l'article
            au lieu de taper une recherche à chaque vente. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              placeholder="Filtrer par nom, taille, couleur..."
              className="pl-9"
            />
            {filtre && (
              <button
                type="button"
                onClick={() => setFiltre("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setCategorieId("tous")}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                categorieId === "tous"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              Tous
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategorieId(c.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  categorieId === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {c.icone ? `${c.icone} ` : ""}
                {c.nom}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : produitsFiltres.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aucun produit ne correspond.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {produitsFiltres.map((p) => {
              const enRupture = p.quantite <= 0;
              const promo = getPrixEffectif(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={enRupture}
                  onClick={() => ajouterAuPanier(p)}
                  className={`group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition ${
                    enRupture
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-primary/50 hover:shadow-md active:scale-[0.98]"
                  }`}
                >
                  <div className="relative aspect-square w-full bg-muted">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.nom} className="h-full w-full object-cover" />
                    ) : p.boutique_categories?.icone ? (
                      <div className="grid h-full w-full place-items-center bg-muted text-3xl">
                        {p.boutique_categories.icone}
                      </div>
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-muted">
                        <Tag className="h-8 w-8 text-muted-foreground/60" />
                      </div>
                    )}
                    {enRupture ? (
                      <span className="absolute inset-x-0 top-0 bg-destructive/90 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-white">
                        Rupture
                      </span>
                    ) : (
                      promo.enPromo && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive-foreground">
                          −{promo.pourcentage}%
                        </span>
                      )
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 p-2">
                    <p className="line-clamp-2 text-xs font-medium leading-tight">{p.nom}</p>
                    {(p.taille || p.couleur) && (
                      <p className="text-[11px] text-muted-foreground">
                        {[p.taille, p.couleur].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-1">
                      {promo.enPromo ? (
                        <span className="flex items-center gap-1">
                          <span className="text-sm font-bold text-destructive">{promo.prix} $</span>
                          <span className="text-[10px] text-muted-foreground line-through">{promo.prixOriginal} $</span>
                        </span>
                      ) : (
                        <span className="text-sm font-bold">{p.prix_usd} $</span>
                      )}
                      {!enRupture && p.quantite <= 3 && (
                        <span className="text-[10px] font-semibold text-amber-600">
                          {p.quantite} rest.
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-fit rounded-xl border p-4 lg:sticky lg:top-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Panier</h2>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Vider
            </button>
          )}
        </div>

        <div className="mt-2 max-h-[40vh] divide-y overflow-y-auto rounded-lg border">
          {cart.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Panier vide — tape un article dans la grille ou scanne un QR.
            </p>
          ) : (
            cart.map((l) => {
              const estRemise = l.prix_usd < l.prix_catalogue_usd;
              return (
                <div key={l.produit_id} className="p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.nom}</p>
                      <p className="text-xs text-muted-foreground">
                        {estRemise && (
                          <span className="mr-1 text-muted-foreground line-through">
                            {l.prix_catalogue_usd} $
                          </span>
                        )}
                        <span className={estRemise ? "font-semibold text-destructive" : undefined}>
                          {l.prix_usd} $
                        </span>{" "}
                        / unité
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 shrink-0"
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((x) =>
                            x.produit_id === l.produit_id
                              ? { ...x, quantite: Math.max(1, x.quantite - 1) }
                              : x,
                          ),
                        )
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 shrink-0 text-center text-sm">{l.quantite}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 shrink-0"
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((x) =>
                            x.produit_id === l.produit_id ? { ...x, quantite: x.quantite + 1 } : x,
                          ),
                        )
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="w-14 shrink-0 text-right text-sm font-medium">
                      {(l.prix_usd * l.quantite).toFixed(2)} $
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() =>
                        setCart((prev) => prev.filter((x) => x.produit_id !== l.produit_id))
                      }
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 pl-0.5">
                    {remiseOuvertePour === l.produit_id ? (
                      <>
                        <Input
                          autoFocus
                          type="number"
                          step="0.01"
                          min={l.prix_plancher_usd ?? 0}
                          max={l.prix_catalogue_usd}
                          value={remiseValeur}
                          onChange={(e) => setRemiseValeur(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              appliquerRemise(l.produit_id);
                            }
                          }}
                          className="h-7 w-24 text-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => appliquerRemise(l.produit_id)}
                        >
                          OK
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setRemiseOuvertePour(null)}
                        >
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={l.prix_plancher_usd == null}
                          onClick={() => ouvrirRemise(l)}
                          title={
                            l.prix_plancher_usd == null
                              ? "Aucune remise possible — aucun prix plancher ni prix d'achat défini pour ce produit"
                              : `Remise possible jusqu'à ${l.prix_plancher_usd} $`
                          }
                          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Percent className="h-3 w-3" /> Remise
                        </button>
                        {estRemise && (
                          <button
                            type="button"
                            onClick={() => annulerRemise(l.produit_id)}
                            className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
                          >
                            Annuler la remise
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4">
          <Label>Mode de paiement</Label>
          <Select
            value={modePaiement}
            onValueChange={(v) => setModePaiement(v as typeof modePaiement)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="mobile_money">FlexPay (Mobile Money)</SelectItem>
              <SelectItem value="carte">Carte bancaire</SelectItem>
              <SelectItem value="credit">Crédit (à payer plus tard)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {modePaiement === "credit" && (
          <div className="mt-3 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <div>
              <Label>Client</Label>
              <SelecteurClientCredit
                boutiqueId={boutique.id}
                client={clientCredit}
                onChange={setClientCredit}
              />
            </div>
            <div>
              <Label htmlFor="date-echeance">Échéance de paiement</Label>
              <Input
                id="date-echeance"
                type="date"
                value={dateEcheance}
                onChange={(e) => setDateEcheance(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
        )}
        <div className="mt-3">
          <Label>Code promo</Label>
          <Input
            value={codePromo}
            onChange={(e) => setCodePromo(e.target.value)}
            placeholder="Optionnel"
          />
        </div>
        <div className="mt-4 flex items-center justify-between text-lg font-bold">
          <span>Sous-total</span>
          <span>{sousTotal.toFixed(2)} $</span>
        </div>
        <p className="text-xs text-muted-foreground">
          La remise du code promo est calculée à l'encaissement.
        </p>
        <Button
          className="mt-4 w-full"
          size="lg"
          disabled={enCours || cart.length === 0}
          onClick={encaisser}
        >
          {enCours ? "Encaissement..." : "Encaisser"}
        </Button>
      </div>
    </div>
  );
}

// Recherche un client existant (nom/téléphone) ou en crée un à la volée —
// une vente à crédit doit toujours être liée à un client réel, jamais un
// texte libre. Pas un <form> : ce composant vit dans une simple <div>
// (le panier n'est pas un formulaire HTML), donc pas de risque de form imbriqué.
function SelecteurClientCredit({
  boutiqueId,
  client,
  onChange,
}: {
  boutiqueId: string;
  client: { id: string; nom: string } | null;
  onChange: (c: { id: string; nom: string } | null) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauTelephone, setNouveauTelephone] = useState("");

  const listerFn = useServerFn(boutiqueListerClients);
  const { data } = useQuery({
    queryKey: ["boutique-clients-recherche", boutiqueId, recherche],
    queryFn: () => listerFn({ data: { boutique_id: boutiqueId, recherche } }),
    enabled: !client && recherche.trim().length >= 2,
  });
  const resultats = data?.clients ?? [];

  const creerFn = useServerFn(boutiqueTrouverOuCreerClient);
  const creer = useMutation({
    mutationFn: () =>
      creerFn({
        data: { boutique_id: boutiqueId, nom: nouveauNom.trim(), telephone: nouveauTelephone.trim() },
      }),
    onSuccess: ({ client: c }) => {
      onChange({ id: c.id, nom: c.nom });
      setOuvrirCreation(false);
      setNouveauNom("");
      setNouveauTelephone("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (client) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
        <span className="font-medium">{client.nom}</span>
        <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (ouvrirCreation) {
    return (
      <div className="space-y-1.5">
        <Input
          autoFocus
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          placeholder="Nom du client"
        />
        <Input
          value={nouveauTelephone}
          onChange={(e) => setNouveauTelephone(e.target.value)}
          placeholder="Téléphone"
          onKeyDown={(e) => {
            if (e.key === "Enter" && nouveauNom.trim() && nouveauTelephone.trim() && !creer.isPending) {
              e.preventDefault();
              creer.mutate();
            }
          }}
        />
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={creer.isPending || !nouveauNom.trim() || !nouveauTelephone.trim()}
            onClick={() => creer.mutate()}
          >
            Ajouter ce client
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOuvrirCreation(false)}>
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par nom ou téléphone…"
      />
      {resultats.length > 0 && (
        <ul className="max-h-32 divide-y overflow-y-auto rounded-md border bg-background">
          {resultats.map((c: { id: string; nom: string; telephone: string }) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: c.id, nom: c.nom });
                  setRecherche("");
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span>{c.nom}</span>
                <span className="text-xs text-muted-foreground">{c.telephone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" size="sm" variant="outline" onClick={() => setOuvrirCreation(true)}>
        + Nouveau client
      </Button>
    </div>
  );
}
