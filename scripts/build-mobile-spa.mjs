#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const role = process.env.VITE_APP_ROLE;
if (role !== "passageiro" && role !== "motorista") {
  console.error("[mobile-spa] VITE_APP_ROLE deve ser passageiro ou motorista.");
  process.exit(1);
}

const root = process.cwd();
const distClient = resolve(root, "dist/client");
const outputServer = resolve(root, ".output/server");
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");

if (!existsSync(viteBin)) {
  console.error("[mobile-spa] node_modules/vite/bin/vite.js não encontrado. Rode `npm install` primeiro.");
  process.exit(1);
}

rmSync(distClient, { recursive: true, force: true });
rmSync(resolve(root, ".output"), { recursive: true, force: true });

execFileSync(
  process.execPath,
  [viteBin, "build", "--config", "vite.mobile.config.ts", "--mode", "mobile"],
  { stdio: "inherit", cwd: root, env: process.env },
);

const indexHtml = resolve(distClient, "index.html");
const generatedMobileHtml = resolve(distClient, "index.mobile.html");
const assetsDir = resolve(distClient, "assets");
if (!existsSync(indexHtml) && existsSync(generatedMobileHtml)) {
  renameSync(generatedMobileHtml, indexHtml);
}
if (!existsSync(indexHtml)) {
  console.error("[mobile-spa] dist/client/index.html não foi gerado.");
  process.exit(1);
}
if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
  console.error("[mobile-spa] dist/client/assets não foi gerado.");
  process.exit(1);
}

const assets = readdirSync(assetsDir);
if (!assets.some((name) => name.endsWith(".js")) || !assets.some((name) => name.endsWith(".css"))) {
  console.error("[mobile-spa] assets JS/CSS não encontrados em dist/client/assets.");
  process.exit(1);
}
if (existsSync(outputServer)) {
  console.error("[mobile-spa] Falha: .output/server foi criado, o build mobile deve ser client-only.");
  process.exit(1);
}

console.log(`[mobile-spa] OK (${role}): dist/client/index.html + assets gerados sem .output/server.`);
