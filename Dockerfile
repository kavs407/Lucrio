FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node server.mjs database.mjs billing.mjs migrate.mjs schema.sql ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
