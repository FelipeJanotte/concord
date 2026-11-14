-- Roda só na primeira vez que o volume do Postgres é criado.
-- Banco separado para os testes (vitest), para não sujar o banco de desenvolvimento.
CREATE DATABASE concord_test OWNER concord;
