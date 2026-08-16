/**
 * APOIS — Regalias oferecidas a bordo.
 * Motorista escolhe (opt-in) o que quer oferecer. Aparece no perfil público
 * para o passageiro perceber o diferencial antes de aceitar a corrida.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/settings/SettingsToggleRow";
import { DSButton, DSCard, HeadingL, BodySmall, Icon } from "@/design-system";
import {
  AMENITY_META,
  DEFAULT_AMENITIES,
  loadDriverAmenities,
  saveDriverAmenities,
  type AmenityKey,
  type DriverAmenities,
} from "@/lib/driverAmenities";

export const Route = createFileRoute("/motorista/regalias")({
  head: () => ({ meta: [{ title: "Regalias a bordo — APOIS" }] }),
  component: RegaliasPage,
});

const KEYS = Object.keys(AMENITY_META) as AmenityKey[];

function normalizeAmenities(value: DriverAmenities): DriverAmenities {
  return KEYS.reduce<DriverAmenities>(
    (result, key) => ({ ...result, [key]: value?.[key] === true }),
    { ...DEFAULT_AMENITIES },
  );
}

function RegaliasPage() {
  const navigate = useNavigate();
  const loadRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<DriverAmenities>(DEFAULT_AMENITIES);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<AmenityKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!data.user) {
        await navigate({ to: "/motorista/login", replace: true });
        return;
      }

      const loaded = await loadDriverAmenities(data.user.id);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setUserId(data.user.id);
      setPrefs(normalizeAmenities(loaded));
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Amenities] load failed", caughtError);
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setError("Não foi possível carregar suas regalias agora.");
    } finally {
      if (mountedRef.current && requestId === loadRequestRef.current) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !savingKey) void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [load, savingKey]);

  async function toggle(key: AmenityKey, value: boolean) {
    if (!userId || savingKey || loading) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingKey(key);
    setSaveError(null);
    try {
      await saveDriverAmenities(userId, next);
      if (!mountedRef.current) return;
      toast.success(value ? `${AMENITY_META[key].label} ativada.` : `${AMENITY_META[key].label} desativada.`);
    } catch (caughtError: unknown) {
      console.error("[APOIS Driver Amenities] save failed", caughtError);
      if (!mountedRef.current) return;
      setPrefs(previous);
      setSaveError("Não foi possível salvar essa alteração. O estado anterior foi restaurado.");
    } finally {
      if (mountedRef.current) setSavingKey(null);
    }
  }

  const enabledCount = KEYS.filter((key) => prefs[key] === true).length;
  const enabledLabel =
    enabledCount === 0
      ? "Nenhuma regalia ativada"
      : `${enabledCount} de ${KEYS.length} ${enabledCount === 1 ? "ativada" : "ativadas"}`;

  return (
    <div className="relative flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.12),transparent_62%)]" aria-hidden="true" />
      <MovviHeader logoutRedirect="/" />
      <main
        className="relative min-w-0 flex-1 px-4 pt-4 sm:px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 7rem)" }}
      >
        <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <DSButton
              variant="outline"
              size="sm"
              className="min-h-11 rounded-full border-white/8 bg-[#111315]/90 px-4 text-zinc-200 backdrop-blur-sm hover:bg-[#15181B] focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"
              onClick={() => void navigate({ to: "/motorista/perfil" })}
              disabled={Boolean(savingKey)}
            >
              <Icon as={ArrowLeft} size="sm" /> Voltar
            </DSButton>
            <button
              type="button"
              aria-label={loading ? "Atualizando regalias" : "Atualizar regalias"}
              aria-busy={loading}
              disabled={loading || Boolean(savingKey)}
              onClick={() => void load()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/8 bg-[#111315]/90 text-[#F6BE1C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            </button>
          </div>

          {error ? (
            <DSCard className="min-w-0 border-red-500/20 bg-red-500/8 p-4" role="alert" aria-live="assertive">
              <div className="flex min-w-0 items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-black text-red-100">Não foi possível carregar</p>
                  <p className="mt-1 break-words text-xs leading-5 text-red-200/80">{error}</p>
                </div>
              </div>
              <button type="button" onClick={() => void load()} disabled={loading} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300/20 px-4 text-xs font-black text-red-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">
                {loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                Tentar novamente
              </button>
            </DSCard>
          ) : null}

          <DSCard className="relative min-w-0 overflow-hidden rounded-[30px] border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-4 shadow-[0_28px_78px_-42px_rgba(246,190,28,.8)] sm:p-5">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-[#F6BE1C]/12 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-white/[0.025] blur-3xl" />
            <div className="relative flex min-w-0 items-start gap-3 max-[339px]:flex-col">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-[#F6BE1C]/25 bg-[#F6BE1C] text-black shadow-[0_14px_34px_-20px_rgba(246,190,28,.9)]" aria-hidden="true">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[11px] font-black uppercase tracking-[0.14em] text-[#F6BE1C]">Experiência a bordo</p>
                <HeadingL className="mt-1 max-w-full break-words text-white">Regalias a bordo</HeadingL>
                <BodySmall className="mt-1 break-words leading-5 text-zinc-400">
                  Escolha somente o que você realmente oferece. As opções ativas aparecem no seu perfil público.
                </BodySmall>
                <div className="mt-3 inline-flex max-w-full rounded-full border border-[#F6BE1C]/18 bg-[#F6BE1C]/8 px-3 py-1.5 text-xs font-black text-[#F6BE1C]" role="status" aria-live="polite">
                  <span className="break-words">{enabledLabel}</span>
                </div>
              </div>
            </div>
          </DSCard>

          {saveError ? (
            <p className="min-w-0 break-words rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs font-bold leading-5 text-red-200" role="alert" aria-live="assertive">
              {saveError}
            </p>
          ) : null}

          <div className="min-w-0 rounded-[26px] border border-white/[0.06] bg-[#0D0F11]/95 p-1 shadow-[0_24px_64px_-44px_rgba(0,0,0,.95)] backdrop-blur-sm" aria-busy={loading || Boolean(savingKey)}>
            <SettingsSection icon={Sparkles} title="O que você oferece">
              {loading && !userId ? (
                <div className="flex min-h-24 items-center justify-center gap-2 px-4 text-xs font-bold text-zinc-400" role="status" aria-live="polite">
                  <Loader2 className="h-4 w-4 animate-spin text-[#F6BE1C] motion-reduce:animate-none" aria-hidden="true" />
                  Carregando opções...
                </div>
              ) : (
                KEYS.map((key) => {
                  const meta = AMENITY_META[key];
                  const saving = savingKey === key;
                  return (
                    <div key={key} className="relative min-w-0">
                      <SettingsToggleRow
                        icon={meta.icon}
                        title={meta.label}
                        hint={saving ? "Salvando alteração..." : meta.hint}
                        checked={prefs[key] === true}
                        onChange={(value) => void toggle(key, value)}
                        disabled={loading || Boolean(savingKey) || !userId || Boolean(error)}
                      />
                      {saving ? <span className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2" role="status" aria-label={`Salvando ${meta.label}`}><Loader2 className="h-4 w-4 animate-spin text-[#F6BE1C] motion-reduce:animate-none" aria-hidden="true" /></span> : null}
                    </div>
                  );
                })
              )}
            </SettingsSection>
          </div>

          <BodySmall className="min-w-0 break-words rounded-[18px] border border-white/5 bg-[#0D0F11]/80 px-4 py-3 text-center leading-5 text-zinc-400">
            Ofereça só o que realmente entrega. O passageiro verá essas informações antes e durante a experiência com você.
          </BodySmall>
        </div>
      </main>
      <ApoisDriverBottomNav />
    </div>
  );
}
