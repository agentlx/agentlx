FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

LABEL org.opencontainers.image.title="agentlx"
LABEL org.opencontainers.image.description="Open source Linux operations hub with web panel and Python agent runtime"
LABEL org.opencontainers.image.licenses="Apache-2.0"

RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV APP_TIME_ZONE=America/Sao_Paulo
ENV TZ=America/Sao_Paulo

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/agent-linux ./agent-linux

EXPOSE 3000

CMD ["sh", "-c", "npm run db:wait && npm run db:init && npm run start"]
