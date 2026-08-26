// APOIS — App role (build-time flag).
//
// Um único código-fonte, três sabores de build controlados por `VITE_APP_ROLE`:
//   - passenger → APOIS Passageiro
//   - driver    → APOIS Motorista
//   - web       → site/painel web
//
// Nada aqui altera regra de negócio. Esta camada apenas impede navegação
// acidental entre superfícies que não pertencem ao bundle atual.

export type AppRole = "passenger" | "driver" | "web";

const rawRole = String(import.meta.env.VITE_APP_ROLE ?? "")
  .trim()
  .toLowerCase()
  .slice(0, 32);

function resolveAppRole(value: string): AppRole {
  if (value === "passenger" || value === "passageiro") return "passenger";
  if (value === "driver" || value === "motorista") return "driver";
  return "web";
}

export const APP_ROLE: AppRole = resolveAppRole(rawRole);

export const isPassengerBuild = () => APP_ROLE === "passenger";
export const isDriverBuild = () => APP_ROLE === "driver";
export const isWebBuild = () => APP_ROLE === "web";

function normalizePathname(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  const withoutQuery = raw.split(/[?#]/, 1)[0] || "/";
  try {
    const parsed = new URL(withoutQuery, "https://apois.invalid");
    return parsed.pathname.replace(/\/{2,}/g, "/") || "/";
  } catch {
    return "/";
  }
}

function isPathInside(pathname: string, root: string): boolean {
  const path = normalizePathname(pathname);
  const normalizedRoot = normalizePathname(root).replace(/\/+$/, "") || "/";
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`);
}

/** Rota inicial do bundle atual. Usada pelo `/` para redirecionar. */
export function defaultLandingPath(): string {
  if (APP_ROLE === "passenger") return "/passageiro/login";
  if (APP_ROLE === "driver") return "/motorista/login";
  return "/";
}

/**
 * Retorna true se o pathname pertence a uma área que NÃO deve existir no
 * bundle atual. A verificação respeita limites de segmento: `/admin-x`, por
 * exemplo, não é confundido com `/admin`.
 */
export function isForbiddenPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (APP_ROLE === "passenger") {
    return isPathInside(path, "/motorista") || isPathInside(path, "/admin");
  }
  if (APP_ROLE === "driver") {
    return isPathInside(path, "/passageiro") || isPathInside(path, "/admin");
  }
  return false;
}
