# Agent Monitor - Claude Code 시각화 모니터링 서버
# - WebSocket + Express on Node 20 (Alpine)
# - 정적 자산: phaser2d/, three3d/ (three3d/node_modules/three 포함)
FROM node:20-alpine

WORKDIR /app

# 의존성 캐시 레이어 — package*.json만 먼저 복사
COPY server/package*.json   ./server/
COPY three3d/package*.json  ./three3d/

# server 의존성 (express, ws)
RUN cd server  && npm ci --omit=dev --no-audit --no-fund

# three3d 의존성 (three) — server.js 가 ../three3d/node_modules/three 를 static 으로 노출
RUN cd three3d && npm ci --omit=dev --no-audit --no-fund

# 소스 복사 (의존성은 이미 위에서 설치됨)
COPY server/   ./server/
COPY phaser2d/ ./phaser2d/
COPY three3d/  ./three3d/

ENV NODE_ENV=production

# 데이터 디렉토리 생성 (activity.jsonl 영속화용 volume 마운트 포인트)
RUN mkdir -p /app/data

EXPOSE 3300

# 헬스체크 — /api/status 가 200 OK 면 healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3300/api/status > /dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
