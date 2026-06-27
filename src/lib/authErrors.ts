// MOVVI DRIVE — tradução de erros de autenticação para português.
// Usado em telas de login/cadastro para que o usuário nunca veja mensagens em inglês.

const MAP: Array<{ match: RegExp; msg: string }> = [
  { match: /invalid login credentials/i, msg: "E-mail ou senha inválidos." },
  { match: /email not confirmed/i, msg: "E-mail ainda não confirmado." },
  { match: /password.*(weak|known|pwned|leak|easy)/i, msg: "Senha muito fraca. Use outra." },
  { match: /password.*at least|should be at least|minimum.*characters/i, msg: "Senha muito curta." },
  { match: /user already registered|already exists/i, msg: "Este e-mail já está cadastrado." },
  { match: /rate limit|too many requests/i, msg: "Muitas tentativas. Aguarde alguns instantes." },
  { match: /invalid email/i, msg: "E-mail inválido." },
  { match: /network|fetch failed|failed to fetch/i, msg: "Falha de conexão. Verifique sua internet." },
  { match: /signup.*disabled/i, msg: "Cadastros desativados no momento." },
  { match: /unauthorized|jwt|token/i, msg: "Sessão expirada. Faça login novamente." },
];

export function translateAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return "Erro inesperado. Tente novamente.";
  for (const { match, msg } of MAP) if (match.test(raw)) return msg;
  return raw; // já em PT vindo das nossas validações Zod
}
