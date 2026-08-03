// Suivi des ventes à crédit : liste, filtre par statut (y compris "en
// retard", calculé), et enregistrement des paiements partiels — le crédit
// reste toujours visible avec son client et sa vente d'origine (numéro).
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, MessageCircle, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  boutiqueListerCredits,
  boutiqueEnregistrerPaiementCredit,
  boutiqueObtenirRapportCredits,
  boutiqueListerPaiementsCredit,
} from "@/lib/boutiques/credits.functions";
import { whatsAppRelanceCreditUrl } from "@/lib/boutiques/whatsapp-links";

export const Route = createFileRoute("/boutique/admin/credits")({
  component: CreditsAdminPage,
});

const FILTRES = [
  { id: "tous", label: "Tous" },
  { id: "en_attente", label: "En attente" },
  { id: "partiellement_paye", label: "Partiellement payé" },
  { id: "paye", label: "Payé" },
  { id: "en_retard", label: "En retard" },
] as const;

type Credit = {
  id: string;
  montant_total_usd: number;
  montant_paye_usd: number;
  montant_restant_usd: number;
  date_echeance: string;
  statut: "en_attente" | "partiellement_paye" | "paye";
  en_retard: boolean;
  notes: string | null;
  ventes: { numero: string | null } | null;
  clients_boutique: { id: string; nom: string; telephone: string } | null;
};

function CreditsAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const [filtre, setFiltre] = useState<(typeof FILTRES)[number]["id"]>("tous");
  const [creditAPayer, setCreditAPayer] = useState<Credit | null>(null);
  const [creditHistorique, setCreditHistorique] = useState<Credit | null>(null);

  const invalider = () => {
    qc.invalidateQueries({ queryKey: ["boutique-credits", boutique.id] });
    qc.invalidateQueries({ queryKey: ["boutique-rapport-credits", boutique.id] });
    qc.invalidateQueries({ queryKey: ["boutique-paiements-credit", boutique.id] });
  };

  const listerFn = useServerFn(boutiqueListerCredits);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-credits", boutique.id, filtre],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id, filtre } }),
  });
  const credits = (data?.credits ?? []) as Credit[];

  const rapportFn = useServerFn(boutiqueObtenirRapportCredits);
  const { data: rapport } = useQuery({
    queryKey: ["boutique-rapport-credits", boutique.id],
    queryFn: () => rapportFn({ data: { boutique_id: boutique.id } }),
  });

  const paiementsFn = useServerFn(boutiqueListerPaiementsCredit);
  const { data: paiements, isLoading: paiementsChargement } = useQuery({
    queryKey: ["boutique-paiements-credit", boutique.id, creditHistorique?.id],
    queryFn: () =>
      paiementsFn({ data: { boutique_id: boutique.id, credit_id: creditHistorique!.id } }),
    enabled: !!creditHistorique,
  });

  const paiementFn = useServerFn(boutiqueEnregistrerPaiementCredit);
  const paiement = useMutation({
    mutationFn: paiementFn,
    onSuccess: () => {
      toast.success("Paiement enregistré.");
      invalider();
      setCreditAPayer(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Crédits — {boutique.nom}</h1>
      <p className="text-sm text-muted-foreground">
        Ventes payées en tout ou en partie plus tard — toujours liées à un client.
      </p>

      {rapport && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CarteChiffre label="Dû au total" valeur={`${rapport.total_du_usd} $`} />
          <CarteChiffre label="Déjà payé" valeur={`${rapport.total_paye_usd} $`} />
          <CarteChiffre label="Restant" valeur={`${rapport.total_restant_usd} $`} accent />
          <CarteChiffre
            label="En retard"
            valeur={`${rapport.total_en_retard_usd} $`}
            accent={rapport.total_en_retard_usd > 0}
            danger
          />
        </div>
      )}

      <div className="mt-6 flex gap-1.5 overflow-x-auto">
        {FILTRES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltre(f.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filtre === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" />
      ) : credits.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Aucun crédit dans ce filtre.</p>
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Vente</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Restant</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {credits.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-medium">{c.clients_boutique?.nom ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{c.clients_boutique?.telephone}</div>
                  {c.notes && <div className="text-xs italic text-muted-foreground">{c.notes}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{c.ventes?.numero ?? "—"}</TableCell>
                <TableCell>{c.montant_total_usd} $</TableCell>
                <TableCell className="font-medium">{c.montant_restant_usd} $</TableCell>
                <TableCell>{c.date_echeance}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={c.statut === "paye" ? "secondary" : "outline"}>
                      {c.statut === "en_attente"
                        ? "En attente"
                        : c.statut === "partiellement_paye"
                          ? "Partiel"
                          : "Payé"}
                    </Badge>
                    {c.en_retard && <Badge variant="destructive">En retard</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {c.statut !== "paye" && (
                      <Button size="sm" onClick={() => setCreditAPayer(c)}>
                        Encaisser
                      </Button>
                    )}
                    {c.statut !== "paye" && c.clients_boutique?.telephone && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Relancer par WhatsApp"
                        asChild
                      >
                        <a
                          href={whatsAppRelanceCreditUrl({
                            telephoneClient: c.clients_boutique.telephone,
                            boutiqueNom: boutique.nom,
                            nomClient: c.clients_boutique.nom,
                            montantRestantUsd: c.montant_restant_usd,
                            dateEcheance: c.date_echeance,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="h-4 w-4 text-green-600" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Historique des paiements"
                      onClick={() => setCreditHistorique(c)}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!creditAPayer} onOpenChange={(open) => !open && setCreditAPayer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
          </DialogHeader>
          {creditAPayer && (
            <FormulairePaiement
              montantRestant={creditAPayer.montant_restant_usd}
              enCours={paiement.isPending}
              onSoumettre={(v) =>
                paiement.mutate({
                  data: { boutique_id: boutique.id, credit_id: creditAPayer.id, ...v },
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!creditHistorique} onOpenChange={(open) => !open && setCreditHistorique(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Historique des paiements — {creditHistorique?.clients_boutique?.nom ?? ""}
            </DialogTitle>
          </DialogHeader>
          {paiementsChargement || !paiements ? (
            <div className="h-32 animate-pulse rounded-xl bg-muted" />
          ) : paiements.paiements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun paiement enregistré pour ce crédit.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paiements.paiements.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell className="font-medium">{p.montant_usd} $</TableCell>
                    <TableCell>{LIBELLE_MODE_PAIEMENT[p.mode_paiement] ?? p.mode_paiement}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const LIBELLE_MODE_PAIEMENT: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  carte: "Carte",
};

function CarteChiffre({
  label,
  valeur,
  accent,
  danger,
}: {
  label: string;
  valeur: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-bold ${
          danger && accent ? "text-destructive" : accent ? "text-primary" : ""
        }`}
      >
        {valeur}
      </p>
    </div>
  );
}

function FormulairePaiement({
  montantRestant,
  onSoumettre,
  enCours,
}: {
  montantRestant: number;
  onSoumettre: (v: { montant_usd: number; mode_paiement: "cash" | "mobile_money" | "carte"; note?: string }) => void;
  enCours: boolean;
}) {
  const [montant, setMontant] = useState(String(montantRestant));
  const [mode, setMode] = useState<"cash" | "mobile_money" | "carte">("cash");
  const [note, setNote] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSoumettre({ montant_usd: Number(montant), mode_paiement: mode, note: note.trim() || undefined });
      }}
    >
      <p className="text-sm text-muted-foreground">Restant dû : {montantRestant} $</p>
      <div>
        <Label htmlFor="paiement-montant">Montant reçu ($)</Label>
        <Input
          id="paiement-montant"
          type="number"
          step="0.01"
          min="0.01"
          max={montantRestant}
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Mode de paiement</Label>
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="mobile_money">Mobile Money</SelectItem>
            <SelectItem value="carte">Carte</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="paiement-note">Note (optionnel)</Label>
        <Input id="paiement-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={enCours}>
          <Wallet className="h-4 w-4" />
          {enCours ? "Enregistrement..." : "Enregistrer le paiement"}
        </Button>
      </DialogFooter>
    </form>
  );
}
