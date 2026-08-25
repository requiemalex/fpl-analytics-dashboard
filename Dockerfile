# Single-host production image: one Express process serves both the API
# proxy and the built React client from the same origin — see README's
# "Architecture overview" and the deployment notes for why this app needs
# an always-on backend rather than static hosting.
#
# Deliberately NOT using the esbuild single-file bundle that the Electron
# build produces (build:electron-server / server/dist/app.bundle.js).
# That bundle is only ever loaded via `await import(...)` from Electron's
# CommonJS main.js, and testing showed the same --format=esm bundle
# reliably throws "Dynamic require of \"path\" is not supported" (from
# deep inside body-parser's "depd" dependency) when run as `node
# <bundle>.mjs` directly, or via a wrapper file rather than an inline
# `-e` script — exactly how a container CMD would invoke it. Rather than
# ship something that only works under one specific, hard-to-pin-down
# invocation style, this image installs real production dependencies and
# runs the plain tsc-compiled server, the same code path already
# exercised by `npm run dev` / `npm start`.

FROM node:20-slim AS build
WORKDIR /app

# Install once for the whole workspace (server + client) before copying
# source, so this layer only re-runs when dependencies actually change.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY . .

# Type-checks + builds the client (tsc -b && vite build) and the server
# (tsc -p tsconfig.json) — same command used locally and in npm run build.
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production-only install (skips typescript/vite/esbuild/electron and the
# other devDependencies) — still workspace-aware, so this also pulls in
# the client workspace's own dependencies even though nothing at runtime
# imports them (only its already-built static output is used below). For
# this app's size that's an acceptable, simple tradeoff against the
# fragility of trying to hand-prune to just the server's own deps in an
# npm-workspaces layout.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev

# Directory layout matches the source tree on purpose: app.ts locates the
# built client via a path relative to its own file
# (path.join(__dirname, "../../client/dist")), so server/dist and
# client/dist must stay siblings under the same root here too.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# Railway (and most PaaS hosts) inject PORT at runtime and route to
# whatever it's set to; config.ts already reads process.env.PORT with a
# 4000 fallback for local/Docker-without-PORT use. EXPOSE here is
# documentation, not a requirement those hosts rely on.
EXPOSE 4000

CMD ["node", "server/dist/index.js"]
