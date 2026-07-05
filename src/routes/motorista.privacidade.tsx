import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SettingsPageShell, SettingsHero } from "@/components/settings";

export const Route = createFileRoute("/motorista/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — MOVVI DRIVE" },
      { name: "description", content: "Política de Privacidade da MOVVI DRIVE em conformidade com a LGPD." },
    ],
  }),
  component: PrivacidadeMotoristaPage,
});

function PrivacidadeMotoristaPage() {
  const _router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "legal.privacy_url")
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
      <DSLoading label="Carregando..." className="min-h-dvh" />
    );
  }

  return (
    <SettingsPageShell>
      <SettingsHero
        icon={ShieldCheck}
        title="Política de Privacidade"
        subtitle="Última atualização: 28 de junho de 2026"
      />
      <article className="space-y-4 rounded-[24px] bg-white p-6 text-[14px] leading-relaxed text-[#1B1B1B] shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
        <p>
          A MOVVI DRIVE trata dados pessoais em conformidade com a LGPD (Lei nº 13.709/2018).
          Coletamos apenas os dados necessários para operar o serviço: cadastro, documentos,
          localização em tempo real durante corridas ativas e histórico de viagens.
        </p>
        <p>
          Dados sensíveis, como CNH e CPF, ficam armazenados de forma restrita e não são
          compartilhados publicamente. Localização é usada apenas para viabilizar corridas e
          recursos de segurança.
        </p>
        <p>
          Você pode solicitar acesso, correção ou exclusão dos seus dados pelo canal de suporte.
        </p>
        <p className="text-[12.5px] text-[#707070]">
          Esta é uma versão preliminar. O texto oficial será publicado pela MOVVI em breve.
        </p>
      </article>
    </SettingsPageShell>
  );
}
