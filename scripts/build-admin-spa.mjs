#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");
const outDir = resolve(root, "dist/admin");

rmSync(outDir, { recursive: true, force: true });
execFileSync(process.execPath, [viteBin, "build", "--config", "vite.admin.config.ts", "--mode", "mobile"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const generated = resolve(outDir, "index.admin.html");
const index = resolve(outDir, "index.html");
if (!existsSync(index) && existsSync(generated)) renameSync(generated, index);
if (!existsSync(index)) throw new Error("Admin build não gerou dist/admin/index.html");

writeFileSync(
  resolve(outDir, ".htaccess"),
  `Options -MultiViews\nRewriteEngine On\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^ index.html [L]\n\n<IfModule mod_headers.c>\n  Header always set X-Content-Type-Options \"nosniff\"\n  Header always set X-Frame-Options \"DENY\"\n  Header always set Referrer-Policy \"strict-origin-when-cross-origin\"\n</IfModule>\n`,
  "utf8",
);

// O login administrativo é deliberadamente isolado do bundle React/TanStack
// compartilhado com os aplicativos móveis. Isso evita que qualquer listener,
// bridge nativo ou ciclo de renderização do app interfira em foco/digitação.
const loginDir = resolve(outDir, "admin/login");
mkdirSync(loginDir, { recursive: true });
writeFileSync(
  resolve(loginDir, "index.html"),
  `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex,nofollow" />
  <meta name="theme-color" content="#050607" />
  <title>APOIS Administração</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050607;color:#f8fafc;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.wrap{width:100%;max-width:416px}.brand{text-align:center;margin-bottom:24px}.mark{width:58px;height:58px;border:2px solid #ffb800;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-weight:900;color:#ffb800;font-size:20px}.brand h1{margin:0;font-size:20px;letter-spacing:.06em}.brand h1 span{color:#ffb800}.card{background:#0b1016;border:1px solid #1d2632;border-radius:24px;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.35)}.title{font-size:24px;font-weight:800;margin:0 0 6px}.desc{color:#94a3b8;font-size:14px;margin:0 0 26px}.field{margin-bottom:18px}label{display:block;font-size:14px;font-weight:700;margin:0 0 8px}input{display:block;width:100%;height:44px;border:1px solid #1f2937;border-radius:14px;background:#070b10;color:#f8fafc;padding:0 14px;font:inherit;font-size:15px;outline:none}input:focus{border-color:#ffb800;box-shadow:0 0 0 2px rgba(255,184,0,.18)}button{width:100%;height:48px;border:0;border-radius:16px;background:#ffb800;color:#080b0f;font:inherit;font-weight:800;font-size:15px;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.error{display:none;margin:0 0 16px;padding:11px 13px;border-radius:12px;border:1px solid #7f1d1d;background:#2b0d0d;color:#fecaca;font-size:13px;line-height:1.4}.top{display:flex;justify-content:space-between;margin-bottom:18px}.top a{color:#94a3b8;text-decoration:none;font-size:12px}.top a:hover{color:#f8fafc}
  </style>
</head>
<body>
  <main class="wrap">
    <nav class="top"><a href="javascript:history.back()">← Voltar</a><a href="/">⌂ Início</a></nav>
    <div class="brand"><div class="mark">A</div><h1>APOIS <span>ADMIN</span></h1></div>
    <section class="card">
      <h2 class="title">🛡 Painel administrativo</h2>
      <p class="desc">Acesso restrito à equipe APOIS.</p>
      <form id="loginForm" autocomplete="on">
        <div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required /></div>
        <div class="field"><label for="password">Senha</label><input id="password" name="password" type="password" autocomplete="current-password" required /></div>
        <div id="error" class="error" role="alert"></div>
        <button id="submit" type="submit">Entrar</button>
      </form>
    </section>
  </main>
  <script>
    (() => {
      const SUPABASE_URL = "https://vqtucstyduxrqjgyigfk.supabase.co";
      const API_KEY = "sb_publishable_ZFE0wgRVAFnpZrcBaOxKkg_fhxS_KHc";
      const STORAGE_KEY = "sb-vqtucstyduxrqjgyigfk-auth-token";
      const form = document.getElementById("loginForm");
      const button = document.getElementById("submit");
      const errorBox = document.getElementById("error");
      const showError = (message) => { errorBox.textContent = message; errorBox.style.display = "block"; };
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorBox.style.display = "none";
        button.disabled = true;
        button.textContent = "Entrando…";
        try {
          const email = document.getElementById("email").value.trim();
          const password = document.getElementById("password").value;
          const authResponse = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
            method: "POST",
            headers: { "apikey": API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
          });
          const session = await authResponse.json();
          if (!authResponse.ok || !session.access_token || !session.user) throw new Error("E-mail ou senha inválidos.");
          const accessResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/admin_is_authorized", {
            method: "POST",
            headers: { "apikey": API_KEY, "Authorization": "Bearer " + session.access_token, "Content-Type": "application/json" },
            body: "{}"
          });
          const allowed = await accessResponse.json();
          if (!accessResponse.ok || allowed !== true) throw new Error("Esta conta não possui acesso administrativo ativo.");
          const now = Math.floor(Date.now() / 1000);
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            expires_at: session.expires_at || now + (session.expires_in || 3600),
            token_type: session.token_type || "bearer",
            user: session.user
          }));
          window.location.replace("/admin/dashboard");
        } catch (error) {
          localStorage.removeItem(STORAGE_KEY);
          showError(error && error.message ? error.message : "Não foi possível entrar agora.");
          button.disabled = false;
          button.textContent = "Entrar";
        }
      });
    })();
  </script>
</body>
</html>`,
  "utf8",
);

console.log("APOIS_ADMIN_HOSTGATOR_PACKAGE_OK");
