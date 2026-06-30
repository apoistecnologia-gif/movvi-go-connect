import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy, Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download — MOVVI DRIVE" },
      { name: "description", content: "Baixe o código-fonte do MOVVI DRIVE." },
      { property: "og:title", content: "Download — MOVVI DRIVE" },
      { property: "og:description", content: "Baixe o código-fonte do MOVVI DRIVE." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/download/movvi-source`
      : "/api/public/download/movvi-source";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg border-border/60 bg-card/60 backdrop-blur">
        <CardContent className="space-y-6 p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">MOVVI DRIVE — Código-fonte</h1>
              <p className="text-xs text-muted-foreground">
                Arquivo ZIP · ~1.6 MB · React + TypeScript + Vite
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Use o botão abaixo para baixar o pacote completo do projeto, ou copie o
            link público para compartilhar.
          </p>

          <a href={url}>
            <Button className="w-full" size="lg">
              <Download className="mr-2 h-5 w-5" />
              Baixar movvi-drive-source.zip
            </Button>
          </a>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">
              Link público
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 truncate rounded-md border border-border bg-background/60 px-3 py-2 text-xs"
              />
              <Button variant="outline" onClick={handleCopy} aria-label="Copiar link">
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            O link gera uma URL assinada de download a cada acesso. Compartilhe esta
            página ou o link acima.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
