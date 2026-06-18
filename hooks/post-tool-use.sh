# DEPRECATED: agent-monitor-hook.js (Node)로 대체됨
# 이 파일은 더 이상 사용되지 않습니다.
# 대체 파일: hooks/agent-monitor-hook.js
# settings.json Hook 등록: node D:/private/agentmonitoring/hooks/agent-monitor-hook.js
#
# ─────────────────────────────────────────────────────────────────
# 아래 코드는 비활성화되었습니다. 삭제 대신 참조용으로 보존합니다.
# ─────────────────────────────────────────────────────────────────
#
# #!/bin/bash
# # Claude Code PostToolUse Hook
# # 도구 사용 후 Agent Monitor 서버로 이벤트 전송
# #
# # 설정 방법 (settings.json):
# # "hooks": {
# #   "PostToolUse": [
# #     { "command": "bash d:/private/agentmonitoring/hooks/post-tool-use.sh $TOOL_NAME" }
# #   ]
# # }
#
# TOOL_NAME="${1:-unknown}"
# ROLE="${CLAUDE_ROLE:-developer}"
# SERVER="http://localhost:3300"
#
# curl -s -X POST "$SERVER/hook/tool-use" \
#   -H "Content-Type: application/json" \
#   -d "{\"tool\":\"$TOOL_NAME\",\"role\":\"$ROLE\",\"status\":\"working\"}" \
#   > /dev/null 2>&1 &
#
# # 5초 후 idle 전환
# (sleep 5 && curl -s -X POST "$SERVER/hook/tool-done" \
#   -H "Content-Type: application/json" \
#   -d "{\"role\":\"$ROLE\"}" \
#   > /dev/null 2>&1) &
