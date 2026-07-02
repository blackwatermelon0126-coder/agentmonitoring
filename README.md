# Agent Monitor — Claude Code 시각화 모니터링

에이전트(Developer, DevOps, QA, PM, Leader)의 실시간 활동을 3D로 시각화합니다.

## 구성

```
agentmonitoring/
├── server/          # Express HTTP 서버 (상태 관리 · Hook 수신 · API 제공)
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
| 3D 로우폴리 오피스 (Three.js) | http://localhost:3300/3d |

### 3. 데모 테스트

브라우저에서 `SPACE` 키를 누르거나 아래 명령으로 랜덤 에이전트 활동을 트리거합니다.

```bash
curl -X POST http://localhost:3300/demo
```

## API · 라우트 목록

| 라우트 | 설명 |
|--------|------|
| `GET /3d` | 3D 로우폴리 오피스 뷰 (Three.js) |
| `POST /demo` | 랜덤 에이전트 활동 데모 |
| `GET /api/status` | 현재 에이전트 상태 조회 |
| `GET /api/roles` | 역할 목록 조회 |
| `POST /hook/tool-use` | Claude Code Hook 수신 |
| `POST /hook/tool-done` | Claude Code Hook 완료 수신 |
| `GET /auth/start` · `GET /auth/status` | MS Graph Device Code 인증 시작 · 상태 |
| `GET /api/org-users` | 조직 사용자 목록 (아바타 피커용, formationlabs 도메인) |
| `GET`·`POST`·`PUT`·`DELETE /api/people` | 사람 아바타 CRUD |
| `GET /api/chats` | 내 Teams 채팅방 목록 |
| `GET /api/chats/:chatId/messages` | 채팅 메시지 읽기 |
| `POST /api/chats/:chatId/messages` | 채팅 메시지 전송 (requireLoopback) |

> 채팅 API 3종의 상세 계약(필드·에러)은 [`server/docs/API_CONTRACT.md`](server/docs/API_CONTRACT.md) §7 참조.

## Microsoft Teams 연동 (Presence · 회의 · 인앱 채팅)

MS Graph API(Device Code Flow)로 Teams를 3D 오피스에 연동한다. 최초 1회 `http://localhost:3300/auth/start` 에서 Device Code 로그인 필요(scope: `Chat.Read`·`Chat.ReadBasic`·`Chat.ReadWrite`·`User.Read.All`).

- **Presence/알림**: 15초 폴링으로 신규 메시지 감지 → 아바타 위 말풍선(`teams-notification` WS broadcast).
- **화상회의 이동**: 회의 중인 인물 아바타를 리조트 회의실로 이동(`meeting-status`).
- **인앱 채팅** (`three3d/js/chat-panel.js`): 우하단 **💬 채팅** 런처 → 사이드패널 방 목록 → 채팅창(읽기·전송). 열린 창 8초 폴링 + `teams-notification` WS로 실시간 갱신, 아바타 말풍선 클릭 시 해당 채팅 인앱 오픈.
  - **채팅방 검색**: 사이드패널 검색창에서 채팅방 명칭·멤버 이름으로 필터.
- **조직 사용자 피커**: `GET /api/org-users` 로 조직 사용자를 불러와 아바타로 추가. `@odata.nextLink` 페이지네이션을 따라 **전체 사용자**를 조회한다(999명 초과 테넌트에서 누락 방지).

## Claude Code Hook 연동 (Phase 2 예정)

> **현재 상태**: Hook 엔드포인트(`/hook/tool-use`, `/hook/tool-done`)는 서버에 구현되어 있으나,
> Claude Code settings.json 연동은 **Phase 2에서 활성화 예정**입니다.
> 지금은 `/demo` 엔드포인트로 동작을 확인할 수 있습니다.

Phase 2 활성화 시 `.claude/settings.example.json`을 `settings.json`으로 복사하여 사용합니다.
설정 예시는 `.claude/settings.example.json`을 참조하세요.
