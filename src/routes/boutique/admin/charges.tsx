// Gestion des charges d'exploitation (loyer/personnel/autre) — alimente le
// calcul de rentabilité réelle en rapports (onglet Rentabilité). Réservé aux
// admins de bout en bout (lecture incluse), cf. charges.functions.ts.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueListerCharges,
  boutiqueCreerCharge,
  boutiqueModifierCharge,
  boutiqueSupprimerCharge,
} from "@/lib/boutiques/charges.functions";

export const Route = createFileRoute("/boutique/admin/charges")({
  component: ChargesAdminPage,
});

type TypeCharge = "loyer" | "personnel" | "autre";
type Recurrence = "mensuelle" | "ponctuelle";
type Charge = {
  id: string;
  type: TypeCharge;
  libelle: string;
  montant_usd: number;
  recurrence: Recurrence;
  date_charge: string;
  date_fin: string | null;
  actif: boolean;
};

const LIBELLE_TYPE: Record<TypeCharge, string> = {
  loyer: "Loyer",
  personnel: "Personnel",
  autre: "Autre",
};
const LIBELLE_RECURRENCE: Record<Recurrence, string> = {
  mensuelle: "Mensuelle",
  ponctuelle: "Ponctuelle",
};

function ChargesAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [chargeAModifier, setChargeAModifier] = useState<Charge | null>(null);

  const invalider = () => qc.invalidateQueries({ queryKey: ["boutique-charges-admin", boutique.id] });

  const listerFn = useServerFn(boutiqueListerCharges);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-charges-admin", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id, inclure_inactives: true } }),
  });
  const charges = (data?.charges ?? []) as Charge[];

  const creerFn = useServerFn(boutiqueCreerCharge);
  const creer = useMutation({
    mutationFn: creerFn,
    onSuccess: () => {
      toast.success("Charge créée.");
      invalider();
      setOuvrirCreation(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modifierFn = useServerFn(boutiqueModifierCharge);
  const modifier = useMutation({
    mutationFn: modifierFn,
    onSuccess: () => {
      toast.success("Charge mise à jour.");
      invalider();
      setChargeAModifier(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supprimerFn = useServerFn(boutiqueSupprimerCharge);
  const supprimer = useMutation({
    mutationFn: supprimerFn,
    onSuccess: () => {
      toast.success("Charge désactivée.");
      invalider();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Charges — {boutique.nom}</h1>
          <p className="text-sm text-muted-foreground">
            Loyer, personnel, autres coûts — utilisés pour calculer la vraie rentabilité dans Rapports.
          </p>
        </div>
        <Dialog open={ouvrirCreation} onOpenChange={setOuvrirCreation}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nouvelle charge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle charge</DialogTitle>
            </DialogHeader>
            <FormulaireCharge
              enCours={creer.isPending}
              onSoumettre={(v) => creer.mutate({ data: { boutique_id: boutique.id, ...v } })}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" />
      ) : charges.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Aucune charge enregistrée.</p>
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Récurrence</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{LIBELLE_TYPE[c.type]}</TableCell>
                <TableCell className="font-medium">{c.libelle}</TableCell>
                <TableCell>{Number(c.montant_usd).toFixed(2)} $</TableCell>
                <TableCell>{LIBELLE_RECURRENCE[c.recurrence]}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.date_charge}
                  {c.date_fin ? ` → ${c.date_fin}` : ""}
                </TableCell>
                <TableCell>
                  {c.actif ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Désactivée</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" title="Modifier" onClick={() => setChargeAModifier(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {c.actif && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Désactiver"
                        onClick={() => {
                          if (
                            confirm(
                              `Désactiver la charge "${c.libelle}" ? Elle restera comptée dans l'historique de rentabilité jusqu'à aujourd'hui.`,
                            )
                          ) {
                            supprimer.mutate({ data: { boutique_id: boutique.id, charge_id: c.id } });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!chargeAModifier} onOpenChange={(open) => !open && setChargeAModifier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la charge</DialogTitle>
          </DialogHeader>
          {chargeAModifier && (
            <FormulaireCharge
              valeursInitiales={chargeAModifier}
              enCours={modifier.isPending}
              onSoumettre={(v) =>
                modifier.mutate({
                  data: { boutique_id: boutique.id, charge_id: chargeAModifier.id, ...v },
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormulaireCharge({
  valeursInitiales,
  onSoumettre,
  enCours,
}: {
  valeursInitiales?: Charge;
  onSoumettre: (v: {
    type: TypeCharge;
    libelle: string;
    montant_usd: number;
    recurrence: Recurrence;
    date_charge: string;
  }) => void;
  enCours: boolean;
}) {
  const [type, setType] = useState<TypeCharge>(valeursInitiales?.type ?? "loyer");
  const [libelle, setLibelle] = useState(valeursInitiales?.libelle ?? "");
  const [montant, setMontant] = useState(valeursInitiales ? String(valeursInitiales.montant_usd) : "");
  const [recurrence, setRecurrence] = useState<Recurrence>(valeursInitiales?.recurrence ?? "mensuelle");
  const [dateCharge, setDateCharge] = useState(
    valeursInitiales?.date_charge ?? new Date().toISOString().slice(0, 10),
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!libelle.trim()) {
          toast.error("Le libellé est requis.");
          return;
        }
        if (!montant || Number(montant) <= 0) {
          toast.error("Le montant doit être supérieur à 0.");
          return;
        }
        onSoumettre({
          type,
          libelle: libelle.trim(),
          montant_usd: Number(montant),
          recurrence,
          date_charge: dateCharge,
        });
      }}
    >
      <div>
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as TypeCharge)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="loyer">Loyer</SelectItem>
            <SelectItem value="personnel">Personnel</SelectItem>
            <SelectItem value="autre">Autre</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="charge-libelle">Libellé</Label>
        <Input
          id="charge-libelle"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Ex. Loyer boutique, Salaire Huguette"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="charge-montant">Montant ($)</Label>
          <Input
            id="charge-montant"
            type="number"
            step="0.01"
            min="0"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Récurrence</Label>
          <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mensuelle">Mensuelle</SelectItem>
              <SelectItem value="ponctuelle">Ponctuelle</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="charge-date">
          {recurrence === "mensuelle" ? "Date de début" : "Date de la dépense"}
        </Label>
        <Input
          id="charge-date"
          type="date"
          value={dateCharge}
          onChange={(e) => setDateCharge(e.target.value)}
          required
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
