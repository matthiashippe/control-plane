# Werkzeuge für die lokale Chain: kompiliert den USDC-Mock, legt ihn per anvil_setCode an die
# Mainnet-Adresse und stattet Wallets mit Test-USDC aus.
FROM node:22-bookworm-slim
WORKDIR /chain
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund 2>&1 | tail -1
COPY MockUSDC.sol chain.mjs ./
ENTRYPOINT ["node", "chain.mjs"]
CMD ["setup"]
