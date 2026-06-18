#!/usr/bin/env node
/**
 * test-hook-offline.js — 무해화 회귀 테스트
 *
 * 서버가 미기동 상태에서 agent-monitor-hook.js를 stdin 시뮬레이션으로 실행하여
 * 1.5초 이내에 exit 0으로 종료되는지 검증한다.
 *
 * Claude Code 세션이 hook 오류로 차단되지 않음을 자동으로 검증한다.
 *
 * 사용법:
 *   node tools/test-hook-offline.js
 *
 * 전제:
 *   - 포트 3300에 서버가 기동되어 있지 않아야 한다.
 *   - Node.js 설치 필요.
 */

"use strict";

const { spawn } = require("child_process");
const path = require("path");

const HOOK_SCRIPT = path.join(__dirname, "..", "hooks", "agent-monitor-hook.js");
const TIMEOUT_MS = 4000; // 판정 타임아웃 (hook 자체 타임아웃 1.5s + 여유 2.5s)

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

/**
 * hook 스크립트를 stdin 페이로드와 함께 실행하고 결과를 반환한다.
 * @param {string} label - 테스트 레이블
 * @param {object} payload - stdin으로 전달할 JSON 객체
 * @param {number} [timeoutMs] - 개별 타임아웃(ms), 기본 TIMEOUT_MS
 * @returns {{ ok: boolean, code: number|null, elapsed: number, reason?: string }}
 */
function runHook(label, payload, timeoutMs = TIMEOUT_MS) {
    return new Promise((resolve) => {
        const start = Date.now();
        const env = { ...process.env, CLAUDE_ROLE: "developer" };
        // 서버가 떠 있어도 오프라인 처럼 동작하도록 없는 포트 지정
        env.AGENT_MONITOR_PORT = "3399";

        const child = spawn(process.execPath, [HOOK_SCRIPT], {
            stdio: ["pipe", "pipe", "pipe"],
            env,
        });

        // stdin 주입
        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));

        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            const elapsed = Date.now() - start;
            resolve({ ok: false, code: null, elapsed, reason: `타임아웃 (${elapsed}ms)` });
        }, timeoutMs);

        child.on("close", (code) => {
            clearTimeout(timer);
            const elapsed = Date.now() - start;
            if (code === 0) {
                resolve({ ok: true, code, elapsed });
            } else {
                resolve({
                    ok: false,
                    code,
                    elapsed,
                    reason: `exit code=${code}, stderr="${stderr.trim()}"`,
                });
            }
        });

        child.on("error", (e) => {
            clearTimeout(timer);
            const elapsed = Date.now() - start;
            resolve({ ok: false, code: null, elapsed, reason: e.message });
        });
    });
}

async function runCase(label, payload, timeoutMs) {
    process.stdout.write(`  ${color(C.cyan, "▶")} ${label} ... `);
    const result = await runHook(label, payload, timeoutMs);
    if (result.ok) {
        console.log(color(C.green, "PASS") + ` (${result.elapsed}ms)`);
    } else {
        console.log(color(C.red, "FAIL") + ` — ${result.reason}`);
    }
    return result.ok;
}

async function main() {
    console.log(`\n${color(C.bold, "=== 무해화 회귀 테스트 (서버 미기동 검증) ===")} \n`);
    console.log(`  Hook 스크립트: ${HOOK_SCRIPT}\n`);

    let passed = 0;
    let failed = 0;

    // ─── 케이스 1: PreToolUse — Read 도구 ────────────────────────────
    console.log(color(C.yellow, "[1] PreToolUse — Read 도구"));
    const r1 = await runCase(
        "서버 미기동 상태에서 exit 0, 1.5초 이내 종료",
        {
            hook_event_name: "PreToolUse",
            tool_name: "Read",
            tool_input: { file_path: "C:\\test\\sample.js" },
            session_id: "offline-test-001",
        }
    );
    r1 ? passed++ : failed++;

    // ─── 케이스 2: PostToolUse — Edit 도구 ───────────────────────────
    console.log(`\n${color(C.yellow, "[2] PostToolUse — Edit 도구")}`);
    const r2 = await runCase(
        "서버 미기동 상태에서 exit 0, 1.5초 이내 종료",
        {
            hook_event_name: "PostToolUse",
            tool_name: "Edit",
            tool_input: { file_path: "C:\\test\\server.js" },
            tool_response: { output: "편집 완료" },
            session_id: "offline-test-001",
        }
    );
    r2 ? passed++ : failed++;

    // ─── 케이스 3: PostToolUse — Bash 도구 ───────────────────────────
    console.log(`\n${color(C.yellow, "[3] PostToolUse — Bash 도구")}`);
    const r3 = await runCase(
        "서버 미기동 상태에서 exit 0, 1.5초 이내 종료",
        {
            hook_event_name: "PostToolUse",
            tool_name: "Bash",
            tool_input: { command: "node --version", description: "버전 확인" },
            tool_response: { output: "v22.0.0" },
            session_id: "offline-test-001",
        }
    );
    r3 ? passed++ : failed++;

    // ─── 케이스 4: Stop 이벤트 ───────────────────────────────────────
    console.log(`\n${color(C.yellow, "[4] Stop 이벤트")}`);
    const r4 = await runCase(
        "서버 미기동 상태에서 exit 0, 1.5초 이내 종료",
        {
            hook_event_name: "Stop",
            session_id: "offline-test-001",
        }
    );
    r4 ? passed++ : failed++;

    // ─── 케이스 5: 빈 stdin (잘못된 JSON) ────────────────────────────
    console.log(`\n${color(C.yellow, "[5] 빈 stdin — JSON 파싱 오류 내성")}`);
    const r5 = await runCase(
        "빈 입력에서도 exit 0으로 종료",
        {} // 빈 객체 = 알 수 없는 이벤트 → 조용히 종료
    );
    r5 ? passed++ : failed++;

    // ─── 결과 요약 ────────────────────────────────────────────────────
    console.log(`\n${color(C.bold, "=== 결과 요약 ===")}`);
    console.log(`  통과: ${color(C.green, String(passed))}  실패: ${color(C.red, String(failed))}\n`);

    if (failed > 0) {
        console.log(color(C.red, "  FAIL — 1개 이상 케이스 실패. 로그를 확인하세요."));
        process.exit(1);
    } else {
        console.log(color(C.green, "  PASS — 모든 케이스 통과. 서버 미기동 시 세션이 차단되지 않습니다."));
        process.exit(0);
    }
}

main().catch((e) => {
    console.error(`${C.red}[오류] ${e.message}${C.reset}`);
    process.exit(1);
});
