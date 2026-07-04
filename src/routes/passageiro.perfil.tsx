import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Eye, User, CreditCard, Heart, Bell, ShieldCheck, LockKeyhole,
  LifeBuoy, FileText, Info, LogOut, BadgeCheck, MapPin, Phone, Mail,
  Calendar, ClipboardList, MapPinned,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { PassengerProfessionalProfileDialog } from "@/components/profile/PassengerProfessionalProfileDialog";
import { Avatar } from "@/components/Avatar";
import {
  SettingsSection, SettingsLinkRow,
} from "@/components/settings";
import { listFavorites } from "@/lib/favoritePlaces";
import { toast } from "sonner";

export const Route = createFileRoute("/passageiro/perfil")({
  head: () => ({ meta: [{ title: "Perfil — MOVVI" }] }),
  component: PerfilPassageiro,
});

function formatMemberSince(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function PerfilPassageiro() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [totalRides, setTotalRides] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [{ data: u }, { count }, favs] = await Promise.all([
        supabase
          .from("users")
          .select("name,email,phone,city,avatar_url,email_verified_at,created_at,completed_rides")
          .eq("auth_user_id", userId)
          .maybeSingle(),
        supabase
          .from("rides")
          .select("id", { count: "exact", head: true })
          .eq("passenger_id", userId)
          .eq("status", "finalizada"),
        listFavorites(userId).catch(() => []),
      ]);
      if (!alive) return;
      if (u) {
        setName(u.name ?? null);
        setEmail(u.email ?? null);
        setPhone((u as any).phone ?? null);
        setCity((u as any).city ?? null);
        setPhotoUrl(u.avatar_url ?? null);
        setVerified(Boolean(u.email_verified_at));
        setMemberSince(formatMemberSince((u as any).created_at));
        setTotalRides(Number((u as any).completed_rides ?? count ?? 0));
      } else {
        setTotalRides(count ?? 0);
      }
      setFavoritesCount(Array.isArray(favs) ? favs.length : 0);
    })();
    return () => { alive = false; };
  }, [userId]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      toast.success("Sessão encerrada.");
      navigate({ to: "/" });
    } catch {
      toast.error("Falha ao encerrar sessão.");
    }
  }

  return (
    <>
      <ProfileForm
        role="passenger"
        title="Informações pessoais"
        description="Atualize seus dados de contato e segurança."
        onLoaded={({ userId: id }) => setUserId(id)}
        headerSlot={<PassengerProfileHero
          name={name}
          email={email}
          phone={phone}
          city={city}
          photoUrl={photoUrl}
          verified={verified}
          memberSince={memberSince}
          totalRides={totalRides}
          favoritesCount={favoritesCount}
          onOpenPublic={() => setPublicProfileOpen(true)}
        />}
        extraSlot={<PassengerAccountSections onLogout={handleLogout} />}
      />
      <PassengerProfessionalProfileDialog
        open={publicProfileOpen}
        onOpenChange={setPublicProfileOpen}
        passengerUserId={userId}
      />
    </>
  );
}

/* ---------------- Hero + summary + stats ---------------- */

type HeroProps = {
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  photoUrl: string | null;
  verified: boolean;
  memberSince: string | null;
  totalRides: number;
  favoritesCount: number;
  onOpenPublic: () => void;
};

function PassengerProfileHero({
  name, email, phone, city, photoUrl, verified, memberSince,
  totalRides, favoritesCount, onOpenPublic,
}: HeroProps) {
  return (
    <div className="space-y-5">
      {/* Hero */}
      <section
        className="animate-in fade-in slide-in-from-bottom-2 duration-[220ms]
                   flex flex-col items-center gap-3 px-1 text-center"
      >
        <div className="relative">
          <div className="rounded-full ring-4 ring-white shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)]">
            <Avatar src={photoUrl} name={name ?? "Usuário"} size={104} />
          </div>
          {verified && (
            <span
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center
                         rounded-full bg-white shadow-md ring-2 ring-white"
              aria-label="Conta verificada"
            >
              <BadgeCheck className="h-5 w-5 text-[#76C139]" strokeWidth={2.2} />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-bold tracking-tight text-[#111418]">
            {name || "Passageiro MOVVI"}
          </h1>
          {memberSince ? (
            <p className="mt-0.5 text-[13px] text-[#707070]">
              Membro desde {memberSince}
            </p>
          ) : null}
        </div>
      </section>

      {/* Summary card */}
      <section
        className="animate-in fade-in slide-in-from-bottom-2 duration-[220ms]
                   rounded-[24px] bg-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.18)]
                   ring-1 ring-black/5"
        style={{ animationDelay: "40ms", animationFillMode: "backwards" }}
      >
        <div className="divide-y divide-[#F1F5F1]">
          <SummaryLine icon={Phone} label="Telefone" value={phone || "Não informado"} />
          <SummaryLine icon={Mail} label="E-mail" value={email || "—"} />
          <SummaryLine icon={MapPin} label="Cidade" value={city || "Não informada"} />
          <SummaryLine icon={Calendar} label="Membro desde" value={memberSince || "—"} />
        </div>
      </section>

      {/* Quick stats */}
      <section
        className="animate-in fade-in slide-in-from-bottom-2 duration-[220ms] grid grid-cols-3 gap-3"
        style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
      >
        <StatCard icon={ClipboardList} value={String(totalRides)} label="Corridas" />
        <StatCard icon={Heart} value={String(favoritesCount)} label="Favoritos" />
        <StatCard icon={MapPinned} value={String(favoritesCount)} label="Endereços" />
      </section>

      {/* Public profile link */}
      <button
        type="button"
        onClick={onOpenPublic}
        className="animate-in fade-in slide-in-from-bottom-2 duration-[220ms]
                   flex w-full items-center justify-between gap-3 rounded-[24px] bg-white p-4 text-left
                   shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5
                   transition active:scale-[0.99] hover:ring-[#76C139]/40"
        style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#76C139]/10 text-[#5A9A2A]">
            <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-[#111418]">Ver perfil público</div>
            <div className="text-[12.5px] text-[#707070]">Como os motoristas te veem.</div>
          </div>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#76C139]">
          Abrir
        </span>
      </button>
    </div>
  );
}

function SummaryLine({
  icon: Icon, label, value,
}: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F7F9F7] text-[#5A9A2A]">
        <Icon className="h-[16px] w-[16px]" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-[#707070]">{label}</div>
        <div className="truncate text-[15px] font-medium text-[#111418]">{value}</div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, value, label,
}: { icon: typeof Heart; value: string; label: string }) {
  return (
    <div className="rounded-[24px] bg-white p-4 text-center shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#76C139]/10 text-[#5A9A2A]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </div>
      <div className="text-[20px] font-bold leading-none tracking-tight text-[#111418]">{value}</div>
      <div className="mt-1 text-[12px] font-medium uppercase tracking-wider text-[#707070]">{label}</div>
    </div>
  );
}

/* ---------------- Account sections + logout ---------------- */

function PassengerAccountSections({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-[220ms]">
      <SettingsSection icon={CreditCard} title="Pagamentos">
        <SettingsLinkRow
          icon={CreditCard}
          title="Formas de pagamento"
          hint="Em breve"
          onClick={() => toast.message("Formas de pagamento em breve.")}
        />
      </SettingsSection>

      <SettingsSection icon={MapPin} title="Locais">
        <SettingsLinkRow icon={Heart} title="Lugares favoritos" hint="Casa, trabalho e mais" to="/passageiro/favoritos" />
        <SettingsLinkRow icon={ClipboardList} title="Histórico de corridas" to="/passageiro/corridas" />
      </SettingsSection>

      <SettingsSection icon={Bell} title="Preferências">
        <SettingsLinkRow icon={Bell} title="Notificações" to="/passageiro/preferencias-notificacoes" />
        <SettingsLinkRow icon={ShieldCheck} title="Privacidade" to="/passageiro/privacidade" />
        <SettingsLinkRow icon={LockKeyhole} title="Segurança" to="/passageiro/seguranca" />
      </SettingsSection>

      <SettingsSection icon={LifeBuoy} title="Suporte & Legal">
        <SettingsLinkRow icon={LifeBuoy} title="Central de ajuda" to="/passageiro/suporte" />
        <SettingsLinkRow icon={FileText} title="Termos & Condições" to="/passageiro/termos" />
        <SettingsLinkRow icon={Info} title="Sobre a MOVVI" to="/passageiro/sobre" />
      </SettingsSection>

      <button
        type="button"
        onClick={onLogout}
        className="mt-2 inline-flex h-14 w-full items-center justify-center gap-2 rounded-[18px]
                   border border-[#E5E7E5] bg-white text-[15px] font-semibold text-[#111418]
                   shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] transition
                   active:scale-[0.98] hover:border-[#DC2626]/40 hover:text-[#DC2626]"
      >
        <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
        Sair da conta
      </button>
    </div>
  );
}
