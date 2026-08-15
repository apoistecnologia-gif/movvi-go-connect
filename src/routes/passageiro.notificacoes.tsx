import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { SettingsPageShell, SettingsHero } from "@/components/settings";
import { PASSENGER_NAV } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DSButton } from "@/design-system";

type Notif = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  read_at: string | null;
  created_at: string;
};

function PassengerInboxPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("notification_inbox")
      .select("id,title,body,category,read_at,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Notif[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.auth.getUser();
      if (!a?.user) { navigate({ to: "/passageiro/login" }); return; }
      setUserId(a.user.id);
      await load(a.user.id);
    })();
  }, [navigate, load]);

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
    await load(userId);
    toast.success("Todas marcadas como lidas.");
  }
  async function remove(id: string) {
    await supabase.from("notification_inbox").delete().eq("id", id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  const unread = items.filter((i) => !i.read_at).length;

  return (
    <SettingsPageShell nav={PASSENGER_NAV}>
      <SettingsHero
        icon={Bell}
        title="Notificações"
        subtitle={`${unread} não ${unread === 1 ? "lida" : "lidas"}`}
        action={
          items.length > 0 ? (
            <DSButton variant="outline" size="sm" onClick={markAll}>
              <Check className="mr-1 h-3.5 w-3.5" /> Marcar todas
            </DSButton>
          ) : undefined
        }
      />

      {loading ? (
        <ul className="space-y-2.5" aria-busy="true" aria-label="Carregando notificações">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="rounded-[24px] bg-white p-4 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5"
            >
              <div className="space-y-2">
                <div className="h-3.5 w-2/5 animate-pulse rounded bg-[#F1F5F1]" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-[#F1F5F1]" />
                <div className="h-2.5 w-1/4 animate-pulse rounded bg-[#F1F5F1]" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[24px] bg-white px-6 py-14 text-center shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#76C139]/10 text-[#5A9A2A]">
            <Bell className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <p className="text-[15px] font-semibold text-[#1B1B1B]">Tudo em dia</p>
          <p className="mt-1 max-w-xs text-[12.5px] text-[#707070]">
            Você não tem novas notificações. Avisos sobre corridas, promoções e atualizações aparecem aqui.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((n, i) => (
            <li
              key={n.id}
              className={`animate-fade-in rounded-[24px] p-4 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.12)] ring-1 ring-black/5 transition ${
                n.read_at ? "bg-white" : "bg-[#F3FBEA]"
              }`}
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug text-[#1B1B1B]">{n.title}</p>
                  {n.body && <p className="mt-1 text-[12.5px] leading-relaxed text-[#707070]">{n.body}</p>}
                  <p className="mt-1.5 text-[11px] text-[#94A3B8]">
                    {new Date(n.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  {!n.read_at && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-[#5A9A2A] transition hover:bg-[#76C139]/10 active:scale-95"
                      aria-label="Marcar como lida"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => remove(n.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-[#DC2626] transition hover:bg-[#FEE2E2] active:scale-95"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsPageShell>
  );
}

export const Route = createFileRoute("/passageiro/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — APOIS" }] }),
  component: PassengerInboxPage,
});
