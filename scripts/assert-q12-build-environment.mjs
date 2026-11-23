// Bloqueio preventivo SENATRAN Q12: nunca publicar preview conectado a producao.
export function assertQ12BuildEnvironment(env) {
  if (env.VERCEL !== "1") return;
  const stage = String(env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (stage === "production") return;
  if (!["preview","development"].includes(stage)) {
    throw new Error("Q12: tipo de deploy Vercel desconhecido; build interrompido por seguranca.");
  }
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!url || !key) {
    throw new Error("Q12: preview sem URL e chave publicavel de homologacao; build bloqueado.");
  }
  if (!/^https:\/\/[^/\s?#]+/.test(url)) {
    throw new Error("Q12: URL de homologacao invalida ou sem HTTPS.");
  }
  const prohibited = [
    "ptgkwyyolrdgnqketkjj", "tbbzkrfupmqdywnzgnms",
    "sbvhdgyuuperszlsllji", "vqtucstyduxrqjgyigfk"
  ];
  const urlNames = ["VITE_SUPABASE_URL", "SUPABASE_URL", "CORRIDAS_VITE_SUPABASE_URL"];
  for (const name of urlNames) {
    const configured = String(env[name] ?? "").toLowerCase();
    if (prohibited.some((ref) => configured.includes(`${ref}.supabase.co`) || configured.includes(`//${ref}.`))) {
      throw new Error(`Q12: ${name} do preview aponta para um projeto real/legado; build bloqueado.`);
    }
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY || env.APOIS_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Q12: credencial administrativa de banco presente no preview; build bloqueado.");
  }
}
