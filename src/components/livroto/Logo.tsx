import { Link } from "@tanstack/react-router";

// Le vrai mark JuntoX (J bleu + X éclair ambre) partout où la marque apparaît en
// évidence — avant ce fix, navbar/footer affichaient un badge générique "L"
// pendant que le vrai logo ne vivait que dans une mention en petit du footer.
// Reconnaissance de marque = un des rares signaux de confiance gratuits sur un
// marché où la fraude en ligne inquiète (cf. product_principles_ux_rdc) : autant
// montrer le vrai logo partout, pas juste une lettre.
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-1 group-hover:scale-105 transition-transform">
        <img src="/logo-juntox-mark.png" alt="" className="h-full w-full object-contain" />
      </span>
      <span className={`font-display text-xl font-bold tracking-tight ${light ? "text-white" : "text-foreground"}`}>
        JuntoxShop
      </span>
    </Link>
  );
}