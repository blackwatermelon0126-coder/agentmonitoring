import './loadEnv.js'; // ⚠ 최우선 — 다른 모듈이 process.env(AZURE_* 등)를 읽기 전에 .env 로드
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { ROLES, ROLE_NAMES } from './shared/roles.js';
import { loadRecentEntries, appendEntry, ACTIVITY_LIMIT as _ACTIVITY_LIMIT } from './activity-log.js';
import { getDeviceCodeUrl, getAuthStatus, refreshTokenIfNeeded, getFileToken, getTokenFromCache } from './auth/msalClient.js';
import { startPolling, graphGet, GRAPH_BASE } from './teams/teamsPoller.js';
import { listChats, getMessages, sendMessage } from './teams/chatService.js';
import { refreshFromGraph as refreshMealPlan, getMealPlanStatus, readImage as readMealPlanImage } from './menu/mealPlan.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ── 서버 시작 시각 (uptime 계산용) — P4-B ─────────────────────
const SERVER_START = Date.now();

// ── 이벤트 카운터 — P4-B ──────────────────────────────────────
let eventCount = 0;
let lastEventAt = null;

const app = express();
app.use(express.json());

// ── origin 루프백 검증 미들웨어 — P4-B ────────────────────────
// /hook/tool-use, /hook/tool-done, /demo 엔드포인트에 적용.
// /api/status, /api/roles, /3d 는 제한 없음.
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function requireLoopback(req, res, next) {
    if (process.env.ALLOW_REMOTE_HOOKS === 'true') {
        return next();
    }
    const remote = req.socket.remoteAddress;
    if (LOOPBACK_ADDRS.has(remote)) {
        return next();
    }
    logger.warn({ event: 'loopback_rejected', remote }, 'Hook rejected: non-loopback origin');
    res.status(403).json({ error: 'forbidden', reason: 'loopback only' });
}

// 정적 파일 서빙 (3D 클라이언트)
app.use('/3d', express.static(path.join(__dirname, '..', 'three3d')));
app.use('/3d/libs/three', express.static(path.join(__dirname, '..', 'three3d', 'node_modules', 'three')));
// MSAL.js(브라우저 개인 로그인) UMD 번들 서빙 — MULTIUSER-01 P1
app.use('/3d/libs/msal', express.static(path.join(__dirname, '..', 'three3d', 'node_modules', '@azure', 'msal-browser', 'lib')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 연결된 클라이언트 목록
const clients = new Set();

// P3: WS 세션 신분 추적 — ws → { oid, email, displayName, color }
const wsUserMap = new Map();

// 최근 활동 로그 (카드뷰 피드용, 최대 50개)
// 서버 시작 시 파일에서 최근 50건을 복원한다 (결함 D11 수정)
const ACTIVITY_LIMIT = _ACTIVITY_LIMIT;
const activityLog = loadRecentEntries(ACTIVITY_LIMIT);

function pushActivity(entry) {
    // 디스크 영속화 (append) — 메모리 링버퍼와 동시 기록
    appendEntry(entry);
    activityLog.push(entry);
    if (activityLog.length > ACTIVITY_LIMIT) activityLog.shift();
}

/**
 * 세션별 에이전트 상태 관리 (P2-C: sessionId 기반 멀티세션 지원)
 *
 * 구조: sessions[sessionId][role] = { status, action, detail, tool, lastUpdate, sessionId, role }
 * - sessionId 미전달 시 'default' 세션으로 폴백 (하위호환)
 * - 'default' 세션은 기존 역할 키 단위 접근과 동일하게 동작한다.
 */
const DEFAULT_SESSION = 'default';

/**
 * 특정 세션의 초기 역할 상태 맵을 생성한다.
 * @param {string} sessionId - 세션 식별자
 * @returns {Record<string, object>} 역할 → 상태 맵
 */
function createSessionRoles(sessionId) {
    return Object.fromEntries(
        ROLES.map(r => [r.name, {
            role: r.label,
            status: 'idle',
            action: '',
            detail: '',
            tool: '',
            lastUpdate: Date.now(),
            sessionId,
            roleName: r.name
        }])
    );
}

// sessions: Map<sessionId, Record<roleName, state>>
// 최초에 default 세션만 존재한다.
const sessions = {
    [DEFAULT_SESSION]: createSessionRoles(DEFAULT_SESSION)
};

/**
 * 세션 내 역할 상태를 가져온다. 세션이 없으면 자동 생성한다.
 * @param {string} sessionId
 * @param {string} roleName
 * @returns {object} 상태 객체 참조
 */
function getOrCreateSessionRole(sessionId, roleName) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = createSessionRoles(sessionId);
        logger.info({ event: 'session_created', sessionId }, 'New session registered');
    }
    return sessions[sessionId][roleName];
}

/**
 * agentStates — 하위호환 뷰 (default 세션 역할 상태 직접 참조)
 * 기존 코드가 agentStates[role]로 접근하는 테스트·엔드포인트와 호환된다.
 */
const agentStates = sessions[DEFAULT_SESSION];

wss.on('connection', (ws) => {
    clients.add(ws);
    logger.info({ event: 'ws_connect', clientCount: wss.clients.size }, 'WS client connected');

    // 초기 상태 + 최근 활동 전송 — sessions 전체 포함 (P2-C)
    ws.send(JSON.stringify({
        type: 'init',
        agents: agentStates,
        sessions,
        activity: activityLog
    }));

    // P3: 현재 세션 접속 사용자 목록 전송 (신규 접속자가 기존 온라인 사용자를 즉시 인지)
    ws.send(JSON.stringify({ type: 'current-users', users: [...wsUserMap.values()] }));

    // P3: 클라이언트 → 서버 user-join 수신 (본인 MSAL 프로필로 세션 신분 등록)
    // 보안: profile에는 oid/email/displayName/color만 포함 — access token은 절대 전달·저장하지 않는다(신분 격리).
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'user-join' && msg.profile && msg.profile.oid) {
                const user = {
                    oid: msg.profile.oid,
                    email: (msg.profile.email || '').toLowerCase(),
                    displayName: msg.profile.displayName || '',
                    color: msg.profile.color || '#00B7C3',
                };
                wsUserMap.set(ws, user);
                const out = JSON.stringify({ type: 'user-joined', user });
                wss.clients.forEach(c => { if (c.readyState === 1) c.send(out); });
                logger.info({ event: 'user_join', oid: user.oid, displayName: user.displayName }, 'User joined session');
            }
        } catch (e) {
            logger.warn({ event: 'ws_message_parse_error', err: e.message }, 'WS message parse error');
        }
    });

    ws.on('close', () => {
        // P3: 세션 신분 등록된 사용자였다면 전원에게 퇴장 브로드캐스트
        const sessionUser = wsUserMap.get(ws);
        wsUserMap.delete(ws);
        clients.delete(ws);
        if (sessionUser) {
            const out = JSON.stringify({ type: 'user-left', oid: sessionUser.oid, email: sessionUser.email });
            wss.clients.forEach(c => { if (c.readyState === 1) c.send(out); });
            logger.info({ event: 'user_left', oid: sessionUser.oid, displayName: sessionUser.displayName }, 'User left session');
        } else {
            logger.info({ event: 'ws_disconnect', clientCount: wss.clients.size }, 'WS client disconnected');
        }
    });
});

// 도구 → 액션 매핑
function toolToAction(toolName) {
    const map = {
        'Read':      { action: 'reading',      label: '파일 읽는 중' },
        'Write':     { action: 'coding',       label: '코드 작성 중' },
        'Edit':      { action: 'coding',       label: '코드 수정 중' },
        'Bash':      { action: 'building',     label: '명령 실행 중' },
        'Grep':      { action: 'searching',    label: '검색 중' },
        'Glob':      { action: 'searching',    label: '파일 탐색 중' },
        'Agent':     { action: 'thinking',     label: '에이전트 호출 중' },
        'TodoWrite': { action: 'planning',     label: '작업 계획 중' },
        'WebSearch': { action: 'searching',    label: '웹 검색 중' },
        'WebFetch':  { action: 'reading',      label: '웹 조회 중' }
    };
    return map[toolName] || { action: 'working', label: toolName };
}

// 도구 → 역할 추론
function inferRole(toolName) {
    if (toolName === 'Bash') return 'devops';
    if (toolName === 'Grep' || toolName === 'Glob') return 'qa';
    if (toolName === 'TodoWrite') return 'pm';
    if (toolName === 'Agent') return 'leader';
    return 'developer';
}

// Hook 수신 엔드포인트 (Claude Code → 서버)
// P2-C: sessionId 포함 시 세션별 독립 상태 유지. 미포함 시 'default' 폴백 (하위호환).
// P4-B: requireLoopback — 루프백 외 주소에서 온 요청은 403 반환.
app.post('/hook/tool-use', requireLoopback, (req, res) => {
    const { tool, role, status, detail, params, event, sessionId, result } = req.body;
    const agentKey = (role || 'developer').toLowerCase();
    const sid = sessionId || DEFAULT_SESSION;

    // default 세션이면 기존 agentStates(하위호환 뷰)를 직접 갱신,
    // 나머지 세션은 getOrCreateSessionRole로 독립 상태 확보
    const sessionRoles = sid === DEFAULT_SESSION
        ? sessions[DEFAULT_SESSION]
        : (sessions[sid] || (sessions[sid] = createSessionRoles(sid)));

    if (!sessionRoles[agentKey] && !ROLE_NAMES.includes(agentKey)) {
        // 알 수 없는 역할은 무시 (하위호환: ok: true 유지)
        res.json({ ok: true });
        return;
    }

    if (sessionRoles[agentKey]) {
        const mapped = toolToAction(tool);
        sessionRoles[agentKey] = {
            ...sessionRoles[agentKey],
            status: status || 'working',
            action: mapped.action,
            detail: detail || mapped.label,
            tool: tool,
            params: params || {},
            event: event || '',
            sessionId: sid,
            roleName: agentKey,
            result: result || '',
            lastUpdate: Date.now()
        };

        // default 세션인 경우 agentStates 참조도 동기화
        if (sid === DEFAULT_SESSION) {
            sessions[DEFAULT_SESSION][agentKey] = sessionRoles[agentKey];
        }

        // 이벤트 카운터 갱신 — P4-B
        eventCount++;
        lastEventAt = new Date().toISOString();

        // 활동 로그에 추가 (PostToolUse 또는 단순 PreToolUse 모두 기록)
        const activityEntry = {
            ts: Date.now(),
            agent: agentKey,
            role: sessionRoles[agentKey].role,
            tool,
            event: event || '',
            detail: detail || mapped.label,
            params: params || {},
            result: result || '',
            sessionId: sid
        };
        pushActivity(activityEntry);

        // 모든 클라이언트에 브로드캐스트 — sessionId 포함 (P2-C)
        const message = JSON.stringify({
            type: 'agent-update',
            agent: agentKey,
            sessionId: sid,
            state: sessionRoles[agentKey],
            activity: activityEntry
        });

        logger.info({ event: 'hook_received', tool, role, sessionId: sid, status }, 'Hook received');

        clients.forEach(ws => {
            if (ws.readyState === 1) ws.send(message);
        });
        logger.debug({ event: 'broadcast', clientCount: wss.clients.size, role, sessionId: sid }, 'Broadcast sent');
    }

    res.json({ ok: true });
});

// 에이전트 idle 전환 (완료 시)
// P2-C: sessionId 포함 시 해당 세션의 역할만 idle 전환. 미포함 시 'default' 폴백 (하위호환).
// P4-B: requireLoopback — 루프백 외 주소에서 온 요청은 403 반환.
app.post('/hook/tool-done', requireLoopback, (req, res) => {
    const { role, allRoles, sessionId } = req.body;
    const sid = sessionId || DEFAULT_SESSION;
    const targetKeys = allRoles
        ? ROLE_NAMES
        : [(role || 'developer').toLowerCase()];

    logger.info({ event: 'tool_done', role, sessionId: sid, ts: Date.now() }, 'tool-done');

    // 대상 세션 결정:
    //  - sessionId 명시 → 그 세션만 (allRoles=true면 그 세션의 전 역할 idle) : 멀티유저 격리
    //  - sessionId 없고 allRoles=true → 전 세션 idle (레거시 하위호환)
    const targetSessions = (allRoles && !sessionId) ? Object.keys(sessions) : [sid];

    targetSessions.forEach(targetSid => {
        const sessionRoles = sessions[targetSid];
        if (!sessionRoles) return;

        targetKeys.forEach(agentKey => {
            if (!sessionRoles[agentKey]) return;
            sessionRoles[agentKey] = {
                ...sessionRoles[agentKey],
                status: 'idle',
                action: 'idle',
                detail: '대기 중',
                lastUpdate: Date.now()
            };

            const message = JSON.stringify({
                type: 'agent-update',
                agent: agentKey,
                sessionId: targetSid,
                state: sessionRoles[agentKey]
            });

            clients.forEach(ws => {
                if (ws.readyState === 1) ws.send(message);
            });
        });
    });

    res.json({ ok: true });
});

// 역할 목록 조회 (SSoT 제공) — P1-A: { roles: ROLES } 형태로 반환
app.get('/api/roles', (req, res) => res.json({ roles: ROLES }));

// 상태 조회 — P4-B 보강: uptime·connectedClients·eventCount·lastEventAt 포함
// 응답 구조:
//   { status, uptime, connectedClients, eventCount, lastEventAt,
//     agentStates,                              // default 세션 역할 상태 (하위호환)
//     sessions }                               // 전체 세션별 상태 (P2-C)
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        uptime: (Date.now() - SERVER_START) / 1000,
        connectedClients: wss.clients.size,
        eventCount,
        lastEventAt,
        agentStates,
        sessions
    });
});

// 개발 편의: 접속 중인 3D 클라이언트 전체 새로고침 + 작업 위치로 이동 (Claude Code 작업 완료 시 호출)
// body.goto(선택) = { map: 'office'|'jumpmap', x, z, y?, view?: { pos:[x,y,z], target:[x,y,z] } }
//   - jumpmap이면 좌표는 점프맵 로컬 기준(클라이언트가 JUMPMAP_ORIGIN 오프셋을 더함)
// 클라이언트는 goto를 sessionStorage에 저장하고 reload → 로드 후 아바타 준비되면 이동.
app.post('/api/dev/reload', requireLoopback, (req, res) => {
    broadcast({ type: 'dev-reload', goto: (req.body && req.body.goto) || null });
    res.json({ ok: true, clients: wss.clients.size });
});

// 데모 이벤트 (테스트용)
// P4-B: requireLoopback — 루프백 외 주소에서 온 요청은 403 반환.
app.post('/demo', requireLoopback, (req, res) => {
    const roles = ['developer', 'devops', 'qa'];
    const tools = ['Read', 'Edit', 'Bash', 'Grep', 'Write'];
    const role = roles[Math.floor(Math.random() * roles.length)];
    const tool = tools[Math.floor(Math.random() * tools.length)];

    const mapped = toolToAction(tool);
    agentStates[role] = {
        ...agentStates[role],
        status: 'working',
        action: mapped.action,
        detail: mapped.label,
        tool: tool,
        lastUpdate: Date.now()
    };

    const message = JSON.stringify({
        type: 'agent-update',
        agent: role,
        state: agentStates[role]
    });

    clients.forEach(ws => {
        if (ws.readyState === 1) ws.send(message);
    });

    // 3초 후 idle
    setTimeout(() => {
        agentStates[role].status = 'idle';
        agentStates[role].action = 'idle';
        agentStates[role].detail = '대기 중';

        const idleMsg = JSON.stringify({
            type: 'agent-update',
            agent: role,
            state: agentStates[role]
        });
        clients.forEach(ws => {
            if (ws.readyState === 1) ws.send(idleMsg);
        });
    }, 3000);

    res.json({ ok: true, role, tool });
});

// ── Auth 라우트 (P5-A: Device Code Flow) ─────────────────────────

/**
 * GET /auth/start
 * Device Code Flow를 시작한다.
 * 반환: { userCode, verificationUri, message }
 * 클라이언트는 verificationUri에서 userCode를 입력해 인증한다.
 */
app.get('/auth/start', async (req, res) => {
    try {
        const result = await getDeviceCodeUrl();
        logger.info({ event: 'auth_start', userCode: result.userCode }, 'Device Code Flow started');
        res.json({
            userCode:        result.userCode,
            verificationUri: result.verificationUri,
            message:         result.message,
        });
    } catch (err) {
        logger.error({ event: 'auth_start_error', err: err.message }, 'Device Code Flow failed');
        res.status(500).json({ error: 'auth_failed', reason: err.message });
    }
});

/**
 * GET /auth/status
 * 현재 인증 상태를 반환한다.
 * 반환: { authenticated: boolean, account: string|null }
 */
app.get('/auth/status', async (req, res) => {
    const status = await getAuthStatus();
    res.json(status);
});

// ── 조직 사용자 조회 API (조직 사용자 피커용) ─────────────────────
//
// 메타오피스(3D)에서 "조직에서 추가 (FORMATIONLABS)" 패널이 사용한다.
//   GET /api/org-users  → CTR 테넌트 내 formationlabs 조직 사용자 목록
//
// 조회 전용이므로 requireLoopback 제한을 두지 않는다(기존 /api/* 와 동일).
// 토큰이 없으면 401 { error: 'not_authenticated' }.
// 라이브 Graph 권한 부족 시 401/403이 올 수 있으며, 이는 graceful 처리한다.
// 이 호출은 User.Read.All 로 동작한다(현재 토큰에 이미 포함, 추가 권한 불필요).

const ORG_EMAIL_DOMAIN = '@formationlabs.co.kr';

/**
 * GET /api/org-users
 * Graph: GET /users?$select=displayName,mail,userPrincipalName,jobTitle&$top=999
 * 반환: [{ displayName, email, jobTitle }]  (displayName 오름차순)
 *   - mail 이 @formationlabs.co.kr 로 끝나는 사용자만 포함 (mail 비면 제외, 대소문자 무시)
 */
app.get('/api/org-users', async (req, res) => {
    const accessToken = await refreshTokenIfNeeded();
    if (!accessToken) {
        return res.status(401).json({ error: 'not_authenticated' });
    }
    try {
        // 전체 사용자 페이지네이션 수집 — @odata.nextLink 를 따라 모든 페이지 조회.
        // (테넌트 사용자가 999명을 넘으면 첫 페이지만 보던 기존 방식은 조직 사용자를 누락시킨다)
        let url = `${GRAPH_BASE}/users?$select=displayName,mail,userPrincipalName,jobTitle&$top=999`;
        let raw = [];
        let guard = 0;
        while (url && guard < 50) {
            const data = await graphGet(url, accessToken);
            raw = raw.concat(data.value || []);
            url = data['@odata.nextLink'] || null;   // 다음 페이지 링크(없으면 종료)
            guard++;                                  // 안전장치(최대 50페이지)
        }
        const users = raw
            .filter(u => u.mail && u.mail.toLowerCase().endsWith(ORG_EMAIL_DOMAIN))
            .map(u => ({
                displayName: u.displayName || '',
                email:       u.mail,
                jobTitle:    u.jobTitle || '',
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
        res.json(users);
    } catch (err) {
        const status = err.status || 500;
        logger.warn({ event: 'org_users_error', status, err: err.message }, 'GET /api/org-users failed');
        res.status(status).json({ error: 'graph_error', status, reason: err.message });
    }
});

// ── 로그인 사용자 프로필 (자동 아바타용) ─────────────────────────
//
// 로그인(Device Code) 후 프론트가 이 API로 본인 프로필을 받아, 조직 피커로 추가하지 않아도
// 자동으로 아바타(people)로 등록한다. Graph GET /me (User.Read 로 동작).

/** GET /api/me — 로그인 사용자 프로필 { displayName, email } */
app.get('/api/me', async (req, res) => {
    const accessToken = await refreshTokenIfNeeded();
    if (!accessToken) return res.status(401).json({ error: 'not_authenticated' });
    try {
        const u = await graphGet(`${GRAPH_BASE}/me?$select=displayName,mail,userPrincipalName`, accessToken);
        res.json({
            displayName: u.displayName || u.userPrincipalName || '',
            email:       u.mail || u.userPrincipalName || '',
        });
    } catch (err) {
        const status = err.status || 500;
        logger.warn({ event: 'me_error', status, err: err.message }, 'GET /api/me failed');
        res.status(status).json({ error: 'graph_error', status, reason: err.message });
    }
});

// ── 인앱 Teams 채팅 API (CHAT-01) ────────────────────────────────
//
// 3D 오피스 안에서 Teams 채팅 목록·읽기·전송을 제공한다(chatService 위임).
//   GET  /api/chats                     → 내 채팅방 목록
//   GET  /api/chats/:chatId/messages    → 채팅 메시지 읽기
//   POST /api/chats/:chatId/messages    → 메시지 전송 (requireLoopback)
//
// 관례: /api/org-users 와 동일 — refreshTokenIfNeeded 로 토큰 확보(없으면 401),
//       Graph 오류는 상태코드 그대로 전파. 조회는 제한 없음, 전송은 외부 비가역 호출이라 requireLoopback.

/**
 * 로그인 사용자 식별자(자기 자신 제외·isMine 판정용)를 토큰 캐시에서 얻는다.
 * @returns {{ id: string, username: string }}
 */
function getMe() {
    const acct = getTokenFromCache()?.account || {};
    return { id: acct.localAccountId || '', username: acct.username || '' };
}

/** GET /api/chats — 내 채팅방 목록 */
app.get('/api/chats', async (req, res) => {
    const accessToken = await refreshTokenIfNeeded();
    if (!accessToken) return res.status(401).json({ error: 'not_authenticated' });
    try {
        const chats = await listChats(accessToken, getMe());
        res.json(chats);
    } catch (err) {
        const status = err.status || 500;
        logger.warn({ event: 'chats_list_error', status, err: err.message }, 'GET /api/chats failed');
        res.status(status).json({ error: 'graph_error', status, reason: err.message });
    }
});

/** GET /api/chats/:chatId/messages — 채팅 메시지 읽기 (limit 기본 20·최대 50) */
app.get('/api/chats/:chatId/messages', async (req, res) => {
    const accessToken = await refreshTokenIfNeeded();
    if (!accessToken) return res.status(401).json({ error: 'not_authenticated' });
    try {
        const messages = await getMessages(accessToken, req.params.chatId, {
            limit: req.query.limit,
            myId: getMe().id,
        });
        res.json(messages);
    } catch (err) {
        const status = err.status || 500;
        logger.warn({ event: 'chat_messages_error', status, err: err.message }, 'GET /api/chats/:id/messages failed');
        res.status(status).json({ error: 'graph_error', status, reason: err.message });
    }
});

/** POST /api/chats/:chatId/messages — 메시지 전송 (requireLoopback) */
app.post('/api/chats/:chatId/messages', requireLoopback, async (req, res) => {
    const text = (req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'empty_message' });
    if (text.length > 4000) return res.status(400).json({ error: 'message_too_long' });

    const accessToken = await refreshTokenIfNeeded();
    if (!accessToken) return res.status(401).json({ error: 'not_authenticated' });
    try {
        const created = await sendMessage(accessToken, req.params.chatId, text);
        logger.info({ event: 'chat_message_sent', chatId: req.params.chatId }, 'Chat message sent');
        res.status(201).json(created);
    } catch (err) {
        const status = err.status || 500;
        logger.warn({ event: 'chat_send_error', status, err: err.message }, 'POST /api/chats/:id/messages failed');
        res.status(status).json({ error: 'graph_error', status, reason: err.message });
    }
});

// ── 사람 아바타 관리 API (P5-B) ──────────────────────────────────

// 저장 경로 — 기본은 data/people.json. 테스트는 PEOPLE_STORE 로 격리(실제 데이터 오염 방지).
const PEOPLE_PATH = process.env.PEOPLE_STORE || path.join(__dirname, 'data', 'people.json');

// 서버 시작 시 people.json 로드
function loadPeople() {
    try {
        if (!existsSync(PEOPLE_PATH)) return [];
        return JSON.parse(readFileSync(PEOPLE_PATH, 'utf8'));
    } catch {
        return [];
    }
}

function savePeople(people) {
    const dir = path.dirname(PEOPLE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(PEOPLE_PATH, JSON.stringify(people, null, 2), 'utf8');
}

function broadcastPeople(people) {
    const msg = JSON.stringify({ type: 'people-update', people });
    clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

// 실시간 위치 전송(스로틀 ~150ms) 시 PUT마다 people.json 디스크 저장은 과부하 →
// 디스크 저장만 디바운스(1s)하고 브로드캐스트는 즉시. 위치는 코스메틱이라 최대 1s 유실 허용.
// 구조 변경(POST/DELETE)은 기존대로 즉시 savePeople 유지.
let _savePeopleTimer = null;
function savePeopleDebounced(people) {
    if (_savePeopleTimer) clearTimeout(_savePeopleTimer);
    _savePeopleTimer = setTimeout(() => { _savePeopleTimer = null; savePeople(people); }, 1000);
}

// 성능: 위치 전용 PUT(실시간 이동, ~150ms)마다 전체 people 배열을 전파하면 직렬화·네트워크 부하가 큼.
// → 경량 델타 {id, position} 만 브로드캐스트. 구조 변경(name·avatarType 등)은 기존 broadcastPeople 유지.
function broadcastPosition(id, position) {
    const msg = JSON.stringify({ type: 'people-pos', id, position });
    clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

let people = loadPeople();

/** GET /api/people — 사람 목록 반환 */
app.get('/api/people', (req, res) => {
    res.json(people);
});

/** POST /api/people — 사람 추가 */
app.post('/api/people', (req, res) => {
    const { name, email, color = '#4A90E2', position = { x: 300, y: 200 } } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'name과 email은 필수입니다.' });
    }
    // 이메일 기준 중복 방지 — 재로그인 시 같은 사람 아바타가 중복 생성되지 않게 기존 항목 반환
    const emailKey = String(email).toLowerCase();
    const existing = people.find(p => (p.email || '').toLowerCase() === emailKey);
    if (existing) {
        existing.name = name || existing.name;
        if (color) existing.color = color;
        savePeople(people);
        broadcastPeople(people);
        logger.info({ event: 'person_reused', id: existing.id, email }, 'Person already exists — reused');
        return res.status(200).json(existing);
    }
    const person = {
        id:          randomUUID(),
        name,
        email,
        color,
        avatarIndex: people.length,
        position,
        teamsStatus: 'idle',
    };
    people.push(person);
    savePeople(people);
    broadcastPeople(people);
    logger.info({ event: 'person_added', id: person.id, name }, 'Person added');
    res.status(201).json(person);
});

/**
 * PUT /api/people/:id — 사람 정보 수정
 *
 * P5-D: 아바타 드래그 위치 영속화.
 * body.position({x,y} 또는 {x,y,z})을 포함하면 그대로 person에 병합·저장한다.
 * (스프레드 병합이므로 position이 전달되면 갱신, 누락되면 기존값 유지.)
 * 저장 후 people.json에 영속화하고 people-update로 전 클라이언트에 전파한다 →
 * 서버 재시작·재접속 후에도 드래그한 좌표가 유지된다.
 */
app.put('/api/people/:id', (req, res) => {
    const idx = people.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '사람을 찾을 수 없습니다.' });
    // id는 불변(클라이언트가 id를 보내도 기존 id 유지). position 등 나머지 필드는 병합.
    people[idx] = { ...people[idx], ...req.body, id: people[idx].id };
    // 위치만 바뀌는 잦은 PUT → 경량 델타 전파 + 디스크 저장 디바운스.
    // 그 외(avatarType·name·color 등) → 전체 people 전파 + 즉시 저장.
    const _keys = Object.keys(req.body || {});
    const _positionOnly = _keys.length > 0 && _keys.every(k => k === 'position' || k === 'id');
    if (_positionOnly) {
        broadcastPosition(people[idx].id, people[idx].position);
        savePeopleDebounced(people);
    } else {
        broadcastPeople(people);
        savePeople(people);
    }
    res.json(people[idx]);
});

/** DELETE /api/people/:id — 사람 삭제 */
app.delete('/api/people/:id', (req, res) => {
    const idx = people.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '사람을 찾을 수 없습니다.' });
    const removed = people.splice(idx, 1)[0];
    savePeople(people);
    broadcastPeople(people);
    logger.info({ event: 'person_deleted', id: removed.id }, 'Person deleted');
    res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// 텐퍼센트 커피 주문 (ORDER-01)
//  - 브라우저(사용자별)가 주문을 POST /api/orders 로 동기화(집계본을 서버 보관).
//  - 월요일(공휴일 제외) 스케줄: 09:00 알림 · 09:18 마감 · 09:20 MOM방 공유 · 10:00 clear.
//  - 서버 로컬 시간(KST 가정) 기준. 신분 격리 유지: MOM 전송은 서버 계정 토큰 사용.
// ══════════════════════════════════════════════════════════════════
const ORDERS_PATH = process.env.ORDERS_STORE || path.join(__dirname, 'data', 'orders.json');

function loadOrders() {
    try { if (!existsSync(ORDERS_PATH)) return []; return JSON.parse(readFileSync(ORDERS_PATH, 'utf8')); }
    catch { return []; }
}
function saveOrdersFile(list) {
    const dir = path.dirname(ORDERS_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(ORDERS_PATH, JSON.stringify(list, null, 2), 'utf8');
}
/** 전체 접속 클라이언트 브로드캐스트 */
function broadcast(msg) {
    const s = JSON.stringify(msg);
    clients.forEach(ws => { if (ws.readyState === 1) ws.send(s); });
}

let orders = loadOrders();   // [{ email, name, items:[{drink,temp,qty,option}], updatedAt }]

/** GET /api/orders — 전체 사용자 주문 집계 */
app.get('/api/orders', (req, res) => res.json(orders));

/** POST /api/orders — 본인 주문 upsert { email, name, items[] } */
app.post('/api/orders', (req, res) => {
    const { email, name, items } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email 필수' });
    const key = String(email).toLowerCase();
    const rec = { email, name: name || email, items: Array.isArray(items) ? items : [], updatedAt: new Date().toISOString() };
    const idx = orders.findIndex(o => (o.email || '').toLowerCase() === key);
    if (idx === -1) orders.push(rec); else orders[idx] = rec;
    saveOrdersFile(orders);
    res.json({ ok: true, users: orders.length });
});

/** 전체 주문 clear(내부 스케줄 + 수동 트리거 공용) */
function clearAllOrders() {
    orders = [];
    saveOrdersFile(orders);
    broadcast({ type: 'order-cleared' });
    logger.info({ event: 'orders_cleared' }, '주문 전체 clear');
}
/** POST /api/orders/clear — 수동 clear (loopback) */
app.post('/api/orders/clear', requireLoopback, (req, res) => { clearAllOrders(); res.json({ ok: true }); });

// ── 한국 공휴일(스케줄 제외) — 필요 시 매년 갱신 ──────────────────
const KR_HOLIDAYS = new Set([
    // 2026
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02',
    '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-08-17',
    '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
    // 2027
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01',
    '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16',
    '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04', '2027-10-09', '2027-10-11', '2027-12-25',
]);
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 주문 목록 → MOM 공유용 텍스트 */
function buildOrderMessage(list) {
    const lines = [`☕ 텐퍼센트 커피 주문 (${ymd(new Date())} 월요일)`, ''];
    let total = 0;
    for (const o of list) {
        lines.push(`● ${o.name}`);
        for (const it of o.items) {
            const qty = Number(it.qty) || 1;
            lines.push(`   - ${it.drink}/${it.temp}/${qty}잔/${it.option}`);
            total += qty;
        }
    }
    lines.push('', `합계 ${total}잔 · ${list.length}명`);
    return lines.join('\n');
}
/** 09:20 — 전체 주문을 취합해 MOM 채팅방에 한 메시지로 전송(서버 계정) */
async function shareOrdersToMOM() {
    const withItems = orders.filter(o => Array.isArray(o.items) && o.items.length);
    if (!withItems.length) { logger.info({ event: 'order_share_skip' }, 'MOM 공유 스킵 — 주문 없음'); return; }
    const token = await refreshTokenIfNeeded();
    if (!token) { logger.warn({ event: 'order_share_no_token' }, 'MOM 공유 실패 — 서버 토큰 없음'); return; }
    let chats;
    try { chats = await listChats(token, getMe()); }
    catch (e) { logger.warn({ event: 'order_share_list_error', err: e.message }, 'MOM 공유 실패 — 채팅 목록 조회 오류'); return; }
    const mom = chats.find(c => (c.title || '').toUpperCase().includes('MOM'));
    if (!mom) { logger.warn({ event: 'order_share_no_mom' }, 'MOM 공유 실패 — MOM 채팅방 없음'); return; }
    try {
        await sendMessage(token, mom.chatId, buildOrderMessage(withItems));
        logger.info({ event: 'order_shared', chatId: mom.chatId, users: withItems.length }, 'MOM 공유 완료');
    } catch (e) {
        logger.warn({ event: 'order_share_send_error', err: e.message }, 'MOM 전송 실패');
    }
}

// ── 월요일 스케줄러(공휴일 제외) — 30초마다 확인, 슬롯당 1회 ──────
const ORDER_SCHEDULE = [
    { hm: '09:00', run: () => broadcast({ type: 'order-reminder' }) },
    { hm: '09:18', run: () => broadcast({ type: 'order-deadline' }) },
    { hm: '09:20', run: () => { shareOrdersToMOM(); } },
    { hm: '10:00', run: () => clearAllOrders() },
];
const firedSlots = new Set();
function tickOrderSchedule() {
    const now = new Date();
    if (now.getDay() !== 1) return;                 // 월요일만
    const dateStr = ymd(now);
    if (KR_HOLIDAYS.has(dateStr)) return;           // 공휴일 제외
    const hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    for (const slot of ORDER_SCHEDULE) {
        if (slot.hm !== hm) continue;
        const key = `${dateStr} ${hm}`;
        if (firedSlots.has(key)) continue;          // 슬롯당 1회
        firedSlots.add(key);
        logger.info({ event: 'order_schedule_fire', slot: hm }, `주문 스케줄 실행: ${hm}`);
        try { slot.run(); } catch (e) { logger.warn({ event: 'order_schedule_error', err: e.message }, '스케줄 실행 오류'); }
    }
}
function startOrderScheduler() {
    setInterval(tickOrderSchedule, 30 * 1000);
    logger.info({ event: 'order_scheduler_started' }, '주문 스케줄러 시작(월 09:00·09:18·09:20·10:00, 공휴일 제외)');
}

// ══════════════════════════════════════════════════════════════════
// 테트리스 타워 순위 (TETRIS-RANK)
//  - 사람(email)별 최고 점수 1건만 보관(개인 최고 갱신 시에만 저장).
//  - 순위 = 점수 내림차순, 동점은 먼저 달성한 사람 우선.
//  - 최고가 갱신되면 tetris-ranking 브로드캐스트 → 3D 타워 순위판 실시간 갱신.
// ══════════════════════════════════════════════════════════════════
const TETRIS_PATH = process.env.TETRIS_STORE || path.join(__dirname, 'data', 'tetris-scores.json');

function loadTetrisScores() {
    try { if (!existsSync(TETRIS_PATH)) return []; return JSON.parse(readFileSync(TETRIS_PATH, 'utf8')); }
    catch { return []; }
}
function saveTetrisScores(list) {
    const dir = path.dirname(TETRIS_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(TETRIS_PATH, JSON.stringify(list, null, 2), 'utf8');
}

let tetrisScores = loadTetrisScores();   // [{ email, name, score, lines, level, updatedAt }]

/** 점수 내림차순(동점은 updatedAt 오름차순 = 먼저 달성한 사람 우선) 정렬 사본 */
function tetrisRanking() {
    return [...tetrisScores].sort((a, b) => (b.score - a.score) || String(a.updatedAt).localeCompare(String(b.updatedAt)));
}

/** GET /api/tetris/ranking — 전체 순위(점수 내림차순) */
app.get('/api/tetris/ranking', (req, res) => res.json({ ranking: tetrisRanking() }));

/** POST /api/tetris/score — 게임 종료 점수 제출 { email, name, score, lines, level }. 개인 최고만 반영 */
app.post('/api/tetris/score', (req, res) => {
    const { email, name, score, lines, level } = req.body || {};
    const sc = Math.floor(Number(score));
    if (!email || !Number.isFinite(sc) || sc <= 0) return res.status(400).json({ error: 'email과 양수 score는 필수입니다.' });
    const key = String(email).toLowerCase();
    let entry = tetrisScores.find(t => t.email === key);
    let improved = false;
    if (!entry) {
        entry = { email: key, name: name || key, score: sc, lines: Math.floor(Number(lines)) || 0, level: Math.floor(Number(level)) || 0, updatedAt: new Date().toISOString() };
        tetrisScores.push(entry);
        improved = true;
    } else {
        entry.name = name || entry.name;               // 표시 이름은 항상 최신으로
        if (sc > entry.score) {
            entry.score = sc;
            entry.lines = Math.floor(Number(lines)) || 0;
            entry.level = Math.floor(Number(level)) || 0;
            entry.updatedAt = new Date().toISOString();
            improved = true;
        }
    }
    const ranking = tetrisRanking();
    if (improved) {
        saveTetrisScores(tetrisScores);
        broadcast({ type: 'tetris-ranking', ranking });
        logger.info({ event: 'tetris_score', email: key, score: sc }, `테트리스 최고 점수 갱신: ${entry.name} ${sc}`);
    }
    const rank = ranking.findIndex(t => t.email === key) + 1;
    res.json({ ok: true, improved, best: entry.score, rank, total: ranking.length, ranking });
});

// ══════════════════════════════════════════════════════════════════
// 식단표 (MEALPLAN-01)
//  - SharePoint 주간식단표(.pptx) 첫 슬라이드를 Graph 썸네일로 받아 캐시(menu/mealPlan.js).
//  - 서버 시작 시 1회 + 평일 07:30 백그라운드 갱신(eTag 변경 시에만 재다운로드).
//  - 평일(공휴일 제외) 12:00 점심 전 알림(WS mealplan-reminder). 신분 격리: 서버 계정 토큰 사용.
//  - 폴백: 권한 미승인/실패 시 기존 캐시 유지. data/mealplan.img 수동 배치 시 그대로 서빙.
// ══════════════════════════════════════════════════════════════════

/** 식단표 이미지 갱신(파일 스코프 전용 토큰 사용). 실패해도 조용히 기존 캐시 유지 */
async function refreshMealPlanJob(reason) {
    const token = await getFileToken();   // Files.Read.All(관리자 동의 시 silent). 미동의 시 null → 폴백
    const r = await refreshMealPlan(token, (o, msg) => logger.info(o, msg || '식단표'));
    logger.info({ event: 'mealplan_refresh', reason, status: r.status, updated: r.updated }, `식단표 갱신(${reason}): ${r.status}`);
    if (r.updated) broadcast({ type: 'mealplan-updated' });
    return r;
}

/** GET /api/mealplan — 캐시 상태(갱신시각·소스·오류) */
app.get('/api/mealplan', (req, res) => res.json(getMealPlanStatus()));

/** GET /api/mealplan/image — 캐시된 식단표 이미지 서빙 */
app.get('/api/mealplan/image', (req, res) => {
    const img = readMealPlanImage();
    if (!img) return res.status(404).json({ error: 'no_image' });
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'no-cache');
    res.send(img.buffer);
});

/** POST /api/mealplan/refresh — 수동 갱신 트리거(읽기 전용·eTag 가드라 개방) */
app.post('/api/mealplan/refresh', async (req, res) => {
    const r = await refreshMealPlanJob('manual');
    res.json({ ok: true, ...r });
});

// ── 식단표 스케줄러(평일·공휴일 제외) — 30초마다 확인, 슬롯당 1회 ──
const MEALPLAN_SCHEDULE = [
    { hm: '07:30', run: () => { refreshMealPlanJob('daily'); } },        // 백그라운드 갱신(알림 없음)
    { hm: '12:00', run: () => broadcast({ type: 'mealplan-reminder' }) }, // 점심 전 알림
];
const mpFiredSlots = new Set();
function tickMealPlanSchedule() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return;             // 평일만(일=0, 토=6 제외)
    const dateStr = ymd(now);
    if (KR_HOLIDAYS.has(dateStr)) return;           // 공휴일 제외
    const hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    for (const slot of MEALPLAN_SCHEDULE) {
        if (slot.hm !== hm) continue;
        const key = `${dateStr} ${hm}`;
        if (mpFiredSlots.has(key)) continue;        // 슬롯당 1회
        mpFiredSlots.add(key);
        logger.info({ event: 'mealplan_schedule_fire', slot: hm }, `식단표 스케줄 실행: ${hm}`);
        try { slot.run(); } catch (e) { logger.warn({ event: 'mealplan_schedule_error', err: e.message }, '식단표 스케줄 오류'); }
    }
}
function startMealPlanScheduler() {
    setInterval(tickMealPlanSchedule, 30 * 1000);
    refreshMealPlanJob('startup');   // 시작 시 1회 갱신(토큰 없으면 조용히 스킵)
    logger.info({ event: 'mealplan_scheduler_started' }, '식단표 스케줄러 시작(평일 07:30 갱신·12:00 알림, 공휴일 제외)');
}

const PORT = 3300;

// 직접 실행 시에만 포트 바인딩 (테스트에서는 바인딩 없이 import 가능)
if (process.argv[1] === __filename) {
    server.listen(PORT, () => {
        logger.info({ event: 'server_start', port: PORT }, 'Server started');
        // P5-C: Teams 폴링 시작 (토큰 없으면 조용히 대기)
        startPolling({
            getPeople: () => people,
            broadcast: (msg) => clients.forEach(ws => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }),
        });
        // ORDER-01: 텐퍼센트 커피 주문 월요일 스케줄러 시작
        startOrderScheduler();
        // MEALPLAN-01: 2F 식당 식단표 스케줄러 시작(시작 시 1회 갱신 포함)
        startMealPlanScheduler();
    });
}

export { app, server, agentStates, sessions, DEFAULT_SESSION, createSessionRoles, activityLog, toolToAction, inferRole, pushActivity, ACTIVITY_LIMIT, eventCount, lastEventAt, requireLoopback, SERVER_START, LOOPBACK_ADDRS, people, broadcastPeople, wsUserMap };
