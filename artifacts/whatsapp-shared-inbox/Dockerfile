FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/whatsapp-shared-inbox/package.json artifacts/whatsapp-shared-inbox/package.json
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib lib
RUN pnpm install --frozen-lockfile
COPY artifacts/whatsapp-shared-inbox artifacts/whatsapp-shared-inbox
COPY artifacts/api-server artifacts/api-server
RUN PORT=3000 BASE_PATH=/ pnpm --filter @workspace/whatsapp-shared-inbox run build
RUN pnpm --filter @workspace/api-server run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/artifacts/whatsapp-shared-inbox/dist/public ./dist/public
COPY --from=build /app/artifacts/api-server/dist ./api-dist
EXPOSE 3000
ENV PORT=3000
ENV STATIC_DIR=/app/dist/public
CMD ["node", "--enable-source-maps", "./api-dist/index.mjs"]