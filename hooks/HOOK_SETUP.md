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
PreToolUse/PostToolUse/Stop → agent-monitor-hook.js → POST /hook/tool-use → 2D/3D 시각화

## 서버 미기동 시
Hook 실행 시 서버가 꺼져 있으면 1.5초 후 자동으로 종료(Claude Code 세션 차단 없음).
