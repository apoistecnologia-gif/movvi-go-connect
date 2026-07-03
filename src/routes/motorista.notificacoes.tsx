import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, DRIVER_NAV } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/motorista/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — MOVVI DRIVE" }] }),
  component: DriverNotificationsPage,
});

type Notif = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  read_at: string | null;
  created_at: string;
};

function DriverNotificationsPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(uid: string) {
    const { data, error } = await supabase
      .from("notification_inbox")
      .select("id,title,body,category,read_at,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error) setItems((data ?? []) as Notif[]);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.auth.getUser();
      if (!a?.user) { navigate({ to: "/motorista/login" }); return; }
      setUserId(a.user.id);
      await load(a.user.id);
    })();
  }, [navigate]);

  async function markRead(id: string) {
    if (!userId) return;
    await supabase.from("notification_inbox").update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }
  async function markAll() {
    if (!userId) return;
    await supabase
      .from("notification_inbox")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (userId) await load(userId);
    toast.success("Todas marcadas como lidas.");
  }
  async function remove(id: string) {
    await supabase.from("notification_inbox").delete().eq("id", id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />
      <main className="flex-1 px-4 py-6 pb-28">
        <div className="container mx-auto max-w-xl space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold">Notificações</h1>
                <p className="text-xs text-muted-foreground">
                  {items.filter((i) => !i.read_at).length} não lidas
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={markAll}>
              <Check className="mr-1 h-3.5 w-3.5" /> Marcar todas
            </Button>
          </header>

          {loading ? (
            <ul className="space-y-2" aria-busy="true" aria-label="Carregando notificações">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="rounded-2xl border border-border bg-card p-4">
                  <div className="space-y-2">
                    <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted/50" />
                    <div className="h-3 w-4/5 animate-pulse rounded bg-muted/40" />
                    <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/40" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/40 px-6 py-12 text-center">
              <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <Bell className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">Tudo em dia</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Você não tem novas notificações. Avisos sobre corridas, pagamentos e atualizações aparecem aqui.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`rounded-2xl border p-4 transition ${n.read_at ? "border-border bg-card/60" : "border-primary/40 bg-primary/5"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug">{n.title}</p>
                      {n.body && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{n.body}</p>}
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {!n.read_at && (
                        <button onClick={() => markRead(n.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Marcar como lida">
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => remove(n.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-destructive transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50" aria-label="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomNav items={DRIVER_NAV} />
    </div>
  );
}
