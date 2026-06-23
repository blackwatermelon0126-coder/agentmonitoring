#!/usr/bin/env node
/**
 * test-hook.js — Hook 전송 시뮬레이션 스크립트
 *
 * 서버가 로컬(포트 3300)에서 기동 중일 때 hook 페이로드를 직접 POST하여
 * agentStates 갱신 여부를 검증한다.
 *
 * 사용법:
 *   node tools/test-hook.js
 *
 * 시나리오:
 *   1. Read 도구 — developer 역할
 *   2. Edit 도구 — developer 역할
 *   3. Bash 도구 — devops 역할
 *   4. Stop 이벤트 — 모든 역할 idle 전환
 */

"use strict";

const http = require("http");

const HOST = process.env.AGENT_MONITOR_HOST || "127.0.0.1";
const PORT = parseInt(process.env.AGENT_MONITOR_PORT || "3300", 10);
const BASE = `http://${HOST}:${PORT}`;

// ANSI 색상 코드
const C = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red:   "\x1b[31m",
    cyan:  "\x1b[36m",
    yellow:"\x1b[33m",
    bold:  "\x1b[1m",
};

function color(c, s) { return `${c}${s}${C.reset}`; }

function post(path, body) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify(body), "utf-8");
        const req = http.request({
            host: HOST,
            port: PORT,
            path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": data.length,
            },
            timeout: 5000,
        }, (res) => {
            let raw = "";
            res.on("data", (chunk) => (raw += chunk));
            res.on("end", () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        req.write(data);
        req.end();
    });
}

function get(path) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: HOST, port: PORT, path, method: "GET", timeout: 5000 },
            (res) => {
                let raw = "";
                res.on("data", (chunk) => (raw += chunk));
                res.on("end", () => {
                    try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                    catch { resolve({ status: res.statusCode, body: raw }); }
                });
            }
        );
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
        req.end();
    });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runScenario(label, fn) {
    process.stdout.write(`  ${color(C.cyan, "▶")} ${label} ... `);
    try {
        const result = await fn();
        if (result.ok) {
            console.log(color(C.green, "PASS"));
        } else {
            console.log(color(C.red, "FAIL") + ` — ${result.reason}`);
        }
        return result.ok;
    } catch (e) {
        console.log(color(C.red, "FAIL") + ` — ${e.message}`);
        return false;
    }
}

async function main() {
    console.log(`\n${color(C.bold, "=== Hook E2E 시뮬레이션 스크립트 ===")} (${BASE})\n`);

    // ─── 서버 연결 확인 ───────────────────────────────────────────────
    console.log(color(C.yellow, "[0] 서버 연결 확인"));
    const connOk = await runScenario("GET /api/status 응답 확인", async () => {
        const r = await get("/api/status");
        if (r.status !== 200) return { ok: false, reason: `HTTP ${r.status}` };
        if (typeof r.body !== "object") return { ok: false, reason: "응답 형식 오류" };
        return { ok: true };
    });

    if (!connOk) {
        console.log(`\n${color(C.red, "  서버가 응답하지 않습니다.")} 아래 명령으로 먼저 기동하세요:\n`);
        console.log(`    cd server && node server.js\n`);
        process.exit(1);
    }

    await sleep(200);

    // ─── 시나리오 1: Read 도구 (developer) ───────────────────────────
    console.log(`\n${color(C.yellow, "[1] Read 도구 — developer 역할")}`);
    await runScenario("POST /hook/tool-use (Read)", async () => {
        const r = await post("/hook/tool-use", {
            tool: "Read",
            role: "developer",
            status: "working",
            detail: "📖 server.js",
            params: { file: "server.js" },
            event: "PreToolUse",
            sessionId: "test-sim-001",
        });
        if (r.status !== 200 || !r.body.ok) return { ok: false, reason: JSON.stringify(r.body) };
        return { ok: true };
    });

    await runScenario("/api/status — developer=working 확인", async () => {
        const r = await get("/api/status");
        const dev = r.body.developer;
        if (!dev) return { ok: false, reason: "developer 키 없음" };
        if (dev.status !== "working") return { ok: false, reason: `status=${dev.status}` };
        if (dev.action !== "reading") return { ok: false, reason: `action=${dev.action}` };
        return { ok: true };
    });

    await sleep(300);

    // ─── 시나리오 2: Edit 도구 (developer) ───────────────────────────
    console.log(`\n${color(C.yellow, "[2] Edit 도구 — developer 역할")}`);
    await runScenario("POST /hook/tool-use (Edit)", async () => {
        const r = await post("/hook/tool-use", {
            tool: "Edit",
            role: "developer",
            status: "working",
            detail: "🛠 server.js 수정",
            params: { file: "server.js" },
            event: "PostToolUse",
            sessionId: "test-sim-001",
            result: "파일 수정 완료",
        });
        if (r.status !== 200 || !r.body.ok) return { ok: false, reason: JSON.stringify(r.body) };
        return { ok: true };
    });

    await runScenario("/api/status — developer action=coding 확인", async () => {
        const r = await get("/api/status");
        const dev = r.body.developer;
        if (!dev) return { ok: false, reason: "developer 키 없음" };
        if (dev.action !== "coding") return { ok: false, reason: `action=${dev.action}` };
        return { ok: true };
    });

    await sleep(300);

    // ─── 시나리오 3: Bash 도구 (devops) ──────────────────────────────
    console.log(`\n${color(C.yellow, "[3] Bash 도구 — devops 역할")}`);
    await runScenario("POST /hook/tool-use (Bash)", async () => {
        const r = await post("/hook/tool-use", {
            tool: "Bash",
            role: "devops",
            status: "working",
            detail: "⚡ npm test",
            params: { command: "npm test", description: "테스트 실행" },
            event: "PreToolUse",
            sessionId: "test-sim-001",
        });
        if (r.status !== 200 || !r.body.ok) return { ok: false, reason: JSON.stringify(r.body) };
        return { ok: true };
    });

    await runScenario("/api/status — devops=working 확인", async () => {
        const r = await get("/api/status");
        const devops = r.body.devops;
        if (!devops) return { ok: false, reason: "devops 키 없음" };
        if (devops.status !== "working") return { ok: false, reason: `status=${devops.status}` };
        if (devops.action !== "building") return { ok: false, reason: `action=${devops.action}` };
        return { ok: true };
    });

    await sleep(300);

    // ─── 시나리오 4: Stop 이벤트 — 전체 idle 전환 ────────────────────
    console.log(`\n${color(C.yellow, "[4] Stop 이벤트 — 모든 역할 idle 전환")}`);
    await runScenario("POST /hook/tool-done (allRoles=true)", async () => {
        const r = await post("/hook/tool-done", {
            role: "developer",
            allRoles: true,
            sessionId: "test-sim-001",
        });
        if (r.status !== 200 || !r.body.ok) return { ok: false, reason: JSON.stringify(r.body) };
        return { ok: true };
    });

    await runScenario("/api/status — 모든 역할 idle 확인", async () => {
        const r = await get("/api/status");
        const states = r.body;
        const nonIdle = Object.entries(states).filter(([, s]) => s.status !== "idle");
        if (nonIdle.length > 0) {
            return { ok: false, reason: `비idle 역할: ${nonIdle.map(([k]) => k).join(", ")}` };
        }
        return { ok: true };
    });

    // ─── 결과 요약 ────────────────────────────────────────────────────
    console.log(`\n${color(C.bold, "=== 시뮬레이션 완료 ===")}`);
    console.log(`브라우저에서 확인: http://${HOST}:${PORT}/3d\n`);
}

main().catch((e) => {
    console.error(color(C.red, `[오류] ${e.message}`));
    process.exit(1);
});
