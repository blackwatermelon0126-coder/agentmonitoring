# Agent Monitor — API Contract

> **대상**: Hook 어댑터 작성자, 클라이언트 연동 개발자 (주니어 포함)
> **기준 코드**: `server/server.js`, `hooks/agent-monitor-hook.js`, `server/shared/roles.js`
> **서버 포트**: `3300` (기본값, `AGENT_MONITOR_PORT` 환경변수로 재지정 가능)

---

## 목차

1. [POST /hook/tool-use](#1-post-hooktools-use)
2. [POST /hook/tool-done](#2-post-hooktool-done)
3. [GET /api/roles](#3-get-apiroles)
4. [GET /api/status](#4-get-apistatus)
5. [WebSocket — `init` 메시지](#5-websocket--init-메시지)
6. [WebSocket — `agent-update` 메시지](#6-websocket--agent-update-메시지)

---

## 1. POST /hook/tool-use

Claude Code Hook(PreToolUse / PostToolUse / SessionStart / UserPromptSubmit)이 도구를 호출할 때 에이전트 상태를 갱신한다.

### 요청 JSON

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `tool` | `string` | Y | Claude Code 도구명 (예: `"Read"`, `"Bash"`, `"Edit"`) |
| `role` | `string` | Y | 에이전트 역할 키 (소문자). `developer` / `devops` / `qa` / `pm` / `leader` 중 하나 |
| `status` | `string` | N | 현재 상태. 기본값 `"working"` |
| `detail` | `string` | N | 화면에 표시할 한 줄 요약 (미입력 시 `tool → action` 자동 매핑 레이블 사용) |
| `params` | `object` | N | 도구별 추가 파라미터 (예: `{ "file": "server.js" }`) |
| `event` | `string` | N | Hook 이벤트 이름 (`"PreToolUse"` / `"PostToolUse"` / `"SessionStart"` 등) |
| `sessionId` | `string` | N | Claude Code 세션 ID (`evt.session_id`) |
| `result` | `string` | N | PostToolUse 전용. 도구 실행 결과 한 줄 요약 (최대 60자) |

### 응답 JSON

```json
{ "ok": true }
```

### 요청 예시 — PreToolUse (Read)

```json
{
  "tool": "Read",
  "role": "developer",
  "status": "working",
  "detail": "📖 server.js",
  "params": { "file": "server.js" },
  "event": "PreToolUse",
  "sessionId": "sess-abc123"
}
```

### 요청 예시 — PostToolUse (Bash)

```json
{
  "tool": "Bash",
  "role": "devops",
  "status": "working",
  "detail": "⚡ docker compose up -d",
  "params": {
    "command": "docker compose up -d",
    "description": "서비스 기동"
  },
  "event": "PostToolUse",
  "sessionId": "sess-abc123",
  "result": "Container started successfully"
}
```

### 요청 예시 — SessionStart

```json
{
  "tool": "SessionStart",
  "role": "developer",
  "status": "working",
  "detail": "🟢 세션 시작",
  "event": "SessionStart",
  "sessionId": "sess-abc123"
}
```

### tool → action 자동 매핑 (detail 미입력 시 서버가 자동 적용)

| tool | action | label |
|------|--------|-------|
| `Read` | `reading` | 파일 읽는 중 |
| `Write` | `coding` | 코드 작성 중 |
| `Edit` | `coding` | 코드 수정 중 |
| `Bash` | `building` | 명령 실행 중 |
| `Grep` | `searching` | 검색 중 |
| `Glob` | `searching` | 파일 탐색 중 |
| `Agent` | `thinking` | 에이전트 호출 중 |
| `TodoWrite` | `planning` | 작업 계획 중 |
| `WebSearch` | `searching` | 웹 검색 중 |
| `WebFetch` | `reading` | 웹 조회 중 |
| (그 외) | `working` | `{tool명}` |

---

## 2. POST /hook/tool-done

에이전트 세션 종료 또는 작업 완료 시 에이전트를 `idle` 상태로 전환한다.

Hook 이벤트 `Stop` / `SessionEnd` / `SubagentStop` 수신 시 Hook 어댑터가 호출한다.

### 요청 JSON

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `role` | `string` | N | 단일 에이전트 역할 키. `allRoles`가 `true`면 무시된다. |
| `allRoles` | `boolean` | N | `true`이면 모든 역할(`developer` / `devops` / `qa` / `pm` / `leader`)을 동시에 `idle`로 전환한다. |

> **선택 기준**: `allRoles: true`는 세션 전체가 종료될 때 사용. 특정 에이전트만 완료된 경우 `role`만 지정.

### 응답 JSON

```json
{ "ok": true }
```

### 요청 예시 — 단일 에이전트 완료

```json
{
  "role": "developer"
}
```

### 요청 예시 — 전체 에이전트 idle 전환 (Stop 이벤트)

```json
{
  "role": "developer",
  "allRoles": true
}
```

---

## 3. GET /api/roles

5개 역할 배열을 반환한다. 클라이언트가 역할 목록을 동적으로 구성할 때 사용한다.
데이터 출처: `server/shared/roles.js` (SSoT).

### 응답 JSON

배열 형태. 각 요소의 필드:

| 필드 | 타입 | 설명 |
|------|------|------|
| `name` | `string` | 역할 키 (소문자, Hook의 `role` 필드 값과 일치) |
| `label` | `string` | 화면 표시 이름 |
| `color` | `string` | UI 대표 색상 (hex) |
| `emoji` | `string` | UI 아이콘 이모지 |

### 응답 예시

```json
[
  { "name": "developer", "label": "Developer", "color": "#4A90D9", "emoji": "💻" },
  { "name": "devops",    "label": "DevOps",    "color": "#E67E22", "emoji": "⚙️" },
  { "name": "qa",        "label": "QA",        "color": "#27AE60", "emoji": "🔍" },
  { "name": "pm",        "label": "PM",        "color": "#8E44AD", "emoji": "📋" },
  { "name": "leader",    "label": "Leader",    "color": "#E74C3C", "emoji": "🎯" }
]
```

---

## 4. GET /api/status

현재 모든 에이전트의 상태 스냅샷을 반환한다.

### 응답 JSON

객체. 키는 역할 이름(`name`), 값은 에이전트 상태 객체.

**에이전트 상태 객체 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `role` | `string` | 화면 표시용 역할 이름 (label, 예: `"Developer"`) |
| `status` | `string` | `"idle"` 또는 `"working"` |
| `action` | `string` | 현재 수행 중인 액션 유형 (`"reading"` / `"coding"` / `"building"` 등) |
| `detail` | `string` | 화면 표시용 상세 텍스트 |
| `tool` | `string` | 마지막으로 사용한 도구명 (초기값 없음) |
| `params` | `object` | 마지막 도구 파라미터 |
| `event` | `string` | 마지막 Hook 이벤트명 |
| `sessionId` | `string` | Claude Code 세션 ID |
| `result` | `string` | 마지막 도구 실행 결과 요약 |
| `lastUpdate` | `number` | 마지막 갱신 시각 (Unix 밀리초, `Date.now()`) |

### 응답 예시

```json
{
  "developer": {
    "role": "Developer",
    "status": "working",
    "action": "coding",
    "detail": "🛠 server.js 수정",
    "tool": "Edit",
    "params": { "file": "server.js" },
    "event": "PreToolUse",
    "sessionId": "sess-abc123",
    "result": "",
    "lastUpdate": 1750123456789
  },
  "devops": {
    "role": "DevOps",
    "status": "idle",
    "action": "idle",
    "detail": "대기 중",
    "lastUpdate": 1750123450000
  },
  "qa": {
    "role": "QA",
    "status": "idle",
    "action": "idle",
    "detail": "대기 중",
    "lastUpdate": 1750123450000
  },
  "pm": {
    "role": "PM",
    "status": "idle",
    "action": "idle",
    "detail": "대기 중",
    "lastUpdate": 1750123450000
  },
  "leader": {
    "role": "Leader",
    "status": "idle",
    "action": "idle",
    "detail": "대기 중",
    "lastUpdate": 1750123450000
  }
}
```

---

## 5. WebSocket — `init` 메시지

WebSocket 클라이언트가 서버에 연결되면 서버가 즉시 전송하는 초기화 메시지.
현재 전체 에이전트 상태와 최근 활동 로그(최대 50건)를 한 번에 내려준다.

### 수신 시점

`ws://localhost:3300` 연결 직후 서버 → 클라이언트 방향으로 1회 전송.

### 메시지 JSON 구조

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | `string` | 항상 `"init"` |
| `agents` | `object` | 전체 에이전트 상태 맵 (키 = 역할 이름). 구조는 [`GET /api/status`](#4-get-apistatus) 응답과 동일 |
| `activity` | `array` | 최근 활동 로그 배열 (최대 50건). 오래된 순 정렬 |

**activity 배열 요소 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `ts` | `number` | 발생 시각 (Unix 밀리초) |
| `agent` | `string` | 역할 키 (예: `"developer"`) |
| `role` | `string` | 화면 표시 역할명 (예: `"Developer"`) |
| `tool` | `string` | 사용된 도구명 |
| `event` | `string` | Hook 이벤트명 |
| `detail` | `string` | 상세 텍스트 |
| `params` | `object` | 도구 파라미터 |
| `result` | `string` | 도구 실행 결과 요약 |

### 메시지 예시

```json
{
  "type": "init",
  "agents": {
    "developer": {
      "role": "Developer",
      "status": "working",
      "action": "reading",
      "detail": "📖 server.js",
      "tool": "Read",
      "params": { "file": "server.js" },
      "event": "PreToolUse",
      "sessionId": "sess-abc123",
      "result": "",
      "lastUpdate": 1750123456789
    },
    "devops": {
      "role": "DevOps",
      "status": "idle",
      "action": "idle",
      "detail": "대기 중",
      "lastUpdate": 1750123450000
    }
  },
  "activity": [
    {
      "ts": 1750123400000,
      "agent": "developer",
      "role": "Developer",
      "tool": "Read",
      "event": "PreToolUse",
      "detail": "📖 server.js",
      "params": { "file": "server.js" },
      "result": ""
    },
    {
      "ts": 1750123456789,
      "agent": "developer",
      "role": "Developer",
      "tool": "Edit",
      "event": "PostToolUse",
      "detail": "🛠 server.js 수정",
      "params": { "file": "server.js" },
      "result": "파일 저장 완료…"
    }
  ]
}
```

---

## 6. WebSocket — `agent-update` 메시지

에이전트 상태가 변경될 때마다 연결된 모든 클라이언트에게 브로드캐스트하는 실시간 이벤트.

### 발생 조건

- `POST /hook/tool-use` 수신 시 (도구 사용 시작/완료)
- `POST /hook/tool-done` 수신 시 (에이전트 idle 전환)

### 메시지 JSON 구조

| 필드 | 타입 | 항상 포함 | 설명 |
|------|------|----------|------|
| `type` | `string` | Y | 항상 `"agent-update"` |
| `agent` | `string` | Y | 갱신된 에이전트의 역할 키 (예: `"developer"`) |
| `state` | `object` | Y | 해당 에이전트의 현재 상태 전체. 구조는 [`GET /api/status`](#4-get-apistatus) 단일 항목과 동일 |
| `activity` | `object` | N | tool-use 이벤트일 때만 포함. 활동 로그 단건 (activity 배열 요소와 동일 구조). tool-done(idle 전환) 시에는 포함되지 않음 |

### 메시지 예시 — 도구 사용 (activity 포함)

```json
{
  "type": "agent-update",
  "agent": "developer",
  "state": {
    "role": "Developer",
    "status": "working",
    "action": "searching",
    "detail": "🔍 grep \"agentStates\"",
    "tool": "Grep",
    "params": { "pattern": "agentStates", "path": "./server" },
    "event": "PreToolUse",
    "sessionId": "sess-abc123",
    "result": "",
    "lastUpdate": 1750123500000
  },
  "activity": {
    "ts": 1750123500000,
    "agent": "developer",
    "role": "Developer",
    "tool": "Grep",
    "event": "PreToolUse",
    "detail": "🔍 grep \"agentStates\"",
    "params": { "pattern": "agentStates", "path": "./server" },
    "result": ""
  }
}
```

### 메시지 예시 — idle 전환 (activity 없음)

```json
{
  "type": "agent-update",
  "agent": "developer",
  "state": {
    "role": "Developer",
    "status": "idle",
    "action": "idle",
    "detail": "대기 중",
    "lastUpdate": 1750123600000
  }
}
```

---

## Hook 어댑터 등록 방법

`settings.json`에 아래와 같이 등록한다. `CLAUDE_ROLE` 환경변수로 역할을 지정한다.

```json
{
  "env": {
    "CLAUDE_ROLE": "developer"
  },
  "hooks": {
    "PreToolUse":  [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "Stop":        [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }]
  }
}
```

역할별 환경변수 값:

| 역할 | `CLAUDE_ROLE` 값 |
|------|-----------------|
| 개발자 | `developer` |
| DevOps | `devops` |
| QA | `qa` |
| PM | `pm` |
| 리더 | `leader` |
