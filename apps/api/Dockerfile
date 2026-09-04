FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm install --workspaces --if-present --include-workspace-root
COPY packages/types packages/types
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app/apps/api
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/node_modules ../../node_modules
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && node dist/server.js"]
