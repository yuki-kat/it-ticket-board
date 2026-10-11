# Backend image for docker-compose.yml: builds the TypeScript, then keeps only production dependencies.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# The migration reads schema.sql from its own folder, and tsc does not copy .sql files.
RUN npm run build && cp src/db/schema.sql dist/db/schema.sql && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# Create or update the tables, then start: the same order as Render's start command.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
