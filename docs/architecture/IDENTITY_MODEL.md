# APOIS CORRIDAS — IDENTITY MODEL

> Status: modelo canônico definido a partir do schema vivo do Supabase oficial `vqtucstyduxrqjgyigfk` e dos RPCs atualmente usados na homologação. Nenhuma alteração de banco foi executada para produzir este documento.

## Objetivo

Eliminar definitivamente a ambiguidade histórica entre:

- `auth.users.id`;
- `public.users.id`;
- `public.users.auth_user_id`;
- `public.drivers.id`;
- `public.drivers.user_id`;
- identificadores de motorista usados no dispatch/ofertas;
- `rides.driver_id` / `rides.accepted_driver_id`.

A regra central é: **não tratar UUIDs de camadas diferentes como intercambiáveis, mesmo quando eventualmente possuírem o mesmo valor**.

## Modelo canônico

### 1. Identidade autenticada

`auth.users.id`

É a identidade de autenticação gerenciada pelo Supabase Auth.

Uso:

- sessão/JWT;
- `auth.uid()`;
- autenticação e recuperação de sessão;
- nunca deve ser usado diretamente como substituto implícito de `public.users.id`.

### 2. Usuário de domínio / mobilidade

`public.users.id`

É a identidade global do usuário dentro do domínio APOIS CORRIDAS. Uma mesma pessoa pode possuir papéis como Passageiro e Motorista sem duplicar a identidade global.

Relação oficial verificada no banco:

```text
auth.users.id
        ↓
public.users.auth_user_id  UNIQUE NOT NULL
public.users.id            PK
```

O schema vivo possui FK `public.users.auth_user_id → auth.users.id` e índice UNIQUE em `auth_user_id`.

O helper canônico existente `public.mobility_user_id()` resolve a sessão autenticada da seguinte forma:

```text
auth.uid()
  ↓
public.users.auth_user_id
  ↓
public.users.id
```

**Regra:** código server-side/RPC que precisa do usuário de domínio deve resolver por `mobility_user_id()` ou por uma abstração equivalente validada; não assumir `auth.uid() = public.users.id`.

### Evidência de produção/homologação

Na auditoria read-only de 2026-08-08 havia 1 usuário de domínio:

- `auth_user_id` nulo: 0;
- `auth_user_id` preenchido: 1;
- registros onde `public.users.id != public.users.auth_user_id`: **1**.

Portanto, no estado vivo atual, a equivalência direta entre Auth ID e User ID já é falsa e quebraria o usuário existente.

## 3. Entidade Motorista

`public.drivers.id`

É a identidade da entidade operacional Motorista.

Relação oficial:

```text
public.users.id
      ↓
public.drivers.user_id UNIQUE NOT NULL
public.drivers.id      PK
```

O schema vivo possui FK `drivers.user_id → users.id` e índice UNIQUE para `drivers.user_id`.

Na auditoria read-only:

- motoristas: 1;
- `drivers.user_id` nulo: 0;
- usuários com mais de um registro em `drivers`: 0.

**Invariante canônica:** no máximo uma entidade `drivers` por `public.users.id`.

## 4. Identificadores dentro de `rides`

### Passageiro

`rides.passenger_id → public.users.id`

É USER ID de domínio, não Auth ID.

### Motorista atribuído

`rides.driver_id → public.drivers.id`

`rides.accepted_driver_id → public.drivers.id`

São DRIVER ENTITY IDs, não `public.users.id` e não `auth.users.id`.

### Dispatch/ofertas

O runtime atual usa USER IDs de domínio nos campos de oferta:

- `rides.candidate_driver_ids[]` → `public.users.id`;
- `rides.offered_driver_ids[]` → `public.users.id`;
- `rides.rejected_driver_ids[]` → `public.users.id`;
- `rides.current_offer_driver_id` → semanticamente `public.users.id`.

Isto foi confirmado pela implementação viva dos RPCs:

- `append_nearby_busy_driver_candidates()` adiciona `drivers.user_id` às listas;
- `driver_accept_ride()` resolve primeiro `mobility_user_id()` e valida esse USER ID nas listas de oferta;
- após o aceite, grava `rides.driver_id` e `rides.accepted_driver_id` com `drivers.id`;
- `driver_reject_ride()` registra o USER ID de domínio na rejeição/oferta.

### Regra de transição

```text
DISPATCH
public.users.id do motorista
        ↓
candidate/offered/current/rejected

ACEITE ATÔMICO
public.users.id
        ↓ resolve drivers.user_id
public.drivers.id
        ↓
rides.driver_id / rides.accepted_driver_id
```

Não converter silenciosamente uma dessas famílias para a outra.

## 5. Integridade observada no banco vivo

Auditoria read-only em `vqtucstyduxrqjgyigfk`:

- corridas existentes: 6;
- `rides.passenger_id` órfãos: 0;
- `rides.driver_id` órfãos: 0;
- `rides.accepted_driver_id` órfãos: 0;
- IDs em `candidate_driver_ids`: 2, órfãos em `public.users`: 0;
- IDs em `offered_driver_ids`: 2, órfãos em `public.users`: 0;
- IDs em `rejected_driver_ids`: 0;
- `current_offer_driver_id` preenchidos no momento da consulta: 0.

A integridade atual confirma a semântica descrita acima.

## 6. Aceite de corrida

O RPC atual `driver_accept_ride()` já possui propriedades importantes que devem ser preservadas:

- resolve o usuário autenticado para `public.users.id`;
- resolve a entidade `public.drivers.id`;
- bloqueia motorista e corrida com `FOR UPDATE`;
- valida aprovação, online/status, assinatura e elegibilidade/oferta;
- só então grava o motorista atribuído;
- usa DRIVER ID nos campos atribuídos.

Ele é a base atual para o requisito de aceite atômico, mas ainda precisa de teste de concorrência com dois motoristas tentando aceitar a mesma corrida antes de ser declarado homologado.

## 7. Cadastro

O RPC `driver_complete_registration_v2()` atualmente segue o modelo de camadas:

1. autenticação Supabase identifica `auth.uid()`;
2. cria/atualiza `public.users` e mantém a relação por `auth_user_id`;
3. registra o papel `driver` em `user_roles` usando `public.users.id`;
4. cria/atualiza `public.drivers` ligado por `drivers.user_id`;
5. persiste dados/documentos do motorista.

A lógica futura deve preservar esta separação.

## 8. Regras obrigatórias para código novo/refatorado

1. Variáveis devem deixar claro o domínio do ID sempre que houver risco de ambiguidade:
   - `authUserId`;
   - `userId` ou `mobilityUserId`;
   - `driverId`.
2. Não usar nomes genéricos como `id` para transportar IDs entre camadas críticas.
3. Queries de Passageiro usam `public.users.id` para `rides.passenger_id`.
4. Queries de motorista atribuído usam `public.drivers.id` para `rides.driver_id`/`accepted_driver_id`.
5. Dispatch/ofertas continuam usando USER IDs enquanto essa for a estrutura canônica dos campos atuais.
6. RLS deve resolver a sessão por `auth.uid() → users.auth_user_id → users.id` quando a política opera sobre entidades de domínio.
7. Admin não deve comparar diretamente Auth ID com Driver ID.
8. Types do frontend não são autoridade enquanto estiverem divergentes do schema vivo.

## 9. Divergências que NÃO devem ser “corrigidas” por simplificação

O schema atual possui `handle_new_user()` que, em alguns caminhos, pode inicialmente criar `public.users.id` com o mesmo UUID de `auth.users.id`. Isso não transforma os dois conceitos em uma única identidade.

Existe atualmente pelo menos um registro vivo em que os IDs são diferentes. Portanto é proibido introduzir lógica como:

```text
const userId = session.user.id
// e usar userId diretamente como public.users.id
```

sem resolver o usuário de domínio.

## 10. Próximas validações antes de qualquer migration de identidade

- revisar RLS de `users`, `drivers`, `rides`, `driver_documents`, carteiras e pagamentos;
- localizar queries frontend/backend que usam `auth.uid()` contra `public.users.id` diretamente;
- localizar usos de `candidate_driver_ids` que esperem `drivers.id` por engano;
- localizar usos de `rides.driver_id` que esperem USER ID por engano;
- executar teste de concorrência do aceite;
- regenerar types somente após consolidação do schema.

## Decisão final desta fase

A representação canônica do APOIS CORRIDAS é:

```text
AUTH
  auth.users.id
       │
       │ 1:1 via users.auth_user_id UNIQUE NOT NULL
       ▼
DOMÍNIO
  public.users.id
       │
       │ 0..1 via drivers.user_id UNIQUE NOT NULL
       ▼
MOTORISTA
  public.drivers.id
```

E na corrida:

```text
rides.passenger_id              = public.users.id
ride offer/candidate IDs        = public.users.id
rides.driver_id                 = public.drivers.id
rides.accepted_driver_id        = public.drivers.id
```

Qualquer implementação incompatível com este mapa deve ser classificada, corrigida ou migrada de forma cirúrgica após análise, nunca por substituição global cega.
