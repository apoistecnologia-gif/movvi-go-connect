import { supabase } from "@/integrations/supabase/client";

type DriverRidePushEvent =
  | "ride.accepted"
  | "ride.driver_arrived"
  | "ride.started"
  | "ride.completed"
  | "ride.cancelled";

type RpcError = { message: string };
type RpcResult = { data: unknown; error: RpcError | null };
type DynamicRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

const rpcClient = supabase as unknown as DynamicRpcClient;

function readableDriverRpcError(message: string) {
  const raw = String(message ?? "");
  if (/ride_offer_unavailable/i.test(raw)) return "Esta corrida não está mais disponível.";
  if (/driver_not_approved/i.test(raw)) return "Seu cadastro ainda não está aprovado.";
  if (/driver_subscription_inactive/i.test(raw)) return "Sua mensalidade precisa estar ativa para receber corridas.";
  if (/driver_offline/i.test(raw)) return "Fique online antes de aceitar a corrida.";
  if (/invalid_security_code_or_transition/i.test(raw)) return "Código incorreto. Peça o PIN ao passageiro e tente novamente.";
  if (/invalid_ride_transition/i.test(raw)) return "Esta ação não está disponível nesta etapa da corrida.";
  if (/driver_cancel_reason_required/i.test(raw)) return "Escolha ou informe o motivo do cancelamento.";
  if (/rating_unavailable/i.test(raw)) return "Esta corrida já foi avaliada ou ainda não pode ser avaliada.";
  if (/driver_profile_missing/i.test(raw)) return "Cadastro de motorista não encontrado.";
  return raw || "Não foi possível concluir a ação.";
}

async function callRpc<T = unknown>(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw new Error(readableDriverRpcError(error.message));
  return data as T;
}

/**
 * Push é complementar ao realtime. A ação da corrida nunca deve voltar a falhar
 * só porque o aparelho do passageiro está sem token ou o FCM está indisponível.
 */
function notifyPassenger(rideId: string, event: DriverRidePushEvent) {
  void supabase.functions
    .invoke("send-ride-push", {
      body: {
        event,
        ride_id: rideId,
      },
    })
    .then(({ error }) => {
      if (error) console.warn(`[APOIS MOTORISTA] push ${event} não enviado:`, error.message);
    })
    .catch((error) => {
      console.warn(`[APOIS MOTORISTA] push ${event} indisponível:`, error);
    });
}

export async function aceitarCorridaMobile({ data }: { data: { rideId: string } }) {
  const ride = await callRpc("driver_accept_ride", { _ride_id: data.rideId });
  notifyPassenger(data.rideId, "ride.accepted");
  return ride;
}

export async function recusarCorridaMobile({ data }: { data: { rideId: string } }) {
  return callRpc("driver_reject_ride", { _ride_id: data.rideId });
}

export async function informarChegadaMobile({ data }: { data: { rideId: string } }) {
  const ride = await callRpc("driver_mark_arrived", { _ride_id: data.rideId });
  notifyPassenger(data.rideId, "ride.driver_arrived");
  return ride;
}

export async function iniciarCorridaMobile({ data }: { data: { rideId: string; safety_code: string } }) {
  const ride = await callRpc("driver_start_ride", {
    _ride_id: data.rideId,
    _security_code: data.safety_code,
  });
  notifyPassenger(data.rideId, "ride.started");
  return ride;
}

/**
 * O motorista apenas sinaliza que a viagem terminou. O backend canônico é o
 * único responsável por definir final_price, settlement e efeitos financeiros.
 */
export async function finalizarCorridaMobile({ data }: { data: { rideId: string } }) {
  const ride = await callRpc("driver_finish_ride", { _ride_id: data.rideId });
  notifyPassenger(data.rideId, "ride.completed");
  return ride;
}

/**
 * Cancelamento do Motorista volta a corrida ao dispatch canônico. Não enviamos
 * `ride.cancelled` ao Passageiro aqui porque a corrida não termina: o Realtime
 * passa a refletir a nova busca/redispatch sem comunicar um estado falso.
 */
export async function cancelarPeloMotoristaMobile({ data }: { data: { rideId: string; motivo?: string } }) {
  return callRpc("driver_cancel_ride", {
    _ride_id: data.rideId,
    _reason: data.motivo ?? null,
  });
}

export async function avaliarPassageiroMobile({
  data,
}: {
  data: { rideId: string; stars: number; comment?: string | null };
}) {
  await callRpc("driver_rate_passenger", {
    _ride_id: data.rideId,
    _stars: data.stars,
    _comment: data.comment ?? null,
  });
  return { ok: true as const };
}
