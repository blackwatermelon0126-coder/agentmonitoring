/**
 * three3d/js/auth-msal.js
 *
 * Azure 개인 로그인 게이트 — MSAL.js 브라우저(Authorization Code + PKCE)  (WJ MULTIUSER-01 P1)
 *
 * 기존 Device Code 게이트(auth-ui.js)를 대체한다. 각 사용자가 **자기 브라우저에서 본인 MS 계정**으로
 * 로그인하고 **본인 토큰**을 브라우저에 보유한다(서버 미보관 — 신분 격리).
 *
 * 사용: scene.js 가 initAuthGate({ onAuthenticated }) 1회 호출.
 *   - 이미 로그인(계정 캐시) → 즉시 통과
 *   - 아니면 전체화면 오버레이 → "Microsoft로 로그인" → loginRedirect → 복귀 시 통과
 *   - getAccessToken()/getAccount() 로 이후 개인 Graph 호출(P2)에서 본인 토큰 사용
 *
 * 전제: index.html 에서 UMD(window.msal) 선로드. Azure 앱 등록에 SPA 리다이렉트 URI(app 페이지) 필요.
 */

const CLIENT_ID = 'c33608da-f7ed-40e5-ab28-c767f08a1d47';
const TENANT_ID = '7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f';
const SCOPES = ['User.Read', 'Chat.Read', 'Chat.ReadBasic', 'Chat.ReadWrite'];

let pca = null;
let account = null;
let onAuthed = null;
let overlay = null;

/** scene.js 에서 1회 호출. 로그인 게이트 초기화. */
export async function initAuthGate({ onAuthenticated } = {}) {
    onAuthed = onAuthenticated;
    if (!window.msal || !window.msal.PublicClientApplication) {
        console.error('[auth-msal] MSAL 라이브러리가 로드되지 않았습니다(window.msal 없음).');
        buildOverlay('MSAL 로드 실패 — 새로고침 해주세요.', true);
        return;
    }

    pca = new window.msal.PublicClientApplication({
        auth: {
            clientId: CLIENT_ID,
            authority: `https://login.microsoftonline.com/${TENANT_ID}`,
            // 리다이렉트 URI = 앱 페이지(/3d/). Azure SPA 등록 URI와 정확히 일치해야 함.
            redirectUri: window.location.origin + '/3d/',
        },
        cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    });

    await pca.initialize();

    // 리다이렉트 로그인 응답 처리(로그인 후 복귀 시)
    try {
        const resp = await pca.handleRedirectPromise();
        if (resp && resp.account) account = resp.account;
    } catch (e) {
        console.warn('[auth-msal] handleRedirectPromise 오류:', e && e.message);
    }

    // 캐시된 계정 확인
    if (!account) {
        const accts = pca.getAllAccounts();
        if (accts && accts.length) account = accts[0];
    }

    if (account) {
        pca.setActiveAccount(account);
        pass();
    } else {
        buildOverlay();
    }
}

function buildOverlay(errorMsg, isError) {
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
        <div id="auth-msg" style="color:${isError ? '#f66' : '#9fb3d1'}; font-size:12px; margin-top:16px; line-height:1.6; word-break:break-all;">${errorMsg || ''}</div>`;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const btn = card.querySelector('#auth-login-btn');
    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = '로그인 창으로 이동 중…';
        try {
            await pca.loginRedirect({ scopes: SCOPES });
        } catch (e) {
            setMsg(`로그인 실패: ${e && e.message}`, true);
            btn.disabled = false;
            btn.textContent = '🔷 Microsoft로 로그인';
        }
    };
}

function setMsg(html, isError) {
    const m = overlay && overlay.querySelector('#auth-msg');
    if (m) { m.innerHTML = html; m.style.color = isError ? '#f66' : '#9fb3d1'; }
}

function pass() {
    if (overlay) { overlay.remove(); overlay = null; }
    if (typeof onAuthed === 'function') {
        try { onAuthed(account); } catch (e) { console.warn('[auth-msal] onAuthenticated 오류:', e && e.message); }
    }
}

/** 로그인 사용자 계정({ name, username=UPN, ... }) 반환. */
export function getAccount() {
    return account;
}

/**
 * 개인 Graph 호출용 access token 획득(silent → 실패 시 popup).
 * P2(브라우저 직접 Graph)에서 본인 채팅 호출에 사용.
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
    if (!pca || !account) return null;
    try {
        const r = await pca.acquireTokenSilent({ scopes: SCOPES, account });
        return r.accessToken;
    } catch (e) {
        try {
            const r = await pca.acquireTokenPopup({ scopes: SCOPES, account });
            return r.accessToken;
        } catch (e2) {
            console.warn('[auth-msal] 토큰 획득 실패:', e2 && e2.message);
            return null;
        }
    }
}

/** 로그아웃(선택). */
export async function logout() {
    if (pca && account) {
        await pca.logoutRedirect({ account });
    }
}
