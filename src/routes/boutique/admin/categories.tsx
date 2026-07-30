// Gestion CRUD des catégories et sous-catégories — chaque catégorie peut être
// dépliée pour gérer ses propres sous-catégories, la relation catégorie <->
// sous-catégorie (categorie_id, migration 49) étant ainsi visible et éditable
// directement, pas seulement au moment de créer un produit.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueListerCategories,
  boutiqueCreerCategorie,
  boutiqueModifierCategorie,
  boutiqueSupprimerCategorie,
} from "@/lib/boutiques/categories.functions";
import {
  boutiqueListerSousCategories,
  boutiqueCreerSousCategorie,
  boutiqueSupprimerSousCategorie,
} from "@/lib/boutiques/sous-categories.functions";

export const Route = createFileRoute("/boutique/admin/categories")({
  component: CategoriesAdminPage,
});

type Categorie = { id: string; nom: string; icone: string | null; actif: boolean };

function CategoriesAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [deplie, setDeplie] = useState<Set<string>>(new Set());
  const [categorieAModifier, setCategorieAModifier] = useState<Categorie | null>(null);

  const invalider = () => qc.invalidateQueries({ queryKey: ["boutique-categories-admin", boutique.id] });

  const listerFn = useServerFn(boutiqueListerCategories);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-categories-admin", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id, inclure_inactives: true } }),
  });
  const categories = data?.categories ?? [];

  const creerFn = useServerFn(boutiqueCreerCategorie);
  const creer = useMutation({
    mutationFn: creerFn,
    onSuccess: () => {
      toast.success("Catégorie créée.");
      invalider();
      setOuvrirCreation(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modifierFn = useServerFn(boutiqueModifierCategorie);
  const modifier = useMutation({
    mutationFn: modifierFn,
    onSuccess: () => {
      toast.success("Catégorie mise à jour.");
      invalider();
      setCategorieAModifier(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supprimerFn = useServerFn(boutiqueSupprimerCategorie);
  const supprimer = useMutation({
    mutationFn: supprimerFn,
    onSuccess: () => {
      toast.success("Catégorie désactivée.");
      invalider();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDeplie = (id: string) => {
    setDeplie((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catégories — {boutique.nom}</h1>
          <p className="text-sm text-muted-foreground">
            Chaque catégorie a ses propres sous-catégories — déplie-la pour les gérer.
          </p>
        </div>
        <Dialog open={ouvrirCreation} onOpenChange={setOuvrirCreation}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nouvelle catégorie
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle catégorie</DialogTitle>
            </DialogHeader>
            <FormulaireCategorie
              enCours={creer.isPending}
              onSoumettre={(v) => creer.mutate({ data: { boutique_id: boutique.id, ...v } })}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" />
      ) : categories.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Aucune catégorie pour le moment.</p>
      ) : (
        <div className="mt-6 space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="rounded-xl border bg-card">
              <div className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => toggleDeplie(c.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  {deplie.has(c.id) ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-lg">{c.icone || "🏷️"}</span>
                  <span className="font-medium">{c.nom}</span>
                  {!c.actif && (
                    <Badge variant="outline" className="ml-1">
                      Inactive
                    </Badge>
                  )}
                </button>
                <Button size="icon" variant="ghost" onClick={() => setCategorieAModifier(c)} title="Modifier">
                  <Pencil className="h-4 w-4" />
                </Button>
                {c.actif && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Désactiver"
                    onClick={() => {
                      if (confirm(`Désactiver la catégorie "${c.nom}" ? Les produits déjà classés dedans restent inchangés.`)) {
                        supprimer.mutate({ data: { boutique_id: boutique.id, categorie_id: c.id } });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              {deplie.has(c.id) && (
                <div className="border-t px-3 py-3 pl-9">
                  <SousCategoriesDeLaCategorie boutiqueId={boutique.id} categorie={c} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!categorieAModifier} onOpenChange={(open) => !open && setCategorieAModifier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la catégorie</DialogTitle>
          </DialogHeader>
          {categorieAModifier && (
            <FormulaireCategorie
              valeursInitiales={categorieAModifier}
              enCours={modifier.isPending}
              onSoumettre={(v) =>
                modifier.mutate({
                  data: { boutique_id: boutique.id, categorie_id: categorieAModifier.id, ...v },
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormulaireCategorie({
  valeursInitiales,
  onSoumettre,
  enCours,
}: {
  valeursInitiales?: { nom: string; icone: string | null };
  onSoumettre: (v: { nom: string; icone?: string }) => void;
  enCours: boolean;
}) {
  const [nom, setNom] = useState(valeursInitiales?.nom ?? "");
  const [icone, setIcone] = useState(valeursInitiales?.icone ?? "");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSoumettre({ nom: nom.trim(), icone: icone.trim() || undefined });
      }}
    >
      <div>
        <Label htmlFor="cat-nom">Nom</Label>
        <Input id="cat-nom" value={nom} onChange={(e) => setNom(e.target.value)} required minLength={1} />
      </div>
      <div>
        <Label htmlFor="cat-icone">Emoji (optionnel)</Label>
        <Input
          id="cat-icone"
          value={icone}
          onChange={(e) => setIcone(e.target.value)}
          placeholder="Ex. 👟"
          maxLength={8}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SousCategoriesDeLaCategorie({
  boutiqueId,
  categorie,
}: {
  boutiqueId: string;
  categorie: Categorie;
}) {
  const qc = useQueryClient();
  const [nouveauNom, setNouveauNom] = useState("");

  const invalider = () =>
    qc.invalidateQueries({ queryKey: ["boutique-sous-categories-admin", boutiqueId, categorie.id] });

  const listerFn = useServerFn(boutiqueListerSousCategories);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-sous-categories-admin", boutiqueId, categorie.id],
    queryFn: () => listerFn({ data: { boutique_id: boutiqueId, categorie_id: categorie.id } }),
  });
  const sousCategories = data?.sousCategories ?? [];

  const creerFn = useServerFn(boutiqueCreerSousCategorie);
  const creer = useMutation({
    mutationFn: () => creerFn({ data: { boutique_id: boutiqueId, categorie_id: categorie.id, nom: nouveauNom.trim() } }),
    onSuccess: () => {
      invalider();
      setNouveauNom("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supprimerFn = useServerFn(boutiqueSupprimerSousCategorie);
  const supprimer = useMutation({
    mutationFn: (sous_categorie_id: string) =>
      supprimerFn({ data: { boutique_id: boutiqueId, sous_categorie_id } }),
    onSuccess: () => invalider(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="h-8 w-full animate-pulse rounded bg-muted" />;

  return (
    <div className="space-y-2">
      {sousCategories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune sous-catégorie.</p>
      ) : (
        <ul className="space-y-1">
          {sousCategories.map((sc: { id: string; nom: string }) => (
            <li key={sc.id} className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
              <span>{sc.nom}</span>
              <button
                type="button"
                title="Désactiver"
                onClick={() => {
                  if (confirm(`Désactiver "${sc.nom}" ?`)) supprimer.mutate(sc.id);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <Input
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nouveauNom.trim() && !creer.isPending) {
              e.preventDefault();
              creer.mutate();
            }
          }}
          placeholder="Ajouter une sous-catégorie…"
          maxLength={60}
          className="h-8"
        />
        <Button
          type="button"
          size="sm"
          disabled={creer.isPending || !nouveauNom.trim()}
          onClick={() => creer.mutate()}
        >
          Ajouter
        </Button>
      </div>
    </div>
  );
}
