# Base image of every sandbox (sandboxd-base:2): Node 22 and the unmodified upstream runtime at the pin under /opt/automaton,
# built like harness/runtime/Dockerfile without a patch to src/, so a sandbox starts an automaton in seconds instead of
# building it in 512 MB (goals/sandbox/08, decision 1). It keeps what the runtime expects (apt-get, node, npm, git;
# src/replication/spawn.ts at the pin) and curl, python3, netcat and iproute2 for ops/sandbox/probe.sh.
# Built on the sandbox host by ops/sandbox/setup.sh from /opt/sandboxd/image, never on the payment server.
FROM node:22-bookworm
ARG AUTOMATON_REV=d8f8168
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git python3 make g++ iproute2 netcat-openbsd \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /opt/automaton
RUN git clone --quiet https://github.com/Conway-Research/automaton.git . \
 && git checkout --quiet ${AUTOMATON_REV}
RUN pnpm install --frozen-lockfile
RUN pnpm build
COPY setup-headless.mjs /opt/automaton-setup/setup-headless.mjs
COPY automaton-start /usr/local/bin/automaton-start
COPY automaton-supervise /usr/local/bin/automaton-supervise
RUN chmod 0755 /usr/local/bin/automaton-start /usr/local/bin/automaton-supervise
ENV HOME=/root
WORKDIR /root
