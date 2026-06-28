import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Bell, CheckCheck, Loader2, Inbox } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type InboxRow = {
  id: string;
  category: string | null;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function PassengerInboxPage() {
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      setRows([]);
      return;
    }
    const { data, error } = await supabase
      .from("notification_inbox")
      .select("id,category,title,body,data,read_at,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) setError(error.message);
    else setRows((data ?? []) as InboxRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      await supabase
        .from("notification_inbox")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", uid)
        .is("read_at", null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    await supabase
      .from("notification_inbox")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)) : prev,
    );
  }

  const unread = rows?.filter((r) => !r.read_at).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-24">
        <div className="container mx-auto max-w-xl">
          <header className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold">Notificações</h1>
                <p className="text-xs text-muted-foreground">
                  {unread > 0 ? `${unread} não lida${unread > 1 ? "s" : ""}` : "Tudo em dia"}
                </p>
              </div>
            </div>
            {unread > 0 && (
              <Button size="sm" variant="outline" onClick={markAllRead} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="mr-1 h-3.5 w-3.5" />}
                Marcar lidas
              </Button>
            )}
          </header>

          {error && (
            <p className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </p>
          )}

          {rows === null && (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}

          {rows && rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
              <Inbox className="mx-auto mb-3 h-10 w-10 opacity-40" />
              Você ainda não tem notificações.
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read_at && markOne(n.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    n.read_at
                      ? "border-border bg-card/40"
                      : "border-primary/40 bg-primary/5 hover:bg-primary/10"
                  }`}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && (
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                  )}
                  {n.category && (
                    <span className="mt-2 inline-block rounded-full bg-secondary/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {n.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomNav items={PASSENGER_NAV} />
    </div>
  );
}

export const Route = createFileRoute("/passageiro/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — MOVVI DRIVE" }] }),
  component: PassengerInboxPage,
});
