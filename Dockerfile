FROM node:20-slim

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci --production

COPY src ./src
COPY scripts ./scripts

CMD ["npx", "tsx", "src/index.ts"]
