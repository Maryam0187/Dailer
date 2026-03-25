# Production Dockerfile
# Mirrors CRM/crm root Dockerfile layout; Node 20 for Next.js 16.
# No `npm prune`: dialer runs `sequelize-cli` on startup via scripts/init-db-simple.js.
FROM node:20.19.1-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
