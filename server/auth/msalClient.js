/**
 * server/auth/msalClient.js
 *
 * Microsoft Authentication Library (MSAL) 클라이언트 — Device Code Flow
 *
 * 인증 방식: Public Client + Device Code Flow
 *   - 리디렉션 URI 불필요 (서버리스 환경에 최적)
 *   - 사용자가 별도 브라우저에서 코드 입력하여 인증 완료
 *   - 토큰은 data/token.json에 캐시, 만료 5분 전 자동 갱신
 */

import { PublicClientApplication } from '@azure/msal-node';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, '..', 'data', 'token.json');
// MSAL 내부 토큰 캐시(리프레시 토큰 포함) 영속 파일 — 서버 재시작 후에도 silent 갱신이 동작하게 한다.
const CACHE_PATH = path.join(__dirname, '..', 'data', 'msal-cache.json');

// ── MSAL Public Client 설정 ───────────────────────────────────────
const CLIENT_ID  = process.env.AZURE_CLIENT_ID  || 'c33608da-f7ed-40e5-ab28-c767f08a1d47';
const TENANT_ID  = process.env.AZURE_TENANT_ID  || '7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f';

/**
 * MSAL 토큰 캐시 영속화 플러그인.
 * MSAL은 리프레시 토큰을 내부 캐시에 보관하는데 기본값이 in-memory 라
 * 프로세스 재시작 시 사라진다 → 매번 device code 재로그인이 필요해진다.
 * 이 플러그인이 캐시를 data/msal-cache.json 에 직렬화/역직렬화하여
 * 재시작 후에도 acquireTokenSilent(리프레시 토큰 사용) 갱신이 동작하게 한다.
 */
const cachePlugin = {
    beforeCacheAccess: async (cacheContext) => {
        try {
            if (fs.existsSync(CACHE_PATH)) {
                cacheContext.tokenCache.deserialize(fs.readFileSync(CACHE_PATH, 'utf8'));
            }
        } catch {
            // 손상된 캐시는 무시 — 다음 로그인 때 재생성된다.
        }
    },
    afterCacheAccess: async (cacheContext) => {
        if (cacheContext.cacheHasChanged) {
            try {
                const dir = path.dirname(CACHE_PATH);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(CACHE_PATH, cacheContext.tokenCache.serialize(), 'utf8');
            } catch {
                // 쓰기 실패는 무해화 — 다음 호출 때 재시도된다.
            }
        }
    },
};

const msalConfig = {
    auth: {
        clientId:  CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    },
    cache: { cachePlugin },
};

const pca = new PublicClientApplication(msalConfig);

// 필요 권한 범위
const SCOPES = [
    'Chat.Read',
    'Chat.ReadBasic',
    'offline_access',
    'User.Read',
    'User.Read.All',        // 조직 디렉터리 사용자 조회 (formationlabs 멤버) — 조직 사용자 피커용
];

// ── 토큰 파일 입출력 ──────────────────────────────────────────────

/**
 * data/token.json에서 저장된 토큰을 읽어 반환한다.
 * 파일이 없거나 파싱 실패 시 null 반환.
 * @returns {{ accessToken: string, expiresOn: string, account: object }|null}
 */
function getTokenFromCache() {
    try {
        if (!fs.existsSync(TOKEN_PATH)) return null;
        const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * 토큰 응답을 data/token.json에 저장한다.
 * @param {object} tokenResponse - MSAL acquireToken 응답 객체
 */
function saveToken(tokenResponse) {
    const dir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const payload = {
        accessToken:  tokenResponse.accessToken,
        expiresOn:    tokenResponse.expiresOn,
        account:      tokenResponse.account,
        idToken:      tokenResponse.idToken || null,
        scopes:       tokenResponse.scopes || SCOPES,
        savedAt:      new Date().toISOString(),
    };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

// ── Device Code Flow ──────────────────────────────────────────────

/**
 * Device Code Flow를 시작한다.
 * 반환값을 클라이언트에게 보여주면, 사용자가 브라우저에서 코드를 입력해 인증한다.
 *
 * @returns {Promise<{ userCode: string, verificationUri: string, message: string, deviceCodeRequest: object }>}
 */
async function getDeviceCodeUrl() {
    return new Promise((resolve, reject) => {
        // SCOPES를 deviceCodeRequest 정의 이전에 참조 — TDZ 해소
        const deviceCodeRequest = {
            scopes: SCOPES,
            deviceCodeCallback: (response) => {
                resolve({
                    userCode:        response.userCode,
                    verificationUri: response.verificationUri,
                    message:         response.message,
                    deviceCodeRequest,
                });
            },
        };

        // acquireTokenByDeviceCode는 내부적으로 deviceCodeCallback을 호출한 뒤 폴링한다.
        // 여기서는 deviceCodeCallback 호출 시점에 resolve하고, 토큰 취득은 acquireTokenByDeviceCode에서 처리한다.
        pca.acquireTokenByDeviceCode({ scopes: SCOPES, deviceCodeCallback: deviceCodeRequest.deviceCodeCallback })
            .then(tokenResponse => {
                if (tokenResponse) saveToken(tokenResponse);
            })
            .catch((err) => {
                // 사용자가 인증하지 않았거나 취소 — reject로 전파하여 /auth/start가 500 사유를 반환하도록
                reject(err);
            });
    });
}

/**
 * 저장된 토큰이 만료 5분 이내이면 silent 갱신을 시도한다.
 * 갱신 성공 시 토큰을 저장하고 새 accessToken을 반환한다.
 * 갱신 실패 시 기존 토큰의 accessToken을 반환한다.
 *
 * @returns {Promise<string|null>} accessToken 또는 null
 */
async function refreshTokenIfNeeded() {
    const cached = getTokenFromCache();
    if (!cached) return null;

    const expiresOn = new Date(cached.expiresOn);
    const fiveMinLater = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresOn > fiveMinLater) {
        // 아직 충분히 유효함
        return cached.accessToken;
    }

    // 만료 임박 — silent 갱신 시도
    try {
        const accounts = await pca.getTokenCache().getAllAccounts();
        const account = accounts.find(a => a.username === cached.account?.username) || accounts[0];
        if (!account) return cached.accessToken;

        const silentRequest = { scopes: SCOPES, account };
        const tokenResponse = await pca.acquireTokenSilent(silentRequest);
        if (tokenResponse) {
            saveToken(tokenResponse);
            return tokenResponse.accessToken;
        }
    } catch {
        // silent 갱신 실패 — 기존 토큰 반환
    }
    return cached.accessToken;
}

/**
 * 인증 상태를 확인한다.
 * access token이 만료됐어도 영속 캐시의 리프레시 토큰으로 silent 갱신이
 * 가능하면 authenticated:true 로 보고한다(서버 재시작 직후에도 로그인 유지).
 * @returns {Promise<{ authenticated: boolean, account: string|null }>}
 */
async function getAuthStatus() {
    const cached = getTokenFromCache();
    if (!cached) return { authenticated: false, account: null };

    const account = cached.account?.username || cached.account?.name || null;
    const expiresOn = new Date(cached.expiresOn);

    // 아직 유효하면 즉시 true
    if (expiresOn > new Date()) {
        return { authenticated: true, account };
    }

    // access token 만료 — 리프레시 토큰으로 silent 갱신 시도 후 재판정
    await refreshTokenIfNeeded();
    const fresh = getTokenFromCache();
    const renewed = !!fresh && new Date(fresh.expiresOn) > new Date();
    return { authenticated: renewed, account };
}

export {
    getDeviceCodeUrl,
    getTokenFromCache,
    saveToken,
    refreshTokenIfNeeded,
    getAuthStatus,
    SCOPES,
};
