import { Globe } from "lucide-react";
import { useI18n, type Lang } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const labels: Record<Lang, string> = { fr: "FR", sw: "SW", ln: "LN", en: "EN" };

export function LangSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-9">
          <Globe className="h-4 w-4" />
          <span className="font-medium">{labels[lang]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(labels) as Lang[]).map((l) => (
          <DropdownMenuItem key={l} onClick={() => setLang(l)} className={lang === l ? "font-semibold" : ""}>
            {t(`lang.${l}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}