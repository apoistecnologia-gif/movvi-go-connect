# SENATRAN Q19 — proteção e prova de integridade dos logs (23/11/2026)

**Projeto:** apoistecnologia-gif/movvi-go-connect. **Tabela:** `public.audit_logs`. **Corte UTC:** `2026-11-23 18:12:23.194821+00`.

- Registros incluídos no marco: **230**.
- SHA-256 do agregado ordenado: `c02bde02f331cd40221982d69cd4569fac2ec890fb4c024af839e75faa21065b`.
- Algoritmo: selecionar linhas cuja `created_at <= cutoff`; converter cada linha para `to_jsonb(l)`; agregar com `jsonb_agg(item ORDER BY created_at, id)`; converter o JSONB agregado em texto UTF-8; calcular SHA-256 com `pgcrypto`.
- RLS ativo; alteração/exclusão bloqueadas por trigger `apois_q19_audit_append_only` (SQLSTATE 42501); permissões UPDATE, DELETE e TRUNCATE revogadas para anon, authenticated e service_role. Inserção de novos eventos pelo service_role continua permitida.
- A alteração de um registro anterior ao corte ou o acréscimo de linha com data retroativa altera a impressão SHA-256; o valor neste repositório fornece um marco externo ao banco.

**SQL de verificação:**

```sql
WITH dataset AS (
  SELECT to_jsonb(l) AS item, l.created_at, l.id
  FROM public.audit_logs l
  WHERE l.created_at <= TIMESTAMPTZ '2026-11-23 18:12:23.194821+00'
), grouped AS (
  SELECT COUNT(*) AS total,
         COALESCE(jsonb_agg(item ORDER BY created_at, id), '[]'::jsonb)::text AS canonical
  FROM dataset
)
SELECT total,
       encode(extensions.digest(convert_to(canonical, 'UTF8'), 'sha256'), 'hex') AS sha256
FROM grouped;
```

**Limites:** Este marco é uma medida pontual de detecção de alterações, não prova retenção contínua, backup, cofre WORM, centralização independente ou monitoramento 24x7; operador com controle administrativo total pode modificar schema, portanto Q19 deve continuar em avaliação.
