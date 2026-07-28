// Configuration d'impression de CE terminal de caisse (localStorage, pas en
// base — chaque caisse a sa propre imprimante). Type / connexion / papier +
// impression d'un reçu de test réel pour valider le branchement.
import { useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  chargerConfigImpression, enregistrerConfigImpression, imprimerRecu, type ConfigImpression,
} from "@/lib/boutiques/impression/imprimante";

export function ConfigImpressionDialog({ boutique }: { boutique: { nom: string; adresse: string | null; telephone: string | null; devise: string } }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConfigImpression>(() => chargerConfigImpression());
  const [testEnCours, setTestEnCours] = useState(false);

  const maj = (patch: Partial<ConfigImpression>) => setConfig((prev) => ({ ...prev, ...patch }));

  const enregistrer = () => {
    enregistrerConfigImpression(config);
    toast.success("Configuration d'impression enregistrée pour ce terminal.");
    setOpen(false);
  };

  const testerImpression = async () => {
    setTestEnCours(true);
    try {
      await imprimerRecu(
        {
          boutique: { nom: boutique.nom, adresse: boutique.adresse, telephone: boutique.telephone },
          numero: "TEST-000000",
          date: new Date(),
          lignes: [
            { nom: "Article de test", quantite: 2, prix_unitaire_usd: 5.0 },
            { nom: "Deuxième article", quantite: 1, prix_unitaire_usd: 12.5 },
          ],
          sous_total_usd: 22.5,
          remise_usd: 2.5,
          total_usd: 20.0,
          mode_paiement: "cash",
          devise: boutique.devise,
        },
        config,
      );
      toast.success("Reçu de test envoyé à l'imprimante.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestEnCours(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Printer className="mr-2 h-4 w-4" />Imprimante</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Imprimante de ce terminal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type d'imprimante</Label>
            <Select value={config.type} onValueChange={(v) => maj({ type: v as ConfigImpression["type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="escpos">Thermique ESC/POS (ticket de caisse)</SelectItem>
                <SelectItem value="navigateur">Imprimante système / PDF (via le navigateur)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              ESC/POS couvre ~90% des imprimantes thermiques de commerce. « Imprimante système » fonctionne avec
              toute imprimante installée (pilote Windows/Android), y compris pour imprimer en PDF.
            </p>
          </div>

          {config.type === "escpos" && (
            <div>
              <Label>Connexion</Label>
              <Select value={config.connexion} onValueChange={(v) => maj({ connexion: v as ConfigImpression["connexion"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bluetooth">Bluetooth</SelectItem>
                  <SelectItem value="usb">USB</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Wi-Fi/Ethernet (port réseau) n'est pas accessible depuis un navigateur — ce mode arrivera avec
                l'application mobile native. En attendant, une imprimante réseau installée dans le système
                fonctionne via le type « Imprimante système ».
              </p>
            </div>
          )}

          <div>
            <Label>Format de papier</Label>
            <Select
              value={String(config.largeur)}
              onValueChange={(v) => maj({ largeur: v === "A4" ? "A4" : (Number(v) as 58 | 80) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 mm (ticket étroit)</SelectItem>
                <SelectItem value="80">80 mm (ticket large)</SelectItem>
                <SelectItem value="A4">A4 (feuille classique)</SelectItem>
              </SelectContent>
            </Select>
            {config.type === "escpos" && config.largeur === "A4" && (
              <p className="mt-1 text-xs text-amber-600">
                A4 n'existe pas en thermique ESC/POS — le reçu passera automatiquement par l'imprimante système.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={testerImpression} disabled={testEnCours}>
            {testEnCours ? "Test..." : "Imprimer un reçu de test"}
          </Button>
          <Button onClick={enregistrer}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
