import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { MovviHeader } from "@/components/MovviHeader";
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
    <div className="min-h-[100dvh] bg-[#050607] text-white">
      <MovviHeader logoutRedirect="/" />

      <main className="mx-auto w-full max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-5">
        <section className="mb-5 rounded-[26px] border border-white/5 bg-[#0D0F11] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F6BE1C]/10 text-[#F6BE1C]">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#F6BE1C]">Central APOIS</p>
                <h1 className="mt-1 text-xl font-black tracking-tight">Notificações</h1>
                <p className="mt-1 text-[11px] font-medium text-zinc-500">
                  {unread === 0 ? "Tudo em dia" : `${unread} ${unread === 1 ? "não lida" : "não lidas"}`}
                </p>
              </div>
            </div>

            {items.length > 0 ? (
              <button
                type="button"
                disabled={busy || unread === 0}
                onClick={() => void markAll()}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-[#F6BE1C]/20 bg-[#F6BE1C]/10 px-3 text-[10px] font-black text-[#F6BE1C] disabled:opacity-35"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                Ler todas
              </button>
            ) : null}
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-[45vh] items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#F6BE1C]" />
          </div>
        ) : items.length === 0 ? (
          <section className="rounded-[26px] border border-white/5 bg-[#0D0F11] px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6BE1C]/10 text-[#F6BE1C]">
              <Bell className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-black text-zinc-200">Nenhuma notificação</p>
            <p className="mx-auto mt-1 max-w-xs text-[11px] font-medium leading-5 text-zinc-600">
              Avisos sobre corridas, pagamentos e segurança aparecerão aqui.
            </p>
          </section>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li
                key={item.id}
                className={`rounded-[22px] border p-4 transition ${
                  item.read_at
                    ? "border-white/5 bg-[#0D0F11]"
                    : "border-[#F6BE1C]/18 bg-[#F6BE1C]/[0.06]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_at ? "bg-zinc-700" : "bg-[#F6BE1C]"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black leading-snug text-white">{item.title}</p>
                    {item.body ? (
                      <p className="mt-1.5 text-[11px] font-medium leading-5 text-zinc-500">{item.body}</p>
                    ) : null}
                    <p className="mt-2 text-[9px] font-bold text-zinc-700">
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {!item.read_at ? (
                      <button
                        type="button"
                        onClick={() => void markRead(item.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6BE1C]/10 text-[#F6BE1C] active:scale-95"
                        aria-label="Marcar como lida"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-400/8 text-red-400 active:scale-95"
                      aria-label="Excluir notificação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
