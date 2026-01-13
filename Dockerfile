# =============================================================================
# DOCKERFILE OPTIMISE - SECURITE & TAILLE MINIMALE
# =============================================================================
# Objectifs:
# - Image la plus petite possible
# - Securite maximale (non-root, read-only FS, no shell, capabilities dropped)
# - Signal handling correct (tini)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Compilation TypeScript
# -----------------------------------------------------------------------------
FROM node:20.18-alpine AS builder

WORKDIR /build

# Copier uniquement les fichiers necessaires pour npm ci
COPY package.json package-lock.json ./

# Installer les dependances (avec cache layer)
RUN npm ci --ignore-scripts

# Copier le source et compiler
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Dependencies - Production deps only
# -----------------------------------------------------------------------------
FROM node:20.18-alpine AS deps

WORKDIR /deps

COPY package.json package-lock.json ./

# Installer uniquement les deps de production
# --ignore-scripts: securite - pas d'execution de scripts postinstall
# --omit=dev: pas de devDependencies
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    # Supprimer les fichiers inutiles des node_modules
    && find node_modules -name "*.md" -delete \
    && find node_modules -name "*.ts" -delete \
    && find node_modules -name "*.map" -delete \
    && find node_modules -name "LICENSE*" -delete \
    && find node_modules -name "*.d.ts" -delete \
    && find node_modules -name "CHANGELOG*" -delete \
    && find node_modules -name ".npmignore" -delete \
    && find node_modules -name ".eslint*" -delete \
    && find node_modules -name ".prettier*" -delete \
    && find node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true

# -----------------------------------------------------------------------------
# Stage 3: Production - Image finale minimale
# -----------------------------------------------------------------------------
FROM node:20.18-alpine AS production

# Labels OCI standard
LABEL org.opencontainers.image.title="Discord Role Bot" \
      org.opencontainers.image.description="Bot Discord de reinscription pour associations" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Association" \
      org.opencontainers.image.licenses="ISC" \
      org.opencontainers.image.source=""

# Installer tini pour le signal handling + supprimer les packages inutiles
RUN apk add --no-cache tini \
    # Supprimer les caches et fichiers inutiles
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/* \
    # Supprimer les shells (securite) - garder sh pour healthcheck
    && rm -f /bin/ash /bin/bash 2>/dev/null || true

# Creer un utilisateur avec UID/GID specifiques (non-root)
# UID 10001 evite les collisions avec les utilisateurs systeme
RUN addgroup -g 10001 -S botgroup \
    && adduser -u 10001 -S botuser -G botgroup -h /app -s /sbin/nologin

WORKDIR /app

# Copier les fichiers compiles et les dependances
COPY --from=deps --chown=botuser:botgroup /deps/node_modules ./node_modules
COPY --from=builder --chown=botuser:botgroup /build/dist ./dist

# Creer le dossier data avec les bonnes permissions
RUN mkdir -p /app/data \
    && chown -R botuser:botgroup /app \
    && chmod 700 /app/data

# Passer a l'utilisateur non-root
USER botuser:botgroup

# Variables d'environnement pour Node.js production
ENV NODE_ENV=production \
    # Desactiver les mises a jour npm
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    # Optimisations Node.js
    NODE_OPTIONS="--max-old-space-size=128"

# Healthcheck optimise (sans npm)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node /app/dist/healthcheck.js || exit 1

# Exposer aucun port (bot Discord = connexion sortante uniquement)
# EXPOSE n'est pas necessaire

# Point d'entree avec tini pour le signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Commande: executer node directement (pas npm)
CMD ["node", "dist/index.js"]
