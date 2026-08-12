# APOIS Motorista — Data Safety (fonte de verdade)

Atualizado em: 11/08/2026
Package: `com.apois.motorista`

Este documento é a fonte de verdade para preencher a seção **Segurança dos dados / Data Safety** da Google Play do APOIS Motorista. Deve ser confrontado com o AAB final antes de cada envio.

## Respostas gerais

- O app coleta ou transmite dados do usuário: **Sim**.
- Os dados são criptografados em trânsito: **Sim**, por HTTPS/TLS nos serviços utilizados.
- O usuário pode solicitar exclusão da conta e dos dados associados: **Sim**.
- Exclusão dentro do app: **Sim**, via `delete-my-account`.
- Solicitação externa: `https://apoisbrasil.com.br/excluir-conta`.
- Política pública: `https://apoisbrasil.com.br/privacidade`.
- Venda de dados pessoais: **Não**.

> Para “compartilhamento”, aplicar a definição da Google Play. Processamento por fornecedor exclusivamente em nome da APOIS, sob a exceção de prestador de serviço, não deve ser marcado automaticamente como compartilhamento. Revalidar contratos e SDKs antes do envio.

## Tipos de dados

| Categoria Google Play | Coletado | Compartilhado* | Obrigatório | Finalidades principais |
|---|---:|---:|---:|---|
| Informações pessoais — Nome | Sim | Não | Sim | Cadastro, operação, segurança e suporte |
| Informações pessoais — E-mail | Sim | Não | Conforme cadastro | Autenticação, recuperação e suporte |
| Informações pessoais — Telefone | Sim | Não | Sim/funcional | Conta, segurança e contato operacional |
| Informações pessoais — Endereço | Sim, quando exigido no cadastro/KYC | Não | Conforme fluxo | Verificação cadastral e obrigações operacionais |
| IDs do usuário | Sim | Não | Sim | Autenticação e vínculo de dados |
| Identificadores governamentais — CPF/CNH | Sim | Não | Sim para aprovação | KYC, aprovação, segurança, prevenção a fraude e obrigações legais |
| Fotos | Sim | Não | Conforme cadastro | Perfil, documentos e verificação cadastral |
| Dados do veículo/documentos | Sim | Não | Sim para operar | Aprovação do motorista e segurança |
| Localização aproximada | Sim | Não | Funcional | Disponibilidade, despacho, mapas e segurança |
| Localização precisa | Sim | Não | Funcional | Ofertas, chegada, navegação, corrida e segurança |
| Localização em segundo plano | Sim | Não | Funcional enquanto online/em operação | Disponibilidade, despacho, acompanhamento operacional e segurança |
| Atividade no app — interações | Sim | Não | Automático/funcional | Operação do mapa e funcionamento do app |
| Histórico de corridas | Sim | Não | Funcional | Operação, segurança, suporte, ganhos e auditoria |
| Avaliações e feedback | Sim | Não | Opcional | Qualidade, confiança e segurança |
| Mensagens/conteúdo enviado pelo usuário | Sim | Não | Opcional | Atendimento, suporte e incidentes |
| Informações financeiras — ganhos | Sim | Não | Funcional | Carteira e extrato do motorista |
| Informações financeiras — pagamentos/transações | Sim | Não* | Funcional | Mensalidade, corridas, conciliação e comprovantes |
| Informações financeiras — repasses/Pix | Sim | Não* | Funcional para saque | Pagamentos ao motorista e conciliação |
| IDs do dispositivo/outros IDs | Sim | Não* | Automático | Push, Firebase Installations, segurança e operação dos SDKs |
| Diagnóstico — informações de falhas | Sim | Não* | Automático | Estabilidade e diagnóstico dos SDKs, inclusive mapas |
| Diagnóstico — desempenho/outros diagnósticos | Sim | Não* | Automático | Métricas técnicas e confiabilidade |

\* Validar a definição de compartilhamento no formulário final conforme o papel contratual de Google/Firebase, processadores financeiros, Asaas e demais operadores.

## SDKs e operadores que precisam ser considerados

- Supabase (Auth, banco, Edge Functions, Storage, Realtime quando aplicável).
- Google Maps / Google Places.
- Google Play Services Location.
- Firebase Cloud Messaging / Firebase Installations.
- Capacitor Android.
- Capacitor Camera.
- Capacitor Geolocation.
- Capacitor Push Notifications.
- Serviço nativo `DriverLocationService`.
- Processadores financeiros/pagamentos configurados na versão final, inclusive Asaas quando utilizado.

## Localização em segundo plano

O `AndroidManifest` declara `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_LOCATION`, e o app possui `DriverLocationService` com `foregroundServiceType="location"`.

A declaração da Play Store deve refletir que a localização pode continuar sendo processada enquanto o motorista está **online e disponível para receber ofertas** ou executando uma corrida, e não apenas durante uma corrida ativa. O disclosure destacado, a Política de Privacidade e o formulário específico de background location devem usar a mesma descrição.

## Câmera e mídia

O `AndroidManifest` declara `CAMERA`, `READ_MEDIA_IMAGES` e compatibilidade de leitura de armazenamento até Android 12 (`READ_EXTERNAL_STORAGE` com `maxSdkVersion=32`). Essas permissões devem permanecer somente enquanto forem necessárias para foto de perfil, CNH, documentos e fluxo de verificação cadastral. No AAB final, verificar se existe alternativa de Photo Picker para reduzir acesso amplo à mídia quando possível.

## Exclusão e retenção

A exclusão da conta é implementada no app e chama `delete-my-account`. Dados pessoais e documentos devem ser eliminados/anonimizados conforme o fluxo. Registros de corridas, pagamentos, repasses, segurança, prevenção a fraude, auditoria ou cumprimento de obrigação legal podem ser mantidos pelo período necessário, com minimização/anonimização quando aplicável.

## Gate antes do envio

Antes de preencher/enviar o formulário no Play Console:

1. inspecionar o `AndroidManifest` mesclado do AAB final;
2. listar SDKs realmente empacotados;
3. validar disclosure destacado de localização em segundo plano;
4. validar formulário de background location e vídeo quando exigido;
5. confirmar URLs públicas de privacidade e exclusão;
6. confirmar que “usuário pode solicitar exclusão” está marcado como **Sim**;
7. comparar este documento com a Política de Privacidade vigente.
