# METAOFFICE 배포·기능 세션 핸드오프 (2026-07-09)

> 3D 가상 오피스(agentmonitoring)를 서버 `10.10.33.36`에 Docker로 배포하고,
> 로그인·카메라·점프·PC별 에이전트 모니터링 기능을 추가한 세션 기록.

## 1. 배포 아키텍처 (현재 운영 중)

```
브라우저 → https://metaoffice.fllab.internal (nginx 443, mkcert 와일드카드 *.fllab.internal)
        → docker: metaoffice-app:3300 (expose only, 호스트 미바인딩)
        → docker-infra_infra-net (기존 nginx 컨테이너와 동일 네트워크)
```

| 항목 | 값 |
|:---|:---|
| 서버 | `10.10.33.36` (SSH: `localadm_dmzdev`) |
| 도메인 | `metaoffice.fllab.internal` (내부, 각 PC `hosts`에 `10.10.33.36` 등록 필요) |
| 앱 컨테이너 | `metaoffice-app` (`docker-compose.prod.yml`, `ALLOW_REMOTE_HOOKS=true`) |
| nginx 설정 | 호스트 `~/docker-infra/nginx/conf.d/site-metaoffice.conf` + `_security-headers-metaoffice.inc`(CSP 확장) |
| 레포 위치(서버) | `~/agentmonitoring` (수동 clone) |

### 배포 방법 (현재 = 수동)
```bash
ssh localadm_dmzdev@10.10.33.36
cd ~/agentmonitoring
git fetch origin master && git reset --hard origin/master
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## 2. CI/CD (self-hosted runner)

- GitHub Actions runner **2개**가 서버에 설치됨:
  - `mom-runner` → 레포 `blackwatermelon0126-coder/fllabs` (기존, 건드리지 않음)
  - `metaoffice-mo-runner` → 레포 `blackwatermelon0126-coder/agentmonitoring`, 라벨 `metaoffice-prod`, `~/actions-runner-mo` (이번에 추가)
- `.github/workflows/ci.yml`의 `deploy` job이 `runs-on: [self-hosted, metaoffice-prod]`.

### ⚠ 미해결: push 자동배포가 실제로 안 돎
- `test` job(ubuntu, 174 통과)·runner 온라인 확인됨에도 `deploy` job이 컨테이너를 갱신하지 못함.
- 서버 레포(`~/agentmonitoring`)가 한동안 옛 커밋에 정체돼 있었고, runner의 `_work` 체크아웃 흔적이 없었음 → **deploy job이 실제로 실행되지 않았거나 실패**로 추정.
- 현재는 **수동 배포로 운영 중**. 다음 세션에서 deploy job 실행 로그(Actions 탭/`~/actions-runner-mo/_diag`)를 확인해 원인 규명 필요.

## 3. 이번 세션 구현 (커밋 순)

| 커밋 | 내용 |
|:---|:---|
| Docker 배포·Dockerfile·compose·nginx conf | 초기 배포 |
| `fix(auth)` MSAL 오버레이 선표시 | 로그인 hang 대비 |
| **파란화면 근본 원인** | 배포된 `scene.js`에 git 충돌 마커 6줄 → SyntaxError. `7063789`에서 해소됨 |
| `fix(three3d)` 상대경로 | 하드코딩 `http://host:3300`·`ws://` → 같은 origin 상대경로(CSP·HTTPS 대응) |
| CSP 확장 | `_security-headers-metaoffice.inc`에 `graph.microsoft.com`·`wss`·`blob:` 추가 |
| favicon 인라인 | `/favicon.ico` 404 제거 |
| `feat(auth)` 로그인 배지 | 좌상단 `👤 이름 · 로그아웃`(재로그인) |
| VIEW 3종 | 타워/접근/1인칭 + 상단 버튼 + V키 순환 |
| SPACE 점프 | 중력·가구 위 착지(`jumpTargets` = envGroup 정적 메시 스냅샷) |
| Ctrl+G | 게임 트리거를 단독 G → Ctrl+G로 |
| 입력 가드 | 채팅/검색 입력 중 게임 단축키·이동키 무시 |
| **AI/사용자 버튼** | 아바타 머리 위 `🤖 AI`(에이전트 현황)·`👤 정보`(Azure 조직정보 `/api/org-users`) |
| 연결 설정 모달 | 브라우저는 env 직접 못 씀 → `setx` 명령 복사 / `.bat` 다운로드 |
| .bat 설치 안내창 | 다운로드 후 대형 매뉴얼(용도·설치 6단계) |
| AI 버튼 상태 지속 | 새로고침 시 `/api/status` 복원 + 4초 여운 + 3색(회색 미연결/청록 연결/초록 작업중) |
| 아바타 클릭 모달 | 아바타(머리) 클릭 시 **AI 진행 중이면** 에이전트 활동 모달 자동 오픈(idle이면 기존 선택/드래그) |

## 4. PC별 에이전트 모니터링 (핵심 신규 아키텍처)

- 서버는 `sessions[sessionId][role]`로 **사용자별 격리** 관리(이미 지원). `ALLOW_REMOTE_HOOKS=true`.
- 훅(`hooks/agent-monitor-hook.js`) 개선: `AGENT_MONITOR_URL`(HTTPS 서버)·`AGENT_MONITOR_USER`(이메일=세션키) 지원.
  → 각 PC가 서버로 전송, **sessionId=이메일**이 3D 로그인 아바타와 매칭되어 그 아바타 🤖 AI 버튼에 실시간 표시.
- 서버 `tool-done`: `sessionId` 있으면 그 세션만 idle(멀티유저 격리), 없을 때만 전 세션(레거시).
- 각 PC 설정: `hooks/HOOK_SETUP.md` §"팀 공유 서버로 전송" 참조. `setx` 3개 후 **Claude Code 완전 재시작**(새 터미널) 필수.

### ✅ 검증됨 / ⚠ 주의
- 훅→서버 경로 **정상 검증 완료**(수동 실행 시 서버에 `102450@ctr.co.kr` 세션 working 도달).
- 흔한 함정: `setx`는 **새 터미널부터** 적용. 기존 세션은 env 미반영 → 반드시 터미널/IDE 완전 재시작.
- 이메일 대소문자는 훅·서버·씬 모두 소문자 정규화로 매칭됨.

## 5. 미완/다음 작업

1. **CI 자동배포 복구** — deploy job이 실제 배포하도록 (2번 참조). 복구 전까지 수동 배포.
2. **펫(고양이·강아지) 인터랙션** — 요청됨, 미구현. 기존 시스템 존재:
   - `scene.js` ~2647 "강아지·고양이 패트롤 + 재롱" (클릭 시 `_animDogTrick`/`_animCatTrick`).
   - 추가 요청: 아바타가 펫 근처에서 클릭 → **앉아서 쓰다듬기**, 펫은 **배 까고(belly-up) 재롱**.
   - 필요: 근접 체크 + 아바타 앉기/쓰다듬 포즈(`updatePersonAnimation` 'sitting') + `_animDogBelly`/`_animCatBelly` 신규.
3. 접근/1인칭 뷰 카메라 거리·감도 사용자 튜닝 여지.

## 6. 자격증명·주의
- 서버 비번은 세션 한정. `deploy/ssl/` 커밋 금지(`.gitignore` 등록됨).
- CSP 공유 파일(`security-headers.conf`)은 미변경 — metaoffice 전용 `.inc`만 사용.
