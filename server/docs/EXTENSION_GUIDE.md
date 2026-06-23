# Agent Monitor — 확장 가이드

> **대상**: 신규 역할·뷰·Hook 이벤트를 추가하려는 주니어/시니어 개발자
> **기준 코드 버전**: Phase 4 (WJ_MONITORING-P4-C)
> **관련 파일**: `server/shared/roles.js`, `server/server.js`, `hooks/agent-monitor-hook.js`, `three3d/`

---

## 목차

1. [신규 역할 추가](#1-신규-역할-추가)
2. [신규 시각화 뷰 추가](#2-신규-시각화-뷰-추가)
3. [Hook 이벤트 종류 확장](#3-hook-이벤트-종류-확장)

---

## 1. 신규 역할 추가

### 개요

역할(role)은 `server/shared/roles.js` 한 곳에서만 정의한다. 이 파일이 SSoT(Single Source of Truth)이므로 여기만 수정하면 서버·3D 클라이언트가 모두 자동으로 반영된다.

### 수정 포인트: `server/shared/roles.js`

```js
const ROLES = [
  { id: 'developer', name: 'developer', label: 'Developer', color: '#4A90D9', emoji: '💻' },
  { id: 'devops',    name: 'devops',    label: 'DevOps',    color: '#E67E22', emoji: '⚙️' },
  { id: 'qa',        name: 'qa',        label: 'QA',        color: '#27AE60', emoji: '🔍' },
  { id: 'pm',        name: 'pm',        label: 'PM',        color: '#8E44AD', emoji: '📋' },
  { id: 'leader',    name: 'leader',    label: 'Leader',    color: '#E74C3C', emoji: '🎯' },
  // 아래에 신규 역할 추가
  { id: 'designer',  name: 'designer',  label: 'Designer',  color: '#1ABC9C', emoji: '🎨' },
];
```

각 필드 의미:

| 필드 | 설명 | 예시 |
|------|------|------|
| `id` | 내부 식별자 (소문자 snake_case). Hook의 `role` 값과 일치해야 한다. | `'designer'` |
| `name` | `id`와 동일하게 설정한다 (하위호환 별칭). | `'designer'` |
| `label` | UI에 표시되는 이름 | `'Designer'` |
| `color` | 카드·파티클 색상 (hex CSS) | `'#1ABC9C'` |
| `emoji` | UI 아이콘 | `'🎨'` |

### 자동 반영 흐름

`server/shared/roles.js` 수정 후 서버를 재기동하면 아래 경로가 자동으로 반영된다.

```
roles.js (SSoT)
  ├─ server.js — ROLES import → agentStates 초기화 (신규 역할 키 자동 추가)
  │                           → GET /api/roles 응답에 신규 역할 포함
  └─ three3d/js/scene.js      — fetch('/api/roles') 호출 → 3D 큐브 동적 생성
```

`server.js`, `scene.js`는 시작 시 `/api/roles`를 동적으로 호출하기 때문에 별도 수정 없이 역할이 추가된다.

### 체크리스트

- [ ] `server/shared/roles.js`에 역할 객체 추가
- [ ] 서버 재기동 (`npm start` 또는 `docker compose restart server`)
- [ ] `GET /api/roles` 응답에서 신규 역할 확인
- [ ] 3D(`/3d`) 화면에서 신규 역할 카드가 표시되는지 확인
- [ ] `hooks/agent-monitor-hook.js`의 `CLAUDE_ROLE` 환경변수를 신규 역할 `id`로 설정하여 Hook 전송 테스트

---

## 2. 신규 시각화 뷰 추가

### 개요

현재 3D 뷰(`/3d`, Three.js)가 제공된다. 신규 뷰(예: 테이블 뷰, 타임라인 뷰)를 추가하려면 정적 디렉토리를 생성하고 Express 라우트를 등록한다.

### 디렉토리 구조

```
agentmonitoring/
  three3d/           ← 기존 3D 뷰
  tabview/           ← 신규 뷰 (예시 이름)
    index.html       ← 진입점 HTML
    js/
      app.js         ← WebSocket 연결 + 렌더링 로직
    assets/          ← (선택) 이미지·폰트 등 정적 자산
```

### 수정 포인트: `server/server.js`

`app.use` 라우트를 추가한다.

```js
// 기존 라우트
app.use('/3d', express.static(path.join(__dirname, '..', 'three3d')));

// 신규 뷰 라우트 추가
app.use('/table', express.static(path.join(__dirname, '..', 'tabview')));
```

### 신규 뷰의 WebSocket 연결 패턴

신규 뷰의 `js/app.js`에서 아래 패턴을 기준으로 작성한다.

```js
// 1. WebSocket 연결
const ws = new WebSocket(`ws://${location.host}`);

// 2. 초기 상태 수신 (init)
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'init') {
    // msg.agents: 전체 에이전트 상태 맵
    // msg.activity: 최근 활동 로그 배열 (최대 50건)
    renderAll(msg.agents, msg.activity);
  }

  if (msg.type === 'agent-update') {
    // msg.agent: 역할 키
    // msg.state: 해당 에이전트의 현재 상태
    // msg.activity: 활동 로그 단건 (tool-done 이벤트는 없음)
    updateAgent(msg.agent, msg.state);
    if (msg.activity) appendActivity(msg.activity);
  }
};

// 3. 역할 목록 동적 로드 (SSoT)
const rolesRes = await fetch('/api/roles');
const roles = await rolesRes.json();
// roles 배열로 UI 초기화
```

### Docker에 신규 뷰 포함

`Dockerfile`에 신규 디렉토리 복사 구문을 추가한다.

```dockerfile
COPY tabview/ ./tabview/
```

뷰에 별도 npm 패키지가 필요한 경우 해당 디렉토리에 `package.json`을 생성하고 Dockerfile에 의존성 설치 구문도 추가한다.

### 체크리스트

- [ ] 신규 디렉토리 생성 및 `index.html` 작성
- [ ] `server/server.js`에 `app.use` 라우트 추가
- [ ] 서버 재기동 후 `http://localhost:3300/<경로>` 접근 확인
- [ ] WebSocket `init` 메시지 수신 및 화면 렌더링 확인
- [ ] (Docker 사용 시) `Dockerfile`에 `COPY` 구문 추가

---

## 3. Hook 이벤트 종류 확장

### 개요

Hook 이벤트는 `hooks/agent-monitor-hook.js`에서 처리한다. Claude Code가 특정 시점(도구 사용 전후, 세션 시작, 프롬프트 제출 등)에 이 스크립트를 stdin으로 JSON 페이로드를 전달하여 실행한다. 새로운 이벤트 타입을 처리하려면 `main()` 함수의 분기문을 확장한다.

### 현재 처리 이벤트 목록

| 이벤트명 | 처리 엔드포인트 | 설명 |
|---------|--------------|------|
| `PreToolUse` | `POST /hook/tool-use` | 도구 실행 직전 |
| `PostToolUse` | `POST /hook/tool-use` | 도구 실행 직후 (결과 포함) |
| `Stop` | `POST /hook/tool-done` | Claude Code 세션 종료 |
| `SessionEnd` | `POST /hook/tool-done` | 세션 만료 |
| `SubagentStop` | `POST /hook/tool-done` | 서브에이전트 종료 |
| `SessionStart` | `POST /hook/tool-use` | 세션 시작 |
| `UserPromptSubmit` | `POST /hook/tool-use` | 사용자 프롬프트 제출 |

### 수정 포인트: `hooks/agent-monitor-hook.js`

`main()` 함수 내부에서 `event` 값으로 분기한다. 새 이벤트를 추가하려면 기존 분기 아래에 `if` 블록을 추가한다.

```js
async function main() {
  // ... stdin 파싱 ...

  const event = evt.hook_event_name || process.env.CLAUDE_HOOK_EVENT || "Unknown";
  const tool  = evt.tool_name || process.argv[2] || "";

  // 기존 분기 (PreToolUse / PostToolUse)
  if (event === "PreToolUse" || event === "PostToolUse") {
    // ... 기존 처리 ...
    return;
  }

  // 기존 분기 (Stop / SessionEnd / SubagentStop)
  if (event === "Stop" || event === "SessionEnd" || event === "SubagentStop") {
    await post("/hook/tool-done", { role: ROLE, allRoles: true });
    return;
  }

  // 신규 이벤트 추가 예시: NotificationReceived
  if (event === "NotificationReceived") {
    const message = trim(evt.message || "", 60);
    await post("/hook/tool-use", {
      tool: event,
      role: ROLE,
      status: "working",
      detail: message ? `🔔 ${message}` : "알림 수신",
      event,
      sessionId: evt.session_id || "",
    });
    return;
  }
}
```

### `extractDetails` 함수 — 신규 도구 파라미터 추출

새로운 도구 타입이 추가된 경우 `extractDetails()` 함수의 `switch` 문에 케이스를 추가한다.

```js
function extractDetails(tool, input) {
  input = input || {};
  const params = {};
  let summary = "";

  switch (tool) {
    // ... 기존 케이스 ...

    // 신규 도구 케이스 추가
    case "NewTool": {
      params.key = trim(input.some_field, 40);
      summary = params.key ? `🔧 ${params.key}` : "NewTool 사용 중";
      break;
    }
  }
  return { summary, params };
}
```

### `server/server.js` — `toolToAction` 매핑 확장

신규 도구가 시각화에서 특정 `action` 유형으로 표시되어야 한다면 `server.js`의 `toolToAction()` 함수에도 항목을 추가한다.

```js
function toolToAction(toolName) {
  const map = {
    // ... 기존 매핑 ...
    'NewTool': { action: 'processing', label: '처리 중' },
  };
  return map[toolName] || { action: 'working', label: toolName };
}
```

### `settings.json` — 신규 이벤트 Hook 등록

Claude Code `settings.json`에 새로운 이벤트 타입을 등록한다.

```json
{
  "hooks": {
    "PreToolUse":       [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "PostToolUse":      [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "Stop":             [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "SessionStart":     [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "UserPromptSubmit": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }]
  }
}
```

새 이벤트 타입(`NotificationReceived` 등)을 추가하려면 위 `hooks` 객체에 해당 키를 추가한다.

### 체크리스트

- [ ] `hooks/agent-monitor-hook.js`의 `main()` 함수에 신규 이벤트 분기 추가
- [ ] (신규 도구인 경우) `extractDetails()` 함수에 케이스 추가
- [ ] (action 매핑 필요 시) `server/server.js`의 `toolToAction()` 함수에 항목 추가
- [ ] `settings.json`에 신규 이벤트 Hook 등록
- [ ] 테스트: 해당 이벤트 발생 시 `/hook/tool-use` 또는 `/hook/tool-done`이 호출되는지 확인
- [ ] 시각화 화면에서 신규 이벤트가 정상적으로 표시되는지 확인
