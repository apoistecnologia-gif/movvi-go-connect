import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  User, CreditCard, ShieldCheck, MessageSquare, LifeBuoy, Settings as SettingsIcon,
  LogOut, BadgeCheck, ChevronRight, Star, Heart, ClipboardList, ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { PassengerProfessionalProfileDialog } from "@/components/profile/PassengerProfessionalProfileDialog";
import { Avatar } from "@/components/Avatar";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { listFavorites } from "@/lib/favoritePlaces";
import { toast } from "sonner";

type Search = { editar?: string };

export const Route = createFileRoute("/passageiro/perfil")({
  head: () => ({ meta: [{ title: "Conta — MOVVI" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    editar: typeof s.editar === "string" ? s.editar : undefined,
  }),
  component: PerfilPassageiro,
});

function PerfilPassageiro() {
  const navigate = useNavigate();
  const { editar } = useSearch({ from: "/passageiro/perfil" }) as Search;
  const isEditing = editar === "1";

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [totalRides, setTotalRides] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setLoaded(true); return; }
      const [{ data: u }, { count }, { data: ratings }, favs] = await Promise.all([
        supabase
          .from("users")
          .select("name,email,phone,avatar_url,email_verified_at,completed_rides")
          .eq("auth_user_id", uid)
          .maybeSingle(),
        supabase
          .from("rides")
          .select("id", { count: "exact", head: true })
          .eq("passenger_id", uid)
          .eq("status", "finalizada"),
        supabase
          .from("ride_ratings")
          .select("passenger_rating")
          .eq("passenger_id", uid)
          .not("passenger_rating", "is", null)
          .limit(200),
        listFavorites().catch(() => [] as unknown[]),
      ]);
      if (u) {
        setName(u.name ?? null);
        setEmail(u.email ?? null);
        setPhone((u as any).phone ?? null);
        setPhotoUrl(u.avatar_url ?? null);
        setVerified(Boolean(u.email_verified_at));
        setTotalRides(Number((u as any).completed_rides ?? count ?? 0));
      } else {
        setTotalRides(count ?? 0);
      }
      if (Array.isArray(ratings) && ratings.length > 0) {
        const vals = ratings
          .map((r: any) => Number(r.passenger_rating))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (vals.length) setRating(vals.reduce((a, b) => a + b, 0) / vals.length);
      }
      setFavoritesCount(Array.isArray(favs) ? favs.length : 0);
      setLoaded(true);
    })();
  }, []);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      toast.success("Sessão encerrada.");
      navigate({ to: "/" });
    } catch {
      toast.error("Falha ao encerrar sessão.");
    }
  }

  // Edit mode: reuse the existing form, keep bottom nav.
  if (isEditing) {
    return (
      <>
        <ProfileForm
          role="passenger"
          title="Informações pessoais"
          description="Atualize seus dados de contato e segurança."
          onLoaded={() => {}}
        />
        <BottomNav items={PASSENGER_NAV} floating theme="dark" />
      </>
    );
  }

  const displayName = name || email?.split("@")[0] || "Passageiro MOVVI";
  const contact = email || phone || "—";

  return (
    <div
      className="min-h-dvh bg-[#0B0F10] text-white"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 110px)" }}
    >
      {/* Simple header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-[#0B0F10]/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate({ to: "/passageiro/app" })}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition active:scale-95 hover:bg-white/5"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[16px] font-semibold tracking-tight">Conta</h1>
        <button
          type="button"
          onClick={() => navigate({ to: "/passageiro/configuracoes" })}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition active:scale-95 hover:bg-white/5"
          aria-label="Configurações"
        >
          <SettingsIcon className="h-[18px] w-[18px]" />
        </button>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 pt-5">
        {/* Profile hero */}
        <section className="flex items-center gap-4 rounded-3xl border border-white/5 bg-[#141A1B] p-4">
          <div className="relative">
            <Avatar src={photoUrl} name={displayName} size={72} />
            {verified && (
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#76C139] ring-2 ring-[#141A1B]"
                aria-label="Conta verificada"
              >
                <BadgeCheck className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold text-white">
              {loaded ? displayName : "…"}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-white/60">{contact}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {rating != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11.5px] font-medium text-white/85">
                  <Star className="h-3 w-3 fill-[#76C139] text-[#76C139]" />
                  {rating.toFixed(2)}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
                  verified
                    ? "bg-[#76C139]/15 text-[#A8E070]"
                    : "bg-white/5 text-white/60"
                }`}
              >
                <BadgeCheck className="h-3 w-3" />
                {verified ? "Conta verificada" : "Conta não verificada"}
              </span>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-3 gap-2.5">
          <MiniStat value={String(totalRides)} label="Corridas" />
          <MiniStat value={String(favoritesCount)} label="Favoritos" />
          <MiniStat value={rating ? rating.toFixed(1) : "—"} label="Avaliação" />
        </section>

        {/* Shortcuts */}
        <section className="overflow-hidden rounded-3xl border border-white/5 bg-[#141A1B]">
          <ShortcutRow
            icon={User}
            label="Perfil"
            hint="Dados pessoais e foto"
            onClick={() => navigate({ to: "/passageiro/perfil", search: { editar: "1" } })}
          />
          <Divider />
          <ShortcutRow
            icon={CreditCard}
            label="Pagamentos"
            hint="Formas e recibos"
            onClick={() => toast.message("Formas de pagamento em breve.")}
          />
          <Divider />
          <ShortcutRow
            icon={ShieldCheck}
            label="Segurança"
            hint="Senha e privacidade"
            onClick={() => navigate({ to: "/passageiro/seguranca" })}
          />
          <Divider />
          <ShortcutRow
            icon={MessageSquare}
            label="Mensagens"
            hint="Central de notificações"
            onClick={() => navigate({ to: "/passageiro/notificacoes" })}
          />
          <Divider />
          <ShortcutRow
            icon={LifeBuoy}
            label="Ajuda"
            hint="Suporte e FAQ"
            onClick={() => navigate({ to: "/passageiro/suporte" })}
          />
          <Divider />
          <ShortcutRow
            icon={SettingsIcon}
            label="Configurações"
            hint="Preferências do app"
            onClick={() => navigate({ to: "/passageiro/configuracoes" })}
          />
        </section>

        {/* Secondary quick links */}
        <section className="grid grid-cols-2 gap-2.5">
          <SecondaryCard
            icon={Heart}
            label="Favoritos"
            onClick={() => navigate({ to: "/passageiro/favoritos" })}
          />
          <SecondaryCard
            icon={ClipboardList}
            label="Corridas"
            onClick={() => navigate({ to: "/passageiro/corridas" })}
          />
        </section>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-transparent py-3 text-[14.5px] font-semibold text-white/85 transition active:scale-[0.99] hover:border-[#DC2626]/40 hover:text-[#F87171]"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Sair da conta
        </button>

        <p className="pb-2 pt-1 text-center text-[11px] text-white/30">
          MOVVI · Passageiro
        </p>
      </main>

      <PassengerProfessionalProfileDialog
        open={publicProfileOpen}
        onOpenChange={setPublicProfileOpen}
        passengerUserId={userId}
      />

      <BottomNav items={PASSENGER_NAV} floating theme="dark" />
    </div>
  );
}

/* ---------------- Building blocks ---------------- */

function Divider() {
  return <div className="mx-4 h-px bg-white/5" />;
}

function ShortcutRow({
  icon: Icon, label, hint, onClick,
}: { icon: LucideIcon; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-white/[0.04]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#76C139]/12 text-[#A8E070]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-white">{label}</span>
        {hint && <span className="mt-0.5 block truncate text-[12.5px] text-white/55">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/40" />
    </button>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#141A1B] px-3 py-3 text-center">
      <div className="text-[18px] font-bold leading-none text-white">{value}</div>
      <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}

function SecondaryCard({
  icon: Icon, label, onClick,
}: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#141A1B] px-4 py-3.5 text-left transition active:scale-[0.99] hover:border-white/10"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-[#A8E070]">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="text-[14px] font-semibold text-white">{label}</span>
    </button>
  );
}
