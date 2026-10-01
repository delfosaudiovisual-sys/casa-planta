# Imagem do programa. Duas etapas: a primeira instala tudo, confere e monta dist/; a segunda leva só o necessário.
#   docker build -t casa-planta .
#   docker run -p 3000:3000 -v casa-dados:/dados -e ADMIN_EMAIL=... -e ADMIN_SENHA_INICIAL=... casa-planta

FROM node:22-bookworm-slim AS montagem
WORKDIR /app
# ferramentas para compilar o better-sqlite3 caso o binário pronto não sirva
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run verificar && npm run montar && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/dados
WORKDIR /app
COPY --from=montagem /app/node_modules ./node_modules
COPY --from=montagem /app/dist ./dist
COPY package.json ./
COPY servidor ./servidor
COPY compartilhado ./compartilhado
COPY modelos ./modelos
COPY dados ./dados
COPY ferramentas/entrada.sh /usr/local/bin/entrada.sh
RUN chmod 755 /usr/local/bin/entrada.sh && mkdir -p /dados && chown node:node /dados
EXPOSE 3000
VOLUME /dados
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# o script de entrada acerta o dono da pasta de dados e roda o servidor com o usuário "node" (sem privilégios)
ENTRYPOINT ["/usr/local/bin/entrada.sh"]
CMD ["node", "servidor/index.js"]
