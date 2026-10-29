# Envio de acesso pelo Google / HTTPS

Este envio usa MailApp no Google Apps Script e HTTPS a partir do Render gratuito. Não usa SMTP nem senha de app. Não lê mensagens, contatos ou arquivos da conta. É preciso o proprietário criar e autorizar o projeto no Google. Não foi implantado na conta Google nem testado com e-mail real nesta entrega.

## Configuração no Google

1. Abra `https://script.google.com/` com a conta que enviará os e-mails e crie um projeto chamado **Lucrio — E-mails de acesso**.
2. Substitua o conteúdo de `Code.gs` pelo arquivo `Code.gs` deste diretório e salve.
3. Nas configurações do projeto, habilite a exibição do manifesto `appsscript.json`. Copie o conteúdo do manifesto deste diretório. O único escopo solicitado é `script.send_mail`.
4. Em **Configurações do projeto → Propriedades do script**, crie `LUCRIO_RELAY_SECRET`. Use exatamente o valor de `GMAIL_RELAY_SECRET` configurado no Render. Copie-o diretamente de um painel para o outro; não o envie por chat nem o coloque no código.
5. Execute `autorizarEnvio` e conclua você mesmo a autorização Google. A função consulta a cota restante e não envia mensagem. Não forneça senha ou código de verificação ao assistente. Se o Google bloquear a autorização ou exibir advertência, revise as permissões antes de continuar por sua conta.
6. Implante como **Aplicativo da Web**, executar como **você**, acesso **Qualquer pessoa**. A URL é pública, mas nenhum envio é permitido sem uma assinatura HMAC válida. Não ative permissões de leitura do Gmail.
7. Copie a URL de implantação terminada em `/exec` (não `/dev`) para `GMAIL_RELAY_URL` no Render.

## Configuração no Render

- `EMAIL_TRANSPORT=google-apps-script`
- `GMAIL_RELAY_SECRET`: segredo exclusivo aleatório de pelo menos 32 caracteres. Já pode ser gerado pelo assistente e salvo no Render, sem passar por código ou chat.
- `GMAIL_RELAY_URL`: URL `/exec` do seu projeto Google.
- `CHECKOUT_ENABLED=0` até concluir os testes abaixo.

Não altere o `KIWIFY_WEBHOOK_TOKEN`; ele é um segredo separado.

## Teste antes de abrir as vendas

Confirme que o webhook usa o produto correto, valide o payload real da Kiwify e faça o envio de uma mensagem de teste apenas ao endereço do proprietário. Depois confira uma compra pelos recursos oficiais da Kiwify, receba o link, crie a conta com o e-mail comprado e teste outro e-mail e expiração. Só então configure `CHECKOUT_ENABLED=1`. Falta de configuração ou falha de envio mantém a venda fechada e o endpoint de webhook retorna erro para permitir reentrega.

Não envie eventos falsos como se fossem compras reais. O endpoint `/readyz` confirma banco/aplicação; não prova entrega de e-mail ou integração financeira.

## Proteções e limites

- Assinatura HMAC SHA-256, janela de 5 minutos, comparação sem interrupção antecipada e bloqueio de mensagens repetidas por cache.
- Aceita um destinatário e somente links `/cadastro#token=...` de `https://uselucrio.onrender.com`. Não é um servidor de e-mail genérico.
- O conteúdo do e-mail é fixo no script, sem assunto ou HTML arbitrário recebido do servidor.
- Guarda apenas hashes dos tokens no banco da Lucrio. Segredo nunca enviado ao Google no corpo da requisição, apenas a assinatura.
- As cotas do Google se aplicam. A documentação atual informa 100 destinatários/dia para contas pessoais; esse valor pode mudar. Cache e cotas do Apps Script também se aplicam. Um envio aceito não garante chegada na caixa de entrada.
- Mudança de domínio requer revisar a lista de links permitidos neste script. Mudança de código exige nova versão da implantação Google.
- O Google não retorna códigos HTTP de aplicação personalizados nesta integração; o servidor confere também o JSON `ok:true`. HTTP 200 com `ok:false` é falha.

Documentação: https://developers.google.com/apps-script/guides/web e https://developers.google.com/apps-script/guides/services/quotas
