# Rebuilt sandboxd for the harness (goals/sandbox/04): the real ops/sandbox/sandboxd.mjs with a Docker stand-in
# (harness/sandboxd/harness-run.mjs). Commands of a sandbox run as processes in this container; no Docker in Docker.
# Build context is the repository root (harness/docker-compose.yml), the layout under /opt/sandboxd keeps the
# relative import of start.mjs.
#
# Since goals/sandbox/08 it also holds what the image sandboxd-base:2 of every sandbox holds (ops/sandbox/image/Dockerfile):
# the unmodified upstream runtime at the pin under /opt/automaton, built like harness/runtime/Dockerfile without a patch to
# src/, the copy of harness/runtime/setup-headless.mjs and the two scripts automaton-start and automaton-supervise, plus
# procps and util-linux for pkill, pgrep and setsid. So a hosted automaton thinks here as a process of the stand-in.

# The runtime at the pin, the same steps as harness/runtime/Dockerfile (which stays unchanged, rule 13).
FROM node:22-bookworm AS runtime
ARG AUTOMATON_REV=d8f8168
RUN apt-get update && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /opt/automaton
RUN git clone --quiet https://github.com/Conway-Research/automaton.git . \
  && git checkout --quiet ${AUTOMATON_REV}
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git procps util-linux \
  && rm -rf /var/lib/apt/lists/*
COPY --from=runtime /opt/automaton /opt/automaton
COPY harness/runtime/setup-headless.mjs /opt/automaton-setup/setup-headless.mjs
COPY ops/sandbox/image/automaton-start ops/sandbox/image/automaton-supervise /usr/local/bin/
RUN chmod 0755 /usr/local/bin/automaton-start /usr/local/bin/automaton-supervise
WORKDIR /opt/sandboxd
COPY ops/sandbox/sandboxd.mjs ./ops/sandbox/sandboxd.mjs
COPY harness/sandboxd/harness-run.mjs harness/sandboxd/start.mjs ./harness/sandboxd/
RUN mkdir -p /var/lib/sandboxd/mnt /var/lib/sandboxd/disks
ENV SANDBOXD_API_PORT=8730 SANDBOXD_HOST=0.0.0.0 SANDBOXD_KEYS_DIR=/cp-data
EXPOSE 8730
CMD ["node", "/opt/sandboxd/harness/sandboxd/start.mjs"]
