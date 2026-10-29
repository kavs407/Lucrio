# Lucrio no Render + Supabase

## Banco já criado

O projeto Supabase **Lucrio**, referência `dvsgiokvycnkfkesulhx`, já foi criado e recebeu as tabelas privadas `lucrio.users`, `lucrio.sessions` e `lucrio.workspaces`. O banco não contém contas de demonstração ou senhas padrão.

Painel: https://supabase.com/dashboard/project/dvsgiokvycnkfkesulhx

## Publicar

1. Envie o conteúdo desta pasta para a raiz de um repositório GitHub. Nunca envie `.env`, credenciais ou `node_modules`.
2. No Render, conecte sua conta GitHub e selecione o repositório.
3. Crie um **Blueprint** usando o `render.yaml` incluído, ou um **Web Service**, runtime **Docker**, plano **Free**.
4. Configure `DATABASE_URL` com a URI **Session pooler**, porta **5432**, obtida em **Connect** no Supabase. Ela contém a senha do banco: coloque somente na variável secreta do Render, nunca no código ou no chat. Codifique caracteres especiais da senha para uso em URL.
5. Em **Database Settings → SSL Configuration** no Supabase, baixe o certificado CA e copie seu conteúdo PEM completo para a variável `DATABASE_CA_CERT` do Render. Aceita quebras de linha reais ou `\n` literais. A conexão verifica o certificado TLS.
6. As variáveis `NODE_ENV=production` e `PORT=3000` estão no Blueprint. O servidor escuta em `0.0.0.0`.
7. O Render fornece `RENDER_EXTERNAL_URL`: o aplicativo detecta automaticamente seu endereço `.onrender.com`. Não precisa preencher `PUBLIC_URL` para começar. Se usar domínio próprio depois, defina `PUBLIC_URL` como a URL HTTPS exata.
8. Use **/healthz** na verificação de saúde. **/readyz** verifica também o acesso ao banco.
9. Publique e abra o endereço HTTPS exibido pelo Render. Cadastre seu negócio para começar.

O container não precisa de disco persistente: todos os cadastros ficam no Supabase. A inicialização verifica o esquema com operações idempotentes; não apaga registros existentes.

## Banco e autenticação

Este pacote usa PostgreSQL por conexão no servidor. O login por e-mail e senha pertence à Lucrio, não ao Supabase Auth. Os usuários aparecem no esquema privado `lucrio`, não na tela Authentication → Users. Não são necessárias chaves anon, publishable ou service_role.

RLS está habilitado e não existem políticas públicas. Não exponha o esquema `lucrio` pela Data API. O backend acessa as tabelas com conexão privilegiada e verifica a sessão e a propriedade em cada operação.

## Gratuidade

O Blueprint pede explicitamente `plan: free` e não cria um banco pago no Render. O banco permanece no projeto Supabase escolhido. Confira o plano antes de confirmar a criação. A gratuidade depende dos limites dos dois provedores, que podem mudar. No Render Free, o app pode dormir após 15 minutos sem uso e demorar para abrir novamente. O Supabase gratuito também pode pausar por inatividade.

## Endereço Duck DNS

O endereço padrão `.onrender.com` funciona sem Duck DNS. Não incluímos nem configuramos `uselucrio.duckdns.org`: subdomínios no fluxo padrão do Render usam um CNAME no provedor DNS, enquanto o Duck DNS é voltado a apontamento por IP. Não altere o IP no Duck DNS para um IP adivinhado do Render.

## Migrar produtos

Exporte o JSON em Meu negócio na versão anterior e importe na nova conta. Isso transfere produtos e configurações, não contas ou senhas.

## Testes locais

Node.js 24+:

```sh
npm ci
npm test
```

Os testes usam PostgreSQL embarcado PGlite. Validam cadastro, login, sessões, isolamento, JSONB, conflitos, persistência e cálculo. Conexão TLS real e publicação precisam ser verificadas na conta após configurar os segredos.

## Diagnóstico

- **Origem inválida:** remova um PUBLIC_URL antigo ou atualize com o endereço exato aberto.
- **Falha de certificado:** informe o CA PEM completo do projeto correto. Não desligue a verificação TLS.
- **Falha de conexão:** confira se o projeto está ativo e se a URI é do Session pooler (5432), com senha correta.
- **Não encontra Dockerfile:** envie o conteúdo da pasta para a raiz do repositório ou ajuste o Root Directory no Render.

Referências oficiais:
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
- https://render.com/docs/environment-variables
- https://supabase.com/docs/guides/database/connecting-to-postgres
