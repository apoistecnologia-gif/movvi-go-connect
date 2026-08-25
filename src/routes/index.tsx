import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { MovviLogo } from "@/components/MovviLogo";
import { ArrowUpRight, CarFront, ChevronRight, CircleDollarSign, ShieldCheck, User, Shield } from "lucide-react";
import { APP_ROLE, isPassengerBuild, isDriverBuild } from "@/lib/appRole";

const HOME_TITLE = "APOIS — Mobilidade brasileira que move você";
const HOME_DESC =
  "Plataforma brasileira de mobilidade urbana. Peça corridas, dirija com a APOIS ou gerencie a operação — rapidez, segurança e tecnologia em todo o Brasil.";
const HOME_URL = "https://movvi-go-connect.lovable.app/";
const HOME_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/70a94c15-531e-4bf4-824b-6f2cef2bea65/id-preview-047658fb--0900bef2-57d2-47b9-93b1-0ea5defee501.lovable.app-1782494344290.png";

export const Route = createFileRoute("/")({
  // Fase 1 — nos builds mobile (passageiro/motorista), a raiz salta direto
  // para o login do papel correspondente. No build "web" mantém a tela
  // institucional de escolha de perfil.
  beforeLoad: () => {
    if (APP_ROLE === "passenger") {
      throw redirect({ to: "/passageiro/login", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESC },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESC },
      { property: "og:url", content: HOME_URL },
      { property: "og:image", content: HOME_OG_IMAGE },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESC },
      { name: "twitter:image", content: HOME_OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: HOME_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "APOIS",
          url: HOME_URL,
          logo: HOME_OG_IMAGE,
          sameAs: [],
        }),
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  if (isDriverBuild()) return <DriverWelcomePage />;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-white text-[#0F172A]">
      {/* Ultra-subtle decorative background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-32 h-[420px] w-[420px] rounded-full bg-[#F6BE1C]/[0.06] blur-3xl" />
        <div className="absolute -bottom-48 -left-32 h-[460px] w-[460px] rounded-full bg-[#F6BE1C]/[0.05] blur-3xl" />
        {/* Ultra-light route line */}
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.05]"
          viewBox="0 0 400 800"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M-20 640 Q120 540 200 580 T440 480"
            stroke="#F6BE1C"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            strokeLinecap="round"
          />
          <path
            d="M-40 120 Q140 200 240 160 T460 240"
            stroke="#0F172A"
            strokeWidth="1"
            strokeDasharray="3 7"
            strokeLinecap="round"
          />
        </svg>
        {/* Faint location pins */}
        <div className="absolute top-[18%] right-[12%] h-1.5 w-1.5 rounded-full bg-[#F6BE1C]/25" />
        <div className="absolute top-[72%] left-[14%] h-1.5 w-1.5 rounded-full bg-[#0F172A]/15" />
        <div className="absolute top-[40%] left-[8%] h-1 w-1 rounded-full bg-[#F6BE1C]/20" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-14">
        {/* Hero */}
        <header className="flex flex-col items-center text-center">
          <div
            className="animate-in fade-in duration-500 fill-mode-both"
            style={{ animationDelay: "0ms" }}
          >
            <div className="rounded-3xl bg-[#0F172A] p-4 shadow-[0_18px_44px_-22px_rgba(246,190,28,0.55)]">
              <MovviLogo size={52} />
            </div>
          </div>

          <h1
            className="mt-10 text-[36px] font-bold leading-[1.05] tracking-tight text-[#0F172A] animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
            style={{ animationDelay: "80ms" }}
          >
            Bem-vindo à <span className="text-[#F6BE1C]">APOIS</span>
          </h1>

          <p
            className="mt-4 max-w-[320px] text-[13.5px] leading-[1.55] text-[#64748B] animate-in fade-in duration-500 fill-mode-both"
            style={{ animationDelay: "160ms" }}
          >
            A plataforma brasileira de mobilidade feita para conectar
            passageiros, motoristas e serviços com rapidez, segurança e
            tecnologia.
          </p>
        </header>

        {/* Cards */}
        <section
          className="mt-12 flex flex-col gap-3.5"
          aria-label="Selecione seu tipo de acesso"
        >
          <AccessCard
            to="/passageiro/login"
            title="Passageiro"
            description="Solicite corridas com rapidez e segurança."
            icon={<User strokeWidth={1.75} className="h-5 w-5" />}
            primary
            delay={240}
          />
          {!isPassengerBuild() && !isDriverBuild() ? (
            <>
              <AccessCard
                to="/motorista/login"
                title="Motorista"
                description="Receba chamadas e amplie seus ganhos."
                icon={<SteeringIcon />}
                delay={320}
              />
              <AccessCard
                to="/admin/login"
                title="Administrador"
                description="Gestão e monitoramento da plataforma."
                icon={<Shield strokeWidth={1.75} className="h-5 w-5" />}
                delay={400}
              />
            </>
          ) : null}
        </section>

        <footer
          className="mt-auto pt-14 text-center animate-in fade-in duration-500 fill-mode-both"
          style={{ animationDelay: "520ms" }}
        >
          <div className="mx-auto mb-3 h-px w-10 bg-[#E5E7EB]" />
          <div className="text-[11.5px] font-medium tracking-wide text-[#94A3B8]/80">
            Versão 1.0 · © {new Date().getFullYear()} APOIS Tecnologia
          </div>
        </footer>
      </div>
    </main>
  );
}

function DriverWelcomePage() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#050607] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[46vh]"
        style={{
          background:
            "radial-gradient(circle at 50% 36%, rgba(246,190,28,0.16) 0%, rgba(246,190,28,0.035) 32%, transparent 68%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-[calc(env(safe-area-inset-top)+24px)]">
        <header className="flex justify-center">
          <MovviLogo size={72} showTagline />
        </header>

        <section className="mt-7 text-center">
          <div className="relative mx-auto flex h-[190px] w-full max-w-[320px] items-center justify-center overflow-hidden rounded-[30px] border border-white/5 bg-[#0D0F11] shadow-[0_30px_80px_-42px_rgba(246,190,28,0.55)]">
            <div className="absolute -bottom-12 left-1/2 h-28 w-[320px] -translate-x-1/2 rounded-[50%] border-t-2 border-[#F6BE1C]/55" />
            <div className="absolute bottom-2 left-1/2 h-px w-44 -translate-x-1/2 rotate-[-14deg] bg-[#F6BE1C]/45" />
            <div className="absolute right-9 top-7 h-2 w-2 rounded-full bg-[#F6BE1C] shadow-[0_0_18px_rgba(246,190,28,0.8)]" />
            <div className="flex h-28 w-28 items-center justify-center rounded-full border border-[#F6BE1C]/20 bg-[#F6BE1C]/8 text-[#F6BE1C]">
              <CarFront className="h-16 w-16" strokeWidth={1.4} />
            </div>
          </div>

          <h1 className="mt-6 text-[27px] font-black leading-tight tracking-tight">
            Bem-vindo à <span className="text-[#F6BE1C]">APOIS Motorista!</span>
          </h1>
          <p className="mx-auto mt-2 max-w-[330px] text-[12.5px] font-medium leading-relaxed text-zinc-400">
            Dirija no seu ritmo, receba suas corridas e tenha autonomia para ficar online quando quiser.
          </p>
        </section>

        <section className="mt-6 space-y-2.5" aria-label="Vantagens para motoristas">
          {[
            [CircleDollarSign, "100% do valor da corrida", "A APOIS não desconta comissão por corrida."],
            [CarFront, "Você escolhe quando dirigir", "Fique online ou offline sempre que precisar."],
            [ShieldCheck, "Tecnologia e segurança", "PIN de embarque e recursos de segurança durante a viagem."],
          ].map(([Icon, title, description]) => (
            <div key={String(title)} className="flex min-h-[68px] items-center gap-3 rounded-[20px] border border-white/5 bg-[#101214] px-3.5 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C]/10 text-[#F6BE1C]">
                <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[12.5px] font-black text-white">{String(title)}</p>
                <p className="mt-0.5 text-[10.5px] font-medium leading-relaxed text-zinc-500">{String(description)}</p>
              </div>
            </div>
          ))}
        </section>

        <div className="mt-auto space-y-2 pt-7">
          <Link
            to="/motorista/cadastro"
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#F6BE1C] text-[13px] font-black text-black shadow-[0_18px_40px_-24px_rgba(246,190,28,0.8)]"
          >
            Começar
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            to="/motorista/login"
            className="flex h-12 w-full items-center justify-center rounded-[18px] border border-[#F6BE1C]/25 bg-transparent text-[11px] font-black uppercase tracking-[0.12em] text-[#F6BE1C]"
          >
            Já tenho uma conta
          </Link>
          <p className="pt-1 text-center text-[9px] font-semibold leading-relaxed text-zinc-700">
            Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade da APOIS.
          </p>
        </div>
      </div>
    </main>
  );
}

function AccessCard({
  to,
  title,
  description,
  icon,
  primary = false,
  delay,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  primary?: boolean;
  delay: number;
}) {
  const border = primary
    ? "border-[#F6BE1C]/40 ring-1 ring-[#F6BE1C]/10"
    : "border-[#EEF1F5]";
  const shadow = primary
    ? "shadow-[0_18px_44px_-22px_rgba(246,190,28,0.35)]"
    : "shadow-[0_10px_30px_-22px_rgba(15,23,42,0.18)]";

  return (
    <Link
      to={to}
      style={{ animationDelay: `${delay}ms` }}
      className={`group relative flex min-h-[72px] w-full items-center gap-4 rounded-[28px] border bg-white px-5 py-5 transition-all ease-out will-change-transform hover:-translate-y-[1px] hover:shadow-[0_20px_48px_-22px_rgba(15,23,42,0.22)] active:scale-[1.02] animate-in fade-in slide-in-from-bottom-2 fill-mode-both ${border} ${shadow}`}
    >
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F6BE1C]/10 text-[#C88A08]"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-semibold leading-tight text-[#0F172A]">
          {title}
        </div>
        <div className="mt-1 text-[12.5px] leading-snug text-[#64748B]">
          {description}
        </div>
      </div>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-[#CBD5E1] transition-colors group-hover:text-[#F6BE1C]"
        strokeWidth={1.75}
      />

      <style>{`
        a { transition-duration: 220ms; }
      `}</style>
    </Link>
  );
}

function SteeringIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.25" />
      <path d="M12 9.75V3.25" />
      <path d="M14.05 13.2l4.7 4.7" />
      <path d="M9.95 13.2l-4.7 4.7" />
    </svg>
  );
}
