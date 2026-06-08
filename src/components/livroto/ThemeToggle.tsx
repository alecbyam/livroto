import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";

const ORDER: Theme[] = ["light", "dark", "system"];
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const LABEL = { light: "Clair", dark: "Sombre", system: "Auto" } as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Thème : ${LABEL[theme]} — cliquer pour ${LABEL[next]}`}
      aria-label={`Thème : ${LABEL[theme]}, changer pour ${LABEL[next]}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
