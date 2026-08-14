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

type StructuredRpcFailure = {
  ok: false;
  code: string;
  retry_after_seconds?: number;
  remaining_attempts?: number;
};

type DriverCancelRedispatchResponse = {
  ok?: boolean;
  error?: string;
  ride?: unknown;
  redispatch?: string;
};

const rpcClient = supabase as unknown as DynamicRpcClient;

function isStructuredRpcFailure(value: unknown): value is StructuredRpcFailure {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.ok === false && typeof record.code === "string";
}

function readableDriverRpcError(message: string, details?: StructuredRpcFailure) {
  const raw = String(message ?? "");
  if (/ride_offer_unavailable/i.test(raw)) return "Esta corrida não está mais disponível.";
  if (/driver_not_approved/i.test(raw)) return "Seu cadastro ainda não está aprovado.";
  if (/driver_subscription_inactive/i.test(raw)) return "Sua mensalidade precisa estar ativa para receber corridas.";
  if (/driver_offline/i.test(raw)) return "Fique online antes de aceitar a corrida.";
  if (/security_code_temporarily_locked/i.test(raw)) {
    const retry = details?.retry_after_seconds;
    if (typeof retry === "number" && Number.isFinite(retry) && retry > 0) {
      const minutes = Math.max(1, Math.ceil(retry / 60));
      return `Muitas tentativas incorretas. Aguarde ${minutes} min para tentar o PIN novamente.`;
    }
    return "Muitas tentativas incorretas. Aguarde alguns minutos para tentar o PIN novamente.";
  }
  if (/invalid_security_code/i.test(raw) || /invalid_security_code_or_transition/i.test(raw)) {
    const remaining = details?.remaining_attempts;
    if (typeof remaining === "number" && remaining > 0) {
      return `Código incorreto. Restam ${remaining} tentativa${remaining === 1 ? "" : "s"} antes do bloqueio temporário.`;
    }
    return "Código incorreto. Peça o PIN ao passageiro e tente novamente.";
  }
  if (/invalid_ride_transition/i.test(raw)) return "Esta ação não está disponível nesta etapa da corrida.";
  if (/driver_cancel_reason_required/i.test(raw)) return "Escolha ou informe o motivo do cancelamento.";
  if (/rating_unavailable/i.test(raw)) return "Esta corrida já foi avaliada ou ainda não pode ser avaliada.";
  if (/driver_profile_missing/i.test(raw)) return "Cadastro de motorista não encontrado.";
  return raw || "Não foi possível concluir a ação.";
}

async function callRpc<T = unknown>(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw new Error(readableDriverRpcError(error.message));
  if (isStructuredRpcFailure(data)) {
    throw new Error(readableDriverRpcError(data.code, data));
  }
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
 * único responsável por definir preço final, settlement e efeitos financeiros.
 *
 * O generic preserva compatibilidade com telas antigas que ainda montam campos
 * extras no objeto local; somente rideId cruza esta fronteira e chega ao RPC.
 */
export async function finalizarCorridaMobile<T extends { rideId: string }>({ data }: { data: T }) {
  const rideId = data.rideId;
  const ride = await callRpc("driver_finish_ride", { _ride_id: rideId });
  notifyPassenger(rideId, "ride.completed");
  return ride;
}

/**
 * Cancelamento operacional passa pela Edge Function autenticada para que o
 * banco valide a ação com o JWT real do motorista e, quando a corrida volta a
 * procurar_motorista, o backend dispare redispatch imediatamente. Isso elimina
 * a dependência do app do passageiro estar aberto para a busca continuar.
 */
export async function cancelarPeloMotoristaMobile({ data }: { data: { rideId: string; motivo?: string } }) {
  const { data: response, error } = await supabase.functions.invoke("driver-cancel-redispatch", {
    body: {
      ride_id: data.rideId,
      reason: data.motivo ?? null,
    },
  });

  if (error) throw new Error(readableDriverRpcError(error.message));
  const result = (response ?? {}) as DriverCancelRedispatchResponse;
  if (result.ok !== true) {
    throw new Error(readableDriverRpcError(result.error ?? "driver_cancel_failed"));
  }
  return result.ride;
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
