FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm build && cp -r src/public dist/public
ENV CP_HOST=0.0.0.0 CP_PORT=8443 CP_DB_PATH=/data/cp.db
EXPOSE 8443

# Offen (Härtung, kein bekannter Angriffspfad): Der Prozess läuft als root. Ein Versuch mit
# `USER node` am 19.09.2026 scheiterte daran, dass das benannte Volume `deploy_cp-data` mit
# root-Rechten existiert und darüber gemountet wird; `chown` im Image greift dann nicht, und
# SQLite kommt mit SQLITE_READONLY nicht hoch. Sauber lösbar mit einem Entrypoint, der als root
# chownt und dann per `su-exec` herunterschaltet, oder indem das Volume einmalig umgestellt und
# der Wechsel in einem Wartungsfenster gefahren wird. Nicht zwischen Tür und Angel.
CMD ["node", "dist/index.js"]
