// ============================================================================
// Champ image avec upload direct — module boutique générique. Envoie le
// fichier dans le bucket public `shop-assets` (1er segment du chemin =
// shop_id, policy déjà en place pour l'owner/manager), récupère l'URL
// publique. Le champ URL reste éditable à la main pour qui préfère coller
// un lien existant.
// ============================================================================
import { useRef, useState } from "react";
import { Loader2, Upload, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export function ImageUploadField({
  label, shopId, folder, value, onChange,
}: {
  label: string;
  shopId: string;
  folder: string; // "logo" | "cover" | "products"
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (file: File) => {
    if (!file.type.startsWith("image/")) { return; }
    if (file.size > 8 * 1024 * 1024) { return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${shopId}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("shop-assets").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("shop-assets").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      console.warn("[ImageUploadField] upload échoué:", e);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted overflow-hidden">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="URL de l'image" className="flex-1" />
        <Button type="button" variant="outline" size="icon" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
      </div>
    </div>
  );
}
