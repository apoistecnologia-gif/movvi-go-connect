import { supabase } from "@/integrations/supabase/client";
import { acceptHmlDriverRide, hmlDriverStage, isHmlDispatch } from "./hml-dispatch-client";

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

type DriverRedispatchResponse = {
  ok?: boolean;
  error?: string;
  ride?: unknown;
  redispatch?: string;
};

const rpcClient = supabase as unknown as DynamicRpcClient;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertRideId(rideId: string) {
  if (!UUID_RE.test(String(rideId ?? "").trim())) {
    throw new Error("Não foi possível identificar esta corrida. Atualize a tela e tente novamente.");
  }
}

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
  if (/driver_location_stale/i.test(raw)) return "Atualize sua localização antes de informar que chegou ao embarque.";
  if (/driver_too_far_from_pickup/i.test(raw)) return "Aproxime-se do ponto de embarque antes de informar que chegou.";
  if (/pickup_location_missing/i.test(raw)) return "O ponto de embarque desta corrida está inválido. Fale com o suporte antes de continuar.";
  if (/no_show_requires_driver_arrival/i.test(raw)) return "Informe primeiro que chegou ao ponto de embarque antes de registrar ausência do passageiro.";
  if (/driver_no_show_wait_not_elapsed/i.test(raw)) return "Aguarde o tempo mínimo de espera no embarque antes de registrar que o passageiro não apareceu.";
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
  if (/jwt|unauthorized|auth|session/i.test(raw)) return "Sua sessão expirou. Entre novamente para continuar.";
  return "Não foi possível concluir a ação. Atualize a tela e tente novamente.";
}

async function callRpc<T = unknown>(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw new Error(readableDriverRpcError(error.message));
  if (isStructuredRpcFailure(data)) {
    throw new Error(readableDriverRpcError(data.code, data));
  }
  return data as T;
}

async function callDriverRedispatchFunction(
  functionName: "driver-reject-redispatch" | "driver-cancel-redispatch" | "driver-finish-redispatch",
  body: Record<string, unknown>,
): Promise<unknown> {
  const { data: response, error } = await supabase.functions.invoke(functionName, { body });
  if (error) throw new Error(readableDriverRpcError(error.message));
  const result = (response ?? {}) as DriverRedispatchResponse;
  if (result.ok !== true) {
    throw new Error(readableDriverRpcError(result.error ?? "driver_operation_failed"));
  }
  return result.ride;
}

/**
 * Push é complementar ao realtime. A ação da corrida nunca deve voltar a falhar
 * só porque o aparelho do passageiro está sem token ou o FCM está indisponível.
 */
function notifyPassenger(rideId: string, event: DriverRidePushEvent) {
  if (import.meta.env.VITE_ENABLE_NATIVE_PUSH !== "true") return;
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
  assertRideId(data.rideId);
  if (isHmlDispatch) return acceptHmlDriverRide(data.rideId);
  const ride = await callRpc("driver_accept_ride", { _ride_id: data.rideId });
  notifyPassenger(data.rideId, "ride.accepted");
  return ride;
}

/**
 * Rejeição e expiração local da oferta usam a mesma função autenticada. Depois
 * da RPC remover o motorista do lote atual, o backend tenta avançar o dispatch.
 * Se ainda restarem ofertas válidas, dispatch-ride apenas mantém o lote ativo;
 * quando o último motorista rejeita, o próximo lote é formado imediatamente.
 */
export async function recusarCorridaMobile({ data }: { data: { rideId: string } }) {
  assertRideId(data.rideId);
  if (isHmlDispatch) return hmlDriverStage("reject", data.rideId);
  return callDriverRedispatchFunction("driver-reject-redispatch", {
    ride_id: data.rideId,
  });
}

export async function informarChegadaMobile({ data }: { data: { rideId: string } }) {
  assertRideId(data.rideId);
  if (isHmlDispatch) return hmlDriverStage("arrive", data.rideId);
  const ride = await callRpc("driver_mark_arrived", { _ride_id: data.rideId });
  notifyPassenger(data.rideId, "ride.driver_arrived");
  return ride;
}

export async function iniciarCorridaMobile({ data }: { data: { rideId: string; safety_code: string } }) {
  assertRideId(data.rideId);
  const safetyCode = String(data.safety_code ?? "").trim();
  if (!/^\d{4}$/.test(safetyCode)) {
    throw new Error("Digite os 4 dígitos do PIN informado pelo passageiro.");
  }
  if (isHmlDispatch) return hmlDriverStage("start", data.rideId, safetyCode);
  const ride = await callRpc("driver_start_ride", {
    _ride_id: data.rideId,
    _security_code: safetyCode,
  });
  notifyPassenger(data.rideId, "ride.started");
  return ride;
}

/**
 * Finalização usa a Edge Function canônica porque, além de concluir a corrida
 * de forma atômica no banco, ela redispara qualquer próxima corrida que tenha
 * sido liberada pelo encerramento da corrida atual. O app nunca envia preço.
 */
export async function finalizarCorridaMobile<T extends { rideId: string }>({ data }: { data: T }) {
  const rideId = data.rideId;
  assertRideId(rideId);
  const ride = await callDriverRedispatchFunction("driver-finish-redispatch", {
    ride_id: rideId,
  });
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
  assertRideId(data.rideId);
  const reason = String(data.motivo ?? "").trim().slice(0, 240);
  if (isHmlDispatch) return hmlDriverStage("cancel", data.rideId, reason);
  return callDriverRedispatchFunction("driver-cancel-redispatch", {
    ride_id: data.rideId,
    reason: reason || null,
  });
}

export async function avaliarPassageiroMobile({
  data,
}: {
  data: { rideId: string; stars: number; comment?: string | null };
}) {
  assertRideId(data.rideId);
  const stars = Number(data.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Escolha uma nota de 1 a 5 estrelas.");
  }
  const comment = String(data.comment ?? "").trim().slice(0, 800);
  await callRpc("driver_rate_passenger", {
    _ride_id: data.rideId,
    _stars: stars,
    _comment: comment || null,
  });
  return { ok: true as const };
}
