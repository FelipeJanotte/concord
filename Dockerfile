# Imagem do servidor do Concord (A14). Só o servidor: o app Electron é distribuído pelo instalador.
# Usada pelo docker-compose.prod.yml; ver deploy/README.md.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    # o binário do Electron não é usado no servidor
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
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
  CMD wget -qO- http://127.0.0.1:3001/ >/dev/null || exit 1

CMD ["npx", "tsx", "server/index.ts"]
