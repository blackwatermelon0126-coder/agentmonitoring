import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { ROLES, ROLE_NAMES } from './shared/roles.js';
import { loadRecentEntries, appendEntry, ACTIVITY_LIMIT as _ACTIVITY_LIMIT } from './activity-log.js';

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
// /api/status, /api/roles, /2d, /3d 는 제한 없음.
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

// 정적 파일 서빙 (2D/3D 클라이언트)
app.use('/2d', express.static(path.join(__dirname, '..', 'phaser2d')));
app.use('/3d', express.static(path.join(__dirname, '..', 'three3d')));
app.use('/3d/libs/three', express.static(path.join(__dirname, '..', 'three3d', 'node_modules', 'three')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 연결된 클라이언트 목록
const clients = new Set();

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

    ws.on('close', () => {
        clients.delete(ws);
        logger.info({ event: 'ws_disconnect', clientCount: wss.clients.size }, 'WS client disconnected');
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

    // 대상 세션 결정: allRoles=true 이면 모든 세션의 해당 역할을 idle로 전환
    const targetSessions = allRoles ? Object.keys(sessions) : [sid];

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

const PORT = 3300;

// 직접 실행 시에만 포트 바인딩 (테스트에서는 바인딩 없이 import 가능)
if (process.argv[1] === __filename) {
    server.listen(PORT, () => {
        logger.info({ event: 'server_start', port: PORT }, 'Server started');
    });
}

export { app, server, agentStates, sessions, DEFAULT_SESSION, createSessionRoles, activityLog, toolToAction, inferRole, pushActivity, ACTIVITY_LIMIT };
