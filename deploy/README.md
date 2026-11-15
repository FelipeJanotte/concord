# Hospedar o Concord pela internet (A14)

Com o servidor numa máquina na internet, os amigos usam o Concord de qualquer lugar, com voz e tela
funcionando mesmo atrás de roteadores e firewalls (o LiveKit tem TURN embutido). Tudo sobe com um
`docker compose`: servidor do Concord, PostgreSQL (com backup diário), LiveKit e Caddy (HTTPS automático).

## Do que você precisa

- Uma máquina Linux com IP público (uma VPS de 2 GB de RAM basta para um grupo de amigos), com
  **Docker** e o plugin **compose** instalados.
- Um domínio com **dois endereços** apontando (registro DNS tipo **A**) para o IP da máquina, por exemplo
  `concord.seudominio.com.br` (o servidor) e `voz.seudominio.com.br` (o LiveKit).

## Passo a passo

1. **Portas:** libere no firewall da máquina (e no painel da VPS, se houver):
   `80/tcp`, `443/tcp`, `7881/tcp`, `7882/udp` e `3478/udp`.
2. **Código:** `git clone https://github.com/FelipeJanotte/concord.git && cd concord`
3. **Configuração:** `cp deploy/.env.example .env` e preencha. Gere cada segredo com `openssl rand -hex 32`
   (o `LIVEKIT_API_SECRET` precisa ter pelo menos 32 caracteres).
4. **Subir:** `docker compose -f docker-compose.prod.yml up -d --build`
5. **Conferir:** `docker compose -f docker-compose.prod.yml ps` (tudo `running`; o Postgres `healthy`) e abra
   `https://concord.seudominio.com.br` no navegador: deve responder `{"name":"concord-server",...}`. O Caddy
   pega o certificado HTTPS sozinho no primeiro acesso (leva alguns segundos).
6. **No app:** na tela de login, use `https://concord.seudominio.com.br` como servidor. A primeira conta criada
   vira a **dona** da comunidade.

## Dia a dia

| Tarefa | Comando |
|---|---|
| Ver os logs | `docker compose -f docker-compose.prod.yml logs -f server` (ou `livekit`, `caddy`) |
| Atualizar para a versão nova | `git pull && docker compose -f docker-compose.prod.yml up -d --build` (as migrations rodam sozinhas) |
| Parar | `docker compose -f docker-compose.prod.yml down` (os dados ficam nos volumes) |
| Backups | ficam no volume `pg-backups` (um por dia, os 7 mais novos). Copiar para fora: `docker compose -f docker-compose.prod.yml cp pg-backup:/backups ./backups` |
| Restaurar um backup | `gunzip -c backups/<arquivo>.sql.gz \| docker compose -f docker-compose.prod.yml exec -T postgres psql -U concord concord` (com o servidor parado) |

Fotos, anexos e sons ficam no volume `concord-data`; inclua-o na sua rotina de cópia da máquina.

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| O Caddy não pega o certificado | O DNS ainda não aponta para a máquina ou as portas 80/443 estão fechadas. `docker compose ... logs caddy`. |
| Login funciona, mas a voz não conecta | `voz.seudominio` sem DNS, ou `LIVEKIT_API_KEY/SECRET` diferentes entre servidor e LiveKit (o compose usa as mesmas do `.env`). |
| Voz conecta mas ninguém se ouve | Portas de mídia fechadas: `7881/tcp`, `7882/udp` e `3478/udp`. `docker compose ... logs livekit` mostra os candidatos ICE. |
| `defina ... no .env` ao subir | Falta uma variável obrigatória no `.env` da raiz. |
| Anexos antigos dão 404 depois de reiniciar | `FILES_SIGNING_SECRET` mudou ou ficou vazio. Defina um valor fixo. |

Mais detalhes (o que cada peça faz, variáveis e decisões): skill `concord-deploy`.
