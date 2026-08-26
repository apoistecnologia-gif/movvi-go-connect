import { MovviLogo } from "@/components/MovviLogo";
import { APP_META } from "@/lib/appMeta";
import { DSCard, DSCardContent } from "@/design-system";

function cleanMeta(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

/** Standard About card used inside Settings. */
export function AppAboutCard() {
  const appName = cleanMeta(APP_META.name, "APOIS");
  const version = cleanMeta(APP_META.version, "—");
  const build = cleanMeta(APP_META.build, "—");
  const copyright = cleanMeta(APP_META.copyright, "APOIS");
  const year = new Date().getFullYear();

  return (
    <DSCard aria-label={`Sobre ${appName}`}>
      <DSCardContent className="flex min-w-0 flex-col items-center gap-3 px-4 py-6 text-center">
        <MovviLogo size={64} productLabel="" />
        <div className="mt-1 max-w-full break-words text-[15px] font-semibold leading-5">
          {appName}
        </div>
        <dl className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] leading-5 text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1">
            <dt>Versão</dt>
            <dd className="max-w-full break-all font-mono text-foreground">{version}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <dt>Build</dt>
            <dd className="max-w-full break-all font-mono text-foreground">{build}</dd>
          </div>
        </dl>
        <div className="max-w-full break-words text-[13px] leading-5 text-muted-foreground">
          © {year} {copyright}
        </div>
      </DSCardContent>
    </DSCard>
  );
}
