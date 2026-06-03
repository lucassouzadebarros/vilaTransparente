# Deploy no Render

Este projeto esta preparado para subir no Render usando Blueprint.

## 1. Subir o codigo para o GitHub

Crie um repositorio no GitHub e envie a pasta `Vila` completa, incluindo:

- `render.yaml`
- `portal-vila-api`
- `portal-vila-app`

## 2. Criar Blueprint no Render

No Render:

1. Acesse o Dashboard.
2. Clique em `New`.
3. Escolha `Blueprint`.
4. Conecte o repositorio do GitHub.
5. Confirme o arquivo `render.yaml`.

O Blueprint cria:

- `portal-vila-api`: backend Spring Boot.
- `portal-vila-app`: front web estatico.
- `portal-vila-db`: banco PostgreSQL.
- Disco persistente para PDFs em `/data/uploads`.

## 3. Preencher variaveis secretas

O Render vai pedir estes valores:

- `PORTAL_ADMIN_PASSWORD`: senha inicial da conta admin.
- `ASAAS_API_KEY`: chave do Asaas Sandbox ou Producao.
- `ASAAS_WEBHOOK_TOKEN`: token que voce tambem vai configurar no webhook do Asaas.

Para homologacao, mantenha:

```text
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
```

Para producao, troque no painel do Render para:

```text
ASAAS_BASE_URL=https://api.asaas.com/v3
```

## 4. URLs esperadas

Se os nomes ficarem livres no Render, as URLs devem ser:

- Front: `https://portal-vila-app.onrender.com`
- API: `https://portal-vila-api.onrender.com`

Se o Render gerar outro dominio para a API, atualize no servico `portal-vila-app`:

```text
EXPO_PUBLIC_API_URL=https://SUA-API.onrender.com/api
```

Depois mande redeploy do front.

## 5. Webhook Asaas

No Asaas, configure:

```text
URL: https://portal-vila-api.onrender.com/api/webhooks/asaas
Header: asaas-access-token = mesmo valor de ASAAS_WEBHOOK_TOKEN
```

Eventos recomendados:

- `PAYMENT_CREATED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_REFUNDED`
- `PAYMENT_DELETED`

## 6. Primeiro acesso

Entre no front e use:

```text
Email: admin@vila.com
Senha: valor definido em PORTAL_ADMIN_PASSWORD
```

As casas 01 a 10 e as configuracoes iniciais sao criadas automaticamente. Moradores e cobrancas reais ficam vazios ate voce cadastrar.
