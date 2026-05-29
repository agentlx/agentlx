FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

ARG AGENTLX_VERSION=0.0.0
ARG AGENTLX_BUILD_REVISION=unknown
ARG AGENTLX_BUILD_SOURCE=local
ARG AGENTLX_IMAGE_REF=
ARG AGENTLX_IMAGE_DIGEST=
ARG AGENTLX_OFFICIAL_BUILD=false

LABEL org.opencontainers.image.title="agentlx"
LABEL org.opencontainers.image.description="Open source Linux operations hub with web panel and Python agent runtime"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.version="${AGENTLX_VERSION}"
LABEL org.opencontainers.image.revision="${AGENTLX_BUILD_REVISION}"

RUN apk add --no-cache tzdata

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV APP_TIME_ZONE=America/Sao_Paulo
ENV TZ=America/Sao_Paulo
ENV AGENTLX_VERSION=${AGENTLX_VERSION}
ENV AGENTLX_BUILD_REVISION=${AGENTLX_BUILD_REVISION}
ENV AGENTLX_BUILD_SOURCE=${AGENTLX_BUILD_SOURCE}
ENV AGENTLX_IMAGE_REF=${AGENTLX_IMAGE_REF}
ENV AGENTLX_IMAGE_DIGEST=${AGENTLX_IMAGE_DIGEST}
ENV AGENTLX_OFFICIAL_BUILD=${AGENTLX_OFFICIAL_BUILD}

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/agent-linux ./agent-linux

EXPOSE 3000

CMD ["sh", "-c", "npm run db:wait && npm run db:init && npm run start"]
