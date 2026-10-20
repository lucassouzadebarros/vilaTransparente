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
