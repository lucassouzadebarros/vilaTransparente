# Portal da Vila App

App Expo + React Native + TypeScript.

## Recursos implementados

- Login com admin e morador.
- Navegacao inferior: Inicio, Caixa, Servicos, Docs e Mais.
- Inicio com saldo, transparencia e minha contribuicao.
- Caixa com arrecadacao, pendencias, despesas e cards de contribuicao.
- Tela de pagamento Pix com QR Code, copia-e-cola e timeline.
- Contribuicoes com acao de pagamento manual para admin.
- Admin Pix com geracao de cobrancas, totais, refresh de QR Code e cancelamento.
- Logs de webhook para admin.
- Despesas.
- Servicos, cadastro de servico, detalhes, orcamentos, aprovacao/rejeicao e finalizacao com despesa.
- Documentos, moradores, relatorios e configuracoes.
- Fallback local quando a API nao esta rodando.

## Comandos

```powershell
cd C:\Users\lucas\Desktop\Vila\portal-vila-app
npm install
npm start
```

Para web:

```powershell
npm run web
```

## API URL

Padrao:

```powershell
$env:EXPO_PUBLIC_API_URL='http://localhost:8080/api'
```

Para Android fisico ou outro dispositivo na rede, use o IP da maquina:

```powershell
$env:EXPO_PUBLIC_API_URL='http://192.168.0.10:8080/api'
```

## Observacao

O app tem fallback visual para os dados seedados do backend. Isso permite abrir e navegar mesmo quando a API local ainda nao esta iniciada.
