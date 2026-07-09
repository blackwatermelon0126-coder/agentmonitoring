# Agent Monitor — Hook 연동 설정 가이드

## 개요
Claude Code 세션의 도구 사용 이벤트를 실시간으로 모니터링 서버에 전송합니다.

## 전제 조건
- 서버 기동: `cd server && npm start` (포트 3300)
- Node.js 설치 확인: `node --version`

## Hook 등록
이 워크스페이스의 `.claude/settings.json`에 이미 등록되어 있습니다.
다른 워크스페이스에서 사용하려면 `.claude/settings.example.json`을 복사하세요.

## 역할 설정
CLAUDE_ROLE 환경변수로 역할을 지정합니다:
- developer (기본값)
- devops
- qa
- pm
- leader

예시: Windows에서 역할 지정
1. 시스템 환경변수에 CLAUDE_ROLE=pm 추가
2. 또는 Claude Code 실행 전 터미널에서 `$env:CLAUDE_ROLE="pm"` 실행

## 이벤트 흐름
PreToolUse/PostToolUse/Stop → agent-monitor-hook.js → POST /hook/tool-use → 3D 시각화

## 서버 미기동 시
Hook 실행 시 서버가 꺼져 있으면 1.5초 후 자동으로 종료(Claude Code 세션 차단 없음).

---

## 🌐 팀 공유 서버로 전송 (각 PC → metaoffice.fllab.internal)

로컬(localhost)이 아니라 **배포된 모니터링 서버**로 보내서, 3D 화면에서 **본인 로그인 아바타 머리 위 🤖 AI 버튼**에 내 Claude Code 진행 현황이 뜨게 하려면 아래 2개 환경변수만 각 PC에 설정한다.

| 환경변수 | 값 | 의미 |
|:---------|:---|:-----|
| `AGENT_MONITOR_URL` | `https://metaoffice.fllab.internal` | 전송 대상(서버). HTTPS·nginx 443 경유. 내부 mkcert 인증서는 자동 허용. |
| `AGENT_MONITOR_USER` | `본인이메일@ctr.co.kr` | 세션 키 = 3D 로그인(MSAL) 이메일과 **동일**하게. 이 값으로 내 아바타에 매칭된다. |
| `CLAUDE_ROLE` | `developer` 등 | (선택) 역할. 기본 developer. |

### 전제
- 각 PC의 `hosts`에 `10.10.33.36  metaoffice.fllab.internal` 등록(도메인 해석용).
- `AGENT_MONITOR_USER` 는 반드시 **3D에서 로그인한 Azure 계정 이메일과 동일**해야 아바타에 매칭된다.

### Windows(PowerShell) 영구 설정 예시
```powershell
setx AGENT_MONITOR_URL  "https://metaoffice.fllab.internal"
setx AGENT_MONITOR_USER "hong@ctr.co.kr"
setx CLAUDE_ROLE        "developer"
# 새 터미널부터 적용 → Claude Code 재기동
```

### 동작
```
[내 PC] Claude Code 훅 → POST https://metaoffice.fllab.internal/hook/tool-use
        { role, sessionId=내이메일, tool, detail }
   ↓ nginx(443) → metaoffice-app(3300)
[서버] sessions[내이메일][role] 갱신 → WebSocket 브로드캐스트
   ↓
[3D 화면] 내 아바타 🤖 AI 버튼 초록 글로우 → 클릭 시 역할별 진행 현황 표시
```

- 미설정 시(기본값) 여전히 `http://127.0.0.1:3300` 로컬 전송(하위호환).
- 서버(HTTPS)로 못 붙어도 1.5초 후 조용히 종료 — 세션 차단 없음.
