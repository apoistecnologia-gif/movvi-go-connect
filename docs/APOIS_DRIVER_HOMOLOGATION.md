# APOIS Motorista — Homologação

Branch isolada para validar o fluxo real Passageiro → Motorista no Supabase oficial `vqtucstyduxrqjgyigfk`.

## Regras

- Não alterar `main` durante a homologação.
- `drivers.user_id` representa `public.users.id` (ID operacional), não `auth.users.id`.
- Ofertas usam `rides.candidate_driver_ids` com IDs operacionais.
- Aceite é atômico pela RPC `driver_accept_ride`.
- GPS/online passam por `driver_set_presence`.
- O APK técnico desta branch serve apenas para validar o contrato de produção antes de transportar o fluxo para a interface final do motorista.
