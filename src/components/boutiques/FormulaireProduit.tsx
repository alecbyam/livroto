// Formulaire création/édition produit — extrait de produits.tsx pour être
// réutilisable ailleurs (la caisse permet aussi de modifier/supprimer un
// produit sans quitter l'encaissement, cf. pos.tsx).
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { GestionnairePhotosProduit } from "@/components/boutiques/GestionnairePhotosProduit";
import {
  boutiqueListerSousCategories,
  boutiqueCreerSousCategorie,
} from "@/lib/boutiques/sous-categories.functions";
import { boutiqueListerCategories, boutiqueCreerCategorie } from "@/lib/boutiques/categories.functions";

export type ValeursProduit = {
  id?: string;
  reference?: string | null;
  nom: string;
  categorie_id: string;
  sous_categorie_id?: string | null;
  taille?: string | null;
  couleur?: string | null;
  prix_usd: number;
  prix_achat_usd?: number | null;
  prix_limite_vente_usd?: number | null;
  tva_applicable?: boolean | null;
  prix_promo_usd?: number | null;
  promo_debut?: string | null;
  promo_fin?: string | null;
  promo_actif?: boolean | null;
  seuil_alerte?: number;
  description?: string | null;
  images?: string[];
};

// ISO <-> valeur d'<input type="datetime-local"> (heure locale) — même
// helper que côté marketplace (VendorPanel.tsx), dupliqué ici pour ne pas
// créer une dépendance croisée entre les deux modules de tarification promo.
function versLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FormulaireProduit({
  boutiqueId,
  onSoumettre,
  enCours,
  valeursInitiales,
}: {
  boutiqueId: string;
  onSoumettre: (v: {
    nom: string;
    categorie_id: string;
    sous_categorie_id?: string;
    taille?: string;
    couleur?: string;
    prix_usd: number;
    prix_achat_usd?: number;
    prix_limite_vente_usd?: number | null;
    tva_applicable?: boolean;
    prix_promo_usd?: number | null;
    promo_debut?: string | null;
    promo_fin?: string | null;
    promo_actif?: boolean;
    quantite?: number;
    seuil_alerte: number;
    description?: string;
    images?: string[];
  }) => void;
  enCours: boolean;
  valeursInitiales?: ValeursProduit;
}) {
  const modeEdition = !!valeursInitiales;
  const [nom, setNom] = useState(valeursInitiales?.nom ?? "");
  const [categorieId, setCategorieId] = useState(valeursInitiales?.categorie_id ?? "");
  const [sousCategorieId, setSousCategorieId] = useState(valeursInitiales?.sous_categorie_id ?? "");
  const [taille, setTaille] = useState(valeursInitiales?.taille ?? "");
  const [couleur, setCouleur] = useState(valeursInitiales?.couleur ?? "");
  const [prix, setPrix] = useState(valeursInitiales ? String(valeursInitiales.prix_usd) : "");
  const [prixAchat, setPrixAchat] = useState(
    valeursInitiales?.prix_achat_usd != null ? String(valeursInitiales.prix_achat_usd) : "",
  );
  const [prixLimiteVente, setPrixLimiteVente] = useState(
    valeursInitiales?.prix_limite_vente_usd != null ? String(valeursInitiales.prix_limite_vente_usd) : "",
  );
  const [tvaApplicable, setTvaApplicable] = useState(!!valeursInitiales?.tva_applicable);
  const [prixPromo, setPrixPromo] = useState(
    valeursInitiales?.prix_promo_usd != null ? String(valeursInitiales.prix_promo_usd) : "",
  );
  const [promoDebut, setPromoDebut] = useState(versLocal(valeursInitiales?.promo_debut));
  const [promoFin, setPromoFin] = useState(versLocal(valeursInitiales?.promo_fin));
  const [promoActif, setPromoActif] = useState(!!valeursInitiales?.promo_actif);
  const [quantite, setQuantite] = useState("0");
  const [seuil, setSeuil] = useState(
    valeursInitiales?.seuil_alerte != null ? String(valeursInitiales.seuil_alerte) : "3",
  );
  const [description, setDescription] = useState(valeursInitiales?.description ?? "");
  const [images, setImages] = useState<string[]>(valeursInitiales?.images ?? []);
  // Dossier de stockage stable pour toute la durée d'ouverture du formulaire.
  // En création, le produit n'existe pas encore en base (uuid temporaire) —
  // voir GestionnairePhotosProduit / migration 47. En édition, on réutilise
  // directement l'id réel du produit (déjà son dossier de stockage).
  const [dossierId] = useState(() => valeursInitiales?.id ?? crypto.randomUUID());

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!categorieId) {
          toast.error("Choisis une catégorie.");
          return;
        }
        if (promoActif) {
          if (!prixPromo || Number(prixPromo) >= Number(prix)) {
            toast.error("Le prix promo doit être renseigné et inférieur au prix de vente.");
            return;
          }
        }
        if (prixLimiteVente && prixAchat && Number(prixLimiteVente) < Number(prixAchat)) {
          toast.error("Le prix plancher doit être supérieur ou égal au prix d'achat.");
          return;
        }
        onSoumettre({
          nom,
          categorie_id: categorieId,
          sous_categorie_id: sousCategorieId || undefined,
          taille: taille || undefined,
          couleur: couleur || undefined,
          prix_usd: Number(prix),
          prix_achat_usd: prixAchat ? Number(prixAchat) : undefined,
          prix_limite_vente_usd: prixLimiteVente ? Number(prixLimiteVente) : null,
          tva_applicable: tvaApplicable,
          prix_promo_usd: prixPromo ? Number(prixPromo) : null,
          promo_debut: promoDebut ? new Date(promoDebut).toISOString() : null,
          promo_fin: promoFin ? new Date(promoFin).toISOString() : null,
          promo_actif: promoActif,
          quantite: modeEdition ? undefined : Number(quantite),
          seuil_alerte: Number(seuil),
          description: description || undefined,
          images: images.length > 0 ? images : undefined,
        });
      }}
    >
      {valeursInitiales?.reference && (
        <p className="text-xs text-muted-foreground">
          Référence : <span className="font-mono font-medium text-foreground">{valeursInitiales.reference}</span>
        </p>
      )}
      <div>
        <Label>Photos (jusqu'à 8)</Label>
        <div className="mt-1.5">
          <GestionnairePhotosProduit
            boutiqueId={boutiqueId}
            dossierId={dossierId}
            images={images}
            onChange={setImages}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="nom">Nom</Label>
        <Input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} required minLength={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Catégorie</Label>
          <SelecteurCategorie
            boutiqueId={boutiqueId}
            value={categorieId}
            onChange={(id) => {
              setCategorieId(id);
              setSousCategorieId(""); // les sous-catégories dépendent de la catégorie
            }}
          />
        </div>
        <div>
          <Label>Sous-catégorie</Label>
          <SelecteurSousCategorie
            boutiqueId={boutiqueId}
            categorieId={categorieId}
            value={sousCategorieId}
            onChange={setSousCategorieId}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="prix">Prix de vente ($)</Label>
          <Input
            id="prix"
            type="number"
            step="0.01"
            min="0"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="prix-achat">Prix d'achat ($)</Label>
          <Input
            id="prix-achat"
            type="number"
            step="0.01"
            min="0"
            value={prixAchat}
            onChange={(e) => setPrixAchat(e.target.value)}
            placeholder="Optionnel"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="prix-limite">Prix plancher ($)</Label>
          <Input
            id="prix-limite"
            type="number"
            step="0.01"
            min="0"
            value={prixLimiteVente}
            onChange={(e) => setPrixLimiteVente(e.target.value)}
            placeholder="Optionnel — jamais de remise en dessous"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-2.5">
          <div>
            <Label htmlFor="tva-applicable">TVA applicable</Label>
            <p className="text-[11px] text-muted-foreground">Indicatif seulement, aucun calcul.</p>
          </div>
          <Switch id="tva-applicable" checked={tvaApplicable} onCheckedChange={setTvaApplicable} />
        </div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="promo-actif">Prix barré (promotion)</Label>
            <p className="text-xs text-muted-foreground">
              Affiche le prix promo barré sur la vitrine et l'applique à la caisse.
            </p>
          </div>
          <Switch id="promo-actif" checked={promoActif} onCheckedChange={setPromoActif} />
        </div>
        {promoActif && (
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="prix-promo">Prix promo ($)</Label>
              <Input
                id="prix-promo"
                type="number"
                step="0.01"
                min="0"
                value={prixPromo}
                onChange={(e) => setPrixPromo(e.target.value)}
                placeholder={`Inférieur à ${prix || "..."} $`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="promo-debut">Début (optionnel)</Label>
                <Input
                  id="promo-debut"
                  type="datetime-local"
                  value={promoDebut}
                  onChange={(e) => setPromoDebut(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="promo-fin">Fin (optionnel)</Label>
                <Input
                  id="promo-fin"
                  type="datetime-local"
                  value={promoFin}
                  onChange={(e) => setPromoFin(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="taille">Taille</Label>
          <Input id="taille" value={taille} onChange={(e) => setTaille(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="couleur">Couleur</Label>
          <Input id="couleur" value={couleur} onChange={(e) => setCouleur(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!modeEdition && (
          <div>
            <Label htmlFor="quantite">Quantité initiale</Label>
            <Input
              id="quantite"
              type="number"
              min="0"
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label htmlFor="seuil">Seuil d'alerte</Label>
          <Input id="seuil" type="number" min="0" value={seuil} onChange={(e) => setSeuil(e.target.value)} />
        </div>
      </div>
      {modeEdition && (
        <p className="text-xs text-muted-foreground">
          Le stock ne se modifie pas ici — utilise les boutons +1/-1 du tableau (ou l'inventaire) pour garder
          un historique fiable des mouvements.
        </p>
      )}
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : modeEdition ? "Enregistrer" : "Créer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Sélecteur de sous-catégorie avec création à la volée — pas de page de
// gestion séparée, la liste se construit organiquement en créant des
// produits (KISS). Recharge la liste dès que `categorie` change côté parent.
const CREER_NOUVELLE = "__creer__";

function SelecteurSousCategorie({
  boutiqueId,
  categorieId,
  value,
  onChange,
}: {
  boutiqueId: string;
  categorieId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const qc = useQueryClient();
  const listerFn = useServerFn(boutiqueListerSousCategories);
  const creerFn = useServerFn(boutiqueCreerSousCategorie);
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");

  const { data } = useQuery({
    queryKey: ["boutique-sous-categories", boutiqueId, categorieId],
    queryFn: () => listerFn({ data: { boutique_id: boutiqueId, categorie_id: categorieId } }),
    enabled: !!categorieId,
  });
  const sousCategories = data?.sousCategories ?? [];

  const creer = useMutation({
    mutationFn: () =>
      creerFn({ data: { boutique_id: boutiqueId, categorie_id: categorieId, nom: nouveauNom.trim() } }),
    onSuccess: ({ sousCategorie }) => {
      qc.invalidateQueries({ queryKey: ["boutique-sous-categories", boutiqueId, categorieId] });
      onChange(sousCategorie.id);
      setOuvrirCreation(false);
      setNouveauNom("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!categorieId) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Choisis d'abord une catégorie" />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (ouvrirCreation) {
    // Une <div>, pas un <form> : ce composant vit À L'INTÉRIEUR du <form>
    // du produit (FormulaireProduit) — un <form> imbriqué est invalide en
    // HTML et fait planter la soumission (le navigateur navigue "en dur" au
    // lieu de déclencher onSubmit React, perdant même le ?boutique=... de
    // l'URL). type="button" partout + Entrée gérée manuellement.
    const soumettre = () => {
      if (nouveauNom.trim() && !creer.isPending) creer.mutate();
    };
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              soumettre();
            }
          }}
          placeholder="Ex. Chemises"
          maxLength={60}
        />
        <Button type="button" size="sm" disabled={creer.isPending || !nouveauNom.trim()} onClick={soumettre}>
          Créer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvrirCreation(false)}>
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => (v === CREER_NOUVELLE ? setOuvrirCreation(true) : onChange(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Aucune (optionnel)" />
      </SelectTrigger>
      <SelectContent>
        {sousCategories.map((sc: { id: string; nom: string }) => (
          <SelectItem key={sc.id} value={sc.id}>
            {sc.nom}
          </SelectItem>
        ))}
        <SelectItem value={CREER_NOUVELLE}>+ Nouvelle sous-catégorie…</SelectItem>
      </SelectContent>
    </Select>
  );
}

// Même principe que SelecteurSousCategorie : création à la volée en plus de
// la page de gestion dédiée (/boutique/admin/categories) — un vendeur pressé
// n'a pas à quitter le formulaire produit pour créer une catégorie manquante.
function SelecteurCategorie({
  boutiqueId,
  value,
  onChange,
}: {
  boutiqueId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const qc = useQueryClient();
  const listerFn = useServerFn(boutiqueListerCategories);
  const creerFn = useServerFn(boutiqueCreerCategorie);
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");

  const { data } = useQuery({
    queryKey: ["boutique-categories", boutiqueId],
    queryFn: () => listerFn({ data: { boutique_id: boutiqueId } }),
  });
  const categories = data?.categories ?? [];

  const creer = useMutation({
    mutationFn: () => creerFn({ data: { boutique_id: boutiqueId, nom: nouveauNom.trim() } }),
    onSuccess: ({ categorie }) => {
      qc.invalidateQueries({ queryKey: ["boutique-categories", boutiqueId] });
      onChange(categorie.id);
      setOuvrirCreation(false);
      setNouveauNom("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ouvrirCreation) {
    // <div>, pas <form> : ce composant vit à l'intérieur du <form> produit —
    // voir la même remarque sur SelecteurSousCategorie plus haut.
    const soumettre = () => {
      if (nouveauNom.trim() && !creer.isPending) creer.mutate();
    };
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              soumettre();
            }
          }}
          placeholder="Ex. Chaussures"
          maxLength={60}
        />
        <Button type="button" size="sm" disabled={creer.isPending || !nouveauNom.trim()} onClick={soumettre}>
          Créer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvrirCreation(false)}>
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => (v === CREER_NOUVELLE ? setOuvrirCreation(true) : onChange(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Choisir…" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((c: { id: string; nom: string; icone: string | null }) => (
          <SelectItem key={c.id} value={c.id}>
            {c.icone ? `${c.icone} ` : ""}
            {c.nom}
          </SelectItem>
        ))}
        <SelectItem value={CREER_NOUVELLE}>+ Nouvelle catégorie…</SelectItem>
      </SelectContent>
    </Select>
  );
}
