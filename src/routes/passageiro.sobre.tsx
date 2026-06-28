import { createFileRoute } from "@tanstack/react-router";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MovviLogo } from "@/components/MovviLogo";
import { Shield, Zap, Globe2, Heart } from "lucide-react";

export const Route = createFileRoute("/passageiro/sobre")({
  head: () => ({ meta: [{ title: "Sobre — MOVVI DRIVE" }] }),
  component: SobrePage,
});

const APP_VERSION = "1.0.0";

function SobrePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-24">
        <div className="container mx-auto max-w-2xl space-y-5">
          <Card>
            <CardHeader className="items-center text-center">
              <div className="mx-auto mb-3">
                <MovviLogo />
              </div>
              <CardTitle className="text-xl">MOVVI DRIVE</CardTitle>
              <CardDescription>
                Mobilidade urbana profissional, segura e premium para todo o Brasil.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-center text-sm text-muted-foreground">
              <p>Versão do app: <span className="font-mono text-foreground">{APP_VERSION}</span></p>
              <p>© {new Date().getFullYear()} MOVVI Tecnologia. Todos os direitos reservados.</p>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Feature icon={Shield} title="Segurança em primeiro lugar" text="Verificação de motoristas, PIN de segurança e suporte 24/7." />
            <Feature icon={Zap} title="Tecnologia premium" text="Rastreamento em tempo real, despacho inteligente e mapas precisos." />
            <Feature icon={Globe2} title="Brasil inteiro" text="Operação em todas as regiões com tarifas justas e transparentes." />
            <Feature icon={Heart} title="Feito por quem se importa" text="Construído com carinho para passageiros e motoristas." />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Links úteis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <a href="mailto:suporte@movvi.app" className="block rounded-lg border border-border bg-card/50 px-3 py-2 hover:bg-accent/40">suporte@movvi.app</a>
              <a href="#" className="block rounded-lg border border-border bg-card/50 px-3 py-2 hover:bg-accent/40">Termos de Uso</a>
              <a href="#" className="block rounded-lg border border-border bg-card/50 px-3 py-2 hover:bg-accent/40">Política de Privacidade</a>
            </CardContent>
          </Card>
        </div>
      </main>
      <BottomNav items={PASSENGER_NAV} />
    </div>
  );
}

function Feature({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
