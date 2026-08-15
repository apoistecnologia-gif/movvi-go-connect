import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, Copy, CheckCircle2, XCircle, CreditCard, KeyRound, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { DSButton, DSCard, DSCardContent, DSCardDescription, DSCardHeader, DSCardTitle, DSInput, DSSelect, DSSelectContent, DSSelectItem, DSSelectTrigger, DSSelectValue, Loading } from "@/design-system";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { logAdminAction } from "@/lib/adminAudit";

export const Route = createFileRoute("/admin/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Admin APOIS" }] }),
  component: AdminPaymentsPage,
});

type Gateway = {
  id: string;
  provider: string;
  display_name: string;
  enabled: boolean;
  mode: "sandbox" | "live";
  api_key_secret_name: string | null;
  webhook_url: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
};

function AdminPaymentsPage() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function refresh() {
    const { data, error } = await supabase
      .from("payment_gateways")
      .select("*")
      .order("display_name");
    if (error) toast.error(error.message);
    setGateways((data ?? []) as Gateway[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("admin-payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_gateways" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  function patch(id: string, p: Partial<Gateway>) {
    setGateways((gs) => gs.map((g) => (g.id === id ? { ...g, ...p } : g)));
  }

  async function save(g: Gateway) {
    setSavingId(g.id);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("payment_gateways")
      .update({
        enabled: g.enabled,
        mode: g.mode,
        api_key_secret_name: g.api_key_secret_name,
        webhook_url: g.webhook_url,
        pix_key: g.pix_key,
        pix_key_type: g.pix_key_type,
        updated_by: u?.user?.id ?? null,
      })
      .eq("id", g.id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    await logAdminAction({ action: "payment_gateway.update", entity: "payment_gateways", entity_id: g.id, after: { enabled: g.enabled, mode: g.mode } });
    toast.success(`${g.display_name} atualizado`);
  }

  function copyWebhook(url: string) {
    navigator.clipboard.writeText(url).then(() => toast.success("Webhook copiado"));
  }

  if (loading) {
    return (
      <AdminLayout title="Pagamentos">
        <Loading label="Carregando gateways de pagamento..." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Pagamentos"
      description="Conecte gateways, defina chave PIX e webhooks. Credenciais ficam protegidas em secrets."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {gateways.map((g) => {
          const isActive = g.enabled && !!g.api_key_secret_name;
          return (
            <DSCard key={g.id} className="border-border bg-card/60">
              <DSCardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="space-y-1">
                  <DSCardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4 text-primary" />
                    {g.display_name}
                  </DSCardTitle>
                  <DSCardDescription className="text-xs">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <CheckCircle2 className="h-3 w-3" /> Conectado em modo {g.mode}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <XCircle className="h-3 w-3" /> Não configurado
                      </span>
                    )}
                  </DSCardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={g.enabled} onCheckedChange={(v) => patch(g.id, { enabled: v })} />
                  <DSButton size="sm" onClick={() => save(g)} disabled={savingId === g.id} className="gap-1">
                    {savingId === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar
                  </DSButton>
                </div>
              </DSCardHeader>
              <DSCardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Modo</span>
                    <DSSelect value={g.mode} onValueChange={(v) => patch(g.id, { mode: v as Gateway["mode"] })}>
                      <DSSelectTrigger className="h-9">
                        <DSSelectValue />
                      </DSSelectTrigger>
                      <DSSelectContent>
                        <DSSelectItem value="sandbox">Sandbox (teste)</DSSelectItem>
                        <DSSelectItem value="live">Produção</DSSelectItem>
                      </DSSelectContent>
                    </DSSelect>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <KeyRound className="mr-1 inline h-3 w-3" /> Nome da secret da API key
                    </span>
                    <DSInput
                      placeholder={`${g.provider.toUpperCase()}_API_KEY`}
                      value={g.api_key_secret_name ?? ""}
                      onChange={(e) => patch(g.id, { api_key_secret_name: e.target.value })}
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">URL do webhook</span>
                  <div className="flex gap-1">
                    <DSInput
                      placeholder="https://seu-projeto.lovable.app/api/public/webhooks/..."
                      value={g.webhook_url ?? ""}
                      onChange={(e) => patch(g.id, { webhook_url: e.target.value })}
                    />
                    {g.webhook_url && (
                      <DSButton variant="outline" size="icon" aria-label="Copiar URL do webhook" onClick={() => copyWebhook(g.webhook_url!)}>
                        <Copy className="h-3.5 w-3.5" />
                      </DSButton>
                    )}
                  </div>
                </label>

                {g.provider === "mercadopago" || g.provider === "asaas" || g.provider === "pagseguro" ? (
                  <div className="grid grid-cols-3 gap-3">
                    <label className="col-span-2 flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Chave PIX</span>
                      <DSInput
                        placeholder="email, CPF, telefone ou chave aleatória"
                        value={g.pix_key ?? ""}
                        onChange={(e) => patch(g.id, { pix_key: e.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</span>
                      <DSSelect value={g.pix_key_type ?? "random"} onValueChange={(v) => patch(g.id, { pix_key_type: v })}>
                        <DSSelectTrigger className="h-9">
                          <DSSelectValue />
                        </DSSelectTrigger>
                        <DSSelectContent>
                          <DSSelectItem value="cpf">CPF</DSSelectItem>
                          <DSSelectItem value="cnpj">CNPJ</DSSelectItem>
                          <DSSelectItem value="email">E-mail</DSSelectItem>
                          <DSSelectItem value="phone">Telefone</DSSelectItem>
                          <DSSelectItem value="random">Aleatória</DSSelectItem>
                        </DSSelectContent>
                      </DSSelect>
                    </label>
                  </div>
                ) : null}

                <span className="inline-flex items-center gap-1 self-start rounded-full border border-border bg-muted/30 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  Provider: <span className="font-mono">{g.provider}</span>
                </span>
              </DSCardContent>
            </DSCard>
          );
        })}
      </div>
    </AdminLayout>
  );
}
