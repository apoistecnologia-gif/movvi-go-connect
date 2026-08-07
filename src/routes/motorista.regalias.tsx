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
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
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
    if (!userId) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      await saveDriverAmenities(userId, next);
    } catch (err) {
      setPrefs(prefs);
      toast.error(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = KEYS.filter((k) => prefs[k]).length;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main
        className="flex-1 px-4 pt-4 sm:px-5"
        style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <div className="flex items-center gap-2">
            <DSButton
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => navigate({ to: "/motorista/perfil" })}
            >
              <Icon as={ArrowLeft} size="sm" /> Voltar
            </DSButton>
          </div>

          <DSCard className="relative overflow-hidden p-5">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
            />
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <HeadingL>Regalias a bordo</HeadingL>
                <BodySmall className="mt-1 text-muted-foreground">
                  Escolha o que você oferece. Só o que estiver ligado aparece no seu
                  perfil público para os passageiros.
                </BodySmall>
                <div className="mt-2 text-[12px] font-semibold text-primary">
                  {enabledCount === 0
                    ? "Nenhuma regalia ativada"
                    : `${enabledCount} de ${KEYS.length} ativadas`}
                </div>
              </div>
            </div>
          </DSCard>

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

          <BodySmall className="px-2 text-center text-muted-foreground">
            Ofereça só o que realmente entrega — a APOIS valoriza motoristas que cumprem o combinado.
          </BodySmall>
        </div>
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}
