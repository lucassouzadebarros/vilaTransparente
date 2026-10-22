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

## Primeiro acesso por convite

Ninguem cria acesso sozinho: o cadastro aberto foi removido. Em **Moradores > Convites de acesso** o administrador gera um
codigo para uma casa sem morador (`POST /api/residents/invites`). O codigo (`XXXX-XXXX`) aparece uma unica vez, vale por
`portal.invite.validity-days` dias (padrao 7), serve uma vez e so o hash fica no banco (`house_invites`). Um codigo novo
para a mesma casa cancela o anterior. A pessoa toca em "Tenho um codigo" na tela de entrada, o codigo mostra qual e a casa
(`POST /api/residents/invite-check`) e ela cria o proprio acesso (`POST /api/residents/register-with-invite`). Codigo errado,
usado, cancelado ou vencido responde igual, e as tentativas por endereco sao limitadas (5 erros em 10 minutos). Criar,
usar e cancelar convites entram no historico de alteracoes.

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

O caminho do dinheiro e: **Problema -> Orcamento -> Votacao -> Servico -> Pagamento**.

1. **Problema** (`problem_reports`): o morador relata, com ate 3 fotos. O administrador ou o sindico gera um ou mais
   orcamentos a partir dele (ou resolve direto, se for um servico pequeno). O problema passa a "Em analise" no primeiro
   orcamento, volta a "Aberto" se todos forem recusados/cancelados e vira "Resolvido" so quando tudo que saiu dele
   (orcamentos e servicos) estiver concluido e pago.
2. **Orcamento** (`budgets.problem_report_id`): um problema pode ter varios. Ao cadastrar o segundo, o sistema pergunta se
   ele *concorre* com os outros (mesmo trabalho: cada casa aprova so um e, quando um vence, os outros sao encerrados) ou e
   *outro trabalho* (votado e aprovado a parte, vira o seu proprio servico). Todo orcamento passa por votacao das casas, com prazo.
3. **Servico** (`service_orders`): nasce de um orcamento aprovado. O valor pago pode passar ate 10% do aprovado. So termina
   pelo botao "Finalizar", que lanca a despesa no caixa.

Regra de valor (`settings.budget_required_above`, vazio = nao exige): ate esse valor o servico pode ser criado e pago direto;
acima dele so a partir de um orcamento aprovado. Duas saidas, ambas publicas:

- **Emergencia**: ao finalizar um servico fora da regra, o admin escreve uma justificativa (minimo 20 letras). O servico
  fica marcado como "Gasto sem votacao" e a justificativa aparece para todos.
- **Despesa direta** acima do limite (tela Despesas): exige justificativa, exceto Energia, Agua e Taxas (contas de rotina).

O extrato mensal mostra a linha "Gastos sem orcamento votado" (valor e quantidade) e marca cada despesa nessa situacao,
na tela, no CSV e no PDF.

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

## Privacidade e exclusao de conta

- Paginas publicas, servidas pelo mesmo site do app: `portal-vila-app/public/privacidade.html` (politica, LGPD) e
  `public/excluir-conta.html` (como apagar a conta). O Expo copia a pasta `public/` para o `dist`. Os enderecos ficam em
  `src/utils/links.ts` e vao para a Play Console (politica de privacidade e URL de exclusao de conta).
- No app: Menu, Minha conta, Excluir minha conta (`POST /api/auth/delete-account`, pede a senha, limite de tentativas).
  O administrador apaga os dados de um morador que pediu por e-mail em Moradores (`POST /api/admin/residents/{id}/erase`).
- `AccountErasureService` apaga o que identifica a pessoa (nome, e-mail, telefone, CPF/CNPJ, senha, codigos de aviso, o e-mail no
  historico de alteracoes) e desativa o acesso. Mensalidades, pagamentos, despesas, votos e relatos ficam, sem o nome, ligados a
  casa, que pode receber novo convite. A conta de administrador nao se exclui pelo app (409). A acao entra no historico
  (`ACCOUNT_ERASED`) sem o e-mail antigo. Teste: `AccountErasureTest`.

## Modo demonstracao

O login tem o botao "Ver demonstracao": abre o app inteiro com dados de exemplo (um "Condominio Exemplo" inventado), sem conta e sem
rede. Serve para quem quer conhecer o app e para o revisor da Google Play (instrucao em "Detalhes do login" da Play Console).

- `src/demo/demoMode.ts`: liga/desliga o modo e cria a sessao de exemplo (so em memoria, nunca gravada; `Session.demo`).
- `src/demo/demoAdapter.ts`: no lugar da rede, o `apiClient` (em `services/api.ts`) usa este adaptador enquanto o modo esta ligado.
  Leituras devolvem os dados de exemplo; gravacoes nao mudam nada (devolvem o que foi enviado). Fica so na memoria o que a pessoa fez
  na demonstracao (voto em orcamento, comentario), e some ao sair.
- `src/demo/demoData.ts`: os dados de exemplo, que acompanham o mes de hoje. Tem as visoes de administracao e de morador (Casa 01).
- `src/components/DemoBanner.tsx`: faixa fixa "Modo demonstracao" com troca de visao e saida. O push e o `EventSource` ficam desligados.
- **Novo endpoint em `api.ts`?** Acrescente o caso em `read` (GET) ou `write` (POST/PUT/DELETE) do adaptador e os dados em `demoData.ts`;
  uma leitura sem caso responde 404 "Esta tela nao tem dados de exemplo".
- Testado: nenhuma requisicao sai do navegador (API apontada para uma porta morta), sem erros no console, celular de 360 px.

## Migracoes do banco

`MigrationsTest` roda todas as migracoes (`db/migration`) num banco em memoria e confere se as entidades batem com as
tabelas. Mantenha as migracoes novas simples (uma coluna por `alter table`, tipos ANSI) para rodarem no PostgreSQL e no teste.
`CondominiumMigrationTest` aplica V1 a V23, grava dados no formato da Vila, aplica a V24 e confere que nada se perdeu.

## Varios condominios (em andamento)

O app esta sendo preparado para atender mais de um condominio, sem mudar nada para a Vila. A V24 cria `condominiums`, cadastra
a Vila como condominio 1 (com o nome que ja estava em `settings`) e coloca `condominium_id` nas 20 tabelas de dados. Toda linha
que ja existia e toda linha nova ficam com a Vila (`default 1`), com chave estrangeira e indice. O numero da casa passa a ser
unico dentro do condominio (`houses.number` deixou de ser unico no sistema todo). Os proximos passos gravam o condominio de
forma explicita em cada insercao, filtram toda leitura por ele e tiram o `default`. As telas de administrador usam a lista de
casas da API (`GET /api/residents/houses`) e mostram o rotulo da casa, nunca o id.

## Prazo da votacao e historico do relato

- **Prazo**: todo orcamento novo ja vem com prazo de 7 dias (editavel ou em branco). O prazo e o ultimo dia para votar; no dia
  seguinte a votacao encerra sozinha (a cada hora, e tambem quando alguem abre a lista ou tenta votar fora do prazo), com a
  mesma regra do encerramento manual: passa se mais da metade das casas votou e o "sim" vence. No ultimo dia e na vespera, as
  casas que ainda nao votaram recebem um lembrete as 9h (so chega a celulares com avisos ativos). Horario de Sao Paulo.
- **Historico do relato** (`problem_report_events`): registro, mudancas de situacao, virou servico, resolvido e comentarios.
  Quem aparece e a casa ("Casa 10"), a "Administracao" ou o "Sindico", nunca o nome. Comentam: quem fez o relato, o
  administrador e o sindico (a administracao comentando avisa quem relatou). Quem relatou pode cancelar enquanto ninguem comecou
  a analisar (situacao "Aberto"). Migracao V21.
