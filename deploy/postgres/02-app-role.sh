#!/bin/sh
# Produção (A14): roda só na primeira vez que o volume do Postgres é criado.
# Cria o usuário do app com privilégio mínimo (lê e grava dados, não altera tabelas) com a senha de
# APP_DB_PASSWORD. As migrations rodam com o dono do banco (POSTGRES_USER) pela DATABASE_MIGRATE_URL.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE concord_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
GRANT CONNECT ON DATABASE "${POSTGRES_DB}" TO concord_app;
GRANT USAGE ON SCHEMA public TO concord_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO concord_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO concord_app;
ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO concord_app;
ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO concord_app;
SQL
