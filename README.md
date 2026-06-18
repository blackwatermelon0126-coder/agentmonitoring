# Agent Monitor - Claude Code 시각화 모니터링

에이전트(Developer, DevOps, QA, PM, Leader)의 실시간 활동을 시각화합니다.

## 구성

```
agentmonitoring/
├── server/          # WebSocket 서버 (Hook 수신 → 클라이언트 브로드캐스트)
├── phaser2d/        # 2D 픽셀아트 사무실 (슈퍼마리오풍)
├── three3d/         # 3D 로우폴리 사무실
└── hooks/           # Claude Code Hook 스크립트
```

## 실행 방법

### 1. 서버 시작
```bash
cd server
npm install
npm start
```

### 2. 브라우저 접속
- 2D 모드: http://localhost:3300/2d
- 3D 모드: http://localhost:3300/3d

### 3. 데모 테스트
- 브라우저에서 `SPACE` 키를 누르면 랜덤 에이전트 활동 데모
- 또는: `curl -X POST http://localhost:3300/demo`

## Claude Code Hook 연동 (향후)

`settings.json`에 Hook 설정 추가:
```json
{
  "hooks": {
    "PostToolUse": [
      { "command": "bash d:/private/agentmonitoring/hooks/post-tool-use.sh $TOOL_NAME" }
    ]
  }
}
```
