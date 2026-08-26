# APOIS CORRIDAS — MIGRATION DECISIONS

> Documento exigido pelo Prompt Mestre. As decisões abaixo foram tomadas comparando a implementação mais nova, o legado MOVVI, o backend standalone e o schema vivo do Supabase oficial `vqtucstyduxrqjgyigfk`. Nenhuma decisão foi tomada apenas por data/nome de arquivo.

## Regra de decisão

Para cada divergência foram considerados: regra de negócio, integração real, testes/builds existentes, compatibilidade com o schema vivo, segurança e custo de migração.

## 1. Produto / repositórios

### Passageiro
- A: `franciel046631/say-hello-buddy-23-84b5dcbf` / `feat/apois-passageiro-completo`
- B: `franciel046631/say-hello-buddy-23`
- C: implementação passageiro histórica dentro do legado MOVVI
- **MANTER:** A como fonte do app Passageiro.
- **MIGRAR:** apenas recursos comprovadamente melhores do legado (segurança, recibo, sharing, helpers) quando compatíveis com o schema oficial.
- **REMOVER/ARQUIVAR:** dependência operacional de B e de bundles antigos do Passageiro.

### Motorista
- A: app APOIS atual em `franciel046631/movvi-go-connect` / `feat/apois-motorista-producao-homologacao`
- B: implementação MOVVI presente no histórico do mesmo repositório
- C: `franciel046631/movvidriver`
- **MANTER:** A, preservando fluxos operacionais validados.
- **MIGRAR:** componentes úteis de B que ainda tenham regra melhor e sejam compatíveis.
- **REMOVER/ARQUIVAR:** C como fonte de produção; é protótipo separado.

### Admin
- A: `franciel046631/movvi-go-connect` / `feat/apois-admin-supabase-oficial-homologacao`
- B: Admin MOVVI histórico
- C: painéis/protótipos separados
- **MANTER:** A.
- **MIGRAR:** telas e operações úteis de B quando a ação backend existir de verdade.
- **REMOVER:** controles visuais que não possuam enforcement real.

### Backend
- A: Edge Functions/RPCs que efetivamente atendem o Supabase oficial e o Passageiro atual
- B: Server Functions no `movvi-go-connect`
- C: `franciel046631/movvi-backend-standalone` e `franciel046631/APOIS`
- **MANTER:** contratos server-side que correspondem ao schema vivo oficial.
- **MIGRAR:** algoritmos úteis de B/C somente depois de adaptação e teste.
- **REMOVER/ARQUIVAR:** qualquer deploy apontando para project refs legados.

## 2. Supabase

### Project refs encontrados
- `vqtucstyduxrqjgyigfk`: **MANTER — oficial APOIS Corridas**.
- `ekddifjpbieuainvjlbl`: **REMOVER das configurações ativas; manter apenas em documentação histórica se necessário**.
- `wqbtnfbvqtkyywfcqjwa`: **REMOVER de deploy/runtime ativo; backend standalone legado**.
- `zjphbuvcapwyuynadgdt`: **REMOVER de runtime ativo; Passageiro legado**.

Não existe development/staging separado confirmado. Não inventar.

## 3. Identidade

Comparação histórica:
- `auth.users.id` usado diretamente em alguns fluxos;
- `public.users.id` usado como identidade operacional do usuário;
- `public.drivers.id` usado como entidade Motorista;
- arrays de oferta antigos misturaram IDs.

**MANTER (compatível com schema vivo atual):**
- `auth.users.id` = identidade de autenticação;
- `public.users.id` = identidade operacional/profile do ecossistema, ligada por `users.auth_user_id`;
- `public.drivers.id` = entidade Motorista;
- `drivers.user_id -> users.id`;
- `rides.passenger_id -> users.id`;
- `rides.driver_id`/`accepted_driver_id -> drivers.id`.

**MIGRAR:** todas as APIs, RLS, tokens, offers e queries para respeitar esse modelo.

**REMOVER:** comparação ad-hoc entre `drivers.id`, `users.id` e `auth.uid()` sem resolução explícita.

## 4. Ride / status

- A: status legados em português (`procurar_motorista`, `motorista_a_caminho`, `motorista_chegou`, `em_viagem`, `finalizada`, cancelamentos separados)
- B: state machine conceitual nova em inglês
- C: variantes de backend que tratavam falta de motorista como cancelamento

**MANTER TEMPORARIAMENTE:** os valores persistidos atuais em português para não quebrar produção.

**MIGRAR:** enforcement central de transições server-side e documentação canônica; aliases de domínio podem ser usados no código.

**REMOVER:** qualquer regra que transforme `no_driver_available/expired` em `cancelada_passageiro`.

## 5. Ride entity / colunas duplicadas

**MANTER:** colunas efetivamente usadas no schema vivo: `origin`, `destination`, `intermediates`, `encoded_polyline`, timestamps de lifecycle, `cancellation_reason`, `cancelled_by`, `share_token`.

**MIGRAR:** código que ainda usa aliases históricos (`route_polyline`, `cancel_reason`, `safety_code`, `driver_lat`, `driver_lng`) para os nomes do schema vivo (`encoded_polyline`, `cancellation_reason`, `security_code`, `driver_latitude`, `driver_longitude`).

**REMOVER:** aliases duplicados após todos os consumidores serem migrados e após migration segura específica; não dropar colunas em produção durante homologação.

## 6. Tarifa / Fare Engine

- A: `tariff_rules(category_id, base_fare, min_fare, per_km, per_min, stop_fee, fixed_fee, dynamic_multiplier, extras...)` no schema vivo.
- B: geração antiga `category_key/field_key/value`.

**MANTER:** A.

**MIGRAR:** Admin e qualquer cálculo legado para A e para uma fórmula única server-side.

**REMOVER:** B do runtime e de novas migrations.

## 7. Dispatch

- A: `passenger-ride-request` / fluxo atual com elegibilidade e redispatch coerentes
- B: `process-ride-dispatch` legado
- C: dispatch standalone antigo

**MANTER:** A como política de referência.

**MIGRAR:** qualquer chamada de redispatch para reutilizar a mesma elegibilidade do dispatch inicial.

**REMOVER:** B/C de deploy caso tratem `no driver` como cancelamento do passageiro ou usem identidade divergente.

## 8. Aceite

**MANTER:** RPC/transação server-side que valida corrida + motorista e resolve concorrência atomicamente.

**MIGRAR:** clientes para chamar apenas a operação atômica.

**REMOVER:** update direto do frontend em `rides.driver_id/status` para aceitar corrida.

## 9. Pagamentos / provedores

Implementações encontradas:
- Mercado Pago: Edge Functions e webhook legados/atuais para mensalidade/cobranças.
- Asaas: adapter no backend standalone.

A decisão comercial de provedor por domínio não está documentada no Prompt Mestre.

**MANTER:** as integrações existentes sem apagar até provar finalidade.

**MIGRAR:** para uma abstração `PaymentProvider` por finalidade: corrida, mensalidade, payout.

**REMOVER:** nomes falsos de assinatura/preapproval quando o objeto real for apenas checkout preference.

**PENDÊNCIA EXTERNA:** definição final de qual provedor processará corrida eletrônica e payout em produção, se ainda não estiver definida em configuração/conta real. Não inventar tarifa nem credencial.

## 10. Financeiro / ledger

**MANTER:** propriedades corretas já existentes em `driver_wallets`, `driver_wallet_transactions` e `driver_withdrawals`, especialmente idempotência/atomicidade onde comprovadas.

**MIGRAR:** conclusão de corrida para criar `RideSettlement` e ledger canônico antes de atualizar carteira.

**REMOVER:** UI de Ganhos baseada em soma de `rides.final_price` como fonte financeira.

## 11. KYC / documentos

**MANTER:** buckets privados e signed URLs.

**MIGRAR:** substituição de documento para sempre reabrir `pending_review`; aprovação administrativa deve conferir arquivo/estado no backend.

**REMOVER:** qualquer update cliente que preserve `approved` depois de trocar arquivo.

## 12. Push

**MANTER:** FCM nativo + Realtime como caminho rápido de foreground.

**MIGRAR:** Motorista para cliente Firebase `com.apois.motorista`, registro de token via RPC canônica e roteamento correto do clique.

**REMOVER:** dependência exclusiva de Realtime para oferta quando app está em background/terminated.

## 13. Localização Motorista

**MANTER:** Foreground Service Android nativo.

**MIGRAR:** presença/GPS para o serviço nativo quando online, com UI apenas como controle/observação.

**REMOVER:** dependência exclusiva de `navigator.geolocation.watchPosition`/timer WebView como localização operacional.

## 14. CI/CD

**MANTER:** workflows de validação/build que não modificam fonte.

**REMOVER:** workflows de `repair source -> git commit -> git push` durante validation.

## 15. Branding

**MANTER:** identidade visual APOIS preto/grafite/amarelo/laranja e mapas dark.

**MIGRAR:** strings/componentes herdados cujo nome interno ainda contém MOVVI mas são invisíveis, apenas quando a troca não gera regressão desnecessária.

**REMOVER:** qualquer texto, logo, cor-identidade ou package ID MOVVI visível/empacotado em builds finais APOIS.

## 16. APOIS Entregas

- `franciel046631/apois-entregas`
- **REMOVER DO ESCOPO:** nenhum código, branch, migration, Supabase ou conceito de delivery será usado no APOIS Corridas.

## 17. Fase 6 — Passageiro

### Rating
- A: `rides.passenger_rating`, já usado por `driver_rate_passenger` para **Motorista → Passageiro**.
- B: UI Passageiro que interpretava `passenger_rating` como se fosse avaliação do motorista.
- C: campo canônico novo `rides.passenger_driver_rating` para **Passageiro → Motorista**.
- **MANTER:** A com seu significado original para não quebrar o Motorista.
- **MIGRAR:** Passageiro para C; média do motorista é recalculada server-side a partir de avaliações Passenger → Driver concluídas.
- **REMOVER:** qualquer uso de `passenger_rating` como nota dada pelo passageiro ao motorista e qualquer `5.0` hardcoded; sem avaliações, a UI mostra `Novo`.

### Compartilhamento de corrida
- A: `rides.share_token` legado sem contrato completo de expiração/revogação.
- B: compartilhamento cliente baseado em ID/token já presente.
- C: RPCs canônicas `passenger_create_or_refresh_share`, `passenger_revoke_share` e `get_shared_passenger_ride`, com token aleatório, expiração, revogação e resposta pública mínima.
- **MANTER:** a coluna `share_token` como armazenamento compatível.
- **MIGRAR:** criação/leitura/revogação para C e adicionar `share_expires_at`/`share_revoked_at` de forma aditiva.
- **REMOVER:** link público previsível por `ride_id`, token eterno e exposição de PIN, telefone, pagamento ou PII desnecessária.

### Segurança / SOS
- A: `sos_alerts` e contatos de emergência já existentes.
- B: botões/fluxos de segurança sem vínculo operacional completo.
- C: `passenger_trigger_sos` com autenticação, ownership da corrida, janela de status, localização, severidade, `ride_id` e evento em `audit_logs`.
- **MANTER:** tabelas e contatos existentes tecnicamente compatíveis.
- **MIGRAR:** botão Segurança/SOS do Passageiro para C.
- **REMOVER:** qualquer SOS placebo. A UI informa corretamente que o alerta APOIS não substitui 190/192.

### Recibo
- A: telas de histórico que usavam `final_price/estimated_price` como comprovante.
- B: ledger/settlement canônico da Fase 5.
- C: `get_passenger_ride_receipt`, que só retorna recibo quando existe `ride_settlements` da corrida concluída.
- **MANTER:** detalhes operacionais de histórico para corridas não liquidadas.
- **MIGRAR:** recibo financeiro para C.
- **REMOVER:** chamar valor reconstruído no frontend de recibo; sem settlement, mostrar explicitamente `Recibo financeiro ainda não disponível`.

### Perfil e foto
- A: perfil/contatos/preferências já integrados.
- B: bucket privado `profile-photos` e RLS de primeiro diretório por `auth.uid()`.
- **MANTER:** B e as políticas privadas existentes.
- **MIGRAR:** upload de avatar do Passageiro para o bucket privado, persistindo somente o path e exibindo por signed URL temporária.
- **REMOVER:** dependência de avatar público ou upload sem validação de MIME/tamanho.

### Termos / privacidade / recuperação
- **MANTER:** rotas reais `/termos` e `/privacidade`, aceite registrado no cadastro e deep link nativo `apoispassageiro://auth/redefinir-senha` já compatível com o Android Manifest.
- **MIGRAR:** todas as superfícies de perfil/cadastro para links reais e recuperação nativa segura.
- **REMOVER:** `window.location.origin` como autoridade de redirect dentro do Capacitor.

### Formas de pagamento do Passageiro
- A: tabela `payment_methods`, na qual linhas históricas Pix/crédito/débito podem estar `is_active=true` mesmo sem gateway eletrônico configurado.
- B: frontend que convertia `is_active` diretamente em `enabled`.
- C: RPC `get_passenger_payment_methods`, que consulta server-side `finance.electronic_payment_provider` e só marca meios eletrônicos como disponíveis quando existe provedor explicitamente configurado; `cash` e `wallet` seguem as regras próprias.
- **MANTER:** cadastro administrativo dos meios de pagamento.
- **MIGRAR:** frontend para C e manter os meios ativos porém indisponíveis visíveis com explicação, sem permitir seleção.
- **REMOVER:** `enabled = is_active` para Pix/cartões e qualquer aparência de checkout eletrônico funcional sem provedor real.

### Estado de validação da Fase 6
- Backend: baseline efêmera completa + testes de integração + invariantes de segurança passaram no workflow `APOIS Corridas — Passenger backend validation`, run `31274524191`.
- Passageiro: contract tests, TypeScript, lint da superfície alterada, production build, Capacitor build e gate de placeholders passaram no workflow `APOIS Corridas — Passenger Phase 6`, run `31274624790`.
- **NÃO PROMOVER AINDA:** `007/008/009` são baseline para banco limpo; a produção oficial ainda não recebeu estas mudanças nesta fase. A promoção deve usar migration aditiva revisada, não execução ad-hoc da baseline.
- Dívida conhecida: o lint global do repositório Passageiro possui erros preexistentes fora da superfície da Fase 6 e será tratado nas fases de testes/auditoria; não foi mascarado como “resolvido”.
