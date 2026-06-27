import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Database, Download, Plus, CheckCircle2, XCircle, Clock } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";
import { downloadCsv } from "@/lib/csvExport";
import { formatDate } from "@/lib/formatters";

export const Route = createFileRoute("/admin/backups")({
  head: () => ({ meta: [{ title: "Backups — Admin MOVVI" }] }),
  component: AdminBackupsPage,
});

type Backup = {
  id: string;
  type: "manual" | "auto";
  status: "pending" | "running" | "success" | "failed";
  size_bytes: number | null;
  tables: string[] | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

const BACKUP_TABLES = ["users", "drivers", "rides", "subscriptions", "ride_categories", "tariff_rules", "coupons", "app_settings"] as const;

function AdminBackupsPage() {
  const [rows, setRows] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const { data, error } = await supabase
      .from("backups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Backup[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-backups")
      .on("postgres_changes", { event: "*", schema: "public", table: "backups" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function createManualBackup() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from("backups")
      .insert({
        type: "manual",
        status: "running",
        tables: BACKUP_TABLES as unknown as never,
        created_by: u?.user?.id ?? null,
      })
      .select()
      .single();
    if (error || !inserted) {
      setBusy(false);
      return toast.error(error?.message ?? "Falha ao iniciar backup");
    }

    // Snapshot to CSV (per table) and trigger download
    let totalSize = 0;
    const errors: string[] = [];
    for (const t of BACKUP_TABLES) {
      const { data, error: e } = await supabase.from(t as never).select("*").limit(50000);
      if (e) {
        errors.push(`${t}: ${e.message}`);
        continue;
      }
      const rowsArr = (data ?? []) as Record<string, unknown>[];
      if (rowsArr.length > 0) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        downloadCsv(`backup-${stamp}-${t}`, rowsArr);
        totalSize += JSON.stringify(rowsArr).length;
      }
    }

    const status: Backup["status"] = errors.length > 0 ? "failed" : "success";
    await supabase
      .from("backups")
      .update({
        status,
        size_bytes: totalSize,
        error: errors.length ? errors.join("; ") : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);

    await logAdminAction({ action: "backup.manual", entity: "backups", entity_id: inserted.id, after: { tables: BACKUP_TABLES.length, status } });
    setBusy(false);
    if (status === "success") toast.success("Backup gerado e baixado em CSV");
    else toast.error("Backup com erros — confira os detalhes");
  }

  function statusBadge(s: Backup["status"]) {
    if (s === "success") return <Badge className="gap-1 bg-primary/15 text-primary"><CheckCircle2 className="h-3 w-3" />Sucesso</Badge>;
    if (s === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Falhou</Badge>;
    if (s === "running") return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Em execução</Badge>;
    return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pendente</Badge>;
  }

  return (
    <AdminLayout
      title="Backups"
      description="Snapshots manuais das tabelas críticas. Cada backup gera um CSV por tabela e registra no histórico."
      actions={
        <Button onClick={createManualBackup} disabled={busy} size="sm" className="gap-1">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Backup agora
        </Button>
      }
    >
      <Card className="border-border bg-card/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" />
            Histórico
          </CardTitle>
          <CardDescription className="text-xs">Últimos 50 backups. Tabelas incluídas: {BACKUP_TABLES.join(", ")}.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center gap-2 py-12 text-center">
              <Database className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum backup ainda. Clique em "Backup agora" para gerar o primeiro.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Tamanho</th>
                    <th className="px-3 py-2 text-left">Concluído</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} className="border-t border-border/60">
                      <td className="px-3 py-2">{formatDate(b.created_at)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">{b.type}</Badge>
                      </td>
                      <td className="px-3 py-2">{statusBadge(b.status)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {b.size_bytes ? `${(b.size_bytes / 1024).toFixed(1)} KB` : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{b.completed_at ? formatDate(b.completed_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        <Download className="mr-1 inline h-3 w-3" />
        Os arquivos CSV são baixados localmente no momento do backup. Para restauração, importe os CSVs manualmente — operação restrita a super_admin.
      </p>
    </AdminLayout>
  );
}
