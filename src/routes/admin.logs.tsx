import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Download, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDate } from "@/lib/formatters";
import { downloadCsv } from "@/lib/csvExport";
import { DSBadge, DSButton, DSCard, DSCardContent } from "@/design-system";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({ meta: [{ title: "Logs — Admin MOVVI" }] }),
  component: AdminLogsPage,
});

type Audit = {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};
type Login = { id: string; user_id: string; ip: string | null; user_agent: string | null; success: boolean; created_at: string };

function AdminLogsPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [logins, setLogins] = useState<Login[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function refresh() {
    setLoading(true);
    let aq = supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (q.trim()) {
      const t = `%${q.trim()}%`;
      aq = aq.or(`action.ilike.${t},entity.ilike.${t},entity_id.ilike.${t}`);
    }
    const [a, l] = await Promise.all([
      aq,
      supabase.from("admin_login_history").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setAudits((a.data ?? []) as Audit[]);
    setLogins((l.data ?? []) as Login[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-logs")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_audit_logs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_login_history" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <AdminLayout
      title="Logs e Auditoria"
      description={`${audits.length} eventos · ${logins.length} logins`}
      actions={
        <DSButton
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => downloadCsv(`audit-${new Date().toISOString().slice(0, 10)}`, audits as unknown as Record<string, unknown>[])}
        >
          <Download className="h-4 w-4" /> CSV
        </DSButton>
      }
    >
      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
          <TabsTrigger value="login">Logins admin</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar ação, entidade ou id"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : audits.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem registros.</p>
          ) : (
            audits.map((a) => (
              <DSCard key={a.id} className="border-border bg-card/60">
                <DSCardContent className="flex flex-col gap-1 p-3 text-xs sm:flex-row sm:items-center">
                  <DSBadge className="font-mono">{a.action}</DSBadge>
                  <span className="text-muted-foreground">{a.entity}</span>
                  {a.entity_id && <span className="font-mono text-[10px] text-muted-foreground">{a.entity_id.slice(0, 8)}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">{formatDate(a.created_at)}</span>
                </DSCardContent>
              </DSCard>
            ))
          )}
        </TabsContent>

        <TabsContent value="login" className="mt-3 space-y-2">
          {loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : logins.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum login registrado.</p>
          ) : (
            logins.map((l) => (
              <DSCard key={l.id} className="border-border bg-card/60">
                <DSCardContent className="flex items-center gap-2 p-3 text-xs">
                  <DSBadge variant="danger" className="${l.success ? "" : ""}">{l.success ? "OK" : "Falha"}</DSBadge>
                  <span className="font-mono">{l.user_id?.slice(0, 8)}</span>
                  <span className="truncate text-muted-foreground">{l.user_agent ?? "—"}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{formatDate(l.created_at)}</span>
                </DSCardContent>
              </DSCard>
            ))
          )}
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
