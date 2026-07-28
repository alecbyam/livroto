import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueObtenirParametresIntegrations, boutiqueEnregistrerWhatsapp, boutiqueTesterWhatsapp,
} from "@/lib/boutiques/parametres.functions";

export const Route = createFileRoute("/boutique/admin/parametres")({
  component: ParametresAdminPage,
});

function ParametresAdminPage() {
  const boutique = useBoutique();
  const obtenirFn = useServerFn(boutiqueObtenirParametresIntegrations);
  const { data, refetch } = useQuery({
    queryKey: ["boutique-parametres", boutique.id],
    queryFn: () => obtenirFn({ data: { boutique_id: boutique.id } }),
  });

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");

  const enregistrerFn = useServerFn(boutiqueEnregistrerWhatsapp);
  const enregistrer = useMutation({
    mutationFn: enregistrerFn,
    onSuccess: () => { toast.success("Paramètres WhatsApp enregistrés."); setToken(""); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const testerFn = useServerFn(boutiqueTesterWhatsapp);
  const tester = useMutation({
    mutationFn: testerFn,
    onSuccess: (r) => (r.ok ? toast.success(r.detail ?? "Connexion WhatsApp OK") : toast.error(r.detail ?? "Échec du test")),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">Paramètres — {boutique.nom}</h1>

      <div className="mt-6 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">WhatsApp Business</h2>
          <Badge variant={data?.whatsapp_configure ? "secondary" : "outline"}>
            {data?.whatsapp_configure ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Numéro et jeton WhatsApp Cloud API propres à {boutique.nom} — jamais partagés avec une autre boutique.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enregistrer.mutate({ data: { boutique_id: boutique.id, whatsapp_phone_number_id: phoneNumberId || data?.whatsapp_phone_number_id || "", whatsapp_token: token || undefined } });
          }}
        >
          <div>
            <Label>Phone Number ID</Label>
            <Input value={phoneNumberId || data?.whatsapp_phone_number_id || ""} onChange={(e) => setPhoneNumberId(e.target.value)} />
          </div>
          <div>
            <Label>Token d'accès {data?.whatsapp_configure && "(laisser vide pour ne pas changer)"}</Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={enregistrer.isPending}>Enregistrer</Button>
            <Button type="button" variant="outline" disabled={tester.isPending || !data?.whatsapp_configure} onClick={() => tester.mutate({ data: { boutique_id: boutique.id } })}>
              Tester
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
