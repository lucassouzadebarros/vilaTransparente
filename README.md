# Portal da Vila

Sistema criado a partir do PDF `portal_da_vila_react_native_pix_asaas_pagamento_substituido(enviar).pdf`.

## Projetos

- `portal-vila-api`: backend Java 17 + Spring Boot + PostgreSQL, com Pix Asaas isolado por interface.
- `portal-vila-app`: app Expo + React Native + TypeScript com telas mobile do Portal da Vila.

## Acesso inicial

O administrador e criado no primeiro start com o e-mail de `PORTAL_ADMIN_EMAIL` e a senha de `PORTAL_ADMIN_PASSWORD`.
Defina as duas antes de subir (sem `PORTAL_ADMIN_PASSWORD` o padrao inseguro `123456` e usado e um aviso sai no log).
Moradores criados pelo administrador recebem uma senha temporaria aleatoria, mostrada uma unica vez, e precisam troca-la
no primeiro acesso. Senhas novas tem no minimo 8 caracteres.

## Execucao rapida

Backend:

```powershell
cd C:\Users\lucas\Desktop\Vila\portal-vila-api
docker compose up -d
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:DATABASE_URL='jdbc:postgresql://127.0.0.1:55433/portal_vila'
$env:DATABASE_USERNAME='portal_vila'
$env:DATABASE_PASSWORD='portal_vila'
mvn spring-boot:run
```

Ou:

```powershell
.\scripts\run-api.ps1
```

App:

```powershell
cd C:\Users\lucas\Desktop\Vila\portal-vila-app
npm install
npm start
```

No celular fisico, ajuste `EXPO_PUBLIC_API_URL` para o IP da maquina em vez de `localhost`.

## Verificacoes feitas

```powershell
cd C:\Users\lucas\Desktop\Vila\portal-vila-api
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn test

cd C:\Users\lucas\Desktop\Vila\portal-vila-app
npm run typecheck
```

Observacao: `npm audit` aponta vulnerabilidades na arvore Expo/React Native. Nao rodei `npm audit fix --force` porque ele pode trocar versoes principais e quebrar a compatibilidade do SDK Expo.

## Do relato ao pagamento

Os tres cadastros principais formam uma cadeia, e cada elo guarda o anterior:

1. **Relato** (`problem_reports`): o morador relata o problema, com ate 3 fotos. O administrador ou o sindico pode
   criar um servico a partir dele; o relato guarda o servico (`service_id`) e o servico guarda o relato (`problem_report_id`).
2. **Servico** (`service_orders`): so e finalizado pelo botao "Finalizar", que lanca a despesa no caixa. Ao finalizar,
   o relato de origem vira "Resolvido"; ao cancelar, o relato volta para "Aberto" e as cotacoes ainda em votacao sao canceladas.
3. **Cotacoes** (`budgets.service_id`): varias cotacoes competem pelo mesmo servico. Cada casa aprova no maximo uma; a
   primeira a chegar a maioria vira o orcamento do servico e as outras sao encerradas como nao escolhidas.

Regra opcional de valor: em Configuracoes o administrador define a partir de quanto um servico so comeca (ou e pago) com
orcamento aprovado pelas casas (`settings.budget_required_above`, vazio = nao exige).

## Fotos e anexos

- Fotos de relatos e comprovantes aceitam PDF, JPG, PNG e WebP, ate 10 MB (`spring.servlet.multipart`). O conteudo do arquivo
  e conferido (nao basta trocar a extensao) e os arquivos ficam em `PORTAL_UPLOAD_DIR` (disco persistente no Render).
- O app usa `expo-image-picker` e `expo-document-picker`, entao camera, galeria e PDF funcionam no navegador e no celular.
- Exportar a prestacao de contas (planilha e PDF) abre a folha de compartilhar do celular (`expo-print` + `expo-sharing`).

## Avisos no celular (push)

O servidor envia avisos pelo servico de push do Expo quando: um orcamento entra em votacao, a votacao termina, e o relato
de um morador muda de situacao ou e resolvido. O aparelho so recebe depois que:

1. o app e gerado para o celular com o EAS (`eas build`) e o `projectId` do EAS fica em `app.json` (`extra.eas.projectId`);
2. o morador aceita receber avisos (o app registra o aparelho em `POST /api/push-tokens` ao entrar).

Sem aparelho registrado nada e enviado. Para desligar no servidor: `PORTAL_PUSH_ENABLED=false`.

## Migracoes do banco

`MigrationsTest` roda todas as migracoes (`db/migration`) num banco em memoria e confere se as entidades batem com as
tabelas. Mantenha as migracoes novas simples (uma coluna por `alter table`, tipos ANSI) para rodarem no PostgreSQL e no teste.

## Prazo da votacao e historico do relato

- **Prazo**: todo orcamento novo ja vem com prazo de 7 dias (editavel ou em branco). O prazo e o ultimo dia para votar; no dia
  seguinte a votacao encerra sozinha (a cada hora, e tambem quando alguem abre a lista ou tenta votar fora do prazo), com a
  mesma regra do encerramento manual: passa se mais da metade das casas votou e o "sim" vence. No ultimo dia e na vespera, as
  casas que ainda nao votaram recebem um lembrete as 9h (so chega a celulares com avisos ativos). Horario de Sao Paulo.
- **Historico do relato** (`problem_report_events`): registro, mudancas de situacao, virou servico, resolvido e comentarios.
  Quem aparece e a casa ("Casa 10"), a "Administracao" ou o "Sindico", nunca o nome. Comentam: quem fez o relato, o
  administrador e o sindico (a administracao comentando avisa quem relatou). Quem relatou pode cancelar enquanto ninguem comecou
  a analisar (situacao "Aberto"). Migracao V21.
