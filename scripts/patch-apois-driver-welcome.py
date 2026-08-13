from pathlib import Path

p = Path("src/routes/index.tsx")
s = p.read_text(encoding="utf-8")

s = s.replace(
    'import { ArrowUpRight, User, Shield } from "lucide-react";',
    'import { ArrowUpRight, CarFront, ChevronRight, CircleDollarSign, ShieldCheck, User, Shield } from "lucide-react";',
)

s = s.replace('''    if (APP_ROLE === "driver") {\n      throw redirect({ to: "/motorista/login", replace: true });\n    }\n''', '')

marker = '''function HomePage() {\n  return ('''
replacement = '''function HomePage() {\n  if (isDriverBuild()) return <DriverWelcomePage />;\n\n  return ('''
s = s.replace(marker, replacement)

insert_before = '''function AccessCard({'''
driver_page = r'''function DriverWelcomePage() {
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

'''
if insert_before in s and 'function DriverWelcomePage()' not in s:
    s = s.replace(insert_before, driver_page + insert_before)

p.write_text(s, encoding="utf-8")
