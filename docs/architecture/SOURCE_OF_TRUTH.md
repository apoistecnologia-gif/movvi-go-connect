# APOIS CORRIDAS — SOURCE OF TRUTH

> Atualizado em 2026-08-08 durante a consolidação exigida pelo Prompt Mestre. O schema vivo foi auditado por consultas de leitura no Supabase oficial. Nenhuma migration destrutiva foi executada em produção.

## Escopo absoluto

Este documento pertence ao **APOIS CORRIDAS**.

**Fora do escopo e proibido de alterar:** `franciel046631/apois-entregas` e qualquer schema, migration, Edge Function, banco ou código do APOIS ENTREGAS.

## Passageiro

- **Repositório canônico:** `franciel046631/say-hello-buddy-23-84b5dcbf`
- **Branch:** `feat/apois-passageiro-completo`
- **PR:** #7 — DRAFT; não mesclar antes do E2E físico Passageiro ↔ Motorista.
- **Stack:** React 19, Vite, TanStack Router/Start, TypeScript, Capacitor, Supabase JS, Google Maps/Geolocation.
- **Supabase:** `vqtucstyduxrqjgyigfk` em `supabase/config.toml` e no runtime de homologação.
- **Decisão:** manter como fonte do Passageiro e migrar somente recursos legados comprovadamente superiores/compatíveis.

## Motorista

- **Repositório canônico:** `franciel046631/movvi-go-connect`
- **Branch de homologação anterior:** `feat/apois-motorista-producao-homologacao`
- **Branch de consolidação atual:** `fix/apois-corridas-consolidacao`
- **PR:** #1 — DRAFT; não mesclar antes do E2E físico Passageiro ↔ Motorista.
- **Stack:** React 19, Vite, TanStack Router/Start, TypeScript, Capacitor 8, Supabase JS, FCM/Push Notifications, Geolocation e Android Foreground Service.
- **Package:** `com.apois.motorista`.
- **Supabase mobile:** `vqtucstyduxrqjgyigfk`.
- **Firebase Android:** projeto `movvi-4d041`, cliente `com.apois.motorista`.
- **Decisão:** preservar a implementação operacional migrada do MOVVI, rebrandear/consolidar e não reconstruir do zero.

### Consolidação de ambiente do Motorista

A divergência histórica em que `.env` e `supabase/config.toml` apontavam para `ekddifjpbieuainvjlbl` foi eliminada desta branch:

- `supabase/config.toml` agora aponta para `vqtucstyduxrqjgyigfk`;
- `.env` local com referências/chaves antigas deixou de ser versionado;
- `.gitignore` protege `.env` locais;
- `.env.example` contém somente placeholders;
- `.env.mobile` contém apenas configuração browser-safe necessária ao build mobile e é validado pelo CI;
- o CI rejeita referências ativas aos project refs legados conhecidos.

Nenhum `service_role`, webhook secret ou segredo de gateway é permitido no bundle mobile.

## Admin

- **Repositório canônico:** `franciel046631/movvi-go-connect`
- **Branch de homologação anterior:** `feat/apois-admin-supabase-oficial-homologacao`
- **Branch de consolidação atual:** `fix/apois-corridas-consolidacao`
- **PR:** #2 — permanece sem merge.
- **Supabase configurado no repositório:** `vqtucstyduxrqjgyigfk` em `supabase/config.toml`.
- **Decisão:** preservar o Admin legado útil, rebrandear e migrar cada operação para contratos server-side compatíveis com o Supabase oficial.
- **Estado:** Fase 8 validada no mesmo HEAD em PostgreSQL efêmero + contratos frontend + TypeScript + production build + ESLint. Isso não equivale a promoção de migration em produção nem a homologação física completa.

## Backend

### Runtime canônico

A autoridade de dados é o Supabase oficial `vqtucstyduxrqjgyigfk`: schema vivo, RLS, RPCs e Edge Functions efetivamente implantadas e compatíveis com os apps atuais.

Server Functions/rotas TanStack existentes nos frontends só permanecem quando não duplicam autoridade de negócio e quando delegam ao contrato server-side canônico.

### Backends standalone legados

- `franciel046631/movvi-backend-standalone`
- `franciel046631/APOIS`

Ambos contêm implementações úteis (rotas, pagamentos, Mercado Pago/Asaas, payout, KYC e auditoria), porém foram construídos contra gerações/projetos anteriores. São **fontes de migração**, não fontes automáticas de verdade.

## Supabase

### Production / homologação oficial

- **Nome:** APOIS Produção
- **Project ref:** `vqtucstyduxrqjgyigfk`
- **Região:** `sa-east-1`
- **Status auditado:** ativo/saudável.

### Referências legadas encontradas

| Project ref | Origem | Decisão |
|---|---|---|
| `vqtucstyduxrqjgyigfk` | APOIS Corridas atual | **MANTER / OFICIAL** |
| `ekddifjpbieuainvjlbl` | configuração histórica `movvi-go-connect` | **REMOVER DO RUNTIME** |
| `wqbtnfbvqtkyywfcqjwa` | MOVVI Produção / backend standalone | **LEGADO; NÃO USAR PARA APOIS CORRIDAS CONSOLIDADO** |
| `zjphbuvcapwyuynadgdt` | Passageiro antigo | **LEGADO** |

O projeto `sbvhdgyuuperszlsllji` pertence ao **APOIS ENTREGAS** e está explicitamente fora do escopo.

### Development / staging

Não há project ref separado de development/staging do APOIS Corridas confirmado como canônico. Não inventar. A baseline deverá ser validada em banco vazio/ambiente efêmero antes de qualquer promoção a produção.

## Identidade canônica

Conforme `IDENTITY_MODEL.md` e o schema vivo:

- `auth.users.id` = identidade de autenticação;
- `public.users.id` = identidade operacional do usuário;
- `public.users.auth_user_id -> auth.users.id`;
- `public.drivers.id` = entidade Motorista;
- `public.drivers.user_id -> public.users.id` (1:1);
- `rides.passenger_id -> public.users.id`;
- `rides.driver_id` e `rides.accepted_driver_id -> public.drivers.id`;
- candidatos/ofertas usam `public.users.id` quando o contrato server-side assim define, sem misturar com `drivers.id`.

## Schema vivo canônico — decisões confirmadas

- `rides` usa `encoded_polyline`, `cancellation_reason`, `security_code`, `driver_latitude/driver_longitude/driver_heading` e timestamps explícitos de lifecycle;
- `tariff_rules` usa o modelo estruturado `category_id/base_fare/min_fare/per_km/per_min/stop_fee/fixed_fee/dynamic_multiplier` e extras de serviço;
- storage sensível do motorista está em buckets privados;
- existem `driver_wallets`, `driver_wallet_transactions`, `driver_withdrawals`, mas só serão considerados ledger final depois do settlement canônico;
- existem tokens/prefs/logs de notificação e RPCs para registrar/desativar token;
- existem tabelas de SOS/emergência, que precisam de E2E real para serem homologadas.

## Código legado a migrar seletivamente

- fluxos operacionais do Motorista MOVVI já migrados e ainda úteis;
- Admin MOVVI útil;
- SOS, incidentes, sharing, recibo, wallet/payout e notificações quando a implementação for superior e compatível;
- abstrações de pagamento do backend standalone após mapear finalidade/provedor.

## Código que não é fonte canônica

- `franciel046631/movvidriver` — protótipo separado;
- `franciel046631/say-hello-buddy-23` — Passageiro antigo;
- `franciel046631/SITEMOVVI` — site/protótipo separado;
- `franciel046631/APOIS` e `franciel046631/movvi-backend-standalone` — backend legado/candidato a migração, não autoridade automática.

## Regras de proteção

1. PR #1 Motorista permanece DRAFT.
2. PR #7 Passageiro permanece DRAFT.
3. PR #2 Admin permanece sem merge.
4. Nenhum merge até E2E físico e quality gates.
5. `franciel046631/apois-entregas` não será alterado.
6. Nenhuma migration destrutiva em produção.
7. Frontend nunca é autoridade de preço final, pagamento, role ou status de corrida.
8. Feature não é pronta apenas porque build passou ou botão apareceu.
9. Divergências são registradas em `MIGRATION_DECISIONS.md` como MANTER/MIGRAR/REMOVER.

## Consolidação em execução

O trabalho de consolidação é desenvolvido em `fix/apois-corridas-consolidacao` sem alterar antecipadamente as branches de homologação/PRs DRAFT. As branches de homologação continuam sendo a referência de E2E físico até promoção revisada da consolidação.

## Fases 1–5 concluídas na consolidação

- **Fase 1 — Inventário:** repositórios, ambientes, legados e Supabase mapeados.
- **Fase 2 — Banco:** identidade, schema canônico, baseline, RLS, Storage e hardening consolidados para validação em banco limpo.
- **Fase 3 — Core Ride:** entidade, state machine, request contract, intermediários e Fare Engine centralizados.
- **Fase 4 — Dispatch:** elegibilidade, redispatch, aceite atômico, timeout e no-driver status cobertos por contratos/testes.
- **Fase 5 — Financeiro:** settlement, payment truth, ledgers, wallet, payout e reversões modelados server-side. Regra comercial corrente preservada como configuração explícita; provedor eletrônico/payout não é inventado.

As baselines financeiras `007/008` foram validadas em Postgres efêmero, mas **não foram aplicadas ad-hoc ao Supabase oficial**.

## Fase 6 — Passageiro — estado validado em código

### Core integrado

O Passageiro na branch `fix/apois-corridas-consolidacao` usa os contratos canônicos para corrida ativa/histórico sem transformar o frontend em autoridade de preço, status ou pagamento.

### Rating

Direções estão explicitamente separadas:
- `rides.passenger_rating` = avaliação feita pelo **Motorista sobre o Passageiro**, preservada por compatibilidade;
- `rides.passenger_driver_rating` = avaliação feita pelo **Passageiro sobre o Motorista**, adicionada na baseline da Fase 6.

A RPC `rate_passenger_ride` exige passageiro autenticado/dono, corrida concluída, motorista vinculado e bloqueia avaliação duplicada. A média do motorista é recalculada server-side. Usuário/motorista sem avaliações aparece como `Novo`, não `5.0` falso.

### Segurança

A RPC `passenger_trigger_sos` registra evento de segurança vinculado a `ride_id`, passageiro, motorista quando existente, localização, severidade, status e timestamp, e cria evento operacional em `audit_logs`. A UI obtém localização real pelo Capacitor Geolocation. O app deixa claro que o alerta APOIS não substitui os serviços públicos 190/192.

### Compartilhamento

O Passageiro cria link via `passenger_create_or_refresh_share`; o token é aleatório, expira e pode ser revogado. A página pública lê apenas `get_shared_passenger_ride` e recebe os campos mínimos do acompanhamento; PIN, telefone, dados de pagamento, passageiro e `ride_id` não são expostos.

Em build nativo, um link público só é gerado quando `VITE_PUBLIC_APP_URL` estiver configurado ou houver origem HTTP pública real. Nenhum domínio foi inventado.

### Recibo

`get_passenger_ride_receipt` só produz recibo para corrida `finalizada` com `ride_settlements` canônico. Valor bruto, desconto, taxa APOIS, taxa do provedor, total, método/status de pagamento e settlement vêm do backend. Sem settlement, a interface informa que o recibo financeiro ainda não está disponível em vez de reconstruir um comprovante no cliente.

### Perfil

Perfil inclui dados pessoais, telefone, e-mail, foto, notificações/preferências, contatos de emergência, segurança, suporte, documentos legais e exclusão de conta. Fotos usam o bucket privado `profile-photos`, validação JPG/PNG/WebP até 10 MB, path sob `auth.uid()` e signed URL temporária.

### Termos, privacidade e recuperação

Cadastro aponta para documentos reais `/termos` e `/privacidade` e registra aceite conforme o fluxo atual. A recuperação mobile usa deep link `apoispassageiro://auth/redefinir-senha` e Android intent filter compatível; não depende de `window.location.origin` como redirect nativo.

### Pagamentos do Passageiro

O schema vivo oficial possuía linhas `pix`, `credit`, `debit`, `cash` e `wallet` marcadas ativas, porém não havia configuração canônica `finance.electronic_payment_provider`. Para não apresentar feature falsa:

- a baseline adiciona `get_passenger_payment_methods()`;
- a RPC consulta a configuração do provedor apenas server-side;
- Pix/crédito/débito ficam `enabled=false` enquanto o provedor eletrônico não estiver explicitamente configurado;
- o frontend mantém o meio visível como `Indisponível`, explica a causa e impede seleção;
- `cash` e `wallet` permanecem sujeitos às próprias regras;
- o frontend não converte mais `is_active` diretamente em “funciona”.

### Validações realmente executadas da Fase 6

**Backend — `movvi-go-connect`:** workflow `APOIS Corridas — Passenger backend validation`, run `31274524191`, conclusão **success**. Passaram:
- criação da baseline completa em PostgreSQL efêmero;
- testes de rating Passageiro → Motorista e duplicidade;
- token público, ausência de vazamento e revogação;
- SOS operacional;
- recibo vindo de settlement;
- disponibilidade de meios eletrônicos com/sem provedor configurado;
- privilégios/invariantes de segurança.

**Frontend — `say-hello-buddy-23-84b5dcbf`:** workflow `APOIS Corridas — Passenger Phase 6`, run `31274624790`, conclusão **success**. Passaram:
- contract tests da Fase 6;
- TypeScript completo;
- ESLint da superfície alterada na Fase 6;
- production build;
- Capacitor Passenger build;
- gate contra placeholders/contratos falsos da Fase 6.

### Dívida conhecida e limite de conclusão

O lint global do repositório Passageiro ainda possui erros preexistentes fora da superfície da Fase 6. Essa dívida não foi declarada resolvida e será tratada nas fases de testes/auditoria final.

A Fase 6 está **concluída e validada em código/banco efêmero**, mas **não está promovida ao Supabase oficial**. As baselines `007/008/009` são de banco limpo e não serão executadas ad-hoc em produção. A promoção futura exige migration aditiva revisada e E2E físico.

## Fase 7 — Motorista — validação canônica concluída em CI

A Fase 7 foi validada na branch de consolidação antes da Fase 8. O último run verde da validação dedicada foi:

- **Workflow:** `APOIS Corridas — Driver Phase 7`
- **Run:** `31285737531`
- **HEAD validado:** `5575f78d1a7ee36a9f49218040dae49425d59d2e`
- **Conclusão:** `success`

Passaram no mesmo run:

**Backend:**
- aplicação da baseline canônica até a Fase 7 em PostgreSQL efêmero;
- testes de integração do backend do Motorista;
- invariantes de segurança do Motorista.

**Mobile:**
- contratos da Fase 7;
- TypeScript da superfície do Motorista;
- ESLint semântico da superfície do Motorista;
- varredura de dívida de formatação sem transformar dívida de Fase 12 em falso bloqueio da Fase 7;
- preparação do cliente Firebase do Motorista;
- build e sync do APOIS Motorista;
- verificação do shell nativo;
- build do APK;
- gate de push nativo e localização em background.

Essa aprovação de CI comprova os contratos e o shell/build nativo previstos na Fase 7, mas **não substitui os testes físicos obrigatórios** de push em foreground/background/app encerrado, localização com tela bloqueada, bateria, navegação, PIN, SOS e ciclo Passageiro ↔ Motorista.

## Fase 8 — Admin — concluída no gate SAME-HEAD

O Admin foi consolidado para as entidades e contratos canônicos, mantendo operações críticas no backend autoritativo. Entre os itens validados estão RBAC administrativo, moderação de motoristas/passageiros, `public.rides`, presença/mapa operacional, categorias/tarifas, settlements/ledgers, equipe administrativa, SOS, suporte, auditoria e notificações. Controles falsos/legados foram removidos ou neutralizados, documentos privados usam URLs assinadas temporárias e a UI de Admin não altera status de corrida diretamente no navegador.

O gate final da Fase 8 passou integralmente no **mesmo HEAD**:

- **HEAD:** `863a79c28c35c41da429837c74608a65a897af0e`
- **Workflow:** `.github/workflows/apois-admin-phase8-validate.yml`
- **Run:** `31289197569`
- **Conclusão geral:** `success`

**Job `admin-backend`:**
- baseline canônica aplicada até a Fase 8 em PostgreSQL efêmero;
- testes de integração do control-plane Admin;
- testes de configurações Admin;
- invariantes de privilégio e segurança.

**Job `admin-frontend`:**
- contratos da Fase 8;
- TypeScript da superfície Admin;
- production build;
- ESLint da superfície Admin.

Portanto, a **Fase 8 está formalmente concluída no nível de código + banco efêmero + CI SAME-HEAD**. Não houve `db reset`, `db push`, `migration repair`, operação destrutiva ou promoção ad-hoc dessas baselines ao Supabase oficial para obter esse resultado.

### Limite da conclusão da Fase 8

A conclusão da Fase 8 **não** significa:
- merge dos PRs;
- promoção automática de migrations para produção;
- homologação E2E física concluída;
- liberação para Play Store.

Esses gates permanecem posteriores conforme o Prompt Mestre.

## Próxima fase autorizada — Fase 9 Mobile Release

Com a Fase 8 verde no mesmo HEAD, a sequência autorizada é a **Fase 9 — MOBILE RELEASE**. O trabalho deve partir do estado consolidado, diagnosticar antes de alterar e validar assets, splash, ícones, package IDs, Firebase, Maps, deep links e AAB sem inventar credenciais ou considerar build isolado como homologação final.
