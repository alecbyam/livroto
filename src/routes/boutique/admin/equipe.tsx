import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueListerStaff,
  boutiqueInviterStaff,
  boutiqueChangerRoleStaff,
  boutiqueRetirerStaff,
} from "@/lib/boutiques/staff.functions";

export const Route = createFileRoute("/boutique/admin/equipe")({
  component: EquipeAdminPage,
});

const LIBELLE_ROLE: Record<string, string> = {
  admin: "Admin",
  vendeur: "Vendeur",
  caissier: "Caissier",
};

function EquipeAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const [ouvrirInvitation, setOuvrirInvitation] = useState(false);

  const listerFn = useServerFn(boutiqueListerStaff);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-staff", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id } }),
  });

  const inviterFn = useServerFn(boutiqueInviterStaff);
  const inviter = useMutation({
    mutationFn: inviterFn,
    onSuccess: () => {
      toast.success("Invitation envoyée — un email a été envoyé pour définir le mot de passe.");
      qc.invalidateQueries({ queryKey: ["boutique-staff", boutique.id] });
      setOuvrirInvitation(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changerRoleFn = useServerFn(boutiqueChangerRoleStaff);
  const changerRole = useMutation({
    mutationFn: changerRoleFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["boutique-staff", boutique.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const retirerFn = useServerFn(boutiqueRetirerStaff);
  const retirer = useMutation({
    mutationFn: retirerFn,
    onSuccess: () => {
      toast.success("Membre retiré de l'équipe.");
      qc.invalidateQueries({ queryKey: ["boutique-staff", boutique.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Équipe — {boutique.nom}</h1>
          <p className="text-sm text-muted-foreground">
            Chaque membre n'a accès qu'à la gestion de {boutique.nom} — jamais au reste de la
            plateforme.
          </p>
        </div>
        <Dialog open={ouvrirInvitation} onOpenChange={setOuvrirInvitation}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4" /> Inviter
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Inviter un membre de l'équipe</DialogTitle>
            </DialogHeader>
            <FormulaireInvitation
              enCours={inviter.isPending}
              onSoumettre={(v) => inviter.mutate({ data: { boutique_id: boutique.id, ...v } })}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" />
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.membres ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.nom}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                <TableCell>
                  <Select
                    value={m.role}
                    onValueChange={(role: "admin" | "vendeur" | "caissier") =>
                      changerRole.mutate({
                        data: { boutique_id: boutique.id, membre_id: m.id, role },
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LIBELLE_ROLE).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Retirer de l'équipe"
                    onClick={() => {
                      if (confirm(`Retirer ${m.nom} de l'équipe ${boutique.nom} ?`)) {
                        retirer.mutate({ data: { boutique_id: boutique.id, membre_id: m.id } });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FormulaireInvitation({
  onSoumettre,
  enCours,
}: {
  onSoumettre: (v: { email: string; nom: string; role: "admin" | "vendeur" | "caissier" }) => void;
  enCours: boolean;
}) {
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [role, setRole] = useState<"admin" | "vendeur" | "caissier">("caissier");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSoumettre({ email: email.trim(), nom: nom.trim(), role });
      }}
    >
      <div>
        <Label htmlFor="eq-nom">Nom</Label>
        <Input
          id="eq-nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          minLength={1}
        />
      </div>
      <div>
        <Label htmlFor="eq-email">Email</Label>
        <Input
          id="eq-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Rôle</Label>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin — accès complet</SelectItem>
            <SelectItem value="vendeur">Vendeur — produits, stock, ventes</SelectItem>
            <SelectItem value="caissier">Caissier — caisse uniquement</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        La personne reçoit un email pour définir son mot de passe et se connecter directement à la
        gestion de la boutique.
      </p>
      <DialogFooter>
        <Button type="submit" disabled={enCours}>
          {enCours ? "Envoi..." : "Envoyer l'invitation"}
        </Button>
      </DialogFooter>
    </form>
  );
}
