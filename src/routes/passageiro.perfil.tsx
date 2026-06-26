import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MovviHeader } from "@/components/MovviHeader";
import { BottomNav, PASSENGER_NAV, DRIVER_NAV } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Lock } from "lucide-react";

export const Route = createFileRoute("/passageiro/perfil")({
  head: () => ({ meta: [{ title: "Perfil — MOVVI DRIVE" }] }),
  component: PerfilPassageiro,
});

function PerfilPassageiro() {
  return (
    <ProfilePage
      role="passenger"
      title="Meu perfil"
      description="Atualize seus dados pessoais e segurança."
    />
  );
}

/** Reaproveitado também por /motorista/perfil */
export function ProfilePage({
  role,
  title,
  description,
}: {
  role: "passenger" | "driver";
  title: string;
  description: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        const meta = (u.user_metadata ?? {}) as Record<string, string>;
        setEmail(u.email ?? "");
        setFullName(meta.full_name ?? meta.name ?? "");
        setPhone(meta.phone ?? u.phone ?? "");
        setCity(meta.city ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const updates: { data: Record<string, string>; password?: string } = {
        data: { full_name: fullName, phone, city },
      };
      if (newPassword) updates.password = newPassword;
      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      setMsg({ kind: "ok", text: "Perfil atualizado com sucesso!" });
      setNewPassword("");
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  const nav = role === "passenger" ? PASSENGER_NAV : DRIVER_NAV;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MovviHeader logoutRedirect="/" />

      <main className="flex-1 px-4 py-6 pb-24">
        <div className="container mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil...
                </div>
              ) : (
                <form onSubmit={onSave} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input value={email} disabled />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name">Nome completo</Label>
                    <Input
                      id="full_name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Como devemos te chamar"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="city">Cidade</Label>
                      <Input
                        id="city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Sua cidade"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-lg border border-border bg-card/50 p-3">
                    <Label htmlFor="new_password" className="flex items-center gap-1.5 text-sm">
                      <Lock className="h-3.5 w-3.5" /> Nova senha (opcional)
                    </Label>
                    <Input
                      id="new_password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Deixe em branco para não alterar"
                      minLength={6}
                    />
                  </div>

                  {msg && (
                    <div
                      className={`rounded-lg px-3 py-2 text-sm ${
                        msg.kind === "ok"
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}

                  <Button type="submit" disabled={saving} className="w-full">
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar alterações
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Foto de perfil disponível em breve.
          </p>
        </div>
      </main>

      {nav && <BottomNav items={nav} />}
    </div>
  );
}
