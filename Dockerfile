# METAOFFICE — Node 20 Alpine
FROM node:20-alpine

WORKDIR /app

# 의존성 캐시 레이어 — package*.json만 먼저 복사
COPY server/package*.json   ./server/
COPY three3d/package*.json  ./three3d/

RUN cd server  && npm install --omit=dev --no-audit --no-fund
RUN cd three3d && npm install --omit=dev --no-audit --no-fund

# 소스 복사 (의존성은 이미 위에서 설치됨)
COPY server/  ./server/
COPY three3d/ ./three3d/

ENV NODE_ENV=production

# 데이터 디렉토리 — people.json, token.json 등 런타임 파일 영속화 포인트
RUN mkdir -p /app/server/data

EXPOSE 3300

# 헬스체크 — /api/status 가 200 OK 면 healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3300/api/status > /dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
