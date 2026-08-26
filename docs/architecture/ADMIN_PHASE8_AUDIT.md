# APOIS CORRIDAS — FASE 8 / AUDITORIA DO ADMIN

Data da auditoria: 2026-08-08.

Escopo: somente APOIS CORRIDAS. `franciel046631/apois-entregas` permanece explicitamente fora do escopo.

Esta auditoria segue a Fase 8 do Prompt Mestre: migrar, rebrand, RBAC, métricas, operações, financeiro, segurança e auditoria. Nenhuma migration desta fase foi aplicada ad-hoc ao Supabase oficial.

## Fontes comparadas

A. Admin atual em `franciel046631/movvi-go-connect` / `fix/apois-corridas-consolidacao`.

B. Baseline canônica `supabase/baseline/001..010` construída a partir do schema oficial e das fases anteriores.

C. Schema vivo do Supabase oficial `vqtucstyduxrqjgyigfk`, consultado somente em modo leitura.

## Achados P0

### 1. Autorização do Admin usa dois modelos incompatíveis

O schema canônico possui dois domínios diferentes:

- mobilidade: `public.users` + `public.user_roles`, onde `user_roles.user_id -> public.users.id`;
- staff/Admin: `public.profiles` + `public.app_role` + `public.role_permissions`, onde `profiles.user_id -> auth.users.id`.

O `AdminGuard` e o login consultavam `user_roles.user_id = auth.uid()`. Isso mistura `auth.users.id` com `public.users.id` e não corresponde ao modelo canônico.

Além disso, vários Server Functions chamavam a RPC legada `has_role`, que não existe no Supabase oficial atual.

**MANTER:** `profiles + role_permissions + private.has_permission()` como RBAC administrativo.

**MIGRAR:** login, guard e mutações administrativas para permissões explícitas.

**REMOVER:** `has_role` e comparação direta `user_roles.user_id = auth.uid()` como autorização do Admin.

### 2. Categorias usam schema legado inexistente

O Admin usa `ride_categories(key,label,color,enabled,sort_order)`.

O schema oficial/canônico usa `ride_categories(code,name,description,icon,image_url,capacity_label,eta_label,sort_order,is_active)`.

A criação de categorias arbitrárias também conflita com o domínio atual da corrida, que aceita somente `carros`, `motos`, `fretes`, `guincho`, `envios`.

**MANTER:** cinco códigos canônicos e seus registros editáveis.

**MIGRAR:** UI e backend para `code/name/.../is_active`.

**REMOVER:** `key/label/color/enabled`, criação livre de novas categorias e exclusão destrutiva de categoria usada por corrida/tarifa.

### 3. Tarifas usam modelo key/value legado

O Admin usa `tariff_rules(category_key,field_key,value)`.

O modelo canônico é uma linha por `category_id + city`, com campos server-side como `base_fare`, `min_fare`, `per_km`, `per_min`, `stop_fee`, `fixed_fee`, `dynamic_multiplier` e extras específicos.

**MANTER:** `tariff_rules(category_id,city,...)` e o Fare Engine server-side.

**MIGRAR:** painel de tarifas para editar somente campos suportados pelo schema canônico através de RPC validada.

**REMOVER:** campos arbitrários key/value e cálculo/regra de preço inventada no frontend.

### 4. Métricas financeiras do Dashboard não são financeiras

O Dashboard chamava de `Receita` a soma de `rides.final_price/estimated_price`. Isso é volume bruto de corridas, não receita APOIS. A Fase 5 definiu `ride_settlements`, `platform_fee_cents`, ledgers e regra atual de 0% de taxa da plataforma.

**MANTER:** settlement/ledger como fonte de verdade financeira.

**MIGRAR:** métricas para distinguir volume bruto, ganhos do motorista e receita APOIS.

**REMOVER:** `sum(rides.final_price)` rotulado como receita da plataforma.

### 5. Auditoria administrativa era placebo

`adminAudit.ts` tentava gravar em `admin_audit_logs`, tabela que não existe no schema vivo oficial. O schema canônico já possui `audit_logs`.

O login também tentava gravar `admin_login_history` e `admin_users_meta`, que não existem no schema vivo consultado.

**MANTER:** `audit_logs` canônico.

**MIGRAR:** mutações críticas para registrar auditoria no mesmo backend/RPC que executa a ação.

**REMOVER:** logs cliente best-effort em tabelas inexistentes e qualquer auditoria que possa falhar silenciosamente.

### 6. Mutações administrativas dependiam de RLS inexistente

Categorias, tarifas e passageiros eram alterados por Server Functions usando o publishable client do usuário. A baseline deny-by-default não concede as políticas de escrita esperadas por essas funções.

**MANTER:** deny-by-default.

**MIGRAR:** ações críticas para RPCs `SECURITY DEFINER` com `private.has_permission()` + validação + audit log.

**REMOVER:** update/delete administrativo direto em tabela como substituto de autorização backend.

### 7. Exclusão de passageiro era hard-delete inconsistente

A função `deletePassenger` apagava `public.users`, mas isso não apaga o registro correspondente em `auth.users`. Poderia deixar identidade autenticável sem perfil operacional.

**MANTER:** bloqueio/suspensão e lifecycle de exclusão controlado.

**MIGRAR:** ação administrativa para soft-delete operacional (`deleted_at`) com bloqueio e auditoria; exclusão de Auth exige fluxo separado e autorizado.

**REMOVER:** `delete from public.users` como exclusão de conta completa.

## Rebrand

O painel já usa marca APOIS em títulos, mas o sidebar ainda exibe `APOIS DRIVE`, herança do painel histórico. A marca administrativa deve ser neutra ao produto e não reintroduzir MOVVI/DRIVE.

**MANTER:** APOIS.

**MIGRAR:** sidebar para `APOIS ADMIN`.

**REMOVER:** identidade MOVVI/DRIVE visível do painel final.

## Estado do Supabase oficial observado

Consultas read-only confirmaram:

- `admin_is_authorized()` existe e hoje delega a `private.has_permission('users.manage')`;
- `admin_set_driver_approval(...)` existe;
- `private.has_permission()` resolve staff por `profiles.role -> role_permissions`;
- `has_role` não aparece entre as funções administrativas canônicas consultadas;
- `ride_categories` vivo já usa `code/name/.../is_active`;
- `admin_driver_notes` existe;
- `admin_audit_logs`, `admin_login_history` e `admin_users_meta` não apareceram no schema vivo consultado;
- as tabelas de settlement da Fase 5 ainda não estão promovidas ao projeto oficial nesta etapa.

## Estratégia da Fase 8

1. adicionar baseline 011 de control plane Admin para banco limpo;
2. consolidar RBAC por permissão;
3. migrar ações de motorista/passageiro/staff/categorias/tarifas para RPCs canônicas;
4. migrar Dashboard para métricas server-side e settlement-aware;
5. migrar operações/SOS/suporte para leitura permissionada;
6. migrar financeiro para settlement/ledgers/payouts;
7. garantir audit log backend para ações críticas;
8. rebrand visível;
9. criar contract/integration tests e workflow específico da Fase 8;
10. não promover baseline 011 ad-hoc ao Supabase oficial; futura promoção exige migration aditiva revisada.
