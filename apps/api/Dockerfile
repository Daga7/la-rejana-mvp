# syntax=docker/dockerfile:1.7
# API de La Rejana Callejera. Construir desde la RAÍZ del repo:
#   docker build -f apps/api/Dockerfile -t rejana-api .
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @rejana/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @rejana/api build
# Carpeta autónoma solo con dependencias de producción.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm --filter @rejana/api deploy --prod --legacy /salida

FROM node:24-bookworm-slim AS run
ENV NODE_ENV=production MIGRACIONES_DIR=/app/drizzle PORT=4000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /salida/node_modules ./node_modules
COPY --from=build --chown=node:node /salida/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/drizzle ./drizzle
COPY --from=build --chown=node:node /repo/apps/api/assets ./assets
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
