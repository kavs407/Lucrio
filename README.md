# Lucrio — Render + Supabase

Pacote de código-fonte para hospedar a Lucrio na Render usando PostgreSQL no Supabase. Leia **GUIA-RENDER.md** para publicar.

## Incluído

- Interface responsiva para celular e computador.
- Cadastro e login por e-mail e senha; sessões salvas no banco externo.
- Produtos e serviços isolados por conta, controle de versão entre abas.
- Precificação com materiais, tempo de trabalho, embalagem, taxas, margem e descontos.
- Escolha simples de equipamento e minutos de uso; custos elétricos/gás estimados, com ajustes técnicos opcionais.
- Backup JSON do negócio e impressão/salvar em PDF pelo navegador.
- Dockerfile, lockfile, configuração de exemplo, esquema SQL privado e testes.

O pacote não contém credenciais. Conectar a integração do Supabase não coloca automaticamente a URI secreta na Render. As variáveis secretas devem ser configuradas no ambiente da hospedagem; nunca no código-fonte.

## Execução

Node.js 24+. Configure `.env` a partir de `.env.example`.

```sh
npm ci
npm run db:migrate
npm start
```

No Docker, a instalação de dependências e a inicialização são automáticas. O servidor verifica o esquema antes de aceitar tráfego. Ele não salva dados no disco efêmero do container.

- `DATABASE_URL`: conexão PostgreSQL Session pooler.
- `DATABASE_CA_CERT`: certificado CA PEM para verificar o TLS do Supabase.
- `NODE_ENV=production`.
- `PUBLIC_URL`: URL HTTPS exata do app; na Render pode ser omitida para usar `RENDER_EXTERNAL_URL`.
- `PORT`: padrão 3000.
- `HOST`: padrão `0.0.0.0`.
- `TRUST_PROXY`: padrão 0. Só use 1 com proxy confiável que substitua X-Forwarded-For e bloqueie acesso direto ao backend.

## Segurança e persistência

O banco fica no esquema privado `lucrio`, com RLS habilitado e sem políticas públicas de leitura. O backend usa conexão privilegiada somente no servidor e verifica a sessão e a propriedade dos dados em cada operação. Senhas são derivadas com scrypt e salt; tokens de sessão são guardados em forma de hash. Sessões expiram em sete dias.

Pool de no máximo três conexões PostgreSQL. Queries usam parâmetros. Atualizações usam número de revisão para recusar sobrescritas de outra aba. Limitação de tentativas de login é por processo e reinicia quando o serviço reinicia; não substitui proteção de borda contra abuso em larga escala.

A aplicação não oferece confirmação de e-mail, recuperação de senha, assinaturas, pagamentos ou painel administrativo. O Supabase é utilizado como banco PostgreSQL; o fluxo de autenticação é da Lucrio, não Supabase Auth. Não há usuário/senha padrão. Não foram transferidos os dados do aplicativo anterior.

## Migrar produtos da versão anterior

Exporte o backup JSON do negócio na versão anterior. Crie uma conta na nova instalação e importe esse arquivo em **Meu negócio → Restaurar backup**. Isso migra produtos e configurações, não contas, senhas ou sessões. Guarde backups completos do banco conforme as ferramentas do seu provedor.

## Testes

```sh
npm ci
npm test
```

Os testes usam o motor PostgreSQL embarcado PGlite, sem acessar sua conta Supabase. Exercitam o mesmo repositório SQL e o servidor HTTP reais: cadastro, login, sessões, separação de usuários, dados JSONB, conflitos de atualização, validação, reinício e fórmulas. Não substituem a verificação final da conexão TLS e do deploy na sua conta.

## Arquivos

- `server.mjs`: servidor HTTP, autenticação, rotas e validação.
- `database.mjs`: pool TLS e consultas PostgreSQL.
- `schema.sql`: migração inicial, somente estrutura.
- `migrate.mjs`: aplica a estrutura de forma idempotente.
- `public/`: app, login, estilos e marca.
- `Dockerfile`: build para Render.
- `GUIA-RENDER.md`: passo a passo.
- `test.mjs`: testes do backend PostgreSQL e calculadora.
