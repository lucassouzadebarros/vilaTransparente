# Portal da Vila

Sistema criado a partir do PDF `portal_da_vila_react_native_pix_asaas_pagamento_substituido(enviar).pdf`.

## Projetos

- `portal-vila-api`: backend Java 17 + Spring Boot + PostgreSQL, com Pix Asaas isolado por interface.
- `portal-vila-app`: app Expo + React Native + TypeScript com telas mobile do Portal da Vila.

## Credenciais seed

- Admin: `admin@vila.com` / `123456`
- Morador: `morador@vila.com` / `123456`

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
