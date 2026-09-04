# Build multi-stage: l'immagine finale non contiene ne' i sorgenti ne' le
# dipendenze di sviluppo. Su un portatile conta: meno spazio e meno da
# ricostruire a ogni aggiornamento.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next in standalone produce un server minimo con le sole dipendenze usate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
# L'utente node esiste gia' nell'immagine: non far girare il server come root
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
