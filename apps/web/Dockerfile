FROM node:20-alpine AS build
ARG VITE_API_BASE_URL=http://localhost:4000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspaces --if-present --include-workspace-root
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/docker-entrypoint.d/40-write-env-config.sh /docker-entrypoint.d/40-write-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-env-config.sh
EXPOSE 80
