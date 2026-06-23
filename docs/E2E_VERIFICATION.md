# E2E 검증 체크리스트 — Agent Monitor Hook

> 대상: WJ_MONITORING-P2-B  
> 작성일: 2026-06-18  
> 목적: 실 Claude Code 세션에서 도구 이벤트 → 서버 → 3D 시각화까지 종단 간 동작을 검증한다.

---

## 1. 사전 준비

### 1-1. Node.js 설치 확인

```powershell
node --version   # v18 이상 권장
```

### 1-2. 서버 의존성 설치 (최초 1회)

```powershell
cd D:\private\agentmonitoring\server
npm install
```

---

## 2. 서버 기동 방법

### 방법 A — Node.js 직접 실행 (개발 권장)

```powershell
cd D:\private\agentmonitoring\server
node server.js
```

정상 기동 시 로그:

```
{"event":"server_start","port":3300}
```

### 방법 B — Docker Compose (Docker Desktop 필요)

```
# Docker Desktop이 기동 중인 터미널에서 사용자가 직접 실행
! docker compose -f D:\private\agentmonitoring\docker-compose.yml up -d
```

> 주의: Claude Code 에이전트는 Docker Named Pipe 접근 제한으로 docker 명령을 직접 실행할 수 없다.
> 터미널에서 `!` prefix 또는 별도 쉘에서 실행해야 한다.

---

## 3. 브라우저 접속 확인

서버 기동 후 브라우저에서 아래 URL을 열어 초기 로드를 확인한다.

| URL | 설명 | 확인 항목 |
|-----|------|-----------|
| `http://localhost:3300/3d` | Three.js 3D 시각화 | 3D 구체 5개 표시, 모두 idle 색상(회색) |
| `http://localhost:3300/api/status` | 상태 JSON | `{"developer":{"status":"idle",...},...}` |

### 스크린샷 포인트 A — 초기 idle 상태

브라우저에서 `/3d` 열었을 때 모든 구체가 idle 색상(회색)인 화면을 캡처한다.

---

## 4. 자동 검증 — test-hook.js

서버가 기동 중인 상태에서 실행한다. 시나리오 4개(Read/Edit/Bash/Stop)를 POST하고
`/api/status` 응답이 올바르게 갱신됐는지 자동 확인한다.

```powershell
cd D:\private\agentmonitoring
node tools/test-hook.js
```

#### 정상 출력 예시

```
=== Hook E2E 시뮬레이션 스크립트 === (http://127.0.0.1:3300)

[0] 서버 연결 확인
  ▶ GET /api/status 응답 확인 ... PASS

[1] Read 도구 — developer 역할
  ▶ POST /hook/tool-use (Read) ... PASS
  ▶ /api/status — developer=working 확인 ... PASS

[2] Edit 도구 — developer 역할
  ▶ POST /hook/tool-use (Edit) ... PASS
  ▶ /api/status — developer action=coding 확인 ... PASS

[3] Bash 도구 — devops 역할
  ▶ POST /hook/tool-use (Bash) ... PASS
  ▶ /api/status — devops=working 확인 ... PASS

[4] Stop 이벤트 — 모든 역할 idle 전환
  ▶ POST /hook/tool-done (allRoles=true) ... PASS
  ▶ /api/status — 모든 역할 idle 확인 ... PASS

=== 시뮬레이션 완료 ===
```

#### 스크린샷 포인트 B — test-hook.js 실행 중 브라우저 변화

`test-hook.js` 실행 중 브라우저 `/3d` 화면을 관찰한다.

- Read 전송 직후: developer 구체가 active 색상(파란색)으로 전환
- Edit 전송 직후: developer 구체가 coding 액션 색상으로 전환
- Bash 전송 직후: devops 구체가 building 액션 색상으로 전환
- Stop 전송 직후: 모든 구체가 idle 색상(회색)으로 복귀

---

## 5. 무해화 검증 — test-hook-offline.js

서버를 **종료한 상태**에서 실행한다. hook이 오류 없이 1.5초 이내에 exit 0으로 종료되는지
자동 검증한다. Claude Code 세션이 hook 오류로 차단되지 않음을 확인한다.

```powershell
cd D:\private\agentmonitoring
node tools/test-hook-offline.js
```

#### 정상 출력 예시

```
=== 무해화 회귀 테스트 (서버 미기동 검증) ===

  Hook 스크립트: D:\private\agentmonitoring\hooks\agent-monitor-hook.js

[1] PreToolUse — Read 도구
  ▶ 서버 미기동 상태에서 exit 0, 1.5초 이내 종료 ... PASS (1521ms)

[2] PostToolUse — Edit 도구
  ▶ 서버 미기동 상태에서 exit 0, 1.5초 이내 종료 ... PASS (1518ms)

[3] PostToolUse — Bash 도구
  ▶ 서버 미기동 상태에서 exit 0, 1.5초 이내 종료 ... PASS (1520ms)

[4] Stop 이벤트
  ▶ 서버 미기동 상태에서 exit 0, 1.5초 이내 종료 ... PASS (1519ms)

[5] 빈 stdin — JSON 파싱 오류 내성
  ▶ 빈 입력에서도 exit 0으로 종료 ... PASS (1517ms)

=== 결과 요약 ===
  통과: 5  실패: 0

  PASS — 모든 케이스 통과. 서버 미기동 시 세션이 차단되지 않습니다.
```

> `test-hook-offline.js`는 서버가 기동 중이어도 내부적으로 없는 포트(3399)를 사용하므로
> 서버 기동 여부와 무관하게 언제든 실행 가능하다.

---

## 6. 실 세션 E2E 검증 절차

> 이 절차는 사용자가 직접 수행한다. Claude Code 에이전트는 자기 자신의 hook 발화를
> 브라우저에서 확인하는 역할을 담당할 수 없다.

### 6-1. 사전 조건

- [ ] 서버가 포트 3300에 기동 중 (`node server.js` 또는 docker compose)
- [ ] 브라우저 탭 열기: `/3d`
- [ ] `.claude/settings.json`에 PreToolUse/PostToolUse/Stop hook 등록 확인

#### settings.json hook 등록 확인 위치

```
D:\private\agentmonitoring\.claude\settings.json
```

등록 형식:

```json
{
  "hooks": {
    "PreToolUse":  [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }],
    "Stop":        [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }]
  }
}
```

### 6-2. Read 도구 사용 → working 전환 확인

1. Claude Code 세션에서 임의 파일 Read 실행
2. 브라우저 `/3d` 확인: developer 구체가 active 색상(파란색)으로 변경됨
3. 브라우저 activity feed 확인: 최근 이벤트 카드에 "📖 [파일명]" 항목 표시

#### 스크린샷 포인트 C — Read 직후 3D 상태

### 6-3. Stop 이벤트 → 전체 idle 전환 확인

1. Claude Code 세션이 작업을 완료하거나 수동 종료
2. 브라우저 `/3d` 확인: 모든 구체가 idle 색상(회색)으로 복귀

#### 스크린샷 포인트 D — Stop 후 전체 idle

### 6-4. 서버 미기동 시 세션 차단 없음 확인

1. 서버를 종료한다
2. Claude Code 세션에서 임의 도구(Read 등) 사용
3. Claude Code가 정상 응답하는지 확인 (hook 오류로 세션이 멈추지 않음)

---

## 7. 체크리스트 요약

### 자동 검증 (에이전트 실행)

- [ ] `node tools/test-hook-offline.js` — exit 0, 5개 케이스 모두 PASS
- [ ] `node tools/test-hook.js` — 서버 기동 상태에서 8개 시나리오 모두 PASS

### 수동 검증 (사용자 브라우저 확인)

- [ ] `/3d` 초기 로드 — 5개 구체 idle 상태 (스크린샷 A)
- [ ] Read 도구 사용 → developer working 전환 확인 (스크린샷 C)
- [ ] activity feed 카드 — 최근 이벤트 실시간 표시 확인
- [ ] Stop 이벤트 → 모든 역할 idle 전환 확인 (스크린샷 D)
- [ ] 서버 미기동 → 세션 차단 없음 확인

---

## 8. 트러블슈팅

| 증상 | 원인 | 조치 |
|------|------|------|
| `test-hook.js` — "서버가 응답하지 않습니다" | 서버 미기동 | `cd server && node server.js` 실행 |
| `test-hook-offline.js` — 타임아웃 FAIL | hook 스크립트 경로 오류 | `HOOK_SCRIPT` 경로 확인 |
| 3D 구체 변화 없음 | WebSocket 연결 안됨 | 브라우저 개발자 도구 → Network → WS 탭 확인 |
| hook은 전송됐는데 시각화 미반영 | 역할 키 불일치 | `/api/status` 응답 확인, role 값 검증 |
| Stop hook 미발화 | settings.json 미등록 | `.claude/settings.json` hook 등록 재확인 |
