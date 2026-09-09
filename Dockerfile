FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY src ./src
COPY fixtures ./fixtures
RUN mkdir -p /app/state && chown node:node /app/state
USER node
ENV STATE_PATH=/app/state/state.json
CMD ["node", "--import", "tsx", "src/cli.ts", "--loop"]
