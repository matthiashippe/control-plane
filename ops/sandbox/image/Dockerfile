# Base image of every sandbox: what the runtime expects (apt-get, node, npm, git; src/replication/spawn.ts at the pin), plus
# curl, python3, netcat and iproute2 for ops/sandbox/probe.sh. Built on the sandbox host by ops/sandbox/setup.sh, never on the payment server.
FROM ubuntu:24.04
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl git nodejs npm python3 iproute2 netcat-openbsd \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /root
