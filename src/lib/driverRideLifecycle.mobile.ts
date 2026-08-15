import { supabase } from "@/integrations/supabase/client";

type DriverRidePushEvent =
  | "ride.accepted"
  | "ride.driver_arrived"
  | "ride.started"
  | "ride.completed"
  | "ride.cancelled";

type RedispatchPayload = {
  ok?: boolean;
  error?: string;
  ride?: unknown;
  redispatch?: string;
};

function readableDriverRpcError(message: string) {
  const raw = String(message ?? "");
  if (/ride_offer_unavailable/i.test(raw)) return "Esta corrida não está mais disponível.";
  if (/driver_not_approved/i.test(raw)) return "Seu cadastro ainda não está aprovado.";
  if (/driver_suspended/i.test(raw)) return "Seu acesso está suspenso. Fale com o suporte para regularizar.";
  if (/driver_subscription_inactive/i.test(raw)) return "Sua mensalidade precisa estar ativa para receber corridas.";
  if (/driver_offline/i.test(raw)) return "Fique online antes de aceitar a corrida.";
  if (/invalid_security_code_or_transition/i.test(raw)) return "Código incorreto. Peça o PIN ao passageiro e tente novamente.";
  if (/invalid_ride_transition/i.test(raw)) return "Esta ação não está disponível nesta etapa da corrida.";
  if (/driver_cancel_reason_required/i.test(raw)) return "Informe o motivo do cancelamento.";
  if (/no_show_requires_driver_arrival/i.test(raw)) return "Marque sua chegada antes de informar que o passageiro não apareceu.";
  if (/driver_no_show_wait_not_elapsed/i.test(raw)) return "Aguarde o tempo mínimo após a chegada antes de informar ausência do passageiro.";
  if (/rating_unavailable/i.test(raw)) return "Esta corrida já foi avaliada ou ainda não pode ser avaliada.";
  if (/driver_profile_missing/i.test(raw)) return "Cadastro de motorista não encontrado.";
  return raw || "Não foi possível concluir a ação.";
}

async function callRpc<T = unknown>(name: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(readableDriverRpcError(error.message));
  return data as T;
}

async function callRedispatchFunction(
  functionName: "driver-reject-redispatch" | "driver-cancel-redispatch",
  body: Record<string, unknown>,
): Promise<RedispatchPayload> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) throw new Error(readableDriverRpcError(error.message));

  const payload = (data ?? {}) as RedispatchPayload;
  if (!payload.ok) throw new Error(readableDriverRpcError(payload.error ?? `${functionName}_failed`));

  if (payload.redispatch === "deferred") {
    console.warn(`[APOIS MOTORISTA] ${functionName}: redispatch adiado; watchdog do servidor continuará a busca`);
  }
  return payload;
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
  const payload = await callRedispatchFunction("driver-reject-redispatch", {
    ride_id: data.rideId,
  });
  return payload.ride ?? payload;
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

export async function finalizarCorridaMobile({ data }: { data: { rideId: string; final_price?: number } }) {
  const ride = await callRpc("driver_finish_ride", { _ride_id: data.rideId });
  notifyPassenger(data.rideId, "ride.completed");
  return ride;
}

export async function cancelarPeloMotoristaMobile({ data }: { data: { rideId: string; motivo?: string } }) {
  const payload = await callRedispatchFunction("driver-cancel-redispatch", {
    ride_id: data.rideId,
    reason: data.motivo ?? "",
  });

  const ride = payload.ride as { status?: string } | null | undefined;
  // Cancelamento operacional antes do embarque devolve a MESMA corrida para
  // busca de outro motorista; não devemos avisar falsamente ao passageiro que
  // a corrida inteira foi cancelada. No-show, por outro lado, é terminal.
  if (ride?.status !== "procurar_motorista") {
    notifyPassenger(data.rideId, "ride.cancelled");
  }

  return payload.ride ?? payload;
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
