import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { boutiqueListerCodesPromo, boutiqueUpsertCodePromo, boutiqueSupprimerCodePromo } from "@/lib/boutiques/promo.functions";

export const Route = createFileRoute("/boutique/admin/promo")({
  component: PromoAdminPage,
});

function PromoAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const listerFn = useServerFn(boutiqueListerCodesPromo);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-codes-promo", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id } }),
  });

  const invalider = () => qc.invalidateQueries({ queryKey: ["boutique-codes-promo", boutique.id] });

  const upsertFn = useServerFn(boutiqueUpsertCodePromo);
  const upsert = useMutation({
    mutationFn: upsertFn,
    onSuccess: () => { toast.success("Code promo enregistré."); invalider(); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const supprimerFn = useServerFn(boutiqueSupprimerCodePromo);
  const supprimer = useMutation({
    mutationFn: supprimerFn,
    onSuccess: () => { toast.success("Code promo supprimé."); invalider(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Codes promo — {boutique.nom}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Nouveau code</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouveau code promo</DialogTitle></DialogHeader>
            <FormulaireCodePromo enCours={upsert.isPending} onSoumettre={(v) => upsert.mutate({ data: { boutique_id: boutique.id, ...v } })} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" />
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Réduction</TableHead>
              <TableHead>Min. achat</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-medium">{c.code}</TableCell>
                <TableCell>{c.type_reduction === "pourcentage" ? `${c.valeur}%` : `${c.valeur} $`}</TableCell>
                <TableCell>{c.montant_min_usd} $</TableCell>
                <TableCell>{c.usage_actuel}{c.usage_max ? ` / ${c.usage_max}` : ""}</TableCell>
                <TableCell>
                  <Badge
                    variant={c.actif ? "secondary" : "outline"}
                    className="cursor-pointer"
                    onClick={() => upsert.mutate({ data: { boutique_id: boutique.id, id: c.id, code: c.code, type_reduction: c.type_reduction, valeur: c.valeur, montant_min_usd: c.montant_min_usd, usage_max: c.usage_max, actif: !c.actif } })}
                  >
                    {c.actif ? "Actif" : "Inactif"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => supprimer.mutate({ data: { boutique_id: boutique.id, id: c.id } })}>Suppr.</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FormulaireCodePromo({
  onSoumettre, enCours,
}: {
  onSoumettre: (v: { code: string; type_reduction: "pourcentage" | "montant_fixe"; valeur: number; montant_min_usd: number; usage_max?: number }) => void;
  enCours: boolean;
}) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"pourcentage" | "montant_fixe">("pourcentage");
  const [valeur, setValeur] = useState("");
  const [montantMin, setMontantMin] = useState("0");
  const [usageMax, setUsageMax] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSoumettre({
          code, type_reduction: type, valeur: Number(valeur),
          montant_min_usd: Number(montantMin) || 0,
          usage_max: usageMax ? Number(usageMax) : undefined,
        });
      }}
    >
      <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={2} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pourcentage">Pourcentage</SelectItem>
              <SelectItem value="montant_fixe">Montant fixe</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Valeur</Label><Input type="number" step="0.01" min="0" value={valeur} onChange={(e) => setValeur(e.target.value)} required /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Achat minimum ($)</Label><Input type="number" step="0.01" min="0" value={montantMin} onChange={(e) => setMontantMin(e.target.value)} /></div>
        <div><Label>Usage max (optionnel)</Label><Input type="number" min="1" value={usageMax} onChange={(e) => setUsageMax(e.target.value)} /></div>
      </div>
      <DialogFooter><Button type="submit" disabled={enCours}>Créer</Button></DialogFooter>
    </form>
  );
}
