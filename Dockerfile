FROM node:22

RUN useradd --create-home --shell /bin/bash agent

WORKDIR /app

RUN npm install -g tsx

COPY --chown=agent:agent package*.json tsconfig.json ./
RUN npm ci --production && chown -R agent:agent /app

COPY --chown=agent:agent src ./src
COPY --chown=agent:agent scripts ./scripts

# Claude Code refuses --dangerously-skip-permissions as root, so we run as a non-root user.
# /app/data is the Fly volume mount point — must be writable by `agent`.
RUN mkdir -p /app/data && chown agent:agent /app/data
USER agent

CMD ["tsx", "src/index.ts"]
