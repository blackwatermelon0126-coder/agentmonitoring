#!/usr/bin/env node
// Claude Code Hook → Agent Monitor (port 3300)
//
// settings.json 등록 예시:
// "PreToolUse":  [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }]
// "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }]
// "Stop":        [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"D:\\private\\agentmonitoring\\hooks\\agent-monitor-hook.js\"", "timeout": 5 }] }]
//
// CLAUDE_ROLE 환경변수로 역할 매핑 (developer/devops/qa/pm/leader). 기본 developer.

"use strict";
const http = require("http");
const path = require("path");

const SERVER_HOST = process.env.AGENT_MONITOR_HOST || "127.0.0.1";
const SERVER_PORT = parseInt(process.env.AGENT_MONITOR_PORT || "3300", 10);
const ROLE = (process.env.CLAUDE_ROLE || "developer").toLowerCase();

function post(p, body) {
    return new Promise((resolve) => {
        const data = Buffer.from(JSON.stringify(body), "utf-8");
        const req = http.request({
            host: SERVER_HOST,
            port: SERVER_PORT,
            path: p,
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": data.length },
            timeout: 1500,
        }, (res) => { res.on("data", () => {}); res.on("end", resolve); });
        req.on("error", resolve);
        req.on("timeout", () => { req.destroy(); resolve(); });
        req.write(data); req.end();
    });
}

function trim(s, n) {
    if (typeof s !== "string") return "";
    s = s.replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function basename(p) {
    if (!p || typeof p !== "string") return "";
    return path.basename(p);
}

// 도구별 입력에서 보여줄 핵심 정보를 뽑아낸다
function extractDetails(tool, input) {
    input = input || {};
    const params = {};
    let summary = "";

    switch (tool) {
        case "Read":
            params.file = basename(input.file_path);
            summary = params.file ? `📖 ${params.file}` : "파일 읽기";
            break;
        case "Write":
            params.file = basename(input.file_path);
            summary = params.file ? `✏️ ${params.file} 작성` : "파일 작성";
            break;
        case "Edit":
            params.file = basename(input.file_path);
            summary = params.file ? `🛠 ${params.file} 수정` : "코드 수정";
            break;
        case "Bash": {
            const cmd = trim(input.command, 80);
            const desc = trim(input.description, 60);
            params.command = cmd;
            params.description = desc;
            summary = desc ? `⚡ ${desc}` : (cmd ? `⚡ ${cmd}` : "쉘 명령 실행");
            break;
        }
        case "Grep":
            params.pattern = trim(input.pattern, 40);
            params.path = input.path || "";
            summary = params.pattern ? `🔍 grep "${params.pattern}"` : "코드 검색";
            break;
        case "Glob":
            params.pattern = trim(input.pattern, 40);
            summary = params.pattern ? `📂 ${params.pattern}` : "파일 탐색";
            break;
        case "WebFetch":
            params.url = trim(input.url, 60);
            summary = params.url ? `🌐 ${params.url}` : "웹 조회";
            break;
        case "WebSearch":
            params.query = trim(input.query, 50);
            summary = params.query ? `🔎 "${params.query}"` : "웹 검색";
            break;
        case "TodoWrite":
        case "TaskCreate":
        case "TaskUpdate":
        case "TaskList":
            summary = `📋 ${tool}`;
            break;
        case "Agent": {
            const sub = input.subagent_type || "";
            params.subagent = sub;
            params.description = trim(input.description, 50);
            summary = sub ? `🤖 ${sub} 에이전트` : "에이전트 호출";
            break;
        }
        default:
            summary = tool ? `${tool} 사용 중` : "작업 중";
    }
    return { summary, params };
}

// PostToolUse 결과에서 한 줄 요약 추출 (옵션)
function extractResultSummary(tool, response) {
    if (!response) return "";
    const out = response.output || response.content || "";
    if (!out || typeof out !== "string") return "";
    return trim(out, 60);
}

// 도구 → 역할 매핑 (CLAUDE_ROLE이 명시되지 않은 경우 대략적으로 분배)
function inferRole(tool) {
    if (process.env.CLAUDE_ROLE) return ROLE;
    switch (tool) {
        case "Bash":
            return "devops";
        case "Grep":
        case "Glob":
            return "qa";
        case "TodoWrite":
        case "TaskCreate":
        case "TaskUpdate":
        case "TaskList":
            return "pm";
        case "Agent":
            return "leader";
        default:
            return "developer";
    }
}

async function main() {
    let raw = "";
    for await (const chunk of process.stdin) raw += chunk;

    let evt = {};
    try { evt = JSON.parse(raw); } catch { /* CLI fallback */ }

    const event = evt.hook_event_name || process.env.CLAUDE_HOOK_EVENT || "Unknown";
    const tool  = evt.tool_name || process.argv[2] || "";

    if (event === "PreToolUse" || event === "PostToolUse") {
        const { summary, params } = extractDetails(tool, evt.tool_input);
        const role = inferRole(tool);
        const body = {
            tool,
            role,
            status: "working",
            detail: summary,
            params,
            event,
            sessionId: evt.session_id || "",
        };
        if (event === "PostToolUse") {
            body.result = extractResultSummary(tool, evt.tool_response);
        }
        await post("/hook/tool-use", body);
        return;
    }

    if (event === "Stop" || event === "SessionEnd" || event === "SubagentStop") {
        await post("/hook/tool-done", { role: ROLE, allRoles: true });
        return;
    }

    if (event === "SessionStart") {
        await post("/hook/tool-use", {
            tool: event, role: ROLE, status: "working",
            detail: "🟢 세션 시작",
            event,
            sessionId: evt.session_id || "",
        });
        return;
    }

    if (event === "UserPromptSubmit") {
        const prompt = trim(evt.prompt, 60);
        await post("/hook/tool-use", {
            tool: event, role: ROLE, status: "working",
            detail: prompt ? `💬 ${prompt}` : "프롬프트 처리 중",
            params: { prompt },
            event,
            sessionId: evt.session_id || "",
        });
        return;
    }
}

main().catch(() => process.exit(0));
