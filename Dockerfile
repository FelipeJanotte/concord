# Imagem do servidor do Concord (A14). Só o servidor: o app desktop é distribuído pelo instalador.
# Usada pelo docker-compose.prod.yml; ver deploy/README.md.
FROM node:22-bookworm-slim

# Bot de música (A11): ffmpeg (Debian, build LGPL/GPL usado como programa externo) e yt-dlp (binário oficial).
# Debian em vez de Alpine: o @livekit/rtc-node só tem binário para glibc.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux /usr/local/bin/yt-dlp
RUN chmod 755 /usr/local/bin/yt-dlp

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3001

# Dependências primeiro (cache das camadas). O servidor roda com tsx, que está nas devDependencies.
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

# Só o que o servidor usa: o código dele e o contrato compartilhado.
COPY server ./server
COPY src/shared ./src/shared

# Dados (fotos, anexos, sons) num volume; o banco fica no Postgres.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3001

# Resposta simples em / ({"name":"concord-server",...}) serve de verificação de saúde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["npx", "tsx", "server/index.ts"]
