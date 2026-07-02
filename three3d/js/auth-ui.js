/**
 * three3d/js/auth-ui.js
 *
 * Azure 조직 로그인 게이트 — Device Code Flow 기반 로그인 화면 (WJ CHAT-01 후속)
 *
 * 앱 진입 시 전체화면 오버레이로 "Microsoft Azure 조직 계정으로 로그인"을 표시한다.
 *   1. /auth/status 로 이미 로그인돼 있으면 즉시 통과.
 *   2. 버튼 클릭 → /auth/start (Device Code) → 코드·링크 표시 + 로그인 페이지 새 탭.
 *   3. /auth/status 를 폴링해 인증 완료되면 오버레이 제거 + onAuthenticated() 호출.
 */

let API_BASE = '';
let overlay = null;
let pollTimer = null;
let onAuthed = null;

/**
 * 로그인 게이트를 초기화한다. scene.js 에서 1회 호출.
 * @param {{ apiBase: string, onAuthenticated?: () => void }} opts
 */
export function initAuthGate({ apiBase, onAuthenticated }) {
    API_BASE = apiBase || `http://${location.hostname}:3300`;
    onAuthed = onAuthenticated;
    buildOverlay();
    checkStatus();   // 이미 로그인 상태면 즉시 통과
}

function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = `
        position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
        background:rgba(10,15,25,0.92); backdrop-filter:blur(6px); font-family:monospace; color:#fff;`;
    const card = document.createElement('div');
    card.style.cssText = `
        width:360px; max-width:90vw; background:rgba(0,0,0,0.55); border:1px solid #2a3550;
        border-radius:14px; padding:28px 26px; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.5);`;
    card.innerHTML = `
        <div style="font-size:20px; font-weight:bold; letter-spacing:1px; margin-bottom:6px;">FOR.LAB META OFFICE</div>
        <div style="color:#9fb3d1; font-size:12px; margin-bottom:22px;">Microsoft Azure 조직 계정으로 로그인</div>
        <button id="auth-login-btn" style="width:100%; background:#2F6FED; color:#fff; border:none; border-radius:8px;
            padding:11px; font-family:monospace; font-size:14px; font-weight:bold; cursor:pointer;">🔷 Microsoft로 로그인</button>
        <div id="auth-msg" style="color:#9fb3d1; font-size:12px; margin-top:16px; line-height:1.7; word-break:break-all;"></div>`;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector('#auth-login-btn').onclick = startLogin;
}

function setMsg(html) {
    const m = overlay && overlay.querySelector('#auth-msg');
    if (m) m.innerHTML = html;
}

async function checkStatus() {
    try {
        const s = await fetch(`${API_BASE}/auth/status`).then((r) => r.json());
        if (s && s.authenticated) { pass(); return true; }
    } catch { /* 서버 미기동 등 — 무시하고 로그인 유지 */ }
    return false;
}

async function startLogin() {
    const btn = overlay.querySelector('#auth-login-btn');
    btn.disabled = true;
    btn.textContent = '로그인 시작 중…';
    try {
        const r = await fetch(`${API_BASE}/auth/start`).then((x) => x.json());
        if (r && r.userCode) {
            setMsg(`아래 링크를 열고 코드를 입력해 로그인하세요.<br>
                <a href="${r.verificationUri}" target="_blank" rel="noopener" style="color:#6fa8ff;">${r.verificationUri}</a><br>
                입력 코드: <b style="font-size:18px; color:#fff; letter-spacing:2px;">${r.userCode}</b><br>
                <span style="color:#7f8fa6;">로그인 완료를 기다리는 중…</span>`);
            window.open(r.verificationUri, '_blank', 'noopener');   // 로그인 페이지 자동 오픈
            startPolling();
        } else {
            setMsg('<span style="color:#f66;">로그인 시작 실패 — 다시 시도해주세요.</span>');
            resetBtn();
        }
    } catch (e) {
        setMsg(`<span style="color:#f66;">오류: ${e.message}</span>`);
        resetBtn();
    }
}

function resetBtn() {
    const btn = overlay && overlay.querySelector('#auth-login-btn');
    if (btn) { btn.disabled = false; btn.textContent = '🔷 Microsoft로 로그인'; }
}

function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
        if (await checkStatus()) stopPolling();
    }, 3000);
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function pass() {
    stopPolling();
    if (overlay) { overlay.remove(); overlay = null; }
    if (typeof onAuthed === 'function') {
        try { onAuthed(); } catch { /* noop */ }
    }
}
