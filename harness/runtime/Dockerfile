# Unveränderte Upstream-Runtime, gepinnt. Kein Patch an src/.
FROM node:22-bookworm
ARG AUTOMATON_REV=d8f8168
RUN apt-get update && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /opt/automaton
RUN git clone --quiet https://github.com/Conway-Research/automaton.git . \
  && git checkout --quiet ${AUTOMATON_REV}
RUN pnpm install --frozen-lockfile
RUN pnpm build
COPY setup-headless.mjs /opt/harness/setup-headless.mjs
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && useradd -m -s /bin/bash automaton
USER automaton
ENV HOME=/home/automaton
ENTRYPOINT ["/entrypoint.sh"]
CMD ["run"]
