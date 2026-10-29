-- Esquema privado: não adicione "lucrio" aos schemas expostos pela API do Supabase.
CREATE SCHEMA IF NOT EXISTS lucrio;
REVOKE ALL ON SCHEMA lucrio FROM PUBLIC;
CREATE TABLE IF NOT EXISTS lucrio.users (
 id text PRIMARY KEY,
 email text NOT NULL UNIQUE,
 password text NOT NULL,
 created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS lucrio.sessions (
 token_hash text PRIMARY KEY,
 user_id text NOT NULL REFERENCES lucrio.users(id) ON DELETE CASCADE,
 expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS lucrio_session_expiry ON lucrio.sessions(expires_at);
CREATE TABLE IF NOT EXISTS lucrio.workspaces (
 user_id text PRIMARY KEY REFERENCES lucrio.users(id) ON DELETE CASCADE,
 data jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1
);
ALTER TABLE lucrio.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE lucrio.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lucrio.workspaces ENABLE ROW LEVEL SECURITY;
-- Acesso somente pelo backend via conexão PostgreSQL privada.
-- Não criamos políticas para anon/authenticated nem expomos hashes pela API.

ALTER TABLE lucrio.users ADD COLUMN IF NOT EXISTS verified_at bigint;
CREATE TABLE IF NOT EXISTS lucrio.purchases (
 order_id text PRIMARY KEY,
 email text NOT NULL,
 status text NOT NULL CHECK(status IN ('paid','revoked')),
 access_until bigint NOT NULL,
 email_sent boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS lucrio_purchase_email ON lucrio.purchases(email,access_until);
CREATE TABLE IF NOT EXISTS lucrio.activations (
 token_hash text PRIMARY KEY,
 email text NOT NULL,
 expires_at bigint NOT NULL,
 used_at bigint
);
ALTER TABLE lucrio.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE lucrio.activations ENABLE ROW LEVEL SECURITY;
