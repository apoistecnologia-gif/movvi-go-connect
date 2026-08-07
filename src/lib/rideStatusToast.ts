import { toast } from "sonner";
import type { RideStatus } from "@/lib/rideLifecycle";
import { showPush } from "@/lib/pushNotifications";

type Audience = "passageiro" | "motorista";

type Notice = {
  title: string;
  description?: string;
  kind: "info" | "success" | "warning" | "error";
};

const MESSAGES: Record<Audience, Partial<Record<RideStatus, Notice>>> = {
  passageiro: {
    procurar_motorista: { title: "Procurando motorista", description: "Estamos buscando o motorista mais próximo.", kind: "info" },
    motorista_a_caminho: { title: "Motorista a caminho", description: "Seu motorista aceitou a corrida.", kind: "success" },
    motorista_chegou: { title: "Seu motorista chegou", description: "Compartilhe o código de segurança para iniciar a viagem.", kind: "success" },
    em_viagem: { title: "Viagem iniciada", description: "Boa viagem!", kind: "info" },
    finalizada: { title: "Corrida finalizada", description: "Avalie seu motorista.", kind: "success" },
    cancelada_motorista: { title: "Motorista cancelou", description: "Estamos procurando outro motorista.", kind: "warning" },
    cancelada_passageiro: { title: "Corrida cancelada", kind: "info" },
  },
  motorista: {
    procurar_motorista: { title: "Nova solicitação", kind: "info" },
    motorista_a_caminho: { title: "Corrida aceita", description: "Siga até o ponto de embarque.", kind: "success" },
    motorista_chegou: { title: "Chegada confirmada", description: "Aguarde o passageiro com o código.", kind: "info" },
    em_viagem: { title: "Viagem iniciada", description: "Siga até o destino.", kind: "success" },
    finalizada: { title: "Corrida finalizada", description: "Avalie o passageiro.", kind: "success" },
    cancelada_passageiro: { title: "Passageiro cancelou", kind: "warning" },
    cancelada_motorista: { title: "Corrida cancelada", kind: "info" },
  },
};

export function notifyRideStatus(audience: Audience, status: RideStatus) {
  const n = MESSAGES[audience][status];
  if (!n) return;
  const fn =
    n.kind === "success" ? toast.success
    : n.kind === "error" ? toast.error
    : n.kind === "warning" ? toast.warning
    : toast.info;
  fn(n.title, n.description ? { description: n.description } : undefined);

  // Background push: only fires when the document is hidden. Tapping the
  // notification opens the correct ride screen (passenger or driver app).
  const deepLink = audience === "passageiro" ? "/passageiro/app" : "/motorista/app";
  showPush({
    title: `APOIS • ${n.title}`,
    body: n.description,
    tag: `movvi-ride-${audience}-${status}`,
    url: deepLink,
  });
}
