import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck, Loader2, Sparkles, Trash2 } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
import { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { loadDriverProfile } from "@/lib/driverProfile";
import { toast } from "sonner";

export const Route = createFileRoute("/motorista/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — APOIS Motorista" }] }),
  component: DriverNotificationsPage,
});

type Notif = {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

function DriverNotificationsPage() {
  const navigate = useNavigate();
  const [mobilityUserId, setMobilityUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,read_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("[APOIS Motorista] notificações:", error);
      toast.error("Não foi possível carregar as notificações.");
    } else {
      setItems((data ?? []) as Notif[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const profile = await loadDriverProfile();
      if (!alive) return;
      if (!profile.ok) {
        await navigate({
          to: profile.reason === "no_session" ? "/motorista/login" : "/motorista/status",
        });
        return;
      }
      const userId = profile.profile.user_id;
      setMobilityUserId(userId);
      await load(userId);
    })();
    return () => {
      alive = false;
    };
  }, [load, navigate]);

  useEffect(() => {
    if (!mobilityUserId) return;
    const channel = supabase
      .channel(`apois-driver-notifications-${mobilityUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${mobilityUserId}` },
        () => void load(mobilityUserId),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, mobilityUserId]);

  async function markRead(id: string) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: now }).eq("id", id);
    if (error) return toast.error("Não foi possível marcar como lida.");
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read_at: now } : item)));
  }

  async function markAll() {
    if (!mobilityUserId || busy) return;
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", mobilityUserId)
      .is("read_at", null);
    setBusy(false);
    if (error) return toast.error("Não foi possível atualizar as notificações.");
    setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    toast.success("Todas marcadas como lidas.");
  }

  async function remove(id: string) {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir a notificação.");
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <div className="relative min-h-[100dvh] min-w-0 overflow-x-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(246,190,28,0.12),transparent_62%)]" aria-hidden="true" />
      <MovviHeader logoutRedirect="/" />

      <main className="relative mx-auto w-full min-w-0 max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom)+112px)] pt-5">
        <section className="relative mb-5 min-w-0 overflow-hidden rounded-[32px] border border-[#F6BE1C]/20 bg-gradient-to-br from-[#211A08] via-[#101214] to-[#08090A] p-4 shadow-[0_28px_80px_-40px_rgba(246,190,28,.78)] sm:p-5">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#F6BE1C]/12 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-white/[0.025] blur-3xl" aria-hidden="true" />
          <div className="relative flex min-w-0 flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 basis-[190px] items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-[#F6BE1C]/25 bg-[#F6BE1C]/12 text-[#F6BE1C] shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_10px_30px_-18px_rgba(246,190,28,.9)]">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">
                  <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" /> <span className="min-w-0 break-words">Central APOIS</span>
                </div>
                <h1 className="mt-1 break-words text-[22px] font-black leading-tight tracking-[-0.035em]">Notificações</h1>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${unread > 0 ? "bg-[#F6BE1C] shadow-[0_0_14px_rgba(246,190,28,.9)]" : "bg-emerald-400"}`} aria-hidden="true" />
                  <p className="min-w-0 break-words text-[11px] font-semibold leading-4 text-zinc-500">
                    {unread === 0 ? "Tudo em dia" : `${unread} ${unread === 1 ? "não lida" : "não lidas"}`}
                  </p>
                </div>
              </div>
            </div>

            {items.length > 0 ? (
              <button
                type="button"
                disabled={busy || unread === 0}
                aria-busy={busy}
                onClick={() => void markAll()}
                className="press-scale flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-[#F6BE1C]/25 bg-[#F6BE1C]/10 px-3 py-2 text-center text-[10px] font-black leading-4 text-[#F6BE1C] shadow-[0_10px_26px_-18px_rgba(246,190,28,.9)] transition hover:bg-[#F6BE1C]/15 disabled:opacity-35 max-[339px]:w-full"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {busy ? "Atualizando..." : "Marcar todas como lidas"}
              </button>
            ) : null}
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-7 w-7 shrink-0 animate-spin text-[#F6BE1C]" aria-hidden="true" />
              <span>Carregando notificações...</span>
            </div>
          </div>
        ) : items.length === 0 ? (
          <section className="min-w-0 rounded-[30px] border border-white/[0.06] bg-[#0D0F11]/95 px-5 py-14 text-center shadow-[0_24px_70px_-42px_rgba(0,0,0,.95)] backdrop-blur-xl sm:px-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 text-[#F6BE1C] shadow-[0_12px_34px_-20px_rgba(246,190,28,.8)]">
              <Bell className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="mt-4 break-words text-sm font-black text-zinc-100">Nenhuma notificação</p>
            <p className="mx-auto mt-1 max-w-xs break-words text-[11px] font-medium leading-5 text-zinc-600">
              Avisos sobre corridas, pagamentos e segurança aparecerão aqui.
            </p>
          </section>
        ) : (
          <ul className="min-w-0 space-y-2.5" aria-label="Notificações do motorista">
            {items.map((item) => (
              <li
                key={item.id}
                className={`min-w-0 rounded-[24px] border p-4 shadow-[0_18px_46px_-34px_rgba(0,0,0,.98)] backdrop-blur-sm transition ${
                  item.read_at
                    ? "border-white/[0.06] bg-[#0D0F11]/95"
                    : "border-[#F6BE1C]/22 bg-gradient-to-br from-[#1B1607] via-[#111315] to-[#0D0F11] shadow-[0_20px_52px_-34px_rgba(246,190,28,.42)]"
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_at ? "bg-zinc-700" : "bg-[#F6BE1C] shadow-[0_0_12px_rgba(246,190,28,.75)]"}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[13px] font-black leading-5 text-white [overflow-wrap:anywhere]">{item.title}</p>
                    {item.body ? (
                      <p className="mt-1.5 break-words text-[11px] font-medium leading-5 text-zinc-500 [overflow-wrap:anywhere]">{item.body}</p>
                    ) : null}
                    <p className="mt-2 break-words text-[9px] font-bold leading-4 text-zinc-700">
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {!item.read_at ? (
                      <button
                        type="button"
                        onClick={() => void markRead(item.id)}
                        className="press-scale flex h-11 w-11 items-center justify-center rounded-xl border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 text-[#F6BE1C] transition hover:bg-[#F6BE1C]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F6BE1C]"
                        aria-label="Marcar notificação como lida"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="press-scale flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/10 bg-red-400/8 text-red-400 transition hover:bg-red-400/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      aria-label="Excluir notificação"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <ApoisDriverBottomNav />
    </div>
  );
}