# OCI image for hkfree cloudmap, buildable with both podman and docker.
#
# The build stage produces platform-independent JavaScript, so it always runs
# on the build host's native platform; only the small runtime stage is per-arch.

FROM --platform=$BUILDPLATFORM docker.io/library/node:24-alpine AS build
WORKDIR /src

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY . .
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}
RUN npm run build


FROM docker.io/library/node:24-alpine

ARG APP_VERSION=""
LABEL org.opencontainers.image.title="hkfree cloudmap" \
      org.opencontainers.image.description="Mapa páteřní sítě hkfree.org" \
      org.opencontainers.image.version="${APP_VERSION}"

ENV NODE_ENV=production \
    LISTEN_HOST=0.0.0.0 \
    PORT=8080 \
    DATABASE_URL=sqlite:/data/cloudmap.db \
    STATIC_DIR=/app/web

WORKDIR /app
COPY --from=build /src/apps/api/dist ./api
COPY --from=build /src/apps/web/dist ./web
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "api/server.js"]
