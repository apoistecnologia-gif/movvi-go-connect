import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, Loader2, Package, ShieldCheck } from "lucide-react";
import { AdminGuard } from "@/components/AdminGuard";
import { DSButton, DSCard, DSCardContent } from "@/design-system";
import { getMovviSourceSignedUrl } from "@/lib/adminDownloads.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download — MOVVI DRIVE" },
      { name: "description", content: "Download restrito do código-fonte do MOVVI DRIVE (admin)." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  return (
    <AdminGuard>
      <DownloadInner />
    </AdminGuard>
  );
}

function DownloadInner() {
  const getUrl = useServerFn(getMovviSourceSignedUrl);
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const { url } = await getUrl({ data: undefined as never });
      window.location.href = url;
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === "forbidden"
          ? "Acesso restrito a administradores."
          : "Não foi possível gerar o link de download.",
      );
    } finally {
      setLoading(false);
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
                Arquivo ZIP · acesso restrito a administradores
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
            <p>
              Este download é privado. Cada acesso gera uma URL assinada válida por poucos minutos
              e é registrado no log administrativo.
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={handleDownload} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Download className="mr-2 h-5 w-5" />
            )}
            Gerar link e baixar
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
