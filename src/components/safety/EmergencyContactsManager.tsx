import { useEffect, useState } from "react";
import { Loader2, Phone, Plus, Star, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createContact,
  deleteContact,
  listContacts,
  setPrimaryContact,
  type EmergencyContact,
  type SafetyRole,
} from "@/lib/safety/emergencyContacts";

export function EmergencyContactsManager({ role }: { role: SafetyRole }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) return;
      setUserId(data.user.id);
      try {
        const list = await listContacts(role, data.user.id);
        setItems(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [role]);

  async function refresh() {
    if (!userId) return;
    setItems(await listContacts(role, userId));
  }

  async function add() {
    if (!userId) return;
    if (!name.trim() || !phone.trim()) {
      toast.error("Preencha nome e telefone");
      return;
    }
    setSaving(true);
    try {
      await createContact(role, userId, {
        name,
        phone,
        relation: relation || null,
        is_primary: items.length === 0,
      });
      setName("");
      setPhone("");
      setRelation("");
      await refresh();
      toast.success("Contato adicionado");
    } catch (e) {
      toast.error((e as Error).message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary(id: string) {
    if (!userId) return;
    try {
      await setPrimaryContact(role, userId, id);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await deleteContact(role, id);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <div className="text-[13px] font-bold">Adicionar contato</div>
        </div>
        <div className="grid gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="Nome"
            className="rounded-xl bg-background/70 px-3 py-2.5 text-[13px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.slice(0, 20))}
            placeholder="Telefone com DDD"
            inputMode="tel"
            className="rounded-xl bg-background/70 px-3 py-2.5 text-[13px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            value={relation}
            onChange={(e) => setRelation(e.target.value.slice(0, 40))}
            placeholder="Parentesco (mãe, cônjuge, amigo...)"
            className="rounded-xl bg-background/70 px-3 py-2.5 text-[13px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={add}
            disabled={saving}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[13px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Salvar contato
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
        <div className="mb-2 text-[13px] font-bold">Contatos cadastrados</div>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted-foreground">
            Nenhum contato cadastrado. Adicione ao menos um para agilizar o SOS.
          </p>
        ) : (
          <ul className="grid gap-2">
            {items.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl bg-background/70 p-3 ring-1 ring-border"
              >
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/25">
                  <Phone className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">
                    {c.name}
                    {c.is_primary && (
                      <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Principal
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    {c.phone}
                    {c.relation ? ` · ${c.relation}` : ""}
                  </div>
                </div>
                {!c.is_primary && (
                  <button
                    onClick={() => makePrimary(c.id)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted/40 hover:text-yellow-400"
                    aria-label="Marcar como principal"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => remove(c.id)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
