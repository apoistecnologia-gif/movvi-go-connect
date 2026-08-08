import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), "utf8");
const write = (file, content) => writeFileSync(join(ROOT, file), content, "utf8");

function replaceOnce(file, from, to, label = from.slice(0, 60)) {
  const src = read(file);
  const count = src.split(from).length - 1;
  if (count !== 1) throw new Error(`[patch] ${file}: esperado 1 match para ${label}; encontrado ${count}`);
  write(file, src.replace(from, to));
  console.log(`[patch] ${file}: ${label}`);
}

function edit(file, transform, label) {
  const src = read(file);
  const next = transform(src);
  if (next === src) throw new Error(`[patch] ${file}: nenhuma alteração em ${label}`);
  write(file, next);
  console.log(`[patch] ${file}: ${label}`);
}

function walk(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs)) {
    const rel = join(dir, name).replaceAll("\\", "/");
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

// 1) Mensalidade de homologação/teste é acesso válido, nunca "expirada".
replaceOnce(
  "src/lib/payments/types.ts",
  '    case "active":\n      return "active";',
  '    case "active":\n    case "ativa":\n    case "teste":\n      return "active";',
  "mapear ativa/teste como active",
);

replaceOnce(
  "src/routes/motorista.ganhos.tsx",
  '  const [sub, setSub] = useState<Awaited<ReturnType<typeof getDriverSubscriptionInfo>> | null>(null);',
  '  const [sub, setSub] = useState<Awaited<ReturnType<typeof getDriverSubscriptionInfo>> | null>(null);\n  const [driverSubscriptionStatus, setDriverSubscriptionStatus] = useState<string | null>(null);',
  "fallback da assinatura pelo perfil",
);
replaceOnce(
  "src/routes/motorista.ganhos.tsx",
  '      setDriverId(profile.profile.id);',
  '      setDriverId(profile.profile.id);\n      setDriverSubscriptionStatus(profile.profile.subscription_status ?? null);',
  "guardar subscription_status do perfil",
);
replaceOnce(
  "src/routes/motorista.ganhos.tsx",
  '  const subUi = sub ? toUiStatus(sub.subscriptionStatus) : "expired";',
  '  const subUi = toUiStatus(sub?.subscriptionStatus ?? driverSubscriptionStatus);',
  "não exibir teste como expirado",
);
replaceOnce(
  "src/routes/motorista.perfil.tsx",
  '  const subActive = subStatus === "active" || subStatus === "ativa";',
  '  const subActive = subStatus === "active" || subStatus === "ativa" || subStatus === "teste";',
  "perfil reconhece teste como ativo",
);

// 2) Histórico: rides não possui passenger_photo_url. Resolver nome/foto pela FK passenger_id -> users.id.
replaceOnce(
  "src/routes/motorista.corridas.tsx",
  '  passenger_photo_url: string | null;\n  passenger_name?: string | null;',
  '  passenger_id: string | null;\n  passenger_photo_url?: string | null;\n  passenger_name?: string | null;',
  "tipo de passageiro do histórico",
);
replaceOnce(
  "src/routes/motorista.corridas.tsx",
  '          "id,status,category,payment_method,passenger_photo_url,origin_name,destination_name,final_price,estimated_price,distance_km,duration_min,completed_at,created_at,accepted_at,passenger_rating,passenger_rating_comment,driver_rated_at",',
  '          "id,status,category,payment_method,passenger_id,origin_name,destination_name,final_price,estimated_price,distance_km,duration_min,completed_at,created_at,accepted_at,passenger_rating,passenger_rating_comment,driver_rated_at",',
  "remover coluna inexistente passenger_photo_url",
);
replaceOnce(
  "src/routes/motorista.corridas.tsx",
  '      if (!active) return;\n      if (error) setError(error.message);\n      else setRides((data ?? []) as RideRow[]);',
  `      if (!active) return;\n      if (error) {\n        setError(error.message);\n        setRides([]);\n        return;\n      }\n\n      const baseRides = (data ?? []) as RideRow[];\n      const passengerIds = Array.from(new Set(baseRides.map((ride) => ride.passenger_id).filter(Boolean))) as string[];\n      let passengerMap = new Map<string, { name: string | null; avatar_url: string | null }>();\n\n      if (passengerIds.length > 0) {\n        const { data: passengers } = await supabase\n          .from("users")\n          .select("id,name,avatar_url")\n          .in("id", passengerIds);\n        passengerMap = new Map(\n          (passengers ?? []).map((passenger) => [\n            passenger.id,\n            { name: passenger.name ?? null, avatar_url: passenger.avatar_url ?? null },\n          ]),\n        );\n      }\n\n      if (!active) return;\n      setError(null);\n      setRides(\n        baseRides.map((ride) => {\n          const passenger = ride.passenger_id ? passengerMap.get(ride.passenger_id) : null;\n          return {\n            ...ride,\n            passenger_name: passenger?.name ?? null,\n            passenger_photo_url: passenger?.avatar_url ?? null,\n          };\n        }),\n      );`,
  "hidratar passageiro no histórico",
);

// 3) Presença online: o desejo do motorista fica persistido e todas as mudanças são propagadas ao keeper global.
replaceOnce(
  "src/routes/motorista.app.tsx",
  '  const [online, setOnline] = useState(false);',
  `  const [online, setOnline] = useState(() => {\n    try {\n      return localStorage.getItem("apois:driver:online") === "1";\n    } catch {\n      return false;\n    }\n  });`,
  "restaurar estado online persistido",
);
edit(
  "src/routes/motorista.app.tsx",
  (src) => {
    const changed = src.replaceAll("setOnline(", "setDesiredOnline(");
    const anchor = `  const [online, setOnline] = useState(() => {\n    try {\n      return localStorage.getItem("apois:driver:online") === "1";\n    } catch {\n      return false;\n    }\n  });`;
    if (!changed.includes(anchor)) throw new Error("âncora do estado online não encontrada");
    const helper = `${anchor}\n  const setDesiredOnline = useCallback((value: boolean) => {\n    setOnline(value);\n    try {\n      localStorage.setItem("apois:driver:online", value ? "1" : "0");\n      window.dispatchEvent(new CustomEvent("apois:driver-presence-change", { detail: { online: value } }));\n    } catch {\n      // armazenamento indisponível não pode bloquear a operação do motorista\n    }\n  }, []);`;
    return changed.replace(anchor, helper);
  },
  "centralizar mudanças online/offline",
);

// 4) Oferta: botões Aceitar/Recusar sempre visíveis acima da bottom nav.
replaceOnce(
  "src/routes/motorista.app.tsx",
  'className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-in fade-in duration-200"',
  'className="fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/40 animate-in fade-in duration-200"\n      style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}',
  "reservar espaço da navegação para a oferta",
);
replaceOnce(
  "src/routes/motorista.app.tsx",
  'className="shrink-0 border-t border-white/5 bg-[#08090A] px-4 pt-3"',
  'className="sticky bottom-0 z-10 shrink-0 border-t border-white/5 bg-[#08090A] px-4 pt-3"',
  "fixar ações da oferta",
);
replaceOnce(
  "src/routes/motorista.app.tsx",
  'style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}',
  'style={{ paddingBottom: "16px" }}',
  "evitar safe-area duplicada na oferta",
);

// 5) O carro do motorista usa a própria cor APOIS recebida pela Home (dourado online), não o vermelho legado.
replaceOnce(
  "src/components/mapMarkers.tsx",
  '      <CarShape\n        position={display}\n        heading={displayHeading}\n        scale={scale}\n        zBase={10000}\n      />',
  '      <CarShape\n        position={display}\n        heading={displayHeading}\n        scale={scale}\n        bodyColor={color}\n        outlineColor="#090A0B"\n        zBase={10000}\n      />',
  "marcador do motorista preto/dourado",
);

// 6) Keeper de presença montado no root: continua online e transmitindo GPS ao navegar pelo app.
const keeper = `import { useCallback, useEffect, useRef } from "react";\nimport { supabase } from "@/integrations/supabase/client";\nimport { isBrazilCoordinate } from "@/lib/googleMaps";\n\nconst STORAGE_KEY = "apois:driver:online";\nconst PRESENCE_EVENT = "apois:driver-presence-change";\nconst HEARTBEAT_MS = 15000;\n\ntype Telemetry = { lat: number; lng: number; heading: number | null; speed: number | null };\n\nfunction readDesiredOnline() {\n  try {\n    return localStorage.getItem(STORAGE_KEY) === "1";\n  } catch {\n    return false;\n  }\n}\n\nasync function syncPresence(online: boolean, position: Telemetry | null) {\n  const { error } = await (supabase as any).rpc("driver_set_presence", {\n    _online: online,\n    _lat: online ? position?.lat ?? null : null,\n    _lng: online ? position?.lng ?? null : null,\n    _heading: online ? position?.heading ?? null : null,\n    _speed: online ? position?.speed ?? null : null,\n  });\n  if (error) console.warn("[APOIS MOTORISTA] keeper de presença:", error.message);\n}\n\nexport function DriverPresenceKeeper() {\n  const latestRef = useRef<Telemetry | null>(null);\n  const watchRef = useRef<number | null>(null);\n  const timerRef = useRef<number | null>(null);\n  const runningRef = useRef(false);\n\n  const stopTracking = useCallback(() => {\n    runningRef.current = false;\n    if (watchRef.current != null && "geolocation" in navigator) {\n      navigator.geolocation.clearWatch(watchRef.current);\n      watchRef.current = null;\n    }\n    if (timerRef.current != null) {\n      window.clearInterval(timerRef.current);\n      timerRef.current = null;\n    }\n  }, []);\n\n  const startTracking = useCallback(async () => {\n    if (runningRef.current || !readDesiredOnline() || !("geolocation" in navigator)) return;\n    const { data } = await supabase.auth.getSession();\n    if (!data.session || !readDesiredOnline()) return;\n    runningRef.current = true;\n\n    const onPosition = (pos: GeolocationPosition) => {\n      const lat = pos.coords.latitude;\n      const lng = pos.coords.longitude;\n      if (!isBrazilCoordinate(lat, lng)) return;\n      const telemetry: Telemetry = {\n        lat,\n        lng,\n        heading: Number.isFinite(pos.coords.heading as number) ? (pos.coords.heading as number) : null,\n        speed: Number.isFinite(pos.coords.speed as number) ? (pos.coords.speed as number) : null,\n      };\n      latestRef.current = telemetry;\n      void syncPresence(true, telemetry);\n    };\n\n    navigator.geolocation.getCurrentPosition(onPosition, () => {}, {\n      enableHighAccuracy: false,\n      timeout: 15000,\n      maximumAge: 120000,\n    });\n    watchRef.current = navigator.geolocation.watchPosition(onPosition, () => {}, {\n      enableHighAccuracy: true,\n      timeout: 20000,\n      maximumAge: 5000,\n    });\n    timerRef.current = window.setInterval(() => {\n      if (!readDesiredOnline()) return;\n      const p = latestRef.current;\n      if (p) void syncPresence(true, p);\n    }, HEARTBEAT_MS);\n  }, []);\n\n  useEffect(() => {\n    void startTracking();\n\n    const onPresenceChange = (event: Event) => {\n      const online = Boolean((event as CustomEvent<{ online?: boolean }>).detail?.online);\n      if (online) {\n        void startTracking();\n      } else {\n        stopTracking();\n        latestRef.current = null;\n        void syncPresence(false, null);\n      }\n    };\n\n    const onVisibility = () => {\n      if (document.visibilityState === "visible" && readDesiredOnline()) void startTracking();\n    };\n\n    window.addEventListener(PRESENCE_EVENT, onPresenceChange as EventListener);\n    document.addEventListener("visibilitychange", onVisibility);\n    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {\n      if (event === "SIGNED_OUT") {\n        try { localStorage.setItem(STORAGE_KEY, "0"); } catch {}\n        stopTracking();\n        latestRef.current = null;\n      } else if (readDesiredOnline()) {\n        void startTracking();\n      }\n    });\n\n    return () => {\n      window.removeEventListener(PRESENCE_EVENT, onPresenceChange as EventListener);\n      document.removeEventListener("visibilitychange", onVisibility);\n      authListener.subscription.unsubscribe();\n      stopTracking();\n    };\n  }, [startTracking, stopTracking]);\n\n  return null;\n}\n`;
write("src/components/DriverPresenceKeeper.tsx", keeper);
console.log("[patch] criado DriverPresenceKeeper.tsx");
replaceOnce(
  "src/routes/__root.tsx",
  'import { initNativeBridge } from "../lib/nativeBridge";',
  'import { initNativeBridge } from "../lib/nativeBridge";\nimport { DriverPresenceKeeper } from "../components/DriverPresenceKeeper";',
  "importar keeper global",
);
replaceOnce(
  "src/routes/__root.tsx",
  '        <MapThemeProvider>\n          <Outlet />',
  '        <MapThemeProvider>\n          {APP_ROLE === "driver" ? <DriverPresenceKeeper /> : null}\n          <Outlet />',
  "montar keeper no bundle motorista",
);

// 7) Settings do motorista: preto/dourado sem contaminar o visual do passageiro.
const settingsShell = `import { createContext, useContext, type ComponentProps, type ReactNode } from "react";\nimport type { LucideIcon } from "lucide-react";\nimport { MovviHeader } from "@/components/MovviHeader";\nimport { BottomNav, DRIVER_NAV } from "@/components/BottomNav";\nimport { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";\n\ntype NavItems = ComponentProps<typeof BottomNav>["items"];\nexport type SettingsVisualVariant = "default" | "driver";\nconst SettingsVisualContext = createContext<SettingsVisualVariant>("default");\nexport const useSettingsVisual = () => useContext(SettingsVisualContext);\n\nexport function SettingsPageShell({\n  children,\n  hideBottomNav = false,\n  nav = DRIVER_NAV,\n  variant = "default",\n}: {\n  children: ReactNode;\n  hideBottomNav?: boolean;\n  nav?: NavItems;\n  variant?: SettingsVisualVariant;\n}) {\n  const driver = variant === "driver";\n  return (\n    <SettingsVisualContext.Provider value={variant}>\n      <div className={driver ? "flex min-h-dvh flex-col bg-[#050607] text-white" : "flex min-h-dvh flex-col bg-[#F7F9F7]"}>\n        <MovviHeader logoutRedirect="/" />\n        <main\n          className="flex-1 px-4 pt-4"\n          style={{ paddingBottom: hideBottomNav ? "2rem" : "max(8rem, env(safe-area-inset-bottom))" }}\n        >\n          <div className="mx-auto w-full max-w-2xl space-y-5">{children}</div>\n        </main>\n        {!hideBottomNav ? (driver ? <ApoisDriverBottomNav /> : <BottomNav items={nav} />) : null}\n      </div>\n    </SettingsVisualContext.Provider>\n  );\n}\n\nexport function SettingsHero({\n  icon: Icon,\n  title,\n  subtitle,\n  action,\n  tone = "primary",\n}: {\n  icon: LucideIcon;\n  title: string;\n  subtitle?: string;\n  action?: ReactNode;\n  tone?: "primary" | "danger";\n}) {\n  const variant = useSettingsVisual();\n  const driver = variant === "driver";\n  const iconBg = tone === "danger"\n    ? "bg-red-500/10 text-red-400"\n    : driver\n      ? "bg-[#F6BE1C]/12 text-[#F6BE1C] ring-1 ring-[#F6BE1C]/20"\n      : "bg-[#76C139]/10 text-[#5A9A2A]";\n  return (\n    <section className="animate-fade-in flex items-center justify-between gap-3 px-1">\n      <div className="flex min-w-0 items-center gap-3">\n        <div className={\`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl \${iconBg}\`}>\n          <Icon className="h-[22px] w-[22px]" strokeWidth={1.75} />\n        </div>\n        <div className="min-w-0">\n          <h1 className={driver ? "truncate text-[24px] font-black tracking-tight text-white" : "truncate text-[24px] font-bold tracking-tight text-[#1B1B1B]"}>{title}</h1>\n          {subtitle ? <p className={driver ? "mt-0.5 truncate text-[13px] text-zinc-500" : "mt-0.5 truncate text-[13px] text-[#707070]"}>{subtitle}</p> : null}\n        </div>\n      </div>\n      {action ? <div className="shrink-0">{action}</div> : null}\n    </section>\n  );\n}\n`;
write("src/components/settings/SettingsPageShell.tsx", settingsShell);

const settingsSection = `import type { LucideIcon } from "lucide-react";\nimport type { ReactNode } from "react";\nimport { useSettingsVisual } from "./SettingsPageShell";\n\nexport function SettingsSection({ icon: Icon, title, description, children, action }: {\n  icon?: LucideIcon; title: string; description?: string; action?: ReactNode; children: ReactNode;\n}) {\n  const driver = useSettingsVisual() === "driver";\n  return (\n    <section className="space-y-2">\n      <div className="flex items-end justify-between gap-3 px-2">\n        <div className="min-w-0">\n          <h2 className={driver ? "flex items-center gap-1.5 text-[12px] font-black uppercase tracking-[0.14em] text-zinc-500" : "flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-[#707070]"}>\n            {Icon ? <Icon className={driver ? "h-3.5 w-3.5 text-[#F6BE1C]" : "h-3.5 w-3.5 text-[#76C139]"} strokeWidth={2} /> : null}\n            <span className="truncate">{title}</span>\n          </h2>\n          {description ? <p className={driver ? "mt-0.5 text-[12px] text-zinc-600" : "mt-0.5 text-[12.5px] text-[#707070]"}>{description}</p> : null}\n        </div>\n        {action}\n      </div>\n      <div className={driver\n        ? "overflow-hidden rounded-[22px] border border-white/5 bg-[#101214] shadow-[0_18px_50px_-34px_rgba(0,0,0,0.95)] [&>*+*]:border-t [&>*+*]:border-white/5"\n        : "overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 [&>*+*]:border-t [&>*+*]:border-[#F1F5F1]"}>\n        {children}\n      </div>\n    </section>\n  );\n}\n`;
write("src/components/settings/SettingsSection.tsx", settingsSection);

const settingsRow = `import type { LucideIcon } from "lucide-react";\nimport type { ReactNode } from "react";\nimport { cn } from "@/lib/utils";\nimport { useSettingsVisual } from "./SettingsPageShell";\n\nexport function SettingsRow({ icon: Icon, title, hint, right, className, onClick, as = "div", disabled, destructive }: {\n  icon?: LucideIcon; title: ReactNode; hint?: ReactNode; right?: ReactNode; className?: string; onClick?: () => void;\n  as?: "div" | "button"; disabled?: boolean; destructive?: boolean;\n}) {\n  const Tag = as as any;\n  const interactive = as === "button" || !!onClick;\n  const driver = useSettingsVisual() === "driver";\n  return (\n    <Tag type={as === "button" ? "button" : undefined} onClick={onClick} disabled={disabled}\n      className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition", interactive && (driver ? "active:bg-white/5 disabled:pointer-events-none disabled:opacity-60" : "active:bg-[#F7F9F7] disabled:pointer-events-none disabled:opacity-60"), className)}>\n      {Icon ? <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", destructive ? "bg-red-500/10 text-red-400" : driver ? "bg-black text-[#F6BE1C] ring-1 ring-white/5" : "bg-[#76C139]/10 text-[#5A9A2A]")}>\n        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />\n      </div> : null}\n      <div className="min-w-0 flex-1">\n        <div className={cn("text-[14px] font-semibold", destructive ? "text-red-400" : driver ? "text-zinc-100" : "text-[#1B1B1B]")}>{title}</div>\n        {hint ? <div className={driver ? "truncate text-[11.5px] text-zinc-600" : "truncate text-[12.5px] text-[#707070]"}>{hint}</div> : null}\n      </div>\n      {right ? <div className="shrink-0">{right}</div> : null}\n    </Tag>\n  );\n}\n`;
write("src/components/settings/SettingsRow.tsx", settingsRow);

const settingsLinkRow = `import { Link } from "@tanstack/react-router";\nimport { ChevronRight, type LucideIcon } from "lucide-react";\nimport type { ReactNode } from "react";\nimport { SettingsRow } from "./SettingsRow";\nimport { useSettingsVisual } from "./SettingsPageShell";\n\nexport function SettingsLinkRow({ icon, title, hint, to, onClick, destructive, badge }: {\n  icon?: LucideIcon; title: ReactNode; hint?: ReactNode; to?: string; onClick?: () => void; destructive?: boolean; badge?: ReactNode;\n}) {\n  const driver = useSettingsVisual() === "driver";\n  const right = <div className={driver ? "flex items-center gap-2 text-zinc-600" : "flex items-center gap-2 text-[#94A3B8]"}>{badge}<ChevronRight className="h-4 w-4" strokeWidth={2} /></div>;\n  const inner = <SettingsRow icon={icon} title={title} hint={hint} right={right} destructive={destructive} />;\n  const cls = driver ? "block transition active:bg-white/5" : "block transition active:bg-[#F7F9F7]";\n  if (to) return <Link to={to} className={cls}>{inner}</Link>;\n  return <button type="button" onClick={onClick} className={\`\${cls} w-full text-left\`}>{inner}</button>;\n}\n`;
write("src/components/settings/SettingsLinkRow.tsx", settingsLinkRow);

// Todo SettingsPageShell dentro de uma rota motorista recebe o tema driver.
for (const file of walk("src/routes").filter((f) => /\/motorista[^/]*\.tsx$/.test(f))) {
  let src = read(file);
  src = src.replace(/<SettingsPageShell(?![^>]*\bvariant=)/g, '<SettingsPageShell variant="driver"');
  write(file, src);
}

// 8) Bottom nav única APOIS em todas as telas do motorista.
for (const file of walk("src/routes").filter((f) => /\/motorista[^/]*\.tsx$/.test(f))) {
  let src = read(file);
  if (!src.includes("BottomNav") || !src.includes("DRIVER_NAV")) continue;
  src = src.replace(/import \{ BottomNav, DRIVER_NAV \} from "@\/components\/BottomNav";\n?/g, 'import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";\n');
  src = src.replace(/<BottomNav\s+items=\{DRIVER_NAV\}[^>]*\/>/g, "<ApoisDriverBottomNav />");
  write(file, src);
  console.log(`[patch] ${file}: bottom nav APOIS`);
}

// 9) Rebranding visual: não renomear APIs/componentes internos, apenas strings/cores legadas nas telas do motorista.
const visualDriverFiles = [
  ...walk("src/routes").filter((f) => /\/motorista[^/]*\.tsx$/.test(f)),
  ...walk("src/components").filter((f) => /\/(Driver|ApoisDriver)[^/]*\.(tsx|ts)$/.test(f)),
  "src/lib/driverRegistration.mobile.ts",
].filter((f) => existsSync(join(ROOT, f)));

for (const file of visualDriverFiles) {
  let src = read(file);
  src = src.replaceAll("MOVVI", "APOIS");
  src = src.replaceAll("#76C139", "#F6BE1C");
  src = src.replaceAll("#5A9A2A", "#D39A00");
  src = src.replaceAll("#8DD92B", "#F6BE1C");
  write(file, src);
}

// 10) Assinatura de homologação persistente: cacheia ~/.android/debug.keystore entre builds.
edit(
  ".github/workflows/apois-driver-homologation.yml",
  (src) => {
    const anchor = `      - name: Install dependencies\n        run: npm install --no-audit --no-fund\n`;
    if (!src.includes(anchor)) throw new Error("âncora de dependências do workflow não encontrada");
    const signing = `${anchor}\n      - name: Restaurar assinatura estável de homologação\n        uses: actions/cache@v4\n        with:\n          path: ~/.android/debug.keystore\n          key: apois-motorista-homologacao-signing-v1\n\n      - name: Garantir chave de homologação\n        run: |\n          mkdir -p ~/.android\n          if [ ! -f ~/.android/debug.keystore ]; then\n            keytool -genkeypair -v \\\n              -keystore ~/.android/debug.keystore \\\n              -storepass android \\\n              -alias androiddebugkey \\\n              -keypass android \\\n              -keyalg RSA -keysize 2048 -validity 10000 \\\n              -dname \"CN=APOIS Motorista Homologacao,O=APOIS,C=BR\"\n          fi\n          keytool -list -v -keystore ~/.android/debug.keystore -storepass android -alias androiddebugkey | grep -E \"SHA256:|Owner:\"\n`;
    return src.replace(anchor, signing);
  },
  "assinatura estável via cache",
);

// 11) Verificações de fonte/rebranding.
const forbiddenVisible = [];
for (const file of visualDriverFiles) {
  const src = read(file);
  if (/MOVVI/.test(src)) forbiddenVisible.push(file);
}
if (forbiddenVisible.length) throw new Error(`MOVVI visível ainda encontrado: ${forbiddenVisible.join(", ")}`);

const history = read("src/routes/motorista.corridas.tsx");
if (history.includes('payment_method,passenger_photo_url,origin_name')) throw new Error("histórico ainda seleciona passenger_photo_url");
const offer = read("src/routes/motorista.app.tsx");
if (!offer.includes('style={{ bottom: "calc(env(safe-area-inset-bottom) + 68px)" }}')) throw new Error("oferta não reservou a bottom nav");
if (!offer.includes("setDesiredOnline")) throw new Error("estado online não foi persistido");
const workflow = read(".github/workflows/apois-driver-homologation.yml");
if (!workflow.includes("apois-motorista-homologacao-signing-v1")) throw new Error("workflow sem assinatura persistente");

// Workflow/script são descartáveis: o commit final não deixa maquinário temporário no projeto.
for (const temp of [".github/workflows/apois-driver-finalize.yml", ".github/scripts/apois-driver-finalize.mjs"]) {
  const abs = join(ROOT, temp);
  if (existsSync(abs)) unlinkSync(abs);
}

console.log("[patch] APOIS Motorista: consolidação final aplicada.");
