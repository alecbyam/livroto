// Page de compte personnel du staff connecté (pas la gestion d'ÉQUIPE, qui
// gère les AUTRES membres — voir equipe.tsx). Accessible aux 3 rôles :
// chacun doit pouvoir changer son propre mot de passe, pas seulement l'admin.
// Même pattern que reset-password.tsx (marketplace) : Supabase n'exige que la
// session active pour updateUser({ password }), pas l'ancien mot de passe.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { boutiqueObtenirMonRole } from "@/lib/boutiques/staff.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/boutique/admin/mon-compte")({
  component: MonCompteAdminPage,
});

const LIBELLE_ROLE: Record<string, string> = {
  admin: "Admin",
  vendeur: "Vendeur",
  caissier: "Caissier",
};

function MonCompteAdminPage() {
  const boutique = useBoutique();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const monRoleFn = useServerFn(boutiqueObtenirMonRole);
  const { data: monRole } = useQuery({
    queryKey: ["boutique-mon-role", boutique.id],
    queryFn: () => monRoleFn({ data: { boutique_id: boutique.id } }),
  });
  const role = monRole?.role;

  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motDePasse.length < 6) {
      toast.error("6 caractères minimum");
      return;
    }
    if (motDePasse !== confirmation) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setEnCours(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: motDePasse });
      if (error) throw error;
      toast.success("Mot de passe mis à jour !");
      setMotDePasse("");
      setConfirmation("");
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="container mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-bold">Mon compte</h1>
      <p className="text-sm text-muted-foreground">Gestion de {boutique.nom}</p>

      <div className="mt-6 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{email ?? "…"}</p>
            <p className="text-xs text-muted-foreground">Adresse de connexion</p>
          </div>
          {role && <Badge variant="secondary">{LIBELLE_ROLE[role]}</Badge>}
        </div>
      </div>

      <div className="mt-4 rounded-xl border p-4">
        <h2 className="font-semibold">Changer mon mot de passe</h2>
        <form onSubmit={soumettre} className="mt-3 space-y-3">
          <div>
            <Label htmlFor="np">Nouveau mot de passe</Label>
            <Input
              id="np"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cp">Confirmer</Label>
            <Input
              id="cp"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={enCours} className="w-full">
            {enCours ? "Mise à jour..." : "Mettre à jour le mot de passe"}
          </Button>
        </form>
      </div>
    </div>
  );
}
