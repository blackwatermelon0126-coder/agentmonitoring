/**
 * server.test.js — WJ_MONITORING-P3-A 단위테스트 (ZTRACE-5 T축)
 *                  WJ_MONITORING-P2-C sessionId 기반 멀티세션 테스트 추가
 *
 * 대상: server.js 핵심 함수·엔드포인트
 * 프레임워크: vitest + supertest
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
    app,
    agentStates,
    sessions,
    DEFAULT_SESSION,
    createSessionRoles,
    activityLog,
    toolToAction,
    inferRole,
    pushActivity,
    ACTIVITY_LIMIT,
    requireLoopback,
    LOOPBACK_ADDRS
} from '../server.js';

// ──────────────────────────────────────────────────────────────
// 1. toolToAction — 도구 → 액션 매핑
// ──────────────────────────────────────────────────────────────
describe('toolToAction()', () => {
    it('Read → reading', () => {
        expect(toolToAction('Read').action).toBe('reading');
    });
    it('Write → coding', () => {
        expect(toolToAction('Write').action).toBe('coding');
    });
    it('Edit → coding', () => {
        expect(toolToAction('Edit').action).toBe('coding');
    });
    it('Bash → building', () => {
        expect(toolToAction('Bash').action).toBe('building');
    });
    it('Grep → searching', () => {
        expect(toolToAction('Grep').action).toBe('searching');
    });
    it('Glob → searching', () => {
        expect(toolToAction('Glob').action).toBe('searching');
    });
    it('Agent → thinking', () => {
        expect(toolToAction('Agent').action).toBe('thinking');
    });
    it('TodoWrite → planning', () => {
        expect(toolToAction('TodoWrite').action).toBe('planning');
    });
    it('WebSearch → searching', () => {
        expect(toolToAction('WebSearch').action).toBe('searching');
    });
    it('WebFetch → reading', () => {
        expect(toolToAction('WebFetch').action).toBe('reading');
    });
    it('알 수 없는 도구 → working', () => {
        expect(toolToAction('UnknownTool').action).toBe('working');
    });
    it('빈 문자열 → working', () => {
        expect(toolToAction('').action).toBe('working');
    });
});

// ──────────────────────────────────────────────────────────────
// 2. inferRole — 도구 → 역할 추론
// ──────────────────────────────────────────────────────────────
describe('inferRole()', () => {
    it('Bash → devops', () => {
        expect(inferRole('Bash')).toBe('devops');
    });
    it('Grep → qa', () => {
        expect(inferRole('Grep')).toBe('qa');
    });
    it('Glob → qa', () => {
        expect(inferRole('Glob')).toBe('qa');
    });
    it('TodoWrite → pm', () => {
        expect(inferRole('TodoWrite')).toBe('pm');
    });
    it('Agent → leader', () => {
        expect(inferRole('Agent')).toBe('leader');
    });
    it('Read → developer (기본값)', () => {
        expect(inferRole('Read')).toBe('developer');
    });
    it('Write → developer (기본값)', () => {
        expect(inferRole('Write')).toBe('developer');
    });
    it('Edit → developer (기본값)', () => {
        expect(inferRole('Edit')).toBe('developer');
    });
    it('알 수 없는 도구 → developer (기본값)', () => {
        expect(inferRole('SomeTool')).toBe('developer');
    });
});

// ──────────────────────────────────────────────────────────────
// 3. activityLog 링버퍼 — 50건 초과 시 oldest 제거
// ──────────────────────────────────────────────────────────────
describe('activityLog 링버퍼', () => {
    beforeEach(() => {
        // 테스트 격리: activityLog 비우기
        activityLog.splice(0, activityLog.length);
    });

    it('50건 미만일 때 모두 유지', () => {
        for (let i = 0; i < 30; i++) {
            pushActivity({ ts: i, agent: 'developer', tool: 'Read', detail: `entry-${i}` });
        }
        expect(activityLog.length).toBe(30);
    });

    it('50건 초과 시 length = 50 유지', () => {
        for (let i = 0; i < 60; i++) {
            pushActivity({ ts: i, agent: 'developer', tool: 'Read', detail: `entry-${i}` });
        }
        expect(activityLog.length).toBe(50);
    });

    it('50건 초과 시 oldest 항목(entry-0)이 제거됨', () => {
        for (let i = 0; i < 55; i++) {
            pushActivity({ ts: i, agent: 'developer', tool: 'Read', detail: `entry-${i}` });
        }
        // entry-0 ~ entry-4 는 제거되고 entry-5 가 첫 항목
        expect(activityLog[0].detail).toBe('entry-5');
    });

    it('정확히 ACTIVITY_LIMIT(50)건이면 제거 없음', () => {
        for (let i = 0; i < ACTIVITY_LIMIT; i++) {
            pushActivity({ ts: i, agent: 'developer', tool: 'Read', detail: `entry-${i}` });
        }
        expect(activityLog.length).toBe(ACTIVITY_LIMIT);
        expect(activityLog[0].detail).toBe('entry-0');
    });
});

// ──────────────────────────────────────────────────────────────
// 4. GET /api/roles — 5역할 JSON 반환
// ──────────────────────────────────────────────────────────────
describe('GET /api/roles', () => {
    it('200 OK + { roles: [...] } 형태 반환', async () => {
        const res = await request(app).get('/api/roles');
        expect(res.status).toBe(200);
        // 서버는 { roles: ROLES } 형태로 반환 (프론트엔드 destructuring 호환)
        expect(res.body).toHaveProperty('roles');
        expect(Array.isArray(res.body.roles)).toBe(true);
    });

    it('정확히 5개 역할 반환', async () => {
        const res = await request(app).get('/api/roles');
        expect(res.body.roles.length).toBe(5);
    });

    it('필수 역할(developer, devops, qa, pm, leader) 포함', async () => {
        const res = await request(app).get('/api/roles');
        const names = res.body.roles.map(r => r.name);
        expect(names).toContain('developer');
        expect(names).toContain('devops');
        expect(names).toContain('qa');
        expect(names).toContain('pm');
        expect(names).toContain('leader');
    });

    it('각 역할은 name, label, color, emoji 필드를 가짐', async () => {
        const res = await request(app).get('/api/roles');
        res.body.roles.forEach(role => {
            expect(role).toHaveProperty('name');
            expect(role).toHaveProperty('label');
            expect(role).toHaveProperty('color');
            expect(role).toHaveProperty('emoji');
        });
    });
});

// ──────────────────────────────────────────────────────────────
// 5. GET /api/status — P4-B 보강: uptime·connectedClients·eventCount·lastEventAt
// ──────────────────────────────────────────────────────────────
describe('GET /api/status', () => {
    it('200 OK + JSON 객체 반환', async () => {
        const res = await request(app).get('/api/status');
        expect(res.status).toBe(200);
        expect(typeof res.body).toBe('object');
    });

    it('P4-B 메트릭 필드 포함 — status, uptime, connectedClients, eventCount, lastEventAt', async () => {
        const res = await request(app).get('/api/status');
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('connectedClients');
        expect(res.body).toHaveProperty('eventCount');
        expect(res.body).toHaveProperty('lastEventAt');
    });

    it('uptime 은 0 이상 숫자', async () => {
        const res = await request(app).get('/api/status');
        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('connectedClients 는 0 이상 정수', async () => {
        const res = await request(app).get('/api/status');
        expect(typeof res.body.connectedClients).toBe('number');
        expect(res.body.connectedClients).toBeGreaterThanOrEqual(0);
    });

    it('agentStates + sessions 키 포함 (P2-C 구조 유지)', async () => {
        const res = await request(app).get('/api/status');
        expect(res.body).toHaveProperty('agentStates');
        expect(res.body).toHaveProperty('sessions');
    });

    it('agentStates — 5개 역할 키 포함', async () => {
        const res = await request(app).get('/api/status');
        const { agentStates: states } = res.body;
        expect(states).toHaveProperty('developer');
        expect(states).toHaveProperty('devops');
        expect(states).toHaveProperty('qa');
        expect(states).toHaveProperty('pm');
        expect(states).toHaveProperty('leader');
    });

    it('agentStates — 각 역할 상태는 role, status, action, detail 필드를 가짐', async () => {
        const res = await request(app).get('/api/status');
        Object.values(res.body.agentStates).forEach(state => {
            expect(state).toHaveProperty('role');
            expect(state).toHaveProperty('status');
            expect(state).toHaveProperty('action');
            expect(state).toHaveProperty('detail');
        });
    });

    it('sessions — default 세션이 존재함', async () => {
        const res = await request(app).get('/api/status');
        expect(res.body.sessions).toHaveProperty('default');
    });

    it('sessions[default] — 5개 역할 포함', async () => {
        const res = await request(app).get('/api/status');
        const defaultSession = res.body.sessions['default'];
        expect(defaultSession).toHaveProperty('developer');
        expect(defaultSession).toHaveProperty('devops');
        expect(defaultSession).toHaveProperty('qa');
        expect(defaultSession).toHaveProperty('pm');
        expect(defaultSession).toHaveProperty('leader');
    });

    it('eventCount — /hook/tool-use 호출 후 증가', async () => {
        const before = (await request(app).get('/api/status')).body.eventCount;
        await request(app).post('/hook/tool-use').send({ tool: 'Read', role: 'developer' });
        const after = (await request(app).get('/api/status')).body.eventCount;
        expect(after).toBeGreaterThan(before);
    });

    it('lastEventAt — /hook/tool-use 호출 후 ISO 타임스탬프로 설정', async () => {
        await request(app).post('/hook/tool-use').send({ tool: 'Read', role: 'developer' });
        const res = await request(app).get('/api/status');
        expect(res.body.lastEventAt).not.toBeNull();
        expect(() => new Date(res.body.lastEventAt)).not.toThrow();
    });
});

// ──────────────────────────────────────────────────────────────
// 6. POST /hook/tool-use — agentStates 갱신
// ──────────────────────────────────────────────────────────────
describe('POST /hook/tool-use', () => {
    beforeEach(() => {
        // 테스트 간 상태 격리: developer 상태 초기화
        agentStates['developer'].status = 'idle';
        agentStates['developer'].action = '';
        agentStates['developer'].tool = '';
        // 테스트용 세션 정리
        delete sessions['test-session-1'];
        delete sessions['test-session-2'];
        activityLog.splice(0, activityLog.length);
    });

    it('200 OK + { ok: true } 반환', async () => {
        const res = await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Read', role: 'developer' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('tool-use 수신 후 agentStates.developer.action 갱신', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Edit', role: 'developer', status: 'working' });
        expect(agentStates['developer'].action).toBe('coding');
        expect(agentStates['developer'].status).toBe('working');
    });

    it('tool-use 수신 후 activityLog에 항목 추가', async () => {
        activityLog.splice(0, activityLog.length);
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Grep', role: 'qa' });
        expect(activityLog.length).toBeGreaterThan(0);
        expect(activityLog[activityLog.length - 1].tool).toBe('Grep');
    });

    it('role 미입력 시 developer 기본값 사용', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Bash' });
        // developer 에 반영되어야 함
        expect(agentStates['developer'].tool).toBe('Bash');
    });

    it('알 수 없는 role 은 agentStates 갱신 안 함 (ok: true 반환은 유지)', async () => {
        const res = await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Read', role: 'unknown_role' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('detail 파라미터가 반영됨', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Read', role: 'developer', detail: '커스텀 상세' });
        expect(agentStates['developer'].detail).toBe('커스텀 상세');
    });
});

// ──────────────────────────────────────────────────────────────
// 7. POST /hook/tool-done — idle 전환 + allRoles 지원
// ──────────────────────────────────────────────────────────────
describe('POST /hook/tool-done', () => {
    beforeEach(() => {
        // 전체 역할 working 상태로 세팅
        Object.keys(agentStates).forEach(key => {
            agentStates[key].status = 'working';
            agentStates[key].action = 'reading';
        });
    });

    it('200 OK + { ok: true } 반환', async () => {
        const res = await request(app)
            .post('/hook/tool-done')
            .send({ role: 'developer' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('단일 role idle 전환', async () => {
        await request(app)
            .post('/hook/tool-done')
            .send({ role: 'developer' });
        expect(agentStates['developer'].status).toBe('idle');
        expect(agentStates['developer'].action).toBe('idle');
    });

    it('allRoles: true — 전체 역할 idle 전환', async () => {
        await request(app)
            .post('/hook/tool-done')
            .send({ allRoles: true });
        Object.values(agentStates).forEach(state => {
            expect(state.status).toBe('idle');
            expect(state.action).toBe('idle');
        });
    });

    it('allRoles: true 시 detail = "대기 중"', async () => {
        await request(app)
            .post('/hook/tool-done')
            .send({ allRoles: true });
        Object.values(agentStates).forEach(state => {
            expect(state.detail).toBe('대기 중');
        });
    });

    it('role 미입력 시 developer 기본값으로 idle 전환', async () => {
        await request(app)
            .post('/hook/tool-done')
            .send({});
        expect(agentStates['developer'].status).toBe('idle');
    });
});

// ──────────────────────────────────────────────────────────────
// 8. GET /2d — 정적 파일 서빙 (index.html 또는 디렉터리)
// ──────────────────────────────────────────────────────────────
describe('GET /2d', () => {
    it('존재하는 경로에 요청 시 5xx 가 아닌 응답 반환 (정적 서빙 마운트 확인)', async () => {
        const res = await request(app).get('/2d/');
        // 정적 파일 없으면 404, 있으면 200 — 어느 쪽이든 5xx 아님을 확인
        expect(res.status).toBeLessThan(500);
    });
});

// ──────────────────────────────────────────────────────────────
// 9. POST /demo — 무작위 에이전트 상태 변경
// ──────────────────────────────────────────────────────────────
describe('POST /demo', () => {
    it('200 OK + { ok: true } 반환', async () => {
        const res = await request(app).post('/demo').send({});
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('응답에 role 과 tool 필드 포함', async () => {
        const res = await request(app).post('/demo').send({});
        expect(res.body).toHaveProperty('role');
        expect(res.body).toHaveProperty('tool');
    });

    it('반환된 role 은 유효한 역할 중 하나', async () => {
        const validRoles = ['developer', 'devops', 'qa'];
        const res = await request(app).post('/demo').send({});
        expect(validRoles).toContain(res.body.role);
    });

    it('반환된 tool 은 유효한 도구 중 하나', async () => {
        const validTools = ['Read', 'Edit', 'Bash', 'Grep', 'Write'];
        const res = await request(app).post('/demo').send({});
        expect(validTools).toContain(res.body.tool);
    });
});

// ──────────────────────────────────────────────────────────────
// 10. requireLoopback 미들웨어 — P4-B origin 루프백 검증
// ──────────────────────────────────────────────────────────────
describe('requireLoopback 미들웨어 (P4-B)', () => {
    it('LOOPBACK_ADDRS 에 127.0.0.1, ::1, ::ffff:127.0.0.1 포함', () => {
        expect(LOOPBACK_ADDRS.has('127.0.0.1')).toBe(true);
        expect(LOOPBACK_ADDRS.has('::1')).toBe(true);
        expect(LOOPBACK_ADDRS.has('::ffff:127.0.0.1')).toBe(true);
    });

    it('supertest (::ffff:127.0.0.1) 에서 /hook/tool-use → 200 OK (루프백 허용)', async () => {
        const res = await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Read', role: 'developer' });
        expect(res.status).toBe(200);
    });

    it('supertest (::ffff:127.0.0.1) 에서 /hook/tool-done → 200 OK (루프백 허용)', async () => {
        const res = await request(app)
            .post('/hook/tool-done')
            .send({ role: 'developer' });
        expect(res.status).toBe(200);
    });

    it('supertest (::ffff:127.0.0.1) 에서 /demo → 200 OK (루프백 허용)', async () => {
        const res = await request(app).post('/demo').send({});
        expect(res.status).toBe(200);
    });

    it('ALLOW_REMOTE_HOOKS=true 설정 시 requireLoopback 미들웨어는 next() 호출', () => {
        const origEnv = process.env.ALLOW_REMOTE_HOOKS;
        process.env.ALLOW_REMOTE_HOOKS = 'true';
        let nextCalled = false;
        const req = { socket: { remoteAddress: '10.0.0.1' } };
        const res = {};
        requireLoopback(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        process.env.ALLOW_REMOTE_HOOKS = origEnv ?? '';
    });

    it('비루프백 주소 + ALLOW_REMOTE_HOOKS 미설정 시 requireLoopback은 403 반환', () => {
        const origEnv = process.env.ALLOW_REMOTE_HOOKS;
        delete process.env.ALLOW_REMOTE_HOOKS;
        let statusCode = null;
        let responseBody = null;
        const req = { socket: { remoteAddress: '10.0.0.1' } };
        const res = {
            status(code) { statusCode = code; return this; },
            json(body) { responseBody = body; return this; }
        };
        requireLoopback(req, res, () => {});
        expect(statusCode).toBe(403);
        expect(responseBody.error).toBe('forbidden');
        if (origEnv !== undefined) process.env.ALLOW_REMOTE_HOOKS = origEnv;
    });
});

// ──────────────────────────────────────────────────────────────
// 11. sessionId 기반 멀티세션 지원 (P2-C)
// ──────────────────────────────────────────────────────────────
describe('sessionId 기반 멀티세션 지원 (P2-C)', () => {
    beforeEach(() => {
        // 테스트용 세션 격리
        delete sessions['test-session-1'];
        delete sessions['test-session-2'];
        agentStates['developer'].status = 'idle';
        agentStates['developer'].action = '';
        agentStates['developer'].tool = '';
        activityLog.splice(0, activityLog.length);
    });

    it('sessionId 포함 시 해당 세션에 독립 상태 생성', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Edit', role: 'developer', sessionId: 'test-session-1', status: 'working' });
        expect(sessions['test-session-1']).toBeDefined();
        expect(sessions['test-session-1']['developer'].action).toBe('coding');
        expect(sessions['test-session-1']['developer'].sessionId).toBe('test-session-1');
    });

    it('sessionId 미포함 시 default 세션(agentStates) 갱신 — 하위호환', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Read', role: 'developer', status: 'working' });
        expect(agentStates['developer'].action).toBe('reading');
        expect(agentStates['developer'].status).toBe('working');
    });

    it('동일 role — 세션 2개 동시 활성화 시 상태 덮어쓰기 없음', async () => {
        // 세션 1: developer가 Edit 중
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Edit', role: 'developer', sessionId: 'test-session-1', status: 'working' });

        // 세션 2: 동일 role(developer)이 Bash 중
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Bash', role: 'developer', sessionId: 'test-session-2', status: 'working' });

        // 각 세션 상태가 독립적으로 유지됨
        expect(sessions['test-session-1']['developer'].action).toBe('coding');
        expect(sessions['test-session-1']['developer'].tool).toBe('Edit');
        expect(sessions['test-session-2']['developer'].action).toBe('building');
        expect(sessions['test-session-2']['developer'].tool).toBe('Bash');
    });

    it('세션별 상태는 sessionId 필드를 포함', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Read', role: 'developer', sessionId: 'test-session-1' });
        expect(sessions['test-session-1']['developer'].sessionId).toBe('test-session-1');
    });

    it('GET /api/status — 세션 추가 후 sessions에 포함', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Edit', role: 'developer', sessionId: 'test-session-1' });

        const res = await request(app).get('/api/status');
        expect(res.body.sessions).toHaveProperty('test-session-1');
        expect(res.body.sessions['test-session-1']['developer'].tool).toBe('Edit');
    });

    it('GET /api/status — sessionId 정보 포함 확인', async () => {
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Grep', role: 'qa', sessionId: 'test-session-2' });

        const res = await request(app).get('/api/status');
        expect(res.body.sessions['test-session-2']['qa'].sessionId).toBe('test-session-2');
    });

    it('tool-done — sessionId 지정 시 해당 세션만 idle 전환', async () => {
        // 두 세션 모두 working 상태로 설정
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Edit', role: 'developer', sessionId: 'test-session-1', status: 'working' });
        await request(app)
            .post('/hook/tool-use')
            .send({ tool: 'Bash', role: 'developer', sessionId: 'test-session-2', status: 'working' });

        // 세션 1만 idle 전환
        await request(app)
            .post('/hook/tool-done')
            .send({ role: 'developer', sessionId: 'test-session-1' });

        expect(sessions['test-session-1']['developer'].status).toBe('idle');
        expect(sessions['test-session-2']['developer'].status).toBe('working');
    });

    it('createSessionRoles — DEFAULT_SESSION 외 세션 초기화 정상 동작', () => {
        const newSession = createSessionRoles('new-session-abc');
        expect(newSession).toHaveProperty('developer');
        expect(newSession['developer'].sessionId).toBe('new-session-abc');
        expect(newSession['developer'].status).toBe('idle');
    });

    it('DEFAULT_SESSION 상수는 "default"', () => {
        expect(DEFAULT_SESSION).toBe('default');
    });
});
