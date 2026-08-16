/**
 * APOIS — Regalias oferecidas a bordo.
 * Motorista escolhe (opt-in) o que quer oferecer. Aparece no perfil público
 * para o passageiro perceber o diferencial antes de aceitar a corrida.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
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

function RegaliasPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<DriverAmenities>(DEFAULT_AMENITIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
      const p = await loadDriverAmenities(data.user.id);
      if (!alive) return;
      setPrefs(p);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  async function toggle(key: AmenityKey, value: boolean) {
    if (!userId || saving) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      await saveDriverAmenities(userId, next);
    } catch (err) {
      setPrefs(previous);
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar agora.");
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = KEYS.filter((k) => prefs[k]).length;

  return (
    <div className="relative flex min-h-dvh min-w-0 flex-col overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.12),transparent_62%)]" />
      <MovviHeader logoutRedirect="/" />
      <main
        className="relative min-w-0 flex-1 px-4 pt-4 sm:px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 7rem)" }}
      >
        <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4">
          <div className="flex items-center gap-2">
            <DSButton
              variant="outline"
              size="sm"
              className="min-h-11 rounded-full border-white/8 bg-[#111315]/90 px-4 text-zinc-200 backdrop-blur-sm hover:bg-[#15181B]"
              onClick={() => navigate({ to: "/motorista/perfil" })}
            >
              <Icon as={ArrowLeft} size="sm" /> Voltar
            </DSButton>
          </div>

          <DSCard className="relative min-w-0 overflow-hidden rounded-[30px] border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-4 shadow-[0_28px_78px_-42px_rgba(246,190,28,.8)] sm:p-5">
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-[#F6BE1C]/12 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-12 h-32 w-32 rounded-full bg-white/[0.025] blur-3xl" />
            <div className="relative flex min-w-0 items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-[#F6BE1C]/25 bg-[#F6BE1C] text-black shadow-[0_14px_34px_-20px_rgba(246,190,28,.9)]">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[10px] font-black uppercase tracking-[0.16em] text-[#F6BE1C]">Experiência a bordo</p>
                <HeadingL className="mt-1 break-words text-white">Regalias a bordo</HeadingL>
                <BodySmall className="mt-1 break-words text-zinc-500">
                  Escolha o que você oferece. Só o que estiver ligado aparece no seu perfil público para os passageiros.
                </BodySmall>
                <div className="mt-3 inline-flex max-w-full rounded-full border border-[#F6BE1C]/18 bg-[#F6BE1C]/8 px-3 py-1.5 text-[11px] font-black text-[#F6BE1C]">
                  <span className="break-words">
                    {enabledCount === 0 ? "Nenhuma regalia ativada" : `${enabledCount} de ${KEYS.length} ativadas`}
                  </span>
                </div>
              </div>
            </div>
          </DSCard>

          <div className="min-w-0 rounded-[26px] border border-white/[0.06] bg-[#0D0F11]/95 p-1 shadow-[0_24px_64px_-44px_rgba(0,0,0,.95)] backdrop-blur-sm" aria-busy={loading || saving}>
            <SettingsSection icon={Sparkles} title="O que você oferece">
              {KEYS.map((k) => {
                const meta = AMENITY_META[k];
                return (
                  <SettingsToggleRow
                    key={k}
                    icon={meta.icon}
                    title={meta.label}
                    hint={meta.hint}
                    checked={prefs[k]}
                    onChange={(v) => toggle(k, v)}
                    disabled={loading || saving || !userId}
                  />
                );
              })}
            </SettingsSection>
          </div>

          <BodySmall className="min-w-0 break-words rounded-[18px] border border-white/5 bg-[#0D0F11]/80 px-4 py-3 text-center leading-5 text-zinc-600">
            Ofereça só o que realmente entrega — a APOIS valoriza motoristas que cumprem o combinado.
          </BodySmall>
        </div>
      </main>
      <ApoisDriverBottomNav />
    </div>
  );
}
