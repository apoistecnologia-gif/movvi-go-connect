import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient, type Session } from "@supabase/supabase-js";
import { Geolocation } from "@capacitor/geolocation";
import "./apois-driver-homologation.css";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
if (!supabaseUrl || !supabaseKey) throw new Error("APOIS_DRIVER_CONFIGURATION_MISSING");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

type DriverProfile = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  approval_status: string;
  subscription_status: string | null;
  is_online: boolean;
  current_lat: number | string | null;
  current_lng: number | string | null;
};

type Ride = {
  id: string;
  passenger_id: string;
  status: string;
  category: string;
  origin_name: string;
  destination_name: string;
  estimated_price: number | string;
  payment_method: string;
  candidate_driver_ids: string[] | null;
  accepted_driver_id: string | null;
  request_expires_at: string | null;
  security_code: string | null;
};

type Position = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
};

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return `R$ ${Number.isFinite(amount) ? amount.toFixed(2).replace(".", ",") : "0,00"}`;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error)
    return String((error as { message?: unknown }).message ?? "Erro inesperado");
  return String(error ?? "Erro inesperado");
}

function normalizeRpcError(error: unknown) {
  const raw = messageOf(error);
  if (raw.includes("driver_not_approved")) return "Seu cadastro ainda não foi aprovado.";
  if (raw.includes("driver_subscription_inactive"))
    return "Sua mensalidade não permite ficar online.";
  if (raw.includes("driver_profile_missing")) return "Cadastro de motorista não encontrado.";
  if (raw.includes("ride_offer_unavailable")) return "Essa oferta não está mais disponível.";
  if (raw.includes("invalid_security_code_or_transition"))
    return "PIN incorreto ou status da corrida mudou.";
  if (raw.includes("invalid_ride_transition"))
    return "Essa ação não está disponível no status atual da corrida.";
  return raw;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [offer, setOffer] = useState<Ride | null>(null);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [category, setCategory] = useState("carros");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const watchIdRef = useRef<string | null>(null);
  const lastPresenceUpdateRef = useRef(0);

  const loadProfile = useCallback(async () => {
    setProfileLoaded(false);
    const { data, error: rpcError } = await supabase.rpc("driver_get_profile");
    if (rpcError) throw rpcError;
    setProfile((data as DriverProfile | null) ?? null);
    setProfileLoaded(true);
  }, []);

  const refreshRides = useCallback(async (profileId: string) => {
    const active = await supabase
      .from("rides")
      .select(
        "id,passenger_id,status,category,origin_name,destination_name,estimated_price,payment_method,candidate_driver_ids,accepted_driver_id,request_expires_at,security_code",
      )
      .eq("accepted_driver_id", profileId)
      .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active.error) throw active.error;
    const activeRow = (active.data as Ride | null) ?? null;
    setActiveRide(activeRow);

    if (activeRow) {
      setOffer(null);
      return;
    }

    const pending = await supabase
      .from("rides")
      .select(
        "id,passenger_id,status,category,origin_name,destination_name,estimated_price,payment_method,candidate_driver_ids,accepted_driver_id,request_expires_at,security_code",
      )
      .contains("candidate_driver_ids", [profileId])
      .eq("status", "procurar_motorista")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pending.error) throw pending.error;
    const pendingRow = (pending.data as Ride | null) ?? null;
    if (
      pendingRow?.request_expires_at &&
      new Date(pendingRow.request_expires_at).getTime() <= Date.now()
    ) {
      setOffer(null);
    } else {
      setOffer(pendingRow);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setProfileLoaded(false);
        setOffer(null);
        setActiveRide(null);
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    setError(null);
    void loadProfile().catch((caught) => {
      setProfileLoaded(true);
      setError(normalizeRpcError(caught));
    });
  }, [loadProfile, session]);

  useEffect(() => {
    if (!profile?.user_id) return;
    let cancelled = false;
    const reload = () => {
      void refreshRides(profile.user_id).catch((caught) => {
        if (!cancelled) setError(normalizeRpcError(caught));
      });
    };
    reload();

    const channel = supabase
      .channel(`apois-driver-homologation-${profile.user_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, reload)
      .subscribe();

    const interval = window.setInterval(reload, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [profile?.user_id, refreshRides]);

  const stopLocationWatch = useCallback(async () => {
    const id = watchIdRef.current;
    watchIdRef.current = null;
    if (id) {
      try {
        await Geolocation.clearWatch({ id });
      } catch {
        /* noop */
      }
    }
  }, []);

  useEffect(
    () => () => {
      void stopLocationWatch();
    },
    [stopLocationWatch],
  );

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (loginError) throw loginError;
    } catch (caught) {
      setError(
        messageOf(caught).toLowerCase().includes("invalid login")
          ? "E-mail ou senha inválidos."
          : messageOf(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await stopLocationWatch();
      if (profile?.is_online) await supabase.rpc("driver_set_presence", { _online: false });
      await supabase.auth.signOut();
    } catch (caught) {
      setError(normalizeRpcError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function bootstrap(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: rpcError } = await supabase.rpc("driver_bootstrap_profile", {
        _category: category,
        _vehicle_model: vehicleModel,
        _vehicle_plate: vehiclePlate,
        _vehicle_color: vehicleColor,
      });
      if (rpcError) throw rpcError;
      await loadProfile();
      setInfo("Cadastro de motorista criado. Agora ele precisa ser aprovado para ficar online.");
    } catch (caught) {
      setError(normalizeRpcError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function readPosition(): Promise<Position> {
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== "granted")
      permission = await Geolocation.requestPermissions({
        permissions: ["location"],
      });
    if (permission.location !== "granted")
      throw new Error("Permita o acesso à localização para ficar online.");
    const current = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 5_000,
    });
    return {
      lat: current.coords.latitude,
      lng: current.coords.longitude,
      heading: Number.isFinite(current.coords.heading) ? current.coords.heading : null,
      speed: Number.isFinite(current.coords.speed) ? current.coords.speed : null,
    };
  }

  async function publishPresence(next: Position, online = true) {
    const { data, error: rpcError } = await supabase.rpc("driver_set_presence", {
      _online: online,
      _lat: next.lat,
      _lng: next.lng,
      _heading: next.heading,
      _speed: next.speed,
    });
    if (rpcError) throw rpcError;
    setPosition(next);
    if (data) setProfile(data as DriverProfile);
  }

  async function goOnline() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const current = await readPosition();
      await publishPresence(current, true);
      await stopLocationWatch();
      watchIdRef.current = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
        (next, watchError) => {
          if (watchError || !next) return;
          const now = Date.now();
          if (now - lastPresenceUpdateRef.current < 8_000) return;
          lastPresenceUpdateRef.current = now;
          const point: Position = {
            lat: next.coords.latitude,
            lng: next.coords.longitude,
            heading: Number.isFinite(next.coords.heading) ? next.coords.heading : null,
            speed: Number.isFinite(next.coords.speed) ? next.coords.speed : null,
          };
          void publishPresence(point, true).catch((caught) => setError(normalizeRpcError(caught)));
        },
      );
      setInfo("Você está online. Novas corridas elegíveis aparecerão automaticamente.");
      if (profile?.user_id) await refreshRides(profile.user_id);
    } catch (caught) {
      setError(normalizeRpcError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function goOffline() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await stopLocationWatch();
      const { data, error: rpcError } = await supabase.rpc("driver_set_presence", {
        _online: false,
      });
      if (rpcError) throw rpcError;
      if (data) setProfile(data as DriverProfile);
      setOffer(null);
      setInfo("Você está offline.");
    } catch (caught) {
      setError(normalizeRpcError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function rideRpc(name: string, params: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(name, params);
      if (rpcError) throw rpcError;
      if (profile?.user_id) await refreshRides(profile.user_id);
      return data as Ride | null;
    } catch (caught) {
      setError(normalizeRpcError(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (authLoading)
    return (
      <Screen>
        <Card>
          <div className="eyebrow">APOIS Motorista</div>
          <h1 className="title">Carregando...</h1>
        </Card>
      </Screen>
    );

  if (!session) {
    return (
      <Screen>
        <Brand />
        <Card>
          <div className="eyebrow">Homologação técnica</div>
          <h1 className="title">Entrar como motorista</h1>
          <p className="subtitle">Este APK está ligado diretamente ao Supabase oficial da APOIS.</p>
          <form onSubmit={login}>
            <Field label="E-mail">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Senha">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            {error ? <Alert error>{error}</Alert> : null}
            <Button busy={busy}>Entrar</Button>
          </form>
        </Card>
      </Screen>
    );
  }

  if (!profileLoaded)
    return (
      <Screen>
        <Brand />
        <Card>
          <div className="eyebrow">Conta encontrada</div>
          <h1 className="title">Carregando perfil...</h1>
        </Card>
      </Screen>
    );

  if (!profile) {
    return (
      <Screen>
        <Brand />
        <Card>
          <div className="eyebrow">Primeiro acesso</div>
          <h1 className="title">Criar perfil de motorista</h1>
          <p className="subtitle">
            Informe somente os dados mínimos para a homologação. O cadastro será criado como
            pendente e não ficará online sem aprovação.
          </p>
          <form onSubmit={bootstrap}>
            <Field label="Categoria">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="carros">Carros</option>
                <option value="motos">Motos</option>
                <option value="fretes">Fretes e mudanças</option>
                <option value="guincho">Guincho</option>
                <option value="envios">Envios</option>
              </select>
            </Field>
            <Field label="Modelo do veículo">
              <input
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                required
              />
            </Field>
            <Field label="Placa">
              <input
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                required
              />
            </Field>
            <Field label="Cor">
              <input
                value={vehicleColor}
                onChange={(e) => setVehicleColor(e.target.value)}
                required
              />
            </Field>
            {error ? <Alert error>{error}</Alert> : null}
            <Button busy={busy}>Criar cadastro</Button>
          </form>
          <div style={{ height: 10 }} />
          <button className="button ghost" onClick={logout} disabled={busy}>
            Sair
          </button>
        </Card>
      </Screen>
    );
  }

  const approved = profile.approval_status === "aprovado";
  const online = Boolean(profile.is_online);

  return (
    <Screen>
      <Brand />
      <Card>
        <div className="row">
          <div>
            <div className="eyebrow">Motorista</div>
            <h1 className="title" style={{ fontSize: 24, marginBottom: 4 }}>
              {profile.name || "APOIS"}
            </h1>
            <div className="muted">
              {profile.vehicle_model || "Veículo"} • {profile.vehicle_plate || "sem placa"}
            </div>
          </div>
          <span
            className={`status ${approved ? (online ? "ok" : "off") : "warn"}`}
          >
            {approved
              ? online
                ? "Online"
                : "Offline"
              : profile.approval_status}
          </span>
        </div>
        {error ? <Alert error>{error}</Alert> : null}
        {info ? <Alert>{info}</Alert> : null}
        {!approved ? (
          <>
            <p className="subtitle" style={{ marginTop: 16 }}>
              Seu cadastro existe no banco oficial, mas ainda precisa ser
              aprovado antes de receber corridas.
            </p>
            <button
              className="button secondary"
              onClick={() => void loadProfile()}
              disabled={busy}
            >
              Verificar novamente
            </button>
          </>
        ) : activeRide ? (
          <ActiveRideCard
            ride={activeRide}
            pin={pin}
            setPin={setPin}
            busy={busy}
            action={rideRpc}
          />
        ) : offer ? (
          <OfferCard ride={offer} busy={busy} action={rideRpc} />
        ) : (
          <>
            <div className="grid2" style={{ marginTop: 16 }}>
              <div className="metric">
                <span>Categoria</span>
                <strong>{profile.category || "—"}</strong>
              </div>
              <div className="metric">
                <span>Localização</span>
                <strong>
                  {position
                    ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
                    : "Aguardando GPS"}
                </strong>
              </div>
            </div>
            <div style={{ height: 12 }} />
            {online ? (
              <button
                className="button secondary"
                onClick={goOffline}
                disabled={busy}
              >
                Ficar offline
              </button>
            ) : (
              <Button busy={busy} onClick={goOnline}>
                Ficar online
              </Button>
            )}
            {online ? (
              <p className="muted" style={{ textAlign: "center", marginTop: 12 }}>
                Buscando corridas elegíveis automaticamente…
              </p>
            ) : null}
          </>
        )}
        <div style={{ height: 10 }} />
        <button className="button ghost" onClick={logout} disabled={busy}>
          Sair desta conta
        </button>
      </Card>
      <p className="muted" style={{ textAlign: "center" }}>
        Build técnico de homologação • não é a interface visual final do
        motorista.
      </p>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="app">
      <div className="shell">{children}</div>
    </main>
  );
}
function Brand() {
  return (
    <div className="brand">
      <div className="brandMark">A</div>
      <div className="brandText">
        <strong>APOIS MOTORISTA</strong>
        <span>Apois, vamos?</span>
      </div>
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return <section className="card">{children}</section>;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
function Alert({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return <div className={`alert ${error ? "error" : "info"}`}>{children}</div>;
}
function Button({
  children,
  busy,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  onClick?: () => void | Promise<void>;
}) {
  return (
    <button
      className="button"
      type={onClick ? "button" : "submit"}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}

function RouteSummary({ ride }: { ride: Ride }) {
  return (
    <div className="rideRoute">
      <div className="ridePoint">
        <span className="dot" />
        <div>
          <small>Embarque</small>
          <p>{ride.origin_name}</p>
        </div>
      </div>
      <div className="ridePoint">
        <span className="dot dest" />
        <div>
          <small>Destino</small>
          <p>{ride.destination_name}</p>
        </div>
      </div>
    </div>
  );
}

function OfferCard({
  ride,
  busy,
  action,
}: {
  ride: Ride;
  busy: boolean;
  action: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<Ride | null>;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="eyebrow">Nova corrida</div>
      <h2 className="title" style={{ fontSize: 25 }}>
        Corrida disponível
      </h2>
      <RouteSummary ride={ride} />
      <div className="grid2">
        <div className="metric">
          <span>Estimativa</span>
          <strong>{money(ride.estimated_price)}</strong>
        </div>
        <div className="metric">
          <span>Pagamento</span>
          <strong>{ride.payment_method.toUpperCase()}</strong>
        </div>
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void action("driver_accept_ride", { _ride_id: ride.id })
          }
        >
          Aceitar corrida
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={() =>
            void action("driver_reject_ride", { _ride_id: ride.id })
          }
        >
          Recusar
        </button>
      </div>
    </div>
  );
}

function ActiveRideCard({
  ride,
  pin,
  setPin,
  busy,
  action,
}: {
  ride: Ride;
  pin: string;
  setPin: (value: string) => void;
  busy: boolean;
  action: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<Ride | null>;
}) {
  const statusLabel: Record<string, string> = {
    motorista_a_caminho: "A caminho do passageiro",
    motorista_chegou: "No local de embarque",
    em_viagem: "Corrida em andamento",
  };
  return (
    <div style={{ marginTop: 18 }}>
      <div className="eyebrow">Corrida ativa</div>
      <h2 className="title" style={{ fontSize: 25 }}>
        {statusLabel[ride.status] || ride.status}
      </h2>
      <RouteSummary ride={ride} />
      <div className="grid2">
        <div className="metric">
          <span>Valor</span>
          <strong>{money(ride.estimated_price)}</strong>
        </div>
        <div className="metric">
          <span>Pagamento</span>
          <strong>{ride.payment_method.toUpperCase()}</strong>
        </div>
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        {ride.status === "motorista_a_caminho" ? (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void action("driver_mark_arrived", { _ride_id: ride.id })
            }
          >
            Cheguei ao embarque
          </button>
        ) : null}
        {ride.status === "motorista_chegou" ? (
          <>
            <div className="field">
              <label>PIN informado pelo passageiro</label>
              <div className="pin">
                <input
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
            </div>
            <button
              className="button"
              disabled={busy || pin.length !== 4}
              onClick={() =>
                void action("driver_start_ride", {
                  _ride_id: ride.id,
                  _security_code: pin,
                })
              }
            >
              Iniciar corrida
            </button>
          </>
        ) : null}
        {ride.status === "em_viagem" ? (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void action("driver_finish_ride", { _ride_id: ride.id })
            }
          >
            Finalizar corrida
          </button>
        ) : null}
        {ride.status !== "em_viagem" ? (
          <button
            className="button danger"
            disabled={busy}
            onClick={() =>
              void action("driver_cancel_ride", {
                _ride_id: ride.id,
                _reason: "Cancelada pelo motorista",
              })
            }
          >
            Cancelar corrida
          </button>
        ) : null}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
