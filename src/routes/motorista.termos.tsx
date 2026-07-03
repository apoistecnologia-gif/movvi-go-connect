import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingsPageShell, SettingsHero } from "@/components/settings";

export const Route = createFileRoute("/motorista/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — MOVVI DRIVE" },
      { name: "description", content: "Termos de Uso da plataforma MOVVI DRIVE." },
    ],
  }),
  component: TermosMotoristaPage,
});

function TermosMotoristaPage() {
  const _router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "legal.terms_url")
        .maybeSingle();
      const url = typeof data?.value === "string" ? data.value : (data?.value as { url?: string } | null)?.url;
      if (alive && url && /^https?:\/\//i.test(url)) {
        window.location.replace(url);
        return;
      }
      if (alive) setChecking(false);
    })();
    return () => { alive = false; };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F7F9F7] text-[#707070]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <SettingsPageShell>
      <SettingsHero
        icon={FileText}
        title="Termos de Uso"
        subtitle="Última atualização: 28 de junho de 2026"
      />
      <article className="space-y-4 rounded-[24px] bg-white p-6 text-[14px] leading-relaxed text-[#1B1B1B] shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <p>
          Ao utilizar o aplicativo MOVVI DRIVE como motorista parceiro, você concorda com estes
          Termos, com a Política de Privacidade e com as regras operacionais da plataforma.
        </p>
        <p>
          A MOVVI é uma plataforma de intermediação tecnológica. O pagamento das corridas é
          realizado diretamente entre passageiro e motorista — a MOVVI não processa valores de
          corrida. A assinatura mensal libera o recebimento de ofertas.
        </p>
        <p>
          É responsabilidade do motorista manter documentos, veículo e cadastro atualizados,
          respeitar a legislação de trânsito e agir com cordialidade com passageiros.
        </p>
        <p className="text-[12.5px] text-[#707070]">
          Esta é uma versão preliminar. O texto oficial será publicado pela MOVVI em breve.
        </p>
      </article>
    </SettingsPageShell>
  );
}
