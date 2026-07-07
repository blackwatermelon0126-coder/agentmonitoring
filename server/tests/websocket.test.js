/**
 * websocket.test.js — WJ_MONITORING-P3-B WebSocket 브로드캐스트 통합테스트 (ZTRACE-5 T축)
 *
 * 대상: server.js WebSocket 브로드캐스트 동작
 * 프레임워크: vitest + ws 패키지 (실제 WS 연결, mock 미사용)
 */
import http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { server } from '../server.js';

// ──────────────────────────────────────────────────────────────
// 테스트 헬퍼
// ──────────────────────────────────────────────────────────────

/**
 * ws 클라이언트를 생성하여 open까지 대기한다.
 * 수신 메시지를 내부 큐에 버퍼링하므로 open 직후 도착하는 init 메시지도 유실 없이 수신 가능하다.
 *
 * 반환 객체:
 *   - ws: WebSocket 인스턴스
 *   - nextMsg(timeout?): 다음 메시지(파싱된 객체) 반환 Promise
 *   - close(): 연결 종료 Promise
 *
 * @param {string} url WebSocket 서버 URL
 */
function createWsClient(url) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);

        // 메시지 큐 및 대기 중인 waiter
        const queue = [];
        const waiters = [];

        ws.on('message', (data) => {
            const parsed = JSON.parse(data.toString());
            if (waiters.length > 0) {
                const { resolve: res, timer } = waiters.shift();
                clearTimeout(timer);
                res(parsed);
            } else {
                queue.push(parsed);
            }
        });

        ws.once('error', reject);

        ws.once('open', () => {
            const client = {
                ws,

                /** 다음 메시지를 반환한다. 큐에 이미 있으면 즉시 반환. */
                nextMsg(timeout = 3000) {
                    if (queue.length > 0) {
                        return Promise.resolve(queue.shift());
                    }
                    return new Promise((res, rej) => {
                        const timer = setTimeout(() => {
                            const idx = waiters.findIndex(w => w.resolve === res);
                            if (idx !== -1) waiters.splice(idx, 1);
                            rej(new Error('nextMsg timeout'));
                        }, timeout);
                        waiters.push({ resolve: res, timer });
                    });
                },

                /** 연결을 닫고 close 이벤트를 기다린다. */
                close() {
                    return new Promise((res) => {
                        if (ws.readyState === WebSocket.CLOSED) {
                            res();
                            return;
                        }
                        ws.once('close', res);
                        ws.close();
                    });
                }
            };
            resolve(client);
        });
    });
}

/**
 * node 내장 http로 JSON POST 요청을 보낸다.
 * @param {number} port
 * @param {string} path
 * @param {object} bodyObj
 * @returns {Promise<void>}
 */
function httpPost(port, path, bodyObj) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(bodyObj);
        const opts = {
            hostname: '127.0.0.1',
            port,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = http.request(opts, (res) => {
            res.resume();
            res.on('end', resolve);
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ──────────────────────────────────────────────────────────────
// 서버 생명주기 — port 0 으로 OS 자동 할당 (포트 충돌 방지)
// ──────────────────────────────────────────────────────────────

let wsUrl;
let serverPort;

beforeAll(() => {
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            serverPort = server.address().port;
            wsUrl = `ws://127.0.0.1:${serverPort}`;
            resolve();
        });
    });
}, 10000);

afterAll(() => {
    return new Promise((resolve) => {
        server.close(() => resolve());
    });
}, 10000);

// ──────────────────────────────────────────────────────────────
// 1. init 메시지 — 연결 즉시 수신 확인
// ──────────────────────────────────────────────────────────────
describe('WebSocket init 메시지', () => {
    it('연결 즉시 type=init 메시지 수신', async () => {
        const client = await createWsClient(wsUrl);
        const msg = await client.nextMsg();
        await client.close();

        expect(msg.type).toBe('init');
    });

    it('init 메시지에 agents 필드(객체) 포함', async () => {
        const client = await createWsClient(wsUrl);
        const msg = await client.nextMsg();
        await client.close();

        expect(msg).toHaveProperty('agents');
        expect(typeof msg.agents).toBe('object');
    });

    it('init 메시지에 activity 필드(배열) 포함', async () => {
        const client = await createWsClient(wsUrl);
        const msg = await client.nextMsg();
        await client.close();

        expect(msg).toHaveProperty('activity');
        expect(Array.isArray(msg.activity)).toBe(true);
    });

    it('init.agents에 5개 역할 키 포함', async () => {
        const client = await createWsClient(wsUrl);
        const msg = await client.nextMsg();
        await client.close();

        const keys = Object.keys(msg.agents);
        expect(keys).toContain('developer');
        expect(keys).toContain('devops');
        expect(keys).toContain('qa');
        expect(keys).toContain('pm');
        expect(keys).toContain('leader');
    });
});

// ──────────────────────────────────────────────────────────────
// 2. agent-update 브로드캐스트 — POST /hook/tool-use 후 수신 확인
// ──────────────────────────────────────────────────────────────
describe('agent-update 브로드캐스트', () => {
    it('/hook/tool-use POST 후 type=agent-update 메시지 수신', async () => {
        const client = await createWsClient(wsUrl);
        await client.nextMsg(); // init 소비
        await client.nextMsg(); // current-users 소비 (P3: WS 세션 신분)

        await httpPost(serverPort, '/hook/tool-use', {
            tool: 'Read', role: 'developer', status: 'working'
        });

        const msg = await client.nextMsg();
        await client.close();

        expect(msg.type).toBe('agent-update');
    });

    it('agent-update 메시지에 agent, state, activity 필드 포함', async () => {
        const client = await createWsClient(wsUrl);
        await client.nextMsg(); // init 소비
        await client.nextMsg(); // current-users 소비 (P3: WS 세션 신분)

        await httpPost(serverPort, '/hook/tool-use', {
            tool: 'Edit', role: 'developer', status: 'working', detail: '테스트 상세'
        });

        const msg = await client.nextMsg();
        await client.close();

        expect(msg).toHaveProperty('agent');
        expect(msg).toHaveProperty('state');
        expect(msg).toHaveProperty('activity');
    });

    it('agent-update.agent는 POST body의 role 값과 일치', async () => {
        const client = await createWsClient(wsUrl);
        await client.nextMsg(); // init 소비
        await client.nextMsg(); // current-users 소비 (P3: WS 세션 신분)

        await httpPost(serverPort, '/hook/tool-use', {
            tool: 'Bash', role: 'devops', status: 'working'
        });

        const msg = await client.nextMsg();
        await client.close();

        expect(msg.agent).toBe('devops');
    });

    it('agent-update.state.action이 도구 매핑과 일치 (Grep → searching)', async () => {
        const client = await createWsClient(wsUrl);
        await client.nextMsg(); // init 소비
        await client.nextMsg(); // current-users 소비 (P3: WS 세션 신분)

        await httpPost(serverPort, '/hook/tool-use', {
            tool: 'Grep', role: 'qa', status: 'working'
        });

        const msg = await client.nextMsg();
        await client.close();

        expect(msg.state.action).toBe('searching');
    });
});

// ──────────────────────────────────────────────────────────────
// 3. 멀티 클라이언트 — 양쪽 모두 브로드캐스트 수신 확인
// ──────────────────────────────────────────────────────────────
describe('멀티 클라이언트 브로드캐스트', () => {
    it('클라이언트 2개 연결 시 양쪽 모두 agent-update 수신', async () => {
        const [c1, c2] = await Promise.all([
            createWsClient(wsUrl),
            createWsClient(wsUrl)
        ]);

        // 양쪽 init 소비
        await c1.nextMsg();
        await c2.nextMsg();
        // 양쪽 current-users 소비 (P3: WS 세션 신분)
        await c1.nextMsg();
        await c2.nextMsg();

        // 두 클라이언트가 동시에 다음 메시지를 대기하면서 POST 발행
        const [msg1, msg2] = await Promise.all([
            c1.nextMsg(),
            c2.nextMsg(),
            httpPost(serverPort, '/hook/tool-use', {
                tool: 'Write', role: 'developer', status: 'working', detail: '멀티 클라이언트 테스트'
            })
        ]);

        await Promise.all([c1.close(), c2.close()]);

        expect(msg1.type).toBe('agent-update');
        expect(msg2.type).toBe('agent-update');
    });

    it('클라이언트 2개 모두 동일한 agent 값 수신', async () => {
        const [c1, c2] = await Promise.all([
            createWsClient(wsUrl),
            createWsClient(wsUrl)
        ]);

        await c1.nextMsg();
        await c2.nextMsg();
        // 양쪽 current-users 소비 (P3: WS 세션 신분)
        await c1.nextMsg();
        await c2.nextMsg();

        const [msg1, msg2] = await Promise.all([
            c1.nextMsg(),
            c2.nextMsg(),
            httpPost(serverPort, '/hook/tool-use', {
                tool: 'TodoWrite', role: 'pm', status: 'working'
            })
        ]);

        await Promise.all([c1.close(), c2.close()]);

        expect(msg1.agent).toBe('pm');
        expect(msg2.agent).toBe('pm');
        expect(msg1.agent).toBe(msg2.agent);
    });
});

// ──────────────────────────────────────────────────────────────
// 4. 연결/해제 — 서버 클라이언트 수 변화 및 정상 동작 확인
// ──────────────────────────────────────────────────────────────
describe('WebSocket 연결/해제', () => {
    it('클라이언트 연결 후 해제 시 서버가 새 연결을 정상 수용', async () => {
        const c1 = await createWsClient(wsUrl);
        await c1.nextMsg(); // init 소비

        // 해제 후 서버 측 close 핸들러 실행까지 대기
        await new Promise((resolve) => {
            c1.ws.once('close', () => setImmediate(resolve));
            c1.ws.close();
        });

        // 새 연결이 정상적으로 init 메시지를 받는지 확인 (wss.clients.size 간접 검증)
        const c2 = await createWsClient(wsUrl);
        const msg = await c2.nextMsg();
        await c2.close();

        expect(msg.type).toBe('init');
    });

    it('클라이언트 3개 연결 후 모두 해제해도 서버 정상 동작', async () => {
        const clients = await Promise.all([
            createWsClient(wsUrl),
            createWsClient(wsUrl),
            createWsClient(wsUrl)
        ]);

        // 모든 init 소비
        await Promise.all(clients.map(c => c.nextMsg()));

        // 모두 해제
        await Promise.all(clients.map(c => c.close()));

        // 서버가 신규 연결을 받을 수 있는지 확인
        const c = await createWsClient(wsUrl);
        const msg = await c.nextMsg();
        await c.close();

        expect(msg.type).toBe('init');
    });

    it('연결 시 init 수신 → 해제 → 재연결 후 init 재수신', async () => {
        const c1 = await createWsClient(wsUrl);
        const init1 = await c1.nextMsg();
        await c1.close();

        const c2 = await createWsClient(wsUrl);
        const init2 = await c2.nextMsg();
        await c2.close();

        expect(init1.type).toBe('init');
        expect(init2.type).toBe('init');
    });
});
