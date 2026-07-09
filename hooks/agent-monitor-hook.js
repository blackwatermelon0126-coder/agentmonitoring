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
const https = require("https");
const path = require("path");
const { URL } = require("url");

// 전송 대상 결정:
//   AGENT_MONITOR_URL (예: https://metaoffice.fllab.internal) 우선 →
//   없으면 AGENT_MONITOR_HOST/PORT (기본 127.0.0.1:3300, 로컬 개발 하위호환).
// 원격 서버(팀 공유 모니터링)로 보내려면 각 PC에 AGENT_MONITOR_URL 만 설정하면 된다.
const MONITOR_URL = process.env.AGENT_MONITOR_URL || "";
let TRANSPORT = http, REQ_HOST = process.env.AGENT_MONITOR_HOST || "127.0.0.1",
    REQ_PORT = parseInt(process.env.AGENT_MONITOR_PORT || "3300", 10), REQ_PROTO = "http:";
if (MONITOR_URL) {
    try {
        const u = new URL(MONITOR_URL);
        REQ_PROTO = u.protocol;
        REQ_HOST  = u.hostname;
        REQ_PORT  = u.port ? parseInt(u.port, 10) : (u.protocol === "https:" ? 443 : 80);
        TRANSPORT = u.protocol === "https:" ? https : http;
    } catch { /* 잘못된 URL → 기본값 유지 */ }
}

const ROLE = (process.env.CLAUDE_ROLE || "developer").toLowerCase();
// 사용자 식별자(이메일) — 3D 화면에서 로그인 아바타와 매칭되는 세션 키.
// 각 PC에 AGENT_MONITOR_USER=본인이메일 로 설정. 없으면 Claude 세션 UUID로 폴백.
const MONITOR_USER = (process.env.AGENT_MONITOR_USER || "").toLowerCase();

function post(p, body) {
    return new Promise((resolve) => {
        const data = Buffer.from(JSON.stringify(body), "utf-8");
        const req = TRANSPORT.request({
            host: REQ_HOST,
            port: REQ_PORT,
            path: p,
            method: "POST",
            protocol: REQ_PROTO,
            headers: { "Content-Type": "application/json", "Content-Length": data.length },
            timeout: 1500,
            rejectUnauthorized: false,   // 내부 mkcert 인증서 허용(HTTPS)
        }, (res) => { res.on("data", () => {}); res.on("end", resolve); });
        req.on("error", resolve);
        req.on("timeout", () => { req.destroy(); resolve(); });
        req.write(data); req.end();
    });
}

/** 세션 키: 사용자 이메일 우선(아바타 매칭) → Claude 세션 UUID 폴백. */
function sid(evt) { return MONITOR_USER || (evt && evt.session_id) || ""; }

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
            sessionId: sid(evt),
        };
        if (event === "PostToolUse") {
            body.result = extractResultSummary(tool, evt.tool_response);
        }
        await post("/hook/tool-use", body);
        return;
    }

    if (event === "Stop" || event === "SessionEnd" || event === "SubagentStop") {
        // 이 세션(사용자)의 모든 역할만 idle 전환 — 타 사용자 세션에 영향 없음.
        await post("/hook/tool-done", { role: ROLE, allRoles: true, sessionId: sid(evt) });
        return;
    }

    if (event === "SessionStart") {
        await post("/hook/tool-use", {
            tool: event, role: ROLE, status: "working",
            detail: "🟢 세션 시작",
            event,
            sessionId: sid(evt),
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
            sessionId: sid(evt),
        });
        return;
    }
}

main().catch(() => process.exit(0));
