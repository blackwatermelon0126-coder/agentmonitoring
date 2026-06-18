# Agent Monitor — Claude Code 시각화 모니터링

에이전트(Developer, DevOps, QA, PM, Designer, Marketer, Leader)의 실시간 활동을 2D/3D로 시각화합니다.

## 구성

```
agentmonitoring/
├── server/          # Express HTTP 서버 (상태 관리 · Hook 수신 · API 제공)
├── phaser2d/        # 2D 픽셀아트 사무실 (Phaser)
├── three3d/         # 3D 로우폴리 사무실 (Three.js)
└── hooks/           # Claude Code Hook 스크립트 (Phase 2 활성화 예정)
```

## 실행 방법 (현재 동작)

### 1. 서버 시작

```bash
cd server
npm install
npm start
```

서버 기동 후 `http://localhost:3300` 에서 접속 가능합니다.

### 2. 브라우저 접속

| 뷰 | URL |
|----|-----|
| 2D 픽셀아트 오피스 (Phaser) | http://localhost:3300/2d |
| 3D 로우폴리 오피스 (Three.js) | http://localhost:3300/3d |

### 3. 데모 테스트

브라우저에서 `SPACE` 키를 누르거나 아래 명령으로 랜덤 에이전트 활동을 트리거합니다.

```bash
curl -X POST http://localhost:3300/demo
```

## API · 라우트 목록

| 라우트 | 설명 |
|--------|------|
| `GET /2d` | 2D 픽셀아트 오피스 뷰 (Phaser) |
| `GET /3d` | 3D 로우폴리 오피스 뷰 (Three.js) |
| `POST /demo` | 랜덤 에이전트 활동 데모 |
| `GET /api/status` | 현재 에이전트 상태 조회 |
| `GET /api/roles` | 역할 목록 조회 |
| `POST /hook/tool-use` | Claude Code Hook 수신 (Phase 2 활성화 예정) |
| `POST /hook/tool-done` | Claude Code Hook 완료 수신 |

## Claude Code Hook 연동 (Phase 2 예정)

> **현재 상태**: Hook 엔드포인트(`/hook/tool-use`, `/hook/tool-done`)는 서버에 구현되어 있으나,
> Claude Code settings.json 연동은 **Phase 2에서 활성화 예정**입니다.
> 지금은 `/demo` 엔드포인트로 동작을 확인할 수 있습니다.

Phase 2 활성화 시 `.claude/settings.example.json`을 `settings.json`으로 복사하여 사용합니다.
설정 예시는 `.claude/settings.example.json`을 참조하세요.
