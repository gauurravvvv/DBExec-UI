# =====================================================================
# DBExec-UI — production container
#
# Multi-stage:
#   1) build   — node:20 runs an OPTIMIZED production Angular build,
#                then rewrites the __API_SERVER__ / __APP_URL__ literals
#                (from environment.prod.ts) to the fixed localhost URLs.
#                Every user runs on the same fixed ports and browses at
#                localhost, so these are constants baked at build time:
#                  API : http://localhost:9058/api/v1
#                  App : http://localhost:8755
#   2) runtime — nginx:alpine serves the static bundle on 8755 with an
#                SPA fallback (try_files -> /index.html) for Angular's
#                client-side router.
#
# No source files are modified; the rewrite is a post-build sed on the
# compiled output only.
# =====================================================================

# ---- Stage 1: build ----
FROM node:20 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Optimized prod build. Raise heap like the repo's build-prod script so
# the AOT compile doesn't OOM on large bundles.
RUN node --max_old_space_size=8000 ./node_modules/@angular/cli/bin/ng build --configuration production

# Bake the fixed localhost API/app URLs into the compiled bundle by
# replacing the deploy-time placeholders. Runs over every emitted JS file.
RUN find dist/DBExec -name '*.js' -exec sed -i \
      -e 's|__API_SERVER__|http://localhost:9058/api/v1|g' \
      -e 's|__APP_URL__|http://localhost:8755|g' {} +

# ---- Stage 2: runtime ----
FROM nginx:alpine AS runtime

# SPA-aware server config listening on 8755.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle.
COPY --from=build /app/dist/DBExec /usr/share/nginx/html

EXPOSE 8755
CMD ["nginx", "-g", "daemon off;"]
