# Segurança dos dados (Play Console), rascunho

Respostas para o formulário "Segurança dos dados", baseadas no que o código coleta hoje. **Declaração legal: revise tudo antes de enviar.** Se o app passar a coletar algo novo (analytics, relatório de falhas, anúncios), atualize aqui e no formulário.

## O app coleta ou compartilha dados?

Sim, coleta. Não vende dados e não tem anúncios.

## Dados coletados

| Categoria da Google | Dado | Obrigatório? | Para quê |
|---|---|---|---|
| Informações pessoais: nome | nome do responsável pela casa | sim | funcionamento do app, gerenciamento da conta |
| Informações pessoais: e-mail | e-mail de acesso | sim | funcionamento, gerenciamento da conta, recuperação de senha |
| Informações pessoais: telefone | telefone | sim | funcionamento (cadastro do cliente de pagamento) |
| Informações pessoais: outras | CPF ou CNPJ | sim | funcionamento (exigido para gerar cobranças Pix) |
| Informações financeiras: outras | valores, vencimentos e situação das mensalidades e despesas do condomínio | sim | funcionamento |
| Fotos e vídeos: fotos | fotos anexadas a relatos e comprovantes | não | funcionamento |
| Identificadores de dispositivo ou outros | código de aviso (token de notificação) | não | funcionamento (avisos no celular) |

Não coleta: localização, contatos, mensagens, áudio, arquivos do aparelho (só os que a pessoa escolhe anexar), histórico de navegação, nem dados de saúde.

## Dados compartilhados

Confirmar com o Lucas antes de enviar; na dúvida, declarar.

- **Asaas** (instituição de pagamento que gera as cobranças Pix): nome, e-mail, telefone e CPF/CNPJ, para criar o cliente e a cobrança. Finalidade: funcionamento.
- **Expo** (serviço de avisos no celular): o código de aviso do aparelho. Finalidade: funcionamento.
- Hospedagem (Render): processa os dados em nome do app; não é compartilhamento para fins próprios.

## Práticas de segurança

- Dados criptografados em trânsito: **sim** (HTTPS).
- O usuário pode pedir a exclusão dos dados: **sim**. Dentro do app (Minha conta, excluir conta) e por página na web (endereço a preencher na Play Console).
- Senhas guardadas com hash; código de convite guardado só como hash; CPF/CNPJ nunca volta para o app depois de salvo (só os 2 últimos dígitos).

## O que a exclusão apaga e o que fica

- Apaga: nome, e-mail, telefone, CPF/CNPJ, acesso e códigos de aviso.
- Fica, sem identificar a pessoa: lançamentos financeiros do condomínio (mensalidades pagas, despesas) e votos, por obrigação de prestação de contas e guarda de registros contábeis.
- Isso precisa estar escrito na política de privacidade e na página de exclusão.

## Outras declarações da Play Console

- **Acesso ao app**: o app exige login. Informar credenciais de um condomínio de demonstração (ainda a criar).
- **Recursos financeiros**: o app gera cobranças Pix de mensalidade condominial; não oferece empréstimo, investimento nem criptomoeda. Marcar como "outros recursos financeiros" e descrever.
- **Anúncios**: não.
- **Público-alvo**: 18+.
- **Política de privacidade**: URL pública (a criar).
