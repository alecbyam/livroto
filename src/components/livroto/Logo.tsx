import { Link } from "@tanstack/react-router";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-display font-bold shadow-sm group-hover:scale-105 transition-transform">
        L
      </span>
      <span className={`font-display text-xl font-bold tracking-tight ${light ? "text-white" : "text-foreground"}`}>
        Livroto
      </span>
    </Link>
  );
}