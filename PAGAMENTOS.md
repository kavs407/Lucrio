# Lucrio — ativação da assinatura

A página de vendas está em `/`. Preço escolhido: R$ 19,90 por mês. Em produção, o backend exige pagamento ativo e confirmação do e-mail. A página não abre o checkout enquanto as configurações abaixo estiverem incompletas.

## O que falta para vender

1. Criar na Kiwify o produto Lucrio como assinatura mensal de R$ 19,90.
2. Configurar no Render, em Environment, sem colocar segredos no GitHub:
   - `KIWIFY_CHECKOUT_URL`: URL pública HTTPS do checkout em `pay.kiwify.com.br`.
   - `KIWIFY_PRODUCT_ID`: identificador exato do produto informado em `Product.product_id` nos eventos.
   - `KIWIFY_WEBHOOK_TOKEN`: segredo aleatório com pelo menos 32 caracteres, usado somente para este webhook.
   - `RESEND_API_KEY`: chave restrita de envio do serviço Resend.
   - `MAIL_FROM`: endereço remetente verificado no Resend. Um remetente de testes não libera envio para compradores em geral; é necessário verificar seu domínio de envio.
3. Na Kiwify, em Apps → Webhooks, cadastrar a URL `https://uselucrio.onrender.com/api/billing/kiwify?token=SEU_SEGREDO`. Nunca publicar essa URL com o segredo. Selecionar o produto e os eventos de compra aprovada, renovação, reembolso e chargeback. O endpoint compara o segredo com tempo constante e confere o produto.
4. Configurar a página após a compra como `https://uselucrio.onrender.com/obrigado` quando a Kiwify permitir. Essa página não concede acesso; só o evento autenticado concede.
5. Fazer uma compra de teste pelos recursos oficiais da Kiwify, validar o evento real, a identificação do produto e o período pago, receber o e-mail e concluir o cadastro. Só depois divulgar o checkout. Não usar payload de exemplo como comprovação de pagamento.

## Comportamento

- `order_approved` e `subscription_renewed` precisam ter `order_status=paid`, assinatura `monthly` e `Subscription.customer_access.access_until` ou `Subscription.next_payment` futuro (no máximo 45 dias).
- Reembolso/chargeback revoga a cobrança correspondente. Uma aprovação atrasada da mesma cobrança não desfaz a revogação. Um novo pagamento possui outro `order_id`.
- Cancelamento não estende acesso: o cliente mantém somente o prazo já pago. Falta de renovação expira automaticamente, inclusive em sessões abertas. Se a Kiwify alterar o formato do webhook, a liberação falha de forma fechada e precisa de revisão.
- Compra repetida não manda e-mail novamente após envio confirmado. Se o envio falhar, o webhook retorna erro para permitir reentrega; o comprador também pode pedir outro link em `/ativar`.
- O e-mail contém token aleatório de 256 bits com validade de 48 horas. Apenas seu hash fica no banco. O cadastro consome o token em transação e fixa a conta no e-mail da compra.
- Contas anteriores precisam de pagamento e confirmar o e-mail antes do primeiro acesso pago. Os dados existentes são preservados.
- A autenticação é própria da Lucrio, com senhas scrypt e sessão HttpOnly. Não usa Supabase Auth. As tabelas privadas não devem ser expostas pela Data API.

## Validação feita

`npm test` verifica isolamento e persistência, cadastro com e-mail diferente, token inválido e reutilizado, webhook sem segredo, produto incorreto, repetição de evento, expiração, revogação de acesso em sessão aberta e aprovação atrasada após reembolso. Os testes usam PostgreSQL embarcado e remetente simulado, sem enviar e-mails ou movimentar dinheiro.

**Integração externa pendente:** Kiwify e Resend não foram configurados nem testados ponta a ponta. A página exibe "Em breve" até a configuração completa. A presença das variáveis não substitui o teste real.

## Alternativa configurada para Gmail (sem SMTP)

O backend também oferece `EMAIL_TRANSPORT=google-apps-script`. Consulte `integrations/google-mail/README.md` para ativar o projeto na conta Google do proprietário. Este caminho não exige domínio de e-mail próprio ou senha de app. O remetente é a conta que autoriza a implantação Google.

**Abertura das vendas agora é explícita:** além de produto, token e transporte configurado, `CHECKOUT_ENABLED=1` é necessário. Mantenha `0` até a confirmação do envio e o teste completo da Kiwify. As instruções antigas sobre ativação só pela presença das variáveis foram substituídas por este requisito.
