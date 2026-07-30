import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  boutiqueExporterVentesCsv,
} from "@/lib/boutiques/rapports.functions";
import { boutiqueObtenirRapportCredits } from "@/lib/boutiques/credits.functions";

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

  const creditsRapportFn = useServerFn(boutiqueObtenirRapportCredits);
  const { data: credits, isLoading: creditsChargement } = useQuery({
    queryKey: ["boutique-rapport-credits", boutique.id],
    queryFn: () => creditsRapportFn({ data: { boutique_id: boutique.id } }),
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
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Valeur du stock</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {stock.valeur_stock_totale_usd.toFixed(2)} $
                  </CardContent>
                </Card>
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
                      <TableHead>Valeur</TableHead>
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
                        <TableCell>{c.valeur_usd.toFixed(2)} $</TableCell>
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
                        <TableHead>Valeur</TableHead>
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
                            <TableCell>{sc.valeur_usd.toFixed(2)} $</TableCell>
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
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">Valeur du stock</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {stock.valeur_stock_totale_usd.toFixed(2)} $
                  </CardContent>
                </Card>
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
      </Tabs>
    </div>
  );
}
