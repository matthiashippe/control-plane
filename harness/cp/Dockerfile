FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm build && cp -r src/public dist/public
ENV CP_HOST=0.0.0.0 CP_PORT=8443 CP_DB_PATH=/data/cp.db
EXPOSE 8443

# Open (hardening, no known attack path): the process runs as root. An attempt with `USER node`
# on 19.09.2026 failed because the named volume `deploy_cp-data` exists with root ownership and is
# mounted over the image, so `chown` inside the image has no effect and SQLite refuses to come up
# with SQLITE_READONLY. Cleanly solvable with an entrypoint that chowns as root and then drops
# down via `su-exec`, or by converting the volume once and making the switch inside a maintenance
# window. Not something to squeeze in between two other things.
CMD ["node", "dist/index.js"]
