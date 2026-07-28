import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { boutiqueListerFactures, boutiqueRegenererFacturePdf } from "@/lib/boutiques/factures.functions";

export const Route = createFileRoute("/boutique/admin/factures")({
  component: FacturesAdminPage,
});

function FacturesAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const listerFn = useServerFn(boutiqueListerFactures);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-admin-factures", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id, offset: 0 } }),
  });

  const regenererFn = useServerFn(boutiqueRegenererFacturePdf);
  const regenerer = useMutation({
    mutationFn: regenererFn,
    onSuccess: () => {
      toast.success("Facture régénérée.");
      qc.invalidateQueries({ queryKey: ["boutique-admin-factures", boutique.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Factures — {boutique.nom}</h1>

      {isLoading ? (
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Numéro</TableHead>
              <TableHead>Vente</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Paiement</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).map((f: any) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.numero}</TableCell>
                <TableCell>{f.ventes?.numero}</TableCell>
                <TableCell>
                  <Badge variant={f.ventes?.canal === "ecommerce" ? "secondary" : "outline"}>
                    {f.ventes?.canal === "ecommerce" ? "En ligne" : "Magasin"}
                  </Badge>
                </TableCell>
                <TableCell>{f.ventes?.mode_paiement}</TableCell>
                <TableCell>{f.ventes?.total_usd} $</TableCell>
                <TableCell>{new Date(f.created_at).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell>
                  {f.pdf_url ? (
                    <a href={f.pdf_url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline">Voir</Button>
                    </a>
                  ) : (
                    <Button
                      size="sm" variant="outline"
                      disabled={regenerer.isPending}
                      onClick={() => regenerer.mutate({ data: { boutique_id: boutique.id, facture_id: f.id } })}
                    >
                      Générer
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
