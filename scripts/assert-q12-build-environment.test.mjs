import test from "node:test";
import assert from "node:assert/strict";
import { assertQ12BuildEnvironment } from "./assert-q12-build-environment.mjs";

const preview = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VITE_SUPABASE_URL: "https://apois-preview-isolado-sem-backend.invalid",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_APOIS_PREVIEW_ISOLADO_SEM_BACKEND",
};
test("Q12: preview sem backend real e aceito como bloqueio seguro", () => {
  assert.doesNotThrow(() => assertQ12BuildEnvironment(preview));
});
test("Q12: preview apontando para Entregas producao e rejeitado", () => {
  assert.throws(() => assertQ12BuildEnvironment({ ...preview, VITE_SUPABASE_URL: "https://ptgkwyyolrdgnqketkjj.supabase.co" }));
});
test("Q12: preview apontando para Corridas producao por variavel alternativa e rejeitado", () => {
  assert.throws(() => assertQ12BuildEnvironment({ ...preview, SUPABASE_URL: "https://tbbzkrfupmqdywnzgnms.supabase.co" }));
});
test("Q12: projetos legados tambem sao proibidos no preview", () => {
  assert.throws(() => assertQ12BuildEnvironment({ ...preview, VITE_SUPABASE_URL: "https://vqtucstyduxrqjgyigfk.supabase.co" }));
});
test("Q12: preview com service_role e rejeitado", () => {
  assert.throws(() => assertQ12BuildEnvironment({ ...preview, SUPABASE_SERVICE_ROLE_KEY: "teste-nao-real" }));
});
test("Q12: preview sem par completo e rejeitado", () => {
  assert.throws(() => assertQ12BuildEnvironment({ ...preview, VITE_SUPABASE_PUBLISHABLE_KEY: "" }));
});
test("Q12: deploy com ambiente desconhecido e rejeitado", () => {
  assert.throws(() => assertQ12BuildEnvironment({ ...preview, VERCEL_ENV: "" }));
});
test("Q12: deploy de producao nao sofre alteracao", () => {
  assert.doesNotThrow(() => assertQ12BuildEnvironment({ VERCEL: "1", VERCEL_ENV: "production" }));
});
