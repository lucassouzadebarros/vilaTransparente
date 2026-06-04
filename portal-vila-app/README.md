# Portal da Vila App

App Expo + React Native + TypeScript.

## Recursos implementados

- Login com admin e morador.
- Navegação inferior: Início, Caixa, Serviços, Docs e Mais.
- Inicio com saldo, transparencia e minha contribuicao.
- Caixa com arrecadação, pendências, despesas e cards de contribuição.
- Tela de pagamento Pix com QR Code, copia-e-cola e timeline.
- Contribuições com ação de pagamento manual para admin.
- Admin Pix com geração de cobranças, totais, refresh de QR Code e cancelamento.
- Logs de webhook para admin.
- Despesas.
- Serviços, cadastro de serviço, detalhes, orçamentos, aprovação/rejeição e finalização com despesa.
- Documentos, moradores, relatorios e configuracoes.
- Fallback local quando a API não está rodando.

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

## Observação

O app tem fallback visual para os dados seedados do backend. Isso permite abrir e navegar mesmo quando a API local ainda não está iniciada.
