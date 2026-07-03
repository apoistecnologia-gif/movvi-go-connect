import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  const router = useRouter();
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
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (router.history.canGoBack() ? router.history.back() : router.navigate({ to: "/motorista/configuracoes" }))}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Política de Privacidade</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-6 pb-24">
        <p className="mb-6 text-xs text-muted-foreground">Última atualização: 28 de junho de 2026</p>
        <article className="prose prose-invert max-w-none space-y-4 text-sm leading-relaxed text-foreground/90">
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
          <p className="text-xs text-muted-foreground">
            Esta é uma versão preliminar. O texto oficial será publicado pela MOVVI em breve.
          </p>
        </article>
      </main>
    </div>
  );
}
