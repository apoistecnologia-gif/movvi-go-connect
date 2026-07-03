/**
 * MOVVI DRIVER — Profile screen (UI redesign only).
 * Premium hub layout. Preserves all logic: uploads, personal-info edits,
 * subscription, documents, auth. The editable form (ProfileForm) is opened
 * on-demand from the "Informações pessoais" card.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, LogOut, User, Car, FileText, CreditCard, LifeBuoy, ShieldCheck,
  Star, Camera, Crown, MapPin, Calendar, Eye, ArrowLeft, CheckCircle2, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { DriverProfessionalProfileDialog } from "@/components/profile/DriverProfessionalProfileDialog";
import { Avatar } from "@/components/Avatar";
import { ProfilePhotoUploader } from "@/components/ProfilePhotoUploader";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { toast } from "sonner";

export const Route = createFileRoute("/motorista/perfil")({
  head: () => ({ meta: [{ title: "Perfil do Motorista — MOVVI DRIVE" }] }),
  component: DriverProfilePage,
});

type Driver = {
  id?: string;
  name: string | null; email: string | null;
  photo_url: string | null; category: string | null;
  vehicle_model: string | null; vehicle_color: string | null;
  vehicle_plate: string | null; vehicle_year: number | null;
  rating: number | null;
  average_rating?: number | null;
  total_ratings?: number | null;
  completed_rides?: number | null;
  approval_status: string | null;
  subscription_status: string | null;
  subscription_expires_at?: string | null;
  city?: string | null;
  is_online: boolean | null;
  created_at: string | null;
};

function DriverProfilePage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [totalRides, setTotalRides] = useState(0);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [mode, setMode] = useState<"hub" | "edit">("hub");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      if (!alive) return;
      setUserId(u.user.id);

      const { data: d } = await supabase.from("drivers")
        .select("id,name,email,photo_url,category,vehicle_model,vehicle_color,vehicle_plate,vehicle_year,rating,average_rating,total_ratings,completed_rides,approval_status,subscription_status,subscription_expires_at,city,is_online,created_at")
        .eq("user_id", u.user.id).maybeSingle();
      if (!alive) return;
      setDriver((d ?? null) as Driver | null);

      const { count } = await supabase.from("rides").select("id", { count: "exact", head: true })
        .eq("driver_id", u.user.id).eq("status", "finalizada");
      if (!alive) return;
      setTotalRides(count ?? 0);
    })();
    return () => { alive = false; };
  }, []);

  if (mode === "edit") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setMode("hub")}
          className="fixed left-3 top-16 z-40 flex h-9 items-center gap-1 rounded-full bg-white/95 px-3 text-[13px] font-semibold text-[#1B1B1B] shadow-md ring-1 ring-black/5 active:scale-95 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <ProfileForm
          role="driver"
          title="Informações pessoais"
          description="Atualize seus dados de contato, segurança e emergência."
          onLoaded={({ userId: id }) => setUserId(id)}
        />
      </div>
    );
  }

  const name = driver?.name || "Motorista MOVVI";
  const rating = Number(driver?.average_rating ?? driver?.rating ?? 0);
  const completed = Number(driver?.completed_rides ?? totalRides);
  const totalRatings = Number(driver?.total_ratings ?? 0);
  const subActive = (driver?.subscription_status ?? "").toLowerCase() === "active"
    || (driver?.subscription_status ?? "").toLowerCase() === "ativa";
  const memberSince = driver?.created_at
    ? new Date(driver.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : "—";
  const expiresAt = driver?.subscription_expires_at
    ? new Date(driver.subscription_expires_at).toLocaleDateString("pt-BR")
    : null;

  async function handleLogout() {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/" });
  }

  async function handlePhotoUploaded(result: { signedUrl: string; path: string }) {
    if (!userId) return;
    setDriver((d) => d ? { ...d, photo_url: result.signedUrl } : d);
    try {
      await supabase.from("users").update({ avatar_url: result.signedUrl }).eq("auth_user_id", userId);
      await supabase.from("drivers").update({ photo_url: result.signedUrl }).eq("user_id", userId);
      await supabase.auth.updateUser({ data: { avatar_url: result.signedUrl } });
      toast.success("Foto atualizada!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar a foto.");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#F7F9F7]">
      <MovviHeader logoutRedirect="/" />

      <main
        className="flex-1 px-4 pt-4"
        style={{ paddingBottom: "max(8rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl space-y-5">
          {/* ============ HERO ============ */}
          <section
            className="relative overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_8px_28px_-14px_rgba(15,23,42,0.15)] ring-1 ring-black/5 animate-fade-in"
            style={{ animationDelay: "0ms", animationFillMode: "backwards" }}
          >
            {/* subtle decorative circles */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#76C139]/[0.08] blur-2xl" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-[#76C139]/[0.06] blur-xl" />

            <div className="relative flex flex-col items-center text-center">
              {userId ? (
                <div className="relative">
                  <div className="rounded-full p-1 ring-2 ring-[#76C139]/40 shadow-[0_10px_28px_-10px_rgba(118,193,57,0.55)] transition-transform hover:scale-[1.02]">
                    <ProfilePhotoUploader
                      userId={userId}
                      name={name}
                      currentUrl={driver?.photo_url ?? null}
                      onUploaded={handlePhotoUploaded}
                      size={104}
                      label=""
                    />
                  </div>
                </div>
              ) : (
                <Avatar name={name} size={104} />
              )}

              <h1 className="mt-4 text-[24px] font-bold tracking-tight text-[#1B1B1B]">{name}</h1>

              <div className="mt-2 flex items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-1 text-[12px] font-semibold text-[#92400E]">
                  <Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                  {rating > 0 ? rating.toFixed(2) : "—"}
                  {totalRatings > 0 && (
                    <span className="text-[#78350F]/70">· {totalRatings}</span>
                  )}
                </div>
                {subActive && (
                  <div className="inline-flex items-center gap-1 rounded-full bg-[#76C139]/12 px-2.5 py-1 text-[12px] font-semibold text-[#3F7A17] ring-1 ring-[#76C139]/25">
                    <Crown className="h-3.5 w-3.5" /> MOVVI Premium
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPublicProfileOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-[13px] font-semibold text-[#1B1B1B] transition active:scale-95 hover:border-[#76C139]/50 hover:text-[#3F7A17]"
              >
                <Eye className="h-4 w-4" /> Ver perfil público
              </button>
            </div>
          </section>

          {/* ============ PROFILE CARD ============ */}
          <section
            className="rounded-[24px] bg-white p-5 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.12)] ring-1 ring-black/5 animate-fade-in"
            style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <InfoRow icon={<Car className="h-4 w-4" />} label="Veículo" value={driver?.vehicle_model || "—"} />
              <InfoRow label="Placa" value={driver?.vehicle_plate || "—"} mono />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Cidade" value={driver?.city || "—"} />
              <InfoRow icon={<Calendar className="h-4 w-4" />} label="Membro desde" value={memberSince} className="capitalize" />
            </div>
          </section>

          {/* ============ STATISTICS ============ */}
          <section
            className="grid grid-cols-3 gap-3 animate-fade-in"
            style={{ animationDelay: "160ms", animationFillMode: "backwards" }}
          >
            <StatCard label="Corridas" value={String(completed)} />
            <StatCard label="Avaliação" value={rating > 0 ? rating.toFixed(1) : "—"} highlight />
            <StatCard label="Concluídas" value={String(completed)} />
          </section>

          {/* ============ SUBSCRIPTION ============ */}
          <Link
            to="/motorista/assinatura"
            className="block animate-fade-in"
            style={{ animationDelay: "220ms", animationFillMode: "backwards" }}
          >
            <div className="relative overflow-hidden rounded-[24px] p-5 shadow-[0_10px_28px_-14px_rgba(63,122,23,0.35)] ring-1 ring-black/5 transition active:scale-[0.99]"
              style={{ background: subActive
                ? "linear-gradient(135deg, #76C139 0%, #5A9A2A 100%)"
                : "linear-gradient(135deg, #1F2937 0%, #111827 100%)" }}
            >
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-white" />
                    <span className="text-[13px] font-semibold uppercase tracking-wider text-white/80">
                      MOVVI Premium
                    </span>
                  </div>
                  <div className="mt-1.5 text-[20px] font-bold text-white">
                    {subActive ? "Assinatura ativa" : "Assinatura inativa"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[12.5px] text-white/85">
                    {subActive ? (
                      <><CheckCircle2 className="h-3.5 w-3.5" />
                        {expiresAt ? `Renova em ${expiresAt}` : "Todos os benefícios liberados"}</>
                    ) : (
                      <><AlertCircle className="h-3.5 w-3.5" /> Ative para receber corridas</>
                    )}
                  </div>
                </div>
                <div className="rounded-full bg-white/15 p-2 ring-1 ring-white/25">
                  <ChevronRight className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          </Link>

          {/* ============ ACCOUNT SECTIONS ============ */}
          <section
            className="space-y-2 animate-fade-in"
            style={{ animationDelay: "280ms", animationFillMode: "backwards" }}
          >
            <h2 className="px-2 text-[13px] font-semibold uppercase tracking-wider text-[#707070]">
              Conta
            </h2>
            <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
              <MenuRow icon={<User />} label="Informações pessoais"
                sub="Nome, e-mail, telefone e senha"
                onClick={() => setMode("edit")} />
              <Divider />
              <MenuRow icon={<Car />} label="Veículo"
                sub={driver?.vehicle_model ? `${driver.vehicle_model} · ${driver.vehicle_plate ?? ""}` : "Modelo, placa e categoria"}
                to="/motorista/documentos" />
              <Divider />
              <MenuRow icon={<FileText />} label="Documentos"
                sub="CNH, CRLV e selfie" to="/motorista/documentos" />
              <Divider />
              <MenuRow icon={<CreditCard />} label="Pagamentos e assinatura"
                sub="Formas de pagamento e recibos" to="/motorista/assinatura" />
            </div>
          </section>

          <section
            className="space-y-2 animate-fade-in"
            style={{ animationDelay: "340ms", animationFillMode: "backwards" }}
          >
            <h2 className="px-2 text-[13px] font-semibold uppercase tracking-wider text-[#707070]">
              Preferências
            </h2>
            <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
              <MenuRow icon={<LifeBuoy />} label="Suporte"
                sub="Central de ajuda e contato" to="/motorista/suporte" />
              <Divider />
              <MenuRow icon={<ShieldCheck />} label="Privacidade e segurança"
                sub="Dados, permissões e conta" to="/motorista/privacidade" />
            </div>
          </section>

          {/* ============ LOGOUT ============ */}
          <div
            className="pt-1 animate-fade-in"
            style={{ animationDelay: "400ms", animationFillMode: "backwards" }}
          >
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-[#E5E7EB] bg-white px-4 py-3.5 text-[15px] font-semibold text-[#DC2626] transition active:scale-[0.98] hover:border-[#DC2626]/40 hover:bg-[#FEF2F2]"
            >
              <LogOut className="h-4 w-4" /> Sair da conta
            </button>
            <p className="mt-3 text-center text-[11.5px] text-[#94A3B8]">
              MOVVI Driver · Versão 1.0
            </p>
          </div>
        </div>
      </main>

      <DriverProfessionalProfileDialog
        open={publicProfileOpen}
        onOpenChange={setPublicProfileOpen}
        driverUserId={userId}
      />

      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}

/* ---------- subcomponents ---------- */

function InfoRow({
  icon, label, value, mono, className,
}: { icon?: React.ReactNode; label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[13px] text-[#707070]">
        {icon && <span className="text-[#76C139]">{icon}</span>}
        <span>{label}</span>
      </div>
      <div className={`mt-0.5 text-[15px] font-semibold text-[#1B1B1B] ${mono ? "font-mono tracking-wide" : ""} ${className ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-[20px] bg-white p-4 text-center shadow-[0_6px_18px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 transition active:scale-[0.98] ${highlight ? "ring-[#76C139]/25" : ""}`}>
      <div className={`text-[24px] font-bold leading-none ${highlight ? "text-[#5A9A2A]" : "text-[#1B1B1B]"}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[12px] font-medium uppercase tracking-wider text-[#707070]">
        {label}
      </div>
    </div>
  );
}

function MenuRow({
  icon, label, sub, to, onClick,
}: { icon: React.ReactNode; label: string; sub?: string; to?: string; onClick?: () => void }) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3.5 transition active:bg-[#F7F9F7]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#76C139]/10 text-[#5A9A2A]">
        <span className="[&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:stroke-[1.75]">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-[#1B1B1B]">{label}</div>
        {sub && <div className="truncate text-[12.5px] text-[#707070]">{sub}</div>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#94A3B8]" />
    </div>
  );
  if (to) return <Link to={to}>{content}</Link>;
  return <button type="button" onClick={onClick} className="w-full text-left">{content}</button>;
}

function Divider() {
  return <div className="mx-4 h-px bg-[#F1F5F1]" />;
}
