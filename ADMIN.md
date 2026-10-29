# Administração da Lucrio

URL: `/admin`. O painel e todas as APIs de dados exigem sessão autenticada, e-mail confirmado e correspondência exata com `ADMIN_EMAIL`, definido somente no servidor. Não existe seleção de cargo no cadastro e o cliente não pode promover usuários.

O proprietário solicita seu link em `/ativar`, abre o e-mail recebido e cria sua própria senha. Se já tem conta, abre o link e faz login com sua senha para confirmar o e-mail. A conta do proprietário não exige compra da própria assinatura. Nenhuma compra fictícia é criada para permitir o acesso.

O painel mostra contas cadastradas, e-mails com período pago ativo, cobranças revogadas, envios pendentes e até 100 cadastros/cobranças recentes. Um mesmo assinante pode ter várias cobranças de renovação. Os valores mostrados são contagens, não faturamento estimado.

O proprietário pode reenviar links apenas a e-mails com pagamento ativo. A ação exige POST da própria origem, sessão do proprietário e limite de frequência. Os dados exibidos são inseridos como texto, não como HTML. Tokens, senhas e chaves de provedores nunca são retornados pelo painel.

As informações de configuração não comprovam entrega na caixa de entrada ou validação financeira ponta a ponta. Cancelamentos e reembolsos financeiros são feitos na Kiwify.

As APIs de diagnóstico com credencial temporária são separadas da autorização do painel, têm destinatário fixo e expiração e não criam contas, compras ou permissões administrativas. As variáveis de diagnóstico podem ser esvaziadas após o teste.
