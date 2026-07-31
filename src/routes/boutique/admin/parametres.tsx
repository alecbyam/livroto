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
  boutiqueObtenirParametresIntegrations,
  boutiqueEnregistrerWhatsapp,
  boutiqueTesterWhatsapp,
  boutiqueEnregistrerFlexpay,
  boutiqueTesterFlexpay,
  boutiqueEnregistrerCoordonnees,
  boutiqueEnregistrerReseauxSociaux,
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

  const [adresse, setAdresse] = useState(boutique.adresse ?? "");
  const [telephone, setTelephone] = useState(boutique.telephone ?? "");
  const [email, setEmail] = useState(boutique.email ?? "");
  const enregistrerCoordonneesFn = useServerFn(boutiqueEnregistrerCoordonnees);
  const enregistrerCoordonnees = useMutation({
    mutationFn: enregistrerCoordonneesFn,
    onSuccess: () => toast.success("Coordonnées enregistrées."),
    onError: (e: Error) => toast.error(e.message),
  });

  const [facebookUrl, setFacebookUrl] = useState(boutique.facebook_url ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(boutique.tiktok_url ?? "");
  const [whatsappUrl, setWhatsappUrl] = useState(boutique.whatsapp_url ?? "");
  const enregistrerReseauxFn = useServerFn(boutiqueEnregistrerReseauxSociaux);
  const enregistrerReseaux = useMutation({
    mutationFn: enregistrerReseauxFn,
    onSuccess: () => toast.success("Réseaux sociaux enregistrés."),
    onError: (e: Error) => toast.error(e.message),
  });

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");

  const enregistrerFn = useServerFn(boutiqueEnregistrerWhatsapp);
  const enregistrer = useMutation({
    mutationFn: enregistrerFn,
    onSuccess: () => {
      toast.success("Paramètres WhatsApp enregistrés.");
      setToken("");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testerFn = useServerFn(boutiqueTesterWhatsapp);
  const tester = useMutation({
    mutationFn: testerFn,
    onSuccess: (r) =>
      r.ok
        ? toast.success(r.detail ?? "Connexion WhatsApp OK")
        : toast.error(r.detail ?? "Échec du test"),
    onError: (e: Error) => toast.error(e.message),
  });

  const [flexpayMerchant, setFlexpayMerchant] = useState("");
  const [flexpayToken, setFlexpayToken] = useState("");

  const enregistrerFlexpayFn = useServerFn(boutiqueEnregistrerFlexpay);
  const enregistrerFlexpay = useMutation({
    mutationFn: enregistrerFlexpayFn,
    onSuccess: () => {
      toast.success("Paramètres FlexPay enregistrés.");
      setFlexpayToken("");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testerFlexpayFn = useServerFn(boutiqueTesterFlexpay);
  const testerFlexpay = useMutation({
    mutationFn: testerFlexpayFn,
    onSuccess: (r) =>
      r.ok
        ? toast.success(r.detail ?? "Connexion FlexPay OK")
        : toast.error(r.detail ?? "Échec du test"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">Paramètres — {boutique.nom}</h1>

      <div className="mt-6 rounded-xl border p-4">
        <h2 className="font-semibold">Coordonnées</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Adresse, téléphone et email affichés sur la vitrine, la facture et partout où l'identité
          de {boutique.nom} apparaît.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enregistrerCoordonnees.mutate({
              data: { boutique_id: boutique.id, adresse, telephone, email },
            });
          }}
        >
          <div>
            <Label>Adresse</Label>
            <Input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="Quartier, avenue, repère..."
            />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+243..." />
          </div>
          <div>
            <Label>Email de contact</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@..."
            />
          </div>
          <Button type="submit" disabled={enregistrerCoordonnees.isPending}>
            Enregistrer
          </Button>
        </form>
      </div>

      <div className="mt-6 rounded-xl border p-4">
        <h2 className="font-semibold">Réseaux sociaux</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Liens affichés en pied de page de la vitrine. Colle l'adresse complète de chaque page
          (laisse vide si non applicable).
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enregistrerReseaux.mutate({
              data: {
                boutique_id: boutique.id,
                facebook_url: facebookUrl,
                tiktok_url: tiktokUrl,
                whatsapp_url: whatsappUrl,
              },
            });
          }}
        >
          <div>
            <Label>Page Facebook</Label>
            <Input
              value={facebookUrl}
              onChange={(e) => setFacebookUrl(e.target.value)}
              placeholder="https://facebook.com/hugocollection"
            />
          </div>
          <div>
            <Label>Page TikTok</Label>
            <Input
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              placeholder="https://tiktok.com/@hugocollection"
            />
          </div>
          <div>
            <Label>Page/chaîne WhatsApp</Label>
            <Input
              value={whatsappUrl}
              onChange={(e) => setWhatsappUrl(e.target.value)}
              placeholder="https://wa.me/243..."
            />
          </div>
          <Button type="submit" disabled={enregistrerReseaux.isPending}>
            Enregistrer
          </Button>
        </form>
      </div>

      <div className="mt-6 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">WhatsApp Business</h2>
          <Badge variant={data?.whatsapp_configure ? "secondary" : "outline"}>
            {data?.whatsapp_configure ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Numéro et jeton WhatsApp Cloud API propres à {boutique.nom} — jamais partagés avec une
          autre boutique.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enregistrer.mutate({
              data: {
                boutique_id: boutique.id,
                whatsapp_phone_number_id: phoneNumberId || data?.whatsapp_phone_number_id || "",
                whatsapp_token: token || undefined,
              },
            });
          }}
        >
          <div>
            <Label>Phone Number ID</Label>
            <Input
              value={phoneNumberId || data?.whatsapp_phone_number_id || ""}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </div>
          <div>
            <Label>
              Token d'accès {data?.whatsapp_configure && "(laisser vide pour ne pas changer)"}
            </Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={enregistrer.isPending}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={tester.isPending || !data?.whatsapp_configure}
              onClick={() => tester.mutate({ data: { boutique_id: boutique.id } })}
            >
              Tester
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-6 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">FlexPay (Mobile Money)</h2>
          <Badge variant={data?.flexpay_configure ? "secondary" : "outline"}>
            {data?.flexpay_configure ? "Configuré" : "Non configuré"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Identifiants marchand FlexPay (M-Pesa/Orange/Airtel) propres à {boutique.nom} — jamais
          partagés avec une autre boutique ni avec le compte FlexPay Livroto.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enregistrerFlexpay.mutate({
              data: {
                boutique_id: boutique.id,
                flexpay_merchant: flexpayMerchant || data?.flexpay_merchant || "",
                flexpay_token: flexpayToken || undefined,
              },
            });
          }}
        >
          <div>
            <Label>Identifiant marchand</Label>
            <Input
              value={flexpayMerchant || data?.flexpay_merchant || ""}
              onChange={(e) => setFlexpayMerchant(e.target.value)}
              placeholder="Fourni par FlexPay lors de l'ouverture du compte marchand"
            />
          </div>
          <div>
            <Label>
              Token d'accès {data?.flexpay_configure && "(laisser vide pour ne pas changer)"}
            </Label>
            <Input
              type="password"
              value={flexpayToken}
              onChange={(e) => setFlexpayToken(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={enregistrerFlexpay.isPending}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={testerFlexpay.isPending || !data?.flexpay_configure}
              onClick={() => testerFlexpay.mutate({ data: { boutique_id: boutique.id } })}
            >
              Tester
            </Button>
          </div>
          {!data?.flexpay_configure && (
            <p className="text-xs text-muted-foreground">
              Pas encore de compte marchand FlexPay ? Demande-en un sur{" "}
              <a href="https://flexpay.cd" target="_blank" rel="noreferrer" className="underline">
                flexpay.cd
              </a>{" "}
              puis reviens coller les identifiants ici.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
