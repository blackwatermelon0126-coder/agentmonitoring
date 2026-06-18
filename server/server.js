import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { ROLES, ROLE_NAMES } from './shared/roles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();
app.use(express.json());

// 정적 파일 서빙 (2D/3D 클라이언트)
app.use('/2d', express.static(path.join(__dirname, '..', 'phaser2d')));
app.use('/3d', express.static(path.join(__dirname, '..', 'three3d')));
app.use('/3d/libs/three', express.static(path.join(__dirname, '..', 'three3d', 'node_modules', 'three')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 연결된 클라이언트 목록
const clients = new Set();

// 최근 활동 로그 (카드뷰 피드용, 최대 50개)
const ACTIVITY_LIMIT = 50;
const activityLog = [];

function pushActivity(entry) {
    activityLog.push(entry);
    if (activityLog.length > ACTIVITY_LIMIT) activityLog.shift();
}

// 에이전트 상태 관리 — ROLE_NAMES(SSoT) 기반 초기화
const agentStates = Object.fromEntries(
    ROLES.map(r => [r.name, { role: r.label, status: 'idle', action: '', detail: '', lastUpdate: Date.now() }])
);

wss.on('connection', (ws) => {
    clients.add(ws);
    logger.info({ event: 'ws_connect', clientCount: wss.clients.size }, 'WS client connected');

    // 초기 상태 + 최근 활동 전송
    ws.send(JSON.stringify({
        type: 'init',
        agents: agentStates,
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
app.post('/hook/tool-use', (req, res) => {
    const { tool, role, status, detail, params, event, sessionId, result } = req.body;
    const agentKey = (role || 'developer').toLowerCase();

    if (agentStates[agentKey]) {
        const mapped = toolToAction(tool);
        agentStates[agentKey] = {
            ...agentStates[agentKey],
            status: status || 'working',
            action: mapped.action,
            detail: detail || mapped.label,
            tool: tool,
            params: params || {},
            event: event || '',
            sessionId: sessionId || '',
            result: result || '',
            lastUpdate: Date.now()
        };

        // 활동 로그에 추가 (PostToolUse 또는 단순 PreToolUse 모두 기록)
        const activityEntry = {
            ts: Date.now(),
            agent: agentKey,
            role: agentStates[agentKey].role,
            tool,
            event: event || '',
            detail: detail || mapped.label,
            params: params || {},
            result: result || ''
        };
        pushActivity(activityEntry);

        // 모든 클라이언트에 브로드캐스트
        const message = JSON.stringify({
            type: 'agent-update',
            agent: agentKey,
            state: agentStates[agentKey],
            activity: activityEntry
        });

        logger.info({ event: 'hook_received', tool, role, sessionId, status }, 'Hook received');

        clients.forEach(ws => {
            if (ws.readyState === 1) ws.send(message);
        });
        logger.debug({ event: 'broadcast', clientCount: wss.clients.size, role }, 'Broadcast sent');
    }

    res.json({ ok: true });
});

// 에이전트 idle 전환 (완료 시)
app.post('/hook/tool-done', (req, res) => {
    const { role, allRoles } = req.body;
    const targetKeys = allRoles
        ? ROLE_NAMES
        : [(role || 'developer').toLowerCase()];

    targetKeys.forEach(agentKey => {
        if (!agentStates[agentKey]) return;
        agentStates[agentKey] = {
            ...agentStates[agentKey],
            status: 'idle',
            action: 'idle',
            detail: '대기 중',
            lastUpdate: Date.now()
        };

        const message = JSON.stringify({
            type: 'agent-update',
            agent: agentKey,
            state: agentStates[agentKey]
        });

        clients.forEach(ws => {
            if (ws.readyState === 1) ws.send(message);
        });
    });

    res.json({ ok: true });
});

// 역할 목록 조회 (SSoT 제공)
app.get('/api/roles', (req, res) => res.json(ROLES));

// 상태 조회
app.get('/api/status', (req, res) => {
    res.json(agentStates);
});

// 데모 이벤트 (테스트용)
app.post('/demo', (req, res) => {
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

export { app, server, agentStates, activityLog, toolToAction, inferRole, pushActivity, ACTIVITY_LIMIT };
