FROM node:24-alpine AS angular-build

WORKDIR /build

# Install Angular dependencies
COPY showcase/angular/package.json showcase/angular/package-lock.json ./
RUN npm ci

# Copy Angular source and assets (angular.json references ../assets and ../js)
COPY showcase/angular/ ./
COPY showcase/assets/ ../assets/
COPY showcase/js/ ../js/
COPY extension/manifest.json ../extension/manifest.json
RUN npm run build -- --configuration production

# ---

FROM node:20-alpine

# better-sqlite3 needs build tools for native compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (cache layer)
COPY showcase/server/package.json showcase/server/package-lock.json ./
RUN npm ci --production

# Copy server source
COPY showcase/server/server.js ./
COPY showcase/server/src/ ./src/

# Copy Angular showcase build output from build stage
COPY --from=angular-build /dist/showcase-angular/browser/ ./public/

# Create data directory for SQLite persistent volume
RUN mkdir -p /data

ENV PORT=3847
ENV DB_PATH=/data/fsb-data.db
ENV NODE_ENV=production

EXPOSE 3847

CMD ["node", "server.js"]
