#!/usr/bin/env node
/**
 * Gera um index.html estático em dist/client/ para empacotamento Capacitor.
 *
 * O TanStack Start produz um bundle SSR (sem index.html). Para rodar dentro
 * do WebView do Android via Capacitor precisamos de um shell HTML estático
 * que carregue o entry client + CSS gerados por Vite. Este script roda
 * DEPOIS de `vite build` e escreve `dist/client/index.html`.
 *
 * Só é usado nos builds mobile (`build:passageiro` / `build:motorista`).
 * O deploy web/SSR na Lovable NÃO usa este arquivo.
 */
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "dist/client";
const ASSETS_DIR = join(OUT_DIR, "assets");

if (!existsSync(ASSETS_DIR)) {
  console.error(`[postbuild-capacitor] ${ASSETS_DIR} não existe. Rode vite build antes.`);
  process.exit(1);
}

const files = readdirSync(ASSETS_DIR);
const entry = files.find((f) => /^index-.*\.js$/.test(f));
const css = files.find((f) => /^styles-.*\.css$/.test(f));

if (!entry) {
  console.error(
    "[postbuild-capacitor] entry client `index-*.js` não encontrado em dist/client/assets/.",
  );
  process.exit(1);
}

const role = process.env.VITE_APP_ROLE || "web";
const appName = role === "motorista" ? "APOIS Motorista" : "APOIS";
const themeColor = role === "motorista" ? "#111827" : "#111827";

const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="${themeColor}" />
    <meta name="format-detection" content="telephone=no" />
    <title>${appName}</title>
${css ? `    <link rel="stylesheet" href="/assets/${css}" />\n` : ""}    <style>
      html,body,#root{height:100%;margin:0;background:${themeColor};color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
      #__boot{display:flex;align-items:center;justify-content:center;height:100%;font-weight:600;letter-spacing:0.08em}
    </style>
  </head>
  <body>
    <div id="root"><div id="__boot">${appName.toUpperCase()}</div></div>
    <script type="module" src="/assets/${entry}"></script>
  </body>
</html>
`;

writeFileSync(join(OUT_DIR, "index.html"), html, "utf8");
console.log(
  `[postbuild-capacitor] dist/client/index.html gerado (role=${role}, entry=${entry}${css ? `, css=${css}` : ""}).`,
);
