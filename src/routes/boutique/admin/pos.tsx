import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Minus, Plus, ScanLine, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { boutiqueEncaisserVente, boutiqueRechercherProduitPos } from "@/lib/boutiques/pos.functions";
import { posOfflineQueue, isOnline } from "@/lib/boutiques/pos-offline-queue";
import { PosOfflineBanner } from "@/components/boutiques/PosOfflineBanner";
import { ConfigImpressionDialog } from "@/components/boutiques/ConfigImpressionDialog";
import { imprimerRecu } from "@/lib/boutiques/impression/imprimante";

export const Route = createFileRoute("/boutique/admin/pos")({
  component: PosPage,
});

type LigneCaisse = { produit_id: string; nom: string; prix_usd: number; quantite: number };

function PosPage() {
  const boutique = useBoutique();
  const rechercherFn = useServerFn(boutiqueRechercherProduitPos);
  const encaisserFn = useServerFn(boutiqueEncaisserVente);

  const [cart, setCart] = useState<LigneCaisse[]>([]);
  const [scan, setScan] = useState("");
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Array<{ id: string; nom: string; prix_usd: number; quantite: number }>>([]);
  const [modePaiement, setModePaiement] = useState<"cash" | "mobile_money" | "carte">("cash");
  const [codePromo, setCodePromo] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  function ajouterAuPanier(p: { id: string; nom: string; prix_usd: number }) {
    setCart((prev) => {
      const existe = prev.find((l) => l.produit_id === p.id);
      if (existe) {
        return prev.map((l) => (l.produit_id === p.id ? { ...l, quantite: l.quantite + 1 } : l));
      }
      return [...prev, { produit_id: p.id, nom: p.nom, prix_usd: p.prix_usd, quantite: 1 }];
    });
    toast.success(`${p.nom} ajouté`);
  }

  // Douchette USB : se comporte comme un clavier qui tape très vite puis
  // valide par Entrée. On capte la valeur au submit du formulaire de scan.
  async function onScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valeur = scan.trim();
    setScan("");
    if (!valeur) return;
    try {
      const { produits } = await rechercherFn({ data: { boutique_id: boutique.id, qr_code_data: valeur } });
      if (produits.length === 0) { toast.error("Produit introuvable pour ce QR."); return; }
      ajouterAuPanier(produits[0]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      scanInputRef.current?.focus();
    }
  }

  async function rechercher(q: string) {
    setRecherche(q);
    if (q.trim().length < 2) { setResultats([]); return; }
    try {
      const { produits } = await rechercherFn({ data: { boutique_id: boutique.id, recherche: q } });
      setResultats(produits);
    } catch { /* recherche best-effort, pas bloquant */ }
  }

  // Scan caméra : progressive enhancement via l'API native BarcodeDetector
  // (Chrome/Edge/Android). Pas de dépendance ajoutée pour ça — si l'API est
  // absente (Safari, vieux navigateurs), on retombe sur douchette/recherche.
  async function demarrerScanCamera() {
    const BD = (window as any).BarcodeDetector;
    if (!BD) { toast.error("Scan caméra non supporté sur ce navigateur — utilise la douchette ou la recherche."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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
            const { produits } = await rechercherFn({ data: { boutique_id: boutique.id, qr_code_data: codes[0].rawValue } });
            if (produits.length === 0) toast.error("Produit introuvable pour ce QR.");
            else ajouterAuPanier(produits[0]);
            return;
          }
        } catch { /* frame illisible, on continue */ }
        requestAnimationFrame(boucle);
      };
      requestAnimationFrame(boucle);
    } catch {
      toast.error("Accès caméra refusé ou indisponible.");
    }
  }

  function arreterScanCamera(stream?: MediaStream) {
    setCamActive(false);
    (stream ?? (videoRef.current?.srcObject as MediaStream | null))?.getTracks().forEach((t) => t.stop());
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
      lignes: lignes.map((l) => ({ nom: l.nom, quantite: l.quantite, prix_unitaire_usd: l.prix_usd })),
      sous_total_usd: st,
      remise_usd: Math.max(0, Math.round((st - totalUsd) * 100) / 100),
      total_usd: totalUsd,
      mode_paiement: modePaiement,
      devise: boutique.devise,
    }).catch((e) => toast.error(`Impression échouée : ${(e as Error).message}`));
  }

  async function encaisser() {
    if (cart.length === 0) { toast.error("Le panier est vide."); return; }
    setEnCours(true);
    const horsLigneId = crypto.randomUUID();
    const payload = {
      boutique_id: boutique.id,
      hors_ligne_id: horsLigneId,
      mode_paiement: modePaiement,
      code_promo: codePromo.trim() || undefined,
      lignes: cart.map((l) => ({ produit_id: l.produit_id, quantite: l.quantite })),
    };

    const lignesVendues = [...cart]; // instantané avant vidage du panier (pour le reçu)

    if (!isOnline()) {
      posOfflineQueue.add({
        id: horsLigneId,
        createdAt: new Date().toISOString(),
        boutique_id: boutique.id,
        mode_paiement: modePaiement,
        code_promo: codePromo.trim() || null,
        lignes: cart.map((l) => ({ produit_id: l.produit_id, nom: l.nom, quantite: l.quantite, prix_unitaire_usd: l.prix_usd })),
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
    } catch (err) {
      // Échec réseau en cours de route (pas juste "hors ligne" détecté à
      // l'avance) : on ne perd pas la vente, on la met en file elle aussi.
      posOfflineQueue.add({
        id: horsLigneId,
        createdAt: new Date().toISOString(),
        boutique_id: boutique.id,
        mode_paiement: modePaiement,
        code_promo: codePromo.trim() || null,
        lignes: cart.map((l) => ({ produit_id: l.produit_id, nom: l.nom, quantite: l.quantite, prix_unitaire_usd: l.prix_usd })),
      });
      toast.error(`Échec d'envoi (${(err as Error).message}) — vente mise en attente, sera réessayée.`);
      imprimerRecuVente(lignesVendues, null, sousTotal);
      setCart([]);
      setCodePromo("");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="container mx-auto grid gap-6 px-4 py-8 md:grid-cols-[1fr_360px]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Caisse — {boutique.nom}</h1>
          <ConfigImpressionDialog
            boutique={{ nom: boutique.nom, adresse: boutique.adresse, telephone: boutique.telephone, devise: boutique.devise }}
          />
        </div>

        <div className="mt-4"><PosOfflineBanner /></div>

        <div className="mt-4 flex flex-wrap gap-2">
          <form onSubmit={onScanSubmit} className="flex flex-1 gap-2">
            <Input
              ref={scanInputRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Scanner le QR (douchette) ou coller le code..."
              className="flex-1"
            />
            <Button type="submit" variant="outline"><ScanLine className="h-4 w-4" /></Button>
          </form>
          <Button type="button" variant="outline" onClick={() => (camActive ? arreterScanCamera() : demarrerScanCamera())}>
            <Camera className="h-4 w-4" />
          </Button>
        </div>

        {camActive && (
          <div className="mt-2 overflow-hidden rounded-xl border">
            <video ref={videoRef} autoPlay playsInline muted className="w-full" />
          </div>
        )}

        <div className="mt-4">
          <Label>Recherche manuelle</Label>
          <Input value={recherche} onChange={(e) => rechercher(e.target.value)} placeholder="Nom du produit..." />
          {resultats.length > 0 && (
            <div className="mt-2 divide-y rounded-lg border">
              {resultats.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => { ajouterAuPanier(p); setRecherche(""); setResultats([]); }}
                >
                  <span>{p.nom}</span>
                  <span className="text-muted-foreground">{p.prix_usd} $ · stock {p.quantite}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 divide-y rounded-xl border">
          {cart.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Panier vide — scanne ou recherche un produit.</p>
          ) : (
            cart.map((l) => (
              <div key={l.produit_id} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{l.nom}</p>
                  <p className="text-xs text-muted-foreground">{l.prix_usd} $ / unité</p>
                </div>
                <Button size="icon" variant="outline" onClick={() =>
                  setCart((prev) => prev.map((x) => x.produit_id === l.produit_id ? { ...x, quantite: Math.max(1, x.quantite - 1) } : x))
                }><Minus className="h-3 w-3" /></Button>
                <span className="w-6 text-center text-sm">{l.quantite}</span>
                <Button size="icon" variant="outline" onClick={() =>
                  setCart((prev) => prev.map((x) => x.produit_id === l.produit_id ? { ...x, quantite: x.quantite + 1 } : x))
                }><Plus className="h-3 w-3" /></Button>
                <span className="w-16 text-right text-sm font-medium">{(l.prix_usd * l.quantite).toFixed(2)} $</span>
                <Button size="icon" variant="ghost" onClick={() => setCart((prev) => prev.filter((x) => x.produit_id !== l.produit_id))}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="h-fit rounded-xl border p-4">
        <h2 className="font-semibold">Paiement</h2>
        <div className="mt-3">
          <Label>Mode de paiement</Label>
          <Select value={modePaiement} onValueChange={(v) => setModePaiement(v as typeof modePaiement)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="mobile_money">Mobile Money</SelectItem>
              <SelectItem value="carte">Carte</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3">
          <Label>Code promo</Label>
          <Input value={codePromo} onChange={(e) => setCodePromo(e.target.value)} placeholder="Optionnel" />
        </div>
        <div className="mt-4 flex items-center justify-between text-lg font-bold">
          <span>Sous-total</span>
          <span>{sousTotal.toFixed(2)} $</span>
        </div>
        <p className="text-xs text-muted-foreground">La remise du code promo est calculée à l'encaissement.</p>
        <Button className="mt-4 w-full" size="lg" disabled={enCours || cart.length === 0} onClick={encaisser}>
          {enCours ? "Encaissement..." : "Encaisser"}
        </Button>
      </div>
    </div>
  );
}
