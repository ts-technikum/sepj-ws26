# Ein Container für Frontend und Backend.
#   docker build -t sepj .
#   docker run -p 3001:3001 --env-file apps/api/.env sepj
# Danach http://localhost:3001 im Browser. Ohne .env läuft der Mock.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/trace-schema/package.json packages/trace-schema/
COPY packages/visualization-api/package.json packages/visualization-api/
RUN npm ci
COPY . .
RUN npm test && npm run build:web && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages packages
COPY --from=build /app/apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "apps/api/src/server.mjs"]
