import { MovviLogo } from "@/components/MovviLogo";
import { APP_META } from "@/lib/appMeta";
import { DSCard, DSCardContent } from "@/design-system";

/**
 * Standard "About" card used inside Settings.
 * Shows logo, version, build number and copyright.
 */
export function AppAboutCard() {
  return (
    <DSCard>
      <DSCardContent className="flex flex-col items-center gap-2 py-6 text-center">
        <MovviLogo size={64} />
        <div className="mt-1 text-sm font-semibold">{APP_META.name}</div>
        <div className="text-xs text-muted-foreground">
          Versão <span className="font-mono text-foreground">{APP_META.version}</span> ·
          Build <span className="font-mono text-foreground">{APP_META.build}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} {APP_META.copyright}
        </div>
      </DSCardContent>
    </DSCard>
  );
}
