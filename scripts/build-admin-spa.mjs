#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

console.log("APOIS_ADMIN_HOSTGATOR_PACKAGE_OK");
