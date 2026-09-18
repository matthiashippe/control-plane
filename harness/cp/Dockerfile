FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm build
ENV CP_HOST=0.0.0.0 CP_PORT=8443 CP_DB_PATH=/data/cp.db
EXPOSE 8443
CMD ["node", "dist/index.js"]
