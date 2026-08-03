import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { History } from "lucide-react";
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
  boutiqueObtenirRapports,
  boutiqueObtenirRapportStock,
  boutiqueObtenirRapportRentabilite,
  boutiqueObtenirMouvementsStock,
  boutiqueExporterVentesCsv,
} from "@/lib/boutiques/rapports.functions";
import { boutiqueObtenirRapportCredits } from "@/lib/boutiques/credits.functions";
import { boutiqueObtenirMonRole } from "@/lib/boutiques/staff.functions";

export const Route = createFileRoute("/boutique/admin/rapports")({
  component: RapportsAdminPage,
});

function debutMois() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function ilYA(jours: number) {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return d.toISOString();
}

const LIBELLE_PAIEMENT: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  carte: "Carte",
  paiement_livraison: "Paiement à la livraison",
};

function RapportsAdminPage() {
  const boutique = useBoutique();
  const [depuis, setDepuis] = useState(new Date().toISOString().slice(0, 10));
  const [jusqua, setJusqua] = useState(new Date().toISOString().slice(0, 10));

  const PRESETS = [
    { label: "Aujourd'hui", depuis: () => new Date().toISOString().slice(0, 10) },
    { label: "7 derniers jours", depuis: () => ilYA(7).slice(0, 10) },
    { label: "Ce mois", depuis: () => debutMois().slice(0, 10) },
  ];

  const obtenirFn = useServerFn(boutiqueObtenirRapports);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-rapports", boutique.id, depuis, jusqua],
    queryFn: () =>
      obtenirFn({
        data: {
          boutique_id: boutique.id,
          depuis: new Date(depuis).toISOString(),
          jusqua: new Date(jusqua + "T23:59:59").toISOString(),
        },
      }),
  });

  const stockFn = useServerFn(boutiqueObtenirRapportStock);
  const { data: stock, isLoading: stockChargement } = useQuery({
    queryKey: ["boutique-rapport-stock", boutique.id],
    queryFn: () => stockFn({ data: { boutique_id: boutique.id } }),
  });

  // Historique des mouvements d'UN produit — chargé seulement quand on ouvre
  // sa fiche (pas de sur-fetch pour tous les produits d'un coup).
  const [produitMouvements, setProduitMouvements] = useState<{ id: string; nom: string } | null>(null);
  const mouvementsFn = useServerFn(boutiqueObtenirMouvementsStock);
  const { data: mouvements, isLoading: mouvementsChargement } = useQuery({
    queryKey: ["boutique-mouvements-stock", boutique.id, produitMouvements?.id],
    queryFn: () => mouvementsFn({ data: { boutique_id: boutique.id, produit_id: produitMouvements!.id } }),
    enabled: !!produitMouvements,
  });

  const creditsRapportFn = useServerFn(boutiqueObtenirRapportCredits);
  const { data: credits, isLoading: creditsChargement } = useQuery({
    queryKey: ["boutique-rapport-credits", boutique.id],
    queryFn: () => creditsRapportFn({ data: { boutique_id: boutique.id } }),
  });

  // L'onglet Rentabilité expose indirectement des données sensibles (loyer,
  // masse salariale) — masqué côté client pour les rôles non-admin, en plus
  // du garde-fou serveur (assertBoutiqueStaff(["admin"]) dans la serverFn).
  const monRoleFn = useServerFn(boutiqueObtenirMonRole);
  const { data: monRole } = useQuery({
    queryKey: ["boutique-mon-role", boutique.id],
    queryFn: () => monRoleFn({ data: { boutique_id: boutique.id } }),
  });
  const estAdmin = monRole?.role === "admin";

  const rentabiliteFn = useServerFn(boutiqueObtenirRapportRentabilite);
  const { data: rentabilite, isLoading: rentabiliteChargement } = useQuery({
    queryKey: ["boutique-rapport-rentabilite", boutique.id, depuis, jusqua],
    queryFn: () =>
      rentabiliteFn({
        data: {
          boutique_id: boutique.id,
          depuis: new Date(depuis).toISOString(),
          jusqua: new Date(jusqua + "T23:59:59").toISOString(),
        },
      }),
    enabled: estAdmin,
  });

  const exporterFn = useServerFn(boutiqueExporterVentesCsv);
  async function exporter() {
    const { csv } = await exporterFn({
      data: {
        boutique_id: boutique.id,
        depuis: new Date(depuis).toISOString(),
        jusqua: new Date(jusqua + "T23:59:59").toISOString(),
      },
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventes-${boutique.slug}-${depuis}-${jusqua}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Rapports — {boutique.nom}</h1>

      <Tabs defaultValue="ventes" className="mt-4">
        <TabsList>
          <TabsTrigger value="ventes">Ventes</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="credits">Crédits</TabsTrigger>
          <TabsTrigger value="general">Général</TabsTrigger>
          {estAdmin && <TabsTrigger value="rentabilite">Rentabilité</TabsTrigger>}
        </TabsList>

        <TabsContent value="ventes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setDepuis(p.depuis());
                setJusqua(new Date().toISOString().slice(0, 10));
              }}
              className="rounded-full border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {p.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <input
            type="date"
            value={depuis}
            onChange={(e) => setDepuis(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
          />
          <span>→</span>
          <input
            type="date"
            value={jusqua}
            onChange={(e) => setJusqua(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
          />
        </div>
        <Button variant="outline" onClick={exporter}>
          Export CSV
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">CA total</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{data.ca.total.toFixed(2)} $</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">CA magasin</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">{data.ca.pos.toFixed(2)} $</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">CA en ligne</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {data.ca.ecommerce.toFixed(2)} $
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Panier moyen</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {data.panier_moyen.toFixed(2)} $
              </CardContent>
            </Card>
          </div>

          {data.par_mode_paiement.length > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold">Répartition par mode de paiement</h2>
              <p className="text-xs text-muted-foreground">
                Utile pour la clôture de caisse — combien de cash compter physiquement.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.par_mode_paiement.map((p) => (
                  <div key={p.mode} className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">
                      {LIBELLE_PAIEMENT[p.mode] ?? p.mode}
                    </p>
                    <p className="text-lg font-bold">{p.total.toFixed(2)} $</p>
                    <p className="text-xs text-muted-foreground">
                      {p.nb} vente{p.nb > 1 ? "s" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="font-semibold">Produits les plus vendus</h2>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Qté</TableHead>
                    <TableHead>Revenu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_produits.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{p.nom}</TableCell>
                      <TableCell>{p.quantite}</TableCell>
                      <TableCell>{p.revenu.toFixed(2)} $</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <h2 className="font-semibold">Produits les moins vendus</h2>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Produit</TableHead>
                    <TableHead>Qté</TableHead>
                    <TableHead>Revenu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.produits_moins_vendus.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{p.nom}</TableCell>
                      <TableCell>{p.quantite}</TableCell>
                      <TableCell>{p.revenu.toFixed(2)} $</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="font-semibold">Codes promo</h2>
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.codes_promo.map((c: any) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>
                      {c.usage_actuel}
                      {c.usage_max ? ` / ${c.usage_max}` : ""}
                    </TableCell>
                    <TableCell>{c.actif ? "Actif" : "Inactif"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.nb_ventes > 0
                ? Math.round(
                    (data.codes_promo.reduce((s: number, c: any) => s + c.ventes_avec_promo, 0) /
                      data.nb_ventes) *
                      100,
                  )
                : 0}
              % des ventes de la période ont utilisé un code promo — remise totale accordée :{" "}
              {data.ca.remises.toFixed(2)} $.
            </p>
          </div>
        </>
      )}
        </TabsContent>

        <TabsContent value="stock">
          {stockChargement || !stock ? (
            <div className="mt-2 h-64 animate-pulse rounded-xl bg-muted" />
          ) : (
            <div className="mt-2 space-y-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {!stock.masquer_finances && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Valeur du stock</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold">
                      {stock.valeur_stock_totale_usd!.toFixed(2)} $
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Produits actifs</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{stock.nb_produits}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Quantité totale</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{stock.quantite_totale}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Stock bas</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold text-destructive">
                    {stock.nb_stock_bas}
                  </CardContent>
                </Card>
              </div>

              <div>
                <h2 className="font-semibold">Inventaire par catégorie</h2>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Produits</TableHead>
                      <TableHead>Quantité</TableHead>
                      {!stock.masquer_finances && <TableHead>Valeur</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stock.par_categorie.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          {c.icone ? `${c.icone} ` : ""}
                          {c.nom}
                        </TableCell>
                        <TableCell>{c.nb_produits}</TableCell>
                        <TableCell>{c.quantite}</TableCell>
                        {!stock.masquer_finances && <TableCell>{c.valeur_usd!.toFixed(2)} $</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {stock.par_sous_categorie.length > 0 && (
                <div>
                  <h2 className="font-semibold">Inventaire par sous-catégorie</h2>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sous-catégorie</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Produits</TableHead>
                        <TableHead>Quantité</TableHead>
                        {!stock.masquer_finances && <TableHead>Valeur</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stock.par_sous_categorie.map((sc) => {
                        const cat = stock.par_categorie.find((c) => c.id === sc.categorie_id);
                        return (
                          <TableRow key={sc.id}>
                            <TableCell>{sc.nom}</TableCell>
                            <TableCell className="text-muted-foreground">{cat?.nom ?? "—"}</TableCell>
                            <TableCell>{sc.nb_produits}</TableCell>
                            <TableCell>{sc.quantite}</TableCell>
                            {!stock.masquer_finances && <TableCell>{sc.valeur_usd!.toFixed(2)} $</TableCell>}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {stock.produits_stock_bas.length > 0 && (
                <div>
                  <h2 className="font-semibold">Produits en stock bas</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stock.produits_stock_bas.map((p) => (
                      <Badge key={p.id} variant="destructive">
                        {p.nom} — {p.quantite}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h2 className="font-semibold">Détail du stock par produit</h2>
                <p className="text-xs text-muted-foreground">
                  Trié du stock le plus bas au plus élevé — clique sur l'historique pour voir les
                  mouvements (ventes, entrées, réévaluations...) d'un produit.
                </p>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Seuil d'alerte</TableHead>
                      {!stock.masquer_finances && (
                        <>
                          <TableHead>Prix d'achat</TableHead>
                          <TableHead>Valeur</TableHead>
                        </>
                      )}
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stock.produits.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {p.reference ?? "—"}
                        </TableCell>
                        <TableCell className="font-medium">{p.nom}</TableCell>
                        <TableCell className="text-muted-foreground">{p.categorie_nom ?? "—"}</TableCell>
                        <TableCell>
                          {p.stock_bas ? (
                            <Badge variant="destructive">{p.quantite}</Badge>
                          ) : (
                            <Badge variant="secondary">{p.quantite}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.seuil_alerte}</TableCell>
                        {!stock.masquer_finances && (
                          <>
                            <TableCell className="text-muted-foreground">
                              {p.prix_achat_usd != null ? `${p.prix_achat_usd} $` : "—"}
                            </TableCell>
                            <TableCell>{p.valeur_usd!.toFixed(2)} $</TableCell>
                          </>
                        )}
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Historique des mouvements"
                            onClick={() => setProduitMouvements({ id: p.id, nom: p.nom })}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="credits">
          {creditsChargement || !credits ? (
            <div className="mt-2 h-48 animate-pulse rounded-xl bg-muted" />
          ) : (
            <div className="mt-2 space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Dû au total</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{credits.total_du_usd.toFixed(2)} $</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Déjà payé</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{credits.total_paye_usd.toFixed(2)} $</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Restant</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold text-primary">
                    {credits.total_restant_usd.toFixed(2)} $
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">En retard</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold text-destructive">
                    {credits.total_en_retard_usd.toFixed(2)} $
                  </CardContent>
                </Card>
              </div>
              <p className="text-sm text-muted-foreground">
                {credits.nb_credits} crédit{credits.nb_credits > 1 ? "s" : ""} au total — {credits.nb_en_attente} en
                attente, {credits.nb_partiellement_payes} partiellement payé
                {credits.nb_partiellement_payes > 1 ? "s" : ""}, {credits.nb_payes} payé
                {credits.nb_payes > 1 ? "s" : ""}, {credits.nb_en_retard} en retard.
              </p>
              <Button variant="outline" asChild>
                <Link to="/boutique/admin/credits" search={{ boutique: boutique.slug }}>
                  Voir le détail des crédits
                </Link>
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="general">
          {isLoading || !data || stockChargement || !stock || creditsChargement || !credits ? (
            <div className="mt-2 h-64 animate-pulse rounded-xl bg-muted" />
          ) : (
            <div className="mt-2 space-y-6">
              <p className="text-sm text-muted-foreground">
                Vue d'ensemble sur la période sélectionnée dans l'onglet Ventes ({depuis} → {jusqua}), combinée à
                l'état actuel du stock et des crédits.
              </p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">CA de la période</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{data.ca.total.toFixed(2)} $</CardContent>
                </Card>
                {!stock.masquer_finances && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Valeur du stock</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold">
                      {stock.valeur_stock_totale_usd!.toFixed(2)} $
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Crédits restants</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold text-primary">
                    {credits.total_restant_usd.toFixed(2)} $
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Ventes (période)</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{data.nb_ventes}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Produits en stock bas</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold text-destructive">{stock.nb_stock_bas}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Crédits en retard</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold text-destructive">{credits.nb_en_retard}</CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {estAdmin && (
          <TabsContent value="rentabilite">
            {rentabiliteChargement || !rentabilite ? (
              <div className="mt-2 h-64 animate-pulse rounded-xl bg-muted" />
            ) : (
              <div className="mt-2 space-y-6">
                <p className="text-sm text-muted-foreground">
                  Rentabilité réelle sur la période sélectionnée dans l'onglet Ventes ({depuis} → {jusqua}) —
                  chiffre d'affaires moins coût des marchandises vendues moins charges d'exploitation.
                </p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Revenu</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold">{rentabilite.revenu_usd.toFixed(2)} $</CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Coût des marchandises</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold">
                      {rentabilite.cout_marchandises_usd.toFixed(2)} $
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Marge brute</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold">{rentabilite.marge_brute_usd.toFixed(2)} $</CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Charges (période)</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold">
                      {rentabilite.charges.total_usd.toFixed(2)} $
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Marge nette</CardTitle>
                    </CardHeader>
                    <CardContent
                      className={`text-2xl font-bold ${rentabilite.marge_nette_usd >= 0 ? "text-primary" : "text-destructive"}`}
                    >
                      {rentabilite.marge_nette_usd.toFixed(2)} $
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm text-muted-foreground">Marge nette %</CardTitle>
                    </CardHeader>
                    <CardContent
                      className={`text-2xl font-bold ${rentabilite.marge_nette_pourcentage >= 0 ? "text-primary" : "text-destructive"}`}
                    >
                      {rentabilite.marge_nette_pourcentage}%
                    </CardContent>
                  </Card>
                </div>

                {rentabilite.nb_lignes_cout_inconnu > 0 && (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {rentabilite.nb_lignes_cout_inconnu} ligne{rentabilite.nb_lignes_cout_inconnu > 1 ? "s" : ""}{" "}
                    vendue{rentabilite.nb_lignes_cout_inconnu > 1 ? "s" : ""} sans prix d'achat connu — la marge
                    est sous-estimée du coût réel de ces produits (renseigne le prix d'achat sur leur fiche).
                  </p>
                )}

                {rentabilite.charges.detail.length > 0 && (
                  <div>
                    <h2 className="font-semibold">Détail des charges de la période</h2>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Libellé</TableHead>
                          <TableHead>Montant proratisé</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rentabilite.charges.detail.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="capitalize">{c.type}</TableCell>
                            <TableCell>{c.libelle}</TableCell>
                            <TableCell>{c.montant_periode_usd.toFixed(2)} $</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!produitMouvements} onOpenChange={(open) => !open && setProduitMouvements(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mouvements de stock — {produitMouvements?.nom}</DialogTitle>
          </DialogHeader>
          {mouvementsChargement || !mouvements ? (
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
          ) : mouvements.mouvements.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mouvement enregistré pour ce produit.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qté</TableHead>
                  <TableHead>Après</TableHead>
                  <TableHead>Motif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mouvements.mouvements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell>{LIBELLE_TYPE_MOUVEMENT[m.type_mouvement] ?? m.type_mouvement}</TableCell>
                    <TableCell className={m.quantite > 0 ? "text-primary" : "text-destructive"}>
                      {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                    </TableCell>
                    <TableCell>{m.quantite_apres}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.motif ?? "—"}</TableCell>
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

const LIBELLE_TYPE_MOUVEMENT: Record<string, string> = {
  entree: "Entrée manuelle",
  sortie: "Sortie manuelle",
  ajustement: "Réévaluation",
  vente: "Vente",
  reception_fournisseur: "Réception fournisseur",
  annulation: "Annulation",
};
