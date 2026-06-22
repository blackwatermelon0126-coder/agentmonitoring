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
| `sessionId` | `string` | N | 대상 세션 ID. 미입력 시 `"default"` 세션. `allRoles: true`인 경우 `sessionId`는 무시되고 **모든 세션**의 해당 역할이 idle로 전환된다 (P2-C). |

> **선택 기준**: `allRoles: true`는 세션 전체가 종료될 때 사용. 특정 에이전트만 완료된 경우 `role`(+ 필요 시 `sessionId`)만 지정.

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

`{ roles: [...] }` 래퍼 객체 형태. `roles` 배열 각 요소의 필드:

| 필드 | 타입 | 설명 |
|------|------|------|
| `name` | `string` | 역할 키 (소문자, Hook의 `role` 필드 값과 일치) |
| `label` | `string` | 화면 표시 이름 |
| `color` | `string` | UI 대표 색상 (hex) |
| `emoji` | `string` | UI 아이콘 이모지 |

### 응답 예시

```json
{
  "roles": [
    { "name": "developer", "label": "Developer", "color": "#4A90D9", "emoji": "💻" },
    { "name": "devops",    "label": "DevOps",    "color": "#E67E22", "emoji": "⚙️" },
    { "name": "qa",        "label": "QA",        "color": "#27AE60", "emoji": "🔍" },
    { "name": "pm",        "label": "PM",        "color": "#8E44AD", "emoji": "📋" },
    { "name": "leader",    "label": "Leader",    "color": "#E74C3C", "emoji": "🎯" }
  ]
}
```

---

## 4. GET /api/status

현재 모든 세션·에이전트의 상태 스냅샷과 서버 헬스 정보를 반환한다.

> **중요 — sessionId 기반 멀티세션 구조 (P2-C)**
> 응답은 더 이상 역할 키만 담은 단일 객체가 아니다.
> 최상위는 **서버 메타 정보 + `agentStates`(하위호환 뷰) + `sessions`(세션별 상태)** 를 담은 래퍼 객체다.
> 여러 Claude Code 세션이 동시에 실행되면, 각 세션은 자신의 `sessionId`를 키로 `sessions` 안에 독립된 역할 상태 맵을 가진다.

### 응답 JSON — 최상위 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `status` | `string` | 서버 상태. 항상 `"ok"` |
| `uptime` | `number` | 서버 가동 시간(초). `(Date.now() - 서버시작시각) / 1000` |
| `connectedClients` | `number` | 현재 연결된 WebSocket 클라이언트 수 |
| `eventCount` | `number` | 서버 시작 이후 처리한 `/hook/tool-use` 이벤트 누적 수 |
| `lastEventAt` | `string \| null` | 마지막 Hook 이벤트 수신 시각(ISO 8601). 아직 없으면 `null` |
| `agentStates` | `object` | **하위호환 뷰**. `default` 세션의 역할→상태 맵 (= `sessions.default`와 동일 참조). 기존에 역할 키로 바로 접근하던 클라이언트를 위해 유지 |
| `sessions` | `object` | **세션별 상태 맵**. 키 = `sessionId`, 값 = 역할→상태 맵. 항상 `default` 세션을 포함하며, 새 `sessionId`가 들어오면 키가 추가된다 |

### `sessions` 구조

```
sessions = {
  "default":      { developer: {상태}, devops: {상태}, qa: {상태}, pm: {상태}, leader: {상태} },
  "<sessionId>":  { developer: {상태}, devops: {상태}, qa: {상태}, pm: {상태}, leader: {상태} },
  ...
}
```

- 키(`sessionId`)는 Hook 요청 본문의 `sessionId` 값(= Claude Code `evt.session_id`)이다.
- `sessionId`가 없는 Hook 요청은 `"default"` 세션으로 폴백되어 적립된다 (하위호환).
- 각 세션 값은 **5개 역할 키**(`developer` / `devops` / `qa` / `pm` / `leader`)를 모두 가진 맵이며, 값은 아래 "에이전트 상태 객체"다.

**에이전트 상태 객체 필드**:

| 필드 | 타입 | 설명 |
|------|------|------|
| `role` | `string` | 화면 표시용 역할 이름 (label, 예: `"Developer"`) |
| `roleName` | `string` | 역할 키 (소문자, 예: `"developer"`) |
| `status` | `string` | `"idle"` 또는 `"working"` |
| `action` | `string` | 현재 수행 중인 액션 유형 (`"reading"` / `"coding"` / `"building"` 등) |
| `detail` | `string` | 화면 표시용 상세 텍스트 |
| `tool` | `string` | 마지막으로 사용한 도구명 (초기값 빈 문자열) |
| `params` | `object` | 마지막 도구 파라미터 (Hook 갱신 이후에만 존재) |
| `event` | `string` | 마지막 Hook 이벤트명 (Hook 갱신 이후에만 존재) |
| `sessionId` | `string` | 이 상태가 속한 세션 ID (`default` 세션이면 `"default"`) |
| `result` | `string` | 마지막 도구 실행 결과 요약 (Hook 갱신 이후에만 존재) |
| `lastUpdate` | `number` | 마지막 갱신 시각 (Unix 밀리초, `Date.now()`) |

> **초기 상태 vs 갱신 상태**: 세션이 처음 생성되면 각 역할은 `{ role, roleName, status:'idle', action:'', detail:'', tool:'', lastUpdate, sessionId }` 만 가진다.
> `/hook/tool-use`로 한 번 갱신되면 `params` / `event` / `result` 필드가 추가된다.

### 클라이언트가 세션을 구분하는 방법

1. **단일 세션만 볼 때**: 최상위 `agentStates`(= `sessions.default`)를 그대로 사용한다. 기존 동작과 동일.
2. **멀티세션을 구분할 때**: `sessions` 객체의 키 목록(`Object.keys(res.sessions)`)을 순회한다. 각 키가 하나의 Claude Code 세션이며, 해당 값이 그 세션의 역할별 상태다.
3. 개별 상태 객체의 `sessionId` 필드로도 어느 세션 소속인지 식별할 수 있다 (WebSocket `agent-update` 메시지와 매칭할 때 유용).

### 응답 예시 (멀티세션)

```json
{
  "status": "ok",
  "uptime": 132.5,
  "connectedClients": 2,
  "eventCount": 17,
  "lastEventAt": "2026-06-19T05:12:34.567Z",
  "agentStates": {
    "developer": {
      "role": "Developer",
      "roleName": "developer",
      "status": "working",
      "action": "coding",
      "detail": "🛠 server.js 수정",
      "tool": "Edit",
      "params": { "file": "server.js" },
      "event": "PreToolUse",
      "sessionId": "default",
      "result": "",
      "lastUpdate": 1750123456789
    },
    "devops": {
      "role": "DevOps",
      "roleName": "devops",
      "status": "idle",
      "action": "",
      "detail": "",
      "tool": "",
      "sessionId": "default",
      "lastUpdate": 1750123450000
    }
  },
  "sessions": {
    "default": {
      "developer": {
        "role": "Developer",
        "roleName": "developer",
        "status": "working",
        "action": "coding",
        "detail": "🛠 server.js 수정",
        "tool": "Edit",
        "params": { "file": "server.js" },
        "event": "PreToolUse",
        "sessionId": "default",
        "result": "",
        "lastUpdate": 1750123456789
      },
      "devops": {
        "role": "DevOps",
        "roleName": "devops",
        "status": "idle",
        "action": "",
        "detail": "",
        "tool": "",
        "sessionId": "default",
        "lastUpdate": 1750123450000
      }
    },
    "sess-abc123": {
      "developer": {
        "role": "Developer",
        "roleName": "developer",
        "status": "working",
        "action": "reading",
        "detail": "📖 다른 세션에서 읽는 중",
        "tool": "Read",
        "params": { "file": "roles.js" },
        "event": "PreToolUse",
        "sessionId": "sess-abc123",
        "result": "",
        "lastUpdate": 1750123460000
      },
      "qa": {
        "role": "QA",
        "roleName": "qa",
        "status": "idle",
        "action": "",
        "detail": "",
        "tool": "",
        "sessionId": "sess-abc123",
        "lastUpdate": 1750123459000
      }
    }
  }
}
```

> 위 예시는 지면상 일부 역할만 표시했다. 실제로는 각 세션마다 5개 역할(`developer` / `devops` / `qa` / `pm` / `leader`)이 모두 포함된다.

---

## 5. WebSocket — `init` 메시지

WebSocket 클라이언트가 서버에 연결되면 서버가 즉시 전송하는 초기화 메시지.
현재 전체 세션·에이전트 상태와 최근 활동 로그(최대 50건)를 한 번에 내려준다.

### 수신 시점

`ws://localhost:3300` 연결 직후 서버 → 클라이언트 방향으로 1회 전송.

### 메시지 JSON 구조

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | `string` | 항상 `"init"` |
| `agents` | `object` | **하위호환 뷰**. `default` 세션의 역할→상태 맵 (= `GET /api/status`의 `agentStates`와 동일 구조·참조) |
| `sessions` | `object` | **세션별 상태 맵** (P2-C). 키 = `sessionId`, 값 = 역할→상태 맵. 구조는 [`GET /api/status`](#4-get-apistatus)의 `sessions`와 동일 |
| `activity` | `array` | 최근 활동 로그 배열 (최대 50건). 오래된 순 정렬 |

> **클라이언트 권장 동작**: 멀티세션을 표시하려면 `agents`가 아닌 `sessions`를 기준으로 렌더링한다. `agents`는 단일(default) 세션만 보는 기존 클라이언트와의 호환을 위해 함께 내려준다.

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
| `sessionId` | `string` | 활동이 발생한 세션 ID (`default` 세션이면 `"default"`) |

### 메시지 예시

```json
{
  "type": "init",
  "agents": {
    "developer": {
      "role": "Developer",
      "roleName": "developer",
      "status": "working",
      "action": "reading",
      "detail": "📖 server.js",
      "tool": "Read",
      "params": { "file": "server.js" },
      "event": "PreToolUse",
      "sessionId": "default",
      "result": "",
      "lastUpdate": 1750123456789
    },
    "devops": {
      "role": "DevOps",
      "roleName": "devops",
      "status": "idle",
      "action": "",
      "detail": "",
      "tool": "",
      "sessionId": "default",
      "lastUpdate": 1750123450000
    }
  },
  "sessions": {
    "default": {
      "developer": {
        "role": "Developer",
        "roleName": "developer",
        "status": "working",
        "action": "reading",
        "detail": "📖 server.js",
        "tool": "Read",
        "params": { "file": "server.js" },
        "event": "PreToolUse",
        "sessionId": "default",
        "result": "",
        "lastUpdate": 1750123456789
      }
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
      "result": "",
      "sessionId": "default"
    },
    {
      "ts": 1750123456789,
      "agent": "developer",
      "role": "Developer",
      "tool": "Edit",
      "event": "PostToolUse",
      "detail": "🛠 server.js 수정",
      "params": { "file": "server.js" },
      "result": "파일 저장 완료…",
      "sessionId": "default"
    }
  ]
}
```

> `agents`와 `sessions.default`는 동일 데이터를 가리킨다. 멀티세션이 진행 중이면 `sessions`에 `sessionId`별 추가 키가 함께 내려온다.

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
| `sessionId` | `string` | Y | 갱신이 발생한 세션 ID (`default` 세션이면 `"default"`). 클라이언트는 이 값으로 어느 세션의 상태를 갱신할지 결정한다 (P2-C) |
| `state` | `object` | Y | 해당 에이전트의 현재 상태 전체. 구조는 [`GET /api/status`](#4-get-apistatus)의 에이전트 상태 객체와 동일 |
| `activity` | `object` | N | tool-use 이벤트일 때만 포함. 활동 로그 단건 (activity 배열 요소와 동일 구조, `sessionId` 포함). tool-done(idle 전환) 시에는 포함되지 않음 |

> **멀티세션 갱신 처리**: 클라이언트는 `sessionId` + `agent`를 키로 `sessions[sessionId][agent]` 위치의 상태를 `state`로 교체한다. 처음 보는 `sessionId`라면 클라이언트는 새 세션 슬롯을 만들어야 한다 (서버는 해당 세션을 자동 생성한 상태다).

### 메시지 예시 — 도구 사용 (activity 포함)

```json
{
  "type": "agent-update",
  "agent": "developer",
  "sessionId": "sess-abc123",
  "state": {
    "role": "Developer",
    "roleName": "developer",
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
    "result": "",
    "sessionId": "sess-abc123"
  }
}
```

### 메시지 예시 — idle 전환 (activity 없음)

```json
{
  "type": "agent-update",
  "agent": "developer",
  "sessionId": "sess-abc123",
  "state": {
    "role": "Developer",
    "roleName": "developer",
    "status": "idle",
    "action": "idle",
    "detail": "대기 중",
    "sessionId": "sess-abc123",
    "lastUpdate": 1750123600000
  }
}
```

> **`tool-done` + `allRoles`의 멀티세션 동작**: `/hook/tool-done`에 `allRoles: true`가 오면 서버는 **모든 세션**의 해당 역할을 idle로 전환하며, 세션마다 별도의 `agent-update` 메시지를 (각자의 `sessionId`로) 브로드캐스트한다.

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
