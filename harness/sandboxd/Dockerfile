# Rebuilt sandboxd for the harness (goals/sandbox/04): the real ops/sandbox/sandboxd.mjs with a Docker stand-in
# (harness/sandboxd/harness-run.mjs). Commands of a sandbox run as processes in this container; no Docker in Docker.
# Build context is the repository root (harness/docker-compose.yml), the layout under /opt/sandboxd keeps the
# relative import of start.mjs.
FROM node:22-bookworm
WORKDIR /opt/sandboxd
COPY ops/sandbox/sandboxd.mjs ./ops/sandbox/sandboxd.mjs
COPY harness/sandboxd/harness-run.mjs harness/sandboxd/start.mjs ./harness/sandboxd/
RUN mkdir -p /var/lib/sandboxd/mnt /var/lib/sandboxd/disks
ENV SANDBOXD_API_PORT=8730 SANDBOXD_HOST=0.0.0.0 SANDBOXD_KEYS_DIR=/cp-data
EXPOSE 8730
CMD ["node", "/opt/sandboxd/harness/sandboxd/start.mjs"]
