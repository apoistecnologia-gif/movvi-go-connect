import { useEffect, useRef, useState } from "react";
import { Loader2, Phone, Plus, RefreshCw, Star, Trash2, UserPlus } from "lucide-react";
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

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function phoneDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function EmergencyContactsManager({ role }: { role: SafetyRole }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestRef = useRef(0);

  async function loadContacts(targetUserId: string, showLoading = true) {
    const normalizedUserId = cleanText(targetUserId, 128);
    if (!normalizedUserId) {
      setItems([]);
      setLoadError("Sessão inválida. Entre novamente para acessar os contatos de emergência.");
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const list = await listContacts(role, normalizedUserId);
      if (requestId !== requestRef.current) return;
      setItems(Array.isArray(list) ? list : []);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setItems([]);
      setLoadError("Não foi possível carregar seus contatos de emergência agora.");
      if (import.meta.env.DEV) console.warn("[APOIS Safety] falha ao listar contatos", error);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    requestRef.current += 1;
    setUserId(null);
    setItems([]);
    setLoadError(null);
    setActionError(null);
    setLoading(true);

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!alive) return;
        if (error) throw error;
        const nextUserId = cleanText(data?.user?.id, 128);
        if (!nextUserId) {
          setLoadError("Sua sessão expirou. Entre novamente para acessar os contatos de emergência.");
          setLoading(false);
          return;
        }
        setUserId(nextUserId);
        await loadContacts(nextUserId);
      } catch (error) {
        if (!alive) return;
        setLoadError("Não foi possível confirmar sua sessão agora. Tente novamente.");
        setLoading(false);
        if (import.meta.env.DEV) console.warn("[APOIS Safety] falha ao confirmar sessão", error);
      }
    })();

    return () => {
      alive = false;
      requestRef.current += 1;
    };
  }, [role]);

  async function refresh() {
    if (!userId || saving || busyId) return;
    await loadContacts(userId);
  }

  async function add() {
    if (!userId || saving || busyId) return;
    const nextName = cleanText(name, 60);
    const nextPhone = cleanText(phone, 24);
    const digits = phoneDigits(nextPhone);
    const nextRelation = cleanText(relation, 40);

    if (nextName.length < 2) {
      setActionError("Informe o nome do contato com pelo menos 2 caracteres.");
      return;
    }
    if (digits.length < 10 || digits.length > 13) {
      setActionError("Informe um telefone válido com DDD.");
      return;
    }

    setSaving(true);
    setActionError(null);
    try {
      await createContact(role, userId, {
        name: nextName,
        phone: nextPhone,
        relation: nextRelation || null,
        is_primary: items.length === 0,
      });
      setName("");
      setPhone("");
      setRelation("");
      await loadContacts(userId, false);
      toast.success("Contato adicionado.");
    } catch (error) {
      setActionError("Não foi possível salvar o contato. Revise os dados e tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Safety] falha ao salvar contato", error);
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary(id: string) {
    const contactId = cleanText(id, 128);
    if (!userId || !contactId || saving || busyId) return;
    setBusyId(contactId);
    setActionError(null);
    try {
      await setPrimaryContact(role, userId, contactId);
      await loadContacts(userId, false);
      toast.success("Contato principal atualizado.");
    } catch (error) {
      setActionError("Não foi possível alterar o contato principal. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Safety] falha ao definir contato principal", error);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, contactName: string) {
    const contactId = cleanText(id, 128);
    if (!userId || !contactId || saving || busyId) return;
    const confirmed = window.confirm(
      `Remover ${cleanText(contactName, 60) || "este contato"} dos contatos de emergência?`,
    );
    if (!confirmed) return;

    setBusyId(contactId);
    setActionError(null);
    try {
      await deleteContact(role, contactId);
      await loadContacts(userId, false);
      toast.success("Contato removido.");
    } catch (error) {
      setActionError("Não foi possível remover o contato. Tente novamente.");
      if (import.meta.env.DEV) console.warn("[APOIS Safety] falha ao remover contato", error);
    } finally {
      setBusyId(null);
    }
  }

  const formDisabled = saving || Boolean(busyId) || !userId;

  return (
    <div className="grid min-w-0 gap-4" aria-label="Contatos de emergência">
      <section className="min-w-0 rounded-2xl bg-card p-4 ring-1 ring-border" aria-labelledby="emergency-contact-add-title">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 id="emergency-contact-add-title" className="text-sm font-bold">
            Adicionar contato
          </h2>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium" htmlFor="emergency-contact-name">
            Nome
            <input
              id="emergency-contact-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value.slice(0, 60));
                setActionError(null);
              }}
              placeholder="Nome do contato"
              autoComplete="name"
              maxLength={60}
              disabled={formDisabled}
              className="min-h-11 rounded-xl bg-background/70 px-3 text-base ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium" htmlFor="emergency-contact-phone">
            Telefone
            <input
              id="emergency-contact-phone"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value.slice(0, 24));
                setActionError(null);
              }}
              placeholder="Telefone com DDD"
              inputMode="tel"
              autoComplete="tel"
              maxLength={24}
              disabled={formDisabled}
              aria-describedby="emergency-contact-phone-help"
              className="min-h-11 rounded-xl bg-background/70 px-3 text-base ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <span id="emergency-contact-phone-help" className="text-sm text-muted-foreground">
              Informe DDD e número. O formato será normalizado antes do uso no SOS.
            </span>
          </label>

          <label className="grid gap-1 text-sm font-medium" htmlFor="emergency-contact-relation">
            Relação com você
            <input
              id="emergency-contact-relation"
              value={relation}
              onChange={(event) => {
                setRelation(event.target.value.slice(0, 40));
                setActionError(null);
              }}
              placeholder="Mãe, cônjuge, amigo…"
              autoComplete="off"
              maxLength={40}
              disabled={formDisabled}
              className="min-h-11 rounded-xl bg-background/70 px-3 text-base ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>

          {actionError ? (
            <p className="break-words rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void add()}
            disabled={formDisabled}
            aria-busy={saving}
            className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Salvando…" : "Salvar contato"}
          </button>
        </div>
      </section>

      <section className="min-w-0 rounded-2xl bg-card p-4 ring-1 ring-border" aria-labelledby="emergency-contacts-list-title">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 id="emergency-contacts-list-title" className="min-w-0 flex-1 break-words text-sm font-bold">
            Contatos cadastrados
          </h2>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || saving || Boolean(busyId) || !userId}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Atualizar contatos de emergência"
            aria-busy={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Carregando contatos…
          </div>
        ) : loadError ? (
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3" role="alert">
            <p className="break-words text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => void refresh()}
              disabled={!userId}
            >
              Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-sm leading-6 text-muted-foreground">
            Nenhum contato cadastrado. Adicione ao menos um para agilizar o SOS.
          </p>
        ) : (
          <ul className="grid gap-2">
            {items.map((contact) => {
              const contactBusy = busyId === contact.id;
              return (
                <li
                  key={contact.id}
                  className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl bg-background/70 p-3 ring-1 ring-border sm:flex-nowrap"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/25" aria-hidden="true">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
                      <span className="min-w-0 break-words">{cleanText(contact.name, 60) || "Contato sem nome"}</span>
                      {contact.is_primary ? (
                        <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                          Principal
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 break-words text-sm text-muted-foreground">
                      {cleanText(contact.phone, 24) || "Telefone não informado"}
                      {cleanText(contact.relation, 40) ? ` · ${cleanText(contact.relation, 40)}` : ""}
                    </div>
                  </div>

                  <div className="ml-auto flex items-center gap-1">
                    {!contact.is_primary ? (
                      <button
                        type="button"
                        onClick={() => void makePrimary(contact.id)}
                        disabled={saving || Boolean(busyId)}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted/40 hover:text-yellow-400 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Marcar ${cleanText(contact.name, 60) || "contato"} como principal`}
                        aria-busy={contactBusy}
                      >
                        {contactBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        ) : (
                          <Star className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void remove(contact.id, contact.name)}
                      disabled={saving || Boolean(busyId)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-destructive/15 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Remover ${cleanText(contact.name, 60) || "contato"}`}
                      aria-busy={contactBusy}
                    >
                      {contactBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
