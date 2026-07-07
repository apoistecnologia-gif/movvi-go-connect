# MOVVI — Guia de Exportação Segura

Este documento descreve como exportar, empacotar ou publicar o código do MOVVI
sem vazar credenciais. Os arquivos `.env`, `.gitignore` e `.workspace/` são
gerenciados pela plataforma Lovable e **não devem ser copiados junto do código**.

---

## 1. Nunca inclua estes arquivos/pastas em ZIPs, repositórios públicos, entregas a terceiros ou builds nativos

| Item                              | Motivo                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| `.env`, `.env.*`                  | Contém chaves reais (Supabase, Maps, etc.).                     |
| `.workspace/`                     | Estado interno da plataforma Lovable.                           |
| `.git/`                           | Histórico do repositório, pode conter segredos antigos.         |
| `node_modules/`                   | Enorme, reprodutível via `bun install`.                         |
| `dist/`, `.output/`, `.vinxi/`, `.tanstack/` | Artefatos de build, gerados a cada deploy.           |
| `*.zip`                           | Pacotes antigos podem conter versões vulneráveis de `.env`.     |
| `.DS_Store`, `Thumbs.db`, `*.log` | Ruído do SO / logs locais.                                      |

### Como gerar um ZIP limpo

```bash
zip -r movvi-source.zip . \
  -x ".env" ".env.*" \
  -x ".git/*" ".workspace/*" \
  -x "node_modules/*" \
  -x "dist/*" ".output/*" ".vinxi/*" ".tanstack/*" \
  -x "*.zip" "*.log" ".DS_Store"
```

---

## 2. Use `.env.example` como referência

O arquivo `.env.example` na raiz contém **apenas os nomes** das variáveis, sem
valores reais. É seguro versionar e compartilhar. Ao receber o código, o
desenvolvedor deve:

1. Copiar `.env.example` para `.env` localmente.
2. Preencher os valores obtidos no painel Lovable Cloud / provedor.
3. Nunca commitar o `.env` resultante.

---

## 3. Onde configurar cada variável

### 3.1 Variáveis públicas (frontend / build)

Prefixadas com `VITE_*`. Vão para o bundle do navegador — **não são segredo**,
mas devem ser configuradas no ambiente de build da plataforma (Lovable Cloud,
Vercel, Netlify, EAS Build, etc.).

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`
- `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID`

> Restrinja a chave do Google Maps por HTTP referrer / bundle id no console
> Google Cloud para evitar abuso mesmo sendo pública.

### 3.2 Secrets (backend / Edge Functions)

**Nunca** devem aparecer no frontend, em `VITE_*`, em código versionado ou em
ZIPs. Configure exclusivamente como *Function Secrets* no backend
(Supabase Edge Functions / Lovable Cloud → Backend → Secrets):

- `SUPABASE_SERVICE_ROLE_KEY` — bypassa RLS, uso admin.
- `CRON_SECRET` — autentica jobs agendados.
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN`

Se algum desses vazar, **rotacione imediatamente** no provedor correspondente
e atualize o secret no backend.

---

## 4. Publicação em Play Store / App Store

Para distribuição mobile (Android AAB/APK, iOS IPA):

- Publique o **binário compilado** (AAB/APK/IPA), não o código-fonte nem `.env`.
- As chaves `VITE_*` já estão embutidas no bundle no momento do build — não
  envie `.env` junto.
- Configure as variáveis de build no serviço de CI (EAS, Codemagic, Bitrise,
  GitHub Actions) usando os segredos do próprio CI, nunca committadas.
- Assine o app com uma keystore/cert armazenada fora do repositório.

---

## 5. Checklist antes de entregar código a terceiros

- [ ] `.env` **não** está no ZIP nem no repositório.
- [ ] `.workspace/`, `.git/`, `node_modules/`, `dist/`, `.output/`, `.vinxi/` excluídos.
- [ ] `.env.example` presente e sem valores reais.
- [ ] Nenhum secret (service role, tokens de pagamento) hardcoded no código.
- [ ] Chaves públicas restritas por domínio / bundle id.
- [ ] Documentação de setup aponta para `.env.example`.

Em caso de suspeita de vazamento: rotacione o(s) segredo(s) no provedor e
regenere as chaves Supabase pelo painel Lovable Cloud.
