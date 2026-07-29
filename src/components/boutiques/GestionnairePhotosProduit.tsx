// Gestion des photos d'un produit (jusqu'à MAX_PHOTOS_PRODUIT) — réutilisé à
// la création ET pour ajouter des photos à un produit déjà créé (les 10
// produits Hugo Collection existants n'en ont aucune). Pas de glisser-déposer
// pour réordonner (retire + réajoute au besoin) — volontairement simple.
import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_PHOTOS_PRODUIT, televerserPhotoProduit } from "@/lib/boutiques/produit-images";

export function GestionnairePhotosProduit({
  boutiqueId,
  dossierId,
  images,
  onChange,
}: {
  boutiqueId: string;
  dossierId: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function ajouterFichiers(files: FileList | null) {
    if (!files || files.length === 0) return;
    const place = MAX_PHOTOS_PRODUIT - images.length;
    if (place <= 0) {
      toast.error(`Maximum ${MAX_PHOTOS_PRODUIT} photos par produit.`);
      return;
    }
    const aTraiter = Array.from(files).slice(0, place);
    setEnCours(true);
    try {
      const urls: string[] = [];
      for (const file of aTraiter) {
        urls.push(await televerserPhotoProduit(file, boutiqueId, dossierId));
      }
      onChange([...images, ...urls]);
    } catch (e) {
      toast.error(`Envoi échoué : ${(e as Error).message}`);
    } finally {
      setEnCours(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <div key={url} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border">
            <img src={url} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-0 top-0 rounded-br bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                Principale
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(images.filter((u) => u !== url))}
              className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {images.length < MAX_PHOTOS_PRODUIT && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => fileRef.current?.click()}
            className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary"
          >
            {enCours ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => ajouterFichiers(e.target.files)}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {images.length}/{MAX_PHOTOS_PRODUIT} photos — la première sert de vignette (caisse, vitrine,
        panier).
      </p>
    </div>
  );
}
