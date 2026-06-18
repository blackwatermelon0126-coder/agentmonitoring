# Agent Monitor — HTTP/WS/Hook 스키마 계약

> **대상**: Hook 어댑터 작성자, 클라이언트 연동 개발자
> **기준 코드**: `server/server.js`, `hooks/agent-monitor-hook.js`, `server/shared/roles.js`
> **서버 포트**: `3300` (기본값, `AGENT_MONITOR_PORT` 환경변수로 재지정 가능)
> **최종 업데이트**: WJ_MONITORING-P1-C (2026-06-18)

---

## 목차

1. [HTTP 엔드포인트](#1-http-엔드포인트)
   - 1.1 [POST /hook/tool-use](#11-post-hooktool-use)
   - 1.2 [POST /hook/tool-done](#12-post-hooktool-done)
   - 1.3 [GET /api/status](#13-get-apistatus)
   - 1.4 [GET /api/roles](#14-get-apiroles)
   - 1.5 [POST /demo](#15-post-demo)
   - 1.6 [GET /2d, GET /3d](#16-get-2d--get-3d)
2. [WebSocket 메시지 계약](#2-websocket-메시지-계약)
   - 2.1 [init 메시지](#21-init-메시지)
   - 2.2 [agent-update 메시지](#22-agent-update-메시지)
3. [Hook 페이로드 스키마](#3-hook-페이로드-스키마)
   - 3.1 [Hook 어댑터 동작 흐름](#31-hook-어댑터-동작-흐름)
   - 3.2 [/hook/tool-use 전송 페이로드](#32-hooktool-use-전송-페이로드)
   - 3.3 [/hook/tool-done 전송 페이로드](#33-hooktool-done-전송-페이로드)
   - 3.4 [도구별 params 추출 규칙](#34-도구별-params-추출-규칙)

---

## 1. HTTP 엔드포인트

### 1.1 POST /hook/tool-use

Claude Code Hook(PreToolUse / PostToolUse / SessionStart / UserPromptSubmit)이 도구를 호출할 때 에이전트 상태를 갱신한다.

#### 요청 JSON

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `tool` | `string` | Y | Claude Code 도구명 (예: `"Read"`, `"Bash"`, `"Edit"`) |
| `role` | `string` | Y | 에이전트 역할 키 (소문자). `developer` / `devops` / `qa` / `pm` / `leader` 중 하나 |
| `status` | `string` | N | 현재 상태. 기본값 `"working"` |
| `detail` | `string` | N | 화면에 표시할 한 줄 요약 (미입력 시 tool → action 자동 매핑 레이블 사용) |
| `params` | `object` | N | 도구별 추가 파라미터 (예: `{ "file": "server.js" }`) |
| `event` | `string` | N | Hook 이벤트명 (`"PreToolUse"` / `"PostToolUse"` / `"SessionStart"` 등) |
| `sessionId` | `string` | N | Claude Code 세션 ID (`evt.session_id`) |
| `result` | `string` | N | PostToolUse 전용. 도구 실행 결과 한 줄 요약 (최대 60자) |

#### 응답 JSON

```json
{ "ok": true }
```

#### tool → action 자동 매핑 (detail 미입력 시 서버가 적용)

| tool | action | 화면 레이블 |
|------|--------|------------|
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

#### 요청 예시 — PreToolUse (Read)

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

#### 요청 예시 — PostToolUse (Bash)

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

---

### 1.2 POST /hook/tool-done

에이전트 세션 종료 또는 작업 완료 시 에이전트를 `idle` 상태로 전환한다.
Hook 이벤트 `Stop` / `SessionEnd` / `SubagentStop` 수신 시 호출된다.

#### 요청 JSON

| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `role` | `string` | N | 단일 에이전트 역할 키. `allRoles`가 `true`면 무시된다. |
| `allRoles` | `boolean` | N | `true`이면 전체 역할을 동시에 `idle`로 전환한다. |

> `allRoles: true`는 세션 전체 종료 시 사용. 특정 에이전트만 완료된 경우 `role`만 지정.

#### 응답 JSON

```json
{ "ok": true }
```

#### 요청 예시 — 단일 에이전트 완료

```json
{ "role": "developer" }
```

#### 요청 예시 — 전체 에이전트 idle 전환 (Stop 이벤트)

```json
{ "role": "developer", "allRoles": true }
```

---

### 1.3 GET /api/status

현재 모든 에이전트의 상태 스냅샷을 반환한다.

#### 응답 JSON

객체 형태. 키는 역할 이름(name), 값은 에이전트 상태 객체.

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

#### 응답 예시

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

### 1.4 GET /api/roles

5개 역할 배열을 반환한다. 클라이언트가 역할 목록을 동적으로 구성할 때 사용한다.
데이터 출처: `server/shared/roles.js` (SSoT). P1-A에서 확정된 5역할.

#### 응답 JSON

`{ "roles": [...] }` 형태의 객체. `roles` 배열 각 요소 필드:

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | `string` | 역할 코드 식별자 (소문자, snake_case). Hook의 `role` 필드 값과 일치 |
| `name` | `string` | 하위호환 별칭 (= `id`와 동일) |
| `label` | `string` | 화면 표시 이름 |
| `color` | `string` | UI 대표 색상 (hex, 예: `"#4A90D9"`) |
| `emoji` | `string` | UI 아이콘 이모지 |

#### 응답 예시

```json
{
  "roles": [
    { "id": "developer", "name": "developer", "label": "Developer", "color": "#4A90D9", "emoji": "💻" },
    { "id": "devops",    "name": "devops",    "label": "DevOps",    "color": "#E67E22", "emoji": "⚙️" },
    { "id": "qa",        "name": "qa",        "label": "QA",        "color": "#27AE60", "emoji": "🔍" },
    { "id": "pm",        "name": "pm",        "label": "PM",        "color": "#8E44AD", "emoji": "📋" },
    { "id": "leader",    "name": "leader",    "label": "Leader",    "color": "#E74C3C", "emoji": "🎯" }
  ]
}
```

---

### 1.5 POST /demo

테스트용 더미 이벤트를 발생시킨다. `developer` / `devops` / `qa` 중 무작위 역할과 `Read` / `Edit` / `Bash` / `Grep` / `Write` 중 무작위 도구를 선택하여 `agent-update`를 브로드캐스트한다. 3초 후 자동으로 해당 에이전트를 idle 상태로 전환한다.

요청 body는 없다.

#### 응답 JSON

```json
{ "ok": true, "role": "developer", "tool": "Read" }
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `ok` | `boolean` | 항상 `true` |
| `role` | `string` | 선택된 역할 키 |
| `tool` | `string` | 선택된 도구명 |

---

### 1.6 GET /2d / GET /3d

정적 파일 서빙. 클라이언트 시각화 애플리케이션을 내려준다.

| 경로 | 서빙 디렉토리 | 설명 |
|------|-------------|------|
| `GET /2d/*` | `phaser2d/` | Phaser 기반 2D 시각화 클라이언트 |
| `GET /3d/*` | `three3d/` | Three.js 기반 3D 시각화 클라이언트 |
| `GET /3d/libs/three/*` | `three3d/node_modules/three/` | Three.js 라이브러리 정적 제공 |

응답: HTTP 200 + 정적 파일 (HTML / JS / CSS 등). API 응답 없음.

---

## 2. WebSocket 메시지 계약

**연결 주소**: `ws://localhost:3300` (기본 포트 3300)

서버 → 클라이언트 방향의 단방향 메시지. 클라이언트 → 서버 메시지는 현재 정의되지 않는다.

### 2.1 init 메시지

WebSocket 클라이언트가 서버에 연결되면 서버가 즉시 전송하는 초기화 메시지.
현재 전체 에이전트 상태와 최근 활동 로그(최대 50건)를 한 번에 내려준다.

#### 수신 시점

`ws://localhost:3300` 연결 직후 서버 → 클라이언트 방향으로 **1회** 전송.

#### 메시지 JSON 구조

| 필드 | 타입 | 설명 |
|------|------|------|
| `type` | `string` | 항상 `"init"` |
| `agents` | `object` | 전체 에이전트 상태 맵 (키 = 역할 이름). 구조는 `GET /api/status` 응답과 동일 |
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

#### 메시지 예시

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
    }
  ]
}
```

---

### 2.2 agent-update 메시지

에이전트 상태가 변경될 때마다 연결된 **모든 클라이언트에게 브로드캐스트**하는 실시간 이벤트.

#### 발생 조건

- `POST /hook/tool-use` 수신 시 (도구 사용 시작/완료)
- `POST /hook/tool-done` 수신 시 (에이전트 idle 전환)

#### 메시지 JSON 구조

| 필드 | 타입 | 항상 포함 | 설명 |
|------|------|:--------:|------|
| `type` | `string` | Y | 항상 `"agent-update"` |
| `agent` | `string` | Y | 갱신된 에이전트의 역할 키 (예: `"developer"`) |
| `state` | `object` | Y | 해당 에이전트의 현재 상태 전체. 구조는 `GET /api/status` 단일 항목과 동일 |
| `activity` | `object` | N | tool-use 이벤트일 때만 포함. 활동 로그 단건 (init.activity 배열 요소 구조와 동일). tool-done(idle 전환) 시 미포함 |

#### 메시지 예시 — 도구 사용 (activity 포함)

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

#### 메시지 예시 — idle 전환 (activity 없음)

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

## 3. Hook 페이로드 스키마

Claude Code → `hooks/agent-monitor-hook.js` → 서버로 이어지는 전송 흐름을 정의한다.

### 3.1 Hook 어댑터 동작 흐름

```
Claude Code
  ├─ PreToolUse   →  hook.js stdin: { hook_event_name, tool_name, tool_input, session_id }
  ├─ PostToolUse  →  hook.js stdin: { hook_event_name, tool_name, tool_input, tool_response, session_id }
  ├─ Stop         →  hook.js stdin: { hook_event_name, session_id }
  ├─ SessionEnd   →  hook.js stdin: { hook_event_name, session_id }
  ├─ SubagentStop →  hook.js stdin: { hook_event_name, session_id }
  ├─ SessionStart →  hook.js stdin: { hook_event_name, session_id }
  └─ UserPromptSubmit → hook.js stdin: { hook_event_name, prompt, session_id }

hook.js
  ├─ PreToolUse / PostToolUse  → POST /hook/tool-use  (에이전트 상태 갱신)
  ├─ Stop / SessionEnd / SubagentStop → POST /hook/tool-done (전체 idle 전환)
  ├─ SessionStart              → POST /hook/tool-use  (세션 시작 이벤트)
  └─ UserPromptSubmit          → POST /hook/tool-use  (프롬프트 처리 중)
```

**역할 결정 우선순위**: 환경변수 `CLAUDE_ROLE`이 설정되어 있으면 무조건 해당 값 사용. 없으면 도구명으로 추론 (`Bash`→`devops`, `Grep`/`Glob`→`qa`, `TodoWrite`/`TaskCreate`/`TaskUpdate`/`TaskList`→`pm`, `Agent`→`leader`, 그 외→`developer`).

**환경변수**:

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `CLAUDE_ROLE` | `developer` | 이 세션의 에이전트 역할 키 |
| `AGENT_MONITOR_HOST` | `127.0.0.1` | 서버 호스트 |
| `AGENT_MONITOR_PORT` | `3300` | 서버 포트 |

---

### 3.2 /hook/tool-use 전송 페이로드

#### PreToolUse / PostToolUse 공통 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `tool` | `string` | `evt.tool_name` (Claude Code 도구명) |
| `role` | `string` | `inferRole(tool)` 결과 (환경변수 또는 도구명 추론) |
| `status` | `string` | 항상 `"working"` |
| `detail` | `string` | `extractDetails()` 함수가 생성한 한 줄 요약 (최대 60~80자, 이모지 포함) |
| `params` | `object` | `extractDetails()` 함수가 추출한 도구별 핵심 파라미터 |
| `event` | `string` | `"PreToolUse"` 또는 `"PostToolUse"` |
| `sessionId` | `string` | `evt.session_id` |

#### PostToolUse 추가 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `result` | `string` | `evt.tool_response.output` 또는 `evt.tool_response.content`에서 추출한 결과 요약 (최대 60자) |

#### SessionStart 페이로드

| 필드 | 값 | 설명 |
|------|-----|------|
| `tool` | `"SessionStart"` | 이벤트명 그대로 tool 필드에 입력 |
| `role` | `CLAUDE_ROLE` 환경변수 값 | |
| `status` | `"working"` | |
| `detail` | `"🟢 세션 시작"` | 고정 문자열 |
| `event` | `"SessionStart"` | |
| `sessionId` | `evt.session_id` | |

#### UserPromptSubmit 페이로드

| 필드 | 값 | 설명 |
|------|-----|------|
| `tool` | `"UserPromptSubmit"` | 이벤트명 그대로 tool 필드에 입력 |
| `role` | `CLAUDE_ROLE` 환경변수 값 | |
| `status` | `"working"` | |
| `detail` | `"💬 {프롬프트 앞 60자}"` 또는 `"프롬프트 처리 중"` | |
| `params` | `{ "prompt": "..." }` | 프롬프트 앞 60자 |
| `event` | `"UserPromptSubmit"` | |
| `sessionId` | `evt.session_id` | |

---

### 3.3 /hook/tool-done 전송 페이로드

Stop / SessionEnd / SubagentStop 이벤트 수신 시 전송.

| 필드 | 값 | 설명 |
|------|-----|------|
| `role` | `CLAUDE_ROLE` 환경변수 값 | |
| `allRoles` | `true` | 세션 종료이므로 전체 역할 idle 전환 |

---

### 3.4 도구별 params 추출 규칙

`extractDetails(tool, input)` 함수가 적용하는 도구별 파라미터 추출 규칙:

| tool | params 필드 | detail 예시 |
|------|------------|-------------|
| `Read` | `{ file: basename(file_path) }` | `"📖 server.js"` |
| `Write` | `{ file: basename(file_path) }` | `"✏️ output.js 작성"` |
| `Edit` | `{ file: basename(file_path) }` | `"🛠 server.js 수정"` |
| `Bash` | `{ command: trim(command, 80), description: trim(description, 60) }` | `"⚡ docker compose up"` |
| `Grep` | `{ pattern: trim(pattern, 40), path: path }` | `"🔍 grep \"agentStates\""` |
| `Glob` | `{ pattern: trim(pattern, 40) }` | `"📂 **/*.js"` |
| `WebFetch` | `{ url: trim(url, 60) }` | `"🌐 https://..."` |
| `WebSearch` | `{ query: trim(query, 50) }` | `"🔎 \"검색어\""` |
| `TodoWrite` / `TaskCreate` / `TaskUpdate` / `TaskList` | `{}` | `"📋 TaskCreate"` |
| `Agent` | `{ subagent: subagent_type, description: trim(description, 50) }` | `"🤖 claude-3-7-sonnet 에이전트"` |
| (그 외) | `{}` | `"{tool명} 사용 중"` |

> `trim(s, n)`: 문자열을 공백 정규화 후 n자 초과 시 마지막에 `…` 붙여 절삭.
> `basename(p)`: 경로에서 파일명(확장자 포함)만 추출.

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

역할별 `CLAUDE_ROLE` 값:

| 역할 | `CLAUDE_ROLE` 값 |
|------|:---------------:|
| 개발자 | `developer` |
| DevOps | `devops` |
| QA | `qa` |
| PM | `pm` |
| 리더 | `leader` |
