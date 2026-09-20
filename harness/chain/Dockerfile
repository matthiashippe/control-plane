# Tools for the local chain: compiles the USDC mock, places it at the mainnet address via
# anvil_setCode and funds wallets with test USDC.
FROM node:22-bookworm-slim
WORKDIR /chain
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund 2>&1 | tail -1
COPY MockUSDC.sol chain.mjs ./
ENTRYPOINT ["node", "chain.mjs"]
CMD ["setup"]
