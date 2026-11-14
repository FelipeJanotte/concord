-- Roda só na primeira vez que o volume do Postgres é criado.
-- Usuário do app com privilégio mínimo: lê e grava dados, mas não cria nem altera tabelas.
-- As migrations rodam com o dono do schema (concord) pela DATABASE_MIGRATE_URL.
--
-- Volume já existente? Rode este arquivo uma vez com:
--   psql "postgres://concord:concord@localhost:5432/concord" -f docker/postgres/init/02-app-role.sql
-- Em produção, troque a senha.
CREATE ROLE concord_app LOGIN PASSWORD 'concord_app';
GRANT CONNECT ON DATABASE concord TO concord_app;
GRANT USAGE ON SCHEMA public TO concord_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO concord_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO concord_app;
-- Tabelas e sequências criadas depois (pelas migrations, como concord) já nascem liberadas.
ALTER DEFAULT PRIVILEGES FOR ROLE concord IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO concord_app;
ALTER DEFAULT PRIVILEGES FOR ROLE concord IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO concord_app;
