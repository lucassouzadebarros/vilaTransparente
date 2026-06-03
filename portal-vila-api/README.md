# Portal da Vila API

Backend Spring Boot do Portal da Vila.

## Recursos implementados

- Login JWT com roles `ADMIN` e `RESIDENT`.
- Seed com 10 casas, 10 moradores, usuario admin, usuario morador, contribuicoes, despesas, servico, orcamento e documento.
- Dashboard com saldo: contribuicoes pagas menos despesas.
- Contribuicoes por casa/mes com indice unico.
- Pix por gateway via `PixGatewayClient`, com `AsaasPixGatewayClient` como implementacao inicial.
- Geracao de cobrancas mensais Pix.
- QR Code Pix e copia-e-cola salvos no backend.
- Webhook Asaas com validacao de token, registro em `webhook_events` e idempotencia.
- Despesas, servicos, orcamentos, documentos, moradores, relatorios e configuracoes.
- Testes para calculo de saldo e webhook `PAYMENT_RECEIVED`.

## Variaveis

```powershell
$env:DATABASE_URL='jdbc:postgresql://127.0.0.1:55433/portal_vila'
$env:DATABASE_USERNAME='portal_vila'
$env:DATABASE_PASSWORD='portal_vila'
$env:JWT_SECRET='troque-por-um-segredo-com-32-caracteres-ou-mais'
$env:ASAAS_BASE_URL='https://api-sandbox.asaas.com/v3'
$env:ASAAS_API_KEY='sua_api_key_sandbox'
$env:ASAAS_WEBHOOK_TOKEN='token_configurado_no_webhook'
```

Sem `ASAAS_API_KEY`, o backend usa respostas mockadas para permitir desenvolvimento local.

## Endpoints principais

- `POST /api/auth/login`
- `GET /api/dashboard?month=2026-05`
- `GET /api/contributions?month=2026-05`
- `POST /api/admin/pix/monthly-charges`
- `GET /api/pix/charges?month=2026-05`
- `GET /api/pix/charges/{id}`
- `POST /api/admin/pix/charges/{id}/refresh-qrcode`
- `POST /api/admin/pix/charges/{id}/cancel`
- `POST /api/admin/contributions/{id}/manual-payment`
- `POST /api/webhooks/asaas`
- `GET /api/admin/webhook-events`
- `GET/POST /api/expenses`
- `GET/POST /api/services`
- `GET /api/services/{id}/budgets`
- `POST /api/services/{id}/budgets`
- `POST /api/budgets/{id}/approve`
- `POST /api/services/{id}/finish`
- `GET/POST /api/documents`
- `GET/POST /api/residents`
- `GET/PUT /api/settings`

## Script local

```powershell
.\scripts\run-api.ps1
```

## Webhook Asaas

Configure no painel do Asaas:

- URL: `https://sua-api.com/api/webhooks/asaas`
- Header: `asaas-access-token` com o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
- Eventos: `PAYMENT_CREATED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`

O backend salva cada payload e ignora duplicidades por `gateway + eventId` e por `gatewayPaymentId + eventType`.

## Referencias oficiais

- https://docs.asaas.com/docs/pix
- https://docs.asaas.com/reference/criar-nova-cobranca
- https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix
- https://docs.asaas.com/docs/sobre-os-webhooks
- https://docs.asaas.com/docs/webhook-para-cobrancas
