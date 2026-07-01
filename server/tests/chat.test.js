/**
 * chat.test.js — 인앱 Teams 채팅 백엔드 단위테스트 (WJ METAOFFICE-CHAT-01)
 *
 * 대상:
 *   server/teams/chatService.js  listChats / getMessages / sendMessage
 *   server/server.js             GET /api/chats · GET /api/chats/:id/messages · POST /api/chats/:id/messages
 *
 * 프레임워크: vitest + supertest
 *
 * 설계:
 *   - Graph 호출 경계(teamsPoller graphGet/graphPost)와 인증(msalClient)을 vi.mock 으로 스텁한다.
 *     → chatService·server.js 라우트의 실제 로직은 그대로 실행되며, 라이브 Graph 호출은 없다.
 *   - 실제 data/token.json 유무와 무관하게 401/정상/에러 경로를 결정적으로 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── 모킹: 토큰·Graph 호출 제어 ────────────────────────────────────
const mockRefreshToken = vi.fn();
const mockGetTokenFromCache = vi.fn();
const mockGraphGet = vi.fn();
const mockGraphPost = vi.fn();

vi.mock('../auth/msalClient.js', () => ({
    refreshTokenIfNeeded: () => mockRefreshToken(),
    getTokenFromCache: () => mockGetTokenFromCache(),
    getDeviceCodeUrl: vi.fn(),
    getAuthStatus: () => ({ authenticated: false, account: null }),
}));

vi.mock('../teams/teamsPoller.js', () => ({
    startPolling: vi.fn(),
    graphGet: (url, token) => mockGraphGet(url, token),
    graphPost: (url, token, body) => mockGraphPost(url, token, body),
    GRAPH_BASE: 'https://graph.microsoft.com/v1.0',
}));

// chatService(실제)와 app(실제)은 위 모킹이 적용된 상태로 import 되어야 한다.
const { listChats, getMessages, sendMessage } = await import('../teams/chatService.js');
const { app } = await import('../server.js');

beforeEach(() => {
    mockRefreshToken.mockReset();
    mockGetTokenFromCache.mockReset();
    mockGraphGet.mockReset();
    mockGraphPost.mockReset();
    // 기본 로그인 사용자 (테스트별로 필요 시 덮어씀)
    mockGetTokenFromCache.mockReturnValue({
        account: { localAccountId: 'aad-me', username: 'me@formationlabs.co.kr' },
    });
});

// ══════════════════════════════════════════════════════════════════
// chatService 단위
// ══════════════════════════════════════════════════════════════════
describe('chatService.listChats', () => {
    const ME = { id: 'aad-me', username: 'me@formationlabs.co.kr' };

    it('1:1(topic 없음): 제목 = 나 제외 상대 displayName', async () => {
        mockGraphGet.mockResolvedValue({
            value: [{
                id: '19:oneone@thread.v2',
                chatType: 'oneOnOne',
                topic: null,
                lastUpdatedDateTime: '2026-07-01T05:00:00Z',
                members: [
                    { userId: 'aad-me', displayName: '나' },
                    { userId: 'aad-hong', displayName: '홍길동' },
                ],
            }],
        });
        const chats = await listChats('t', ME);
        expect(chats[0].title).toBe('홍길동');
        expect(chats[0].chatId).toBe('19:oneone@thread.v2');
        expect(chats[0].memberNames).toEqual(['나', '홍길동']);
    });

    it('group(topic 있음): 제목 = topic', async () => {
        mockGraphGet.mockResolvedValue({
            value: [{
                id: '19:group@thread.v2',
                chatType: 'group',
                topic: '기획팀',
                lastUpdatedDateTime: '2026-07-01T05:00:00Z',
                members: [
                    { userId: 'aad-me', displayName: '나' },
                    { userId: 'aad-a', displayName: 'A' },
                    { userId: 'aad-b', displayName: 'B' },
                ],
            }],
        });
        const chats = await listChats('t', ME);
        expect(chats[0].title).toBe('기획팀');
    });

    it('최근 갱신순(lastUpdatedDateTime desc) 정렬, 값 없는 방은 뒤로', async () => {
        mockGraphGet.mockResolvedValue({
            value: [
                { id: 'old', topic: 'OLD', lastUpdatedDateTime: '2026-07-01T01:00:00Z', members: [] },
                { id: 'none', topic: 'NONE', lastUpdatedDateTime: null, members: [] },
                { id: 'new', topic: 'NEW', lastUpdatedDateTime: '2026-07-01T09:00:00Z', members: [] },
            ],
        });
        const chats = await listChats('t', ME);
        expect(chats.map(c => c.chatId)).toEqual(['new', 'old', 'none']);
    });

    it('UPN 으로도 자기 자신을 제외한다 (userId 누락 폴백)', async () => {
        mockGraphGet.mockResolvedValue({
            value: [{
                id: 'c1', topic: null, lastUpdatedDateTime: '2026-07-01T05:00:00Z',
                members: [
                    { email: 'me@formationlabs.co.kr', displayName: '나' },
                    { email: 'kim@formationlabs.co.kr', displayName: '김철수' },
                ],
            }],
        });
        const chats = await listChats('t', ME);
        expect(chats[0].title).toBe('김철수');
    });
});

describe('chatService.getMessages', () => {
    function msgFixture() {
        return {
            value: [
                // Graph는 최신순(desc) 으로 반환
                {
                    id: 'm2', createdDateTime: '2026-07-01T05:02:00Z', messageType: 'message',
                    body: { contentType: 'html', content: '<p>두번째 <b>메시지</b></p>' },
                    from: { user: { id: 'aad-hong', displayName: '홍길동' } },
                },
                {
                    id: 'sys', createdDateTime: '2026-07-01T05:01:30Z', messageType: 'systemEventMessage',
                    body: { content: '홍길동님이 참여했습니다' }, from: null,
                },
                {
                    id: 'm1', createdDateTime: '2026-07-01T05:01:00Z', messageType: 'message',
                    body: { contentType: 'text', plainTextContent: '첫번째', content: '첫번째' },
                    from: { user: { id: 'aad-me', displayName: '나' } },
                },
            ],
        };
    }

    it('오래된→최신 순으로 반환한다', async () => {
        mockGraphGet.mockResolvedValue(msgFixture());
        const msgs = await getMessages('t', '19:c@thread.v2', { myId: 'aad-me' });
        expect(msgs.map(m => m.id)).toEqual(['m1', 'm2']);
    });

    it('시스템 메시지(messageType!=="message")를 제외한다', async () => {
        mockGraphGet.mockResolvedValue(msgFixture());
        const msgs = await getMessages('t', 'c', { myId: 'aad-me' });
        expect(msgs.find(m => m.id === 'sys')).toBeUndefined();
    });

    it('HTML content 는 태그 제거된 평문으로 반환한다', async () => {
        mockGraphGet.mockResolvedValue(msgFixture());
        const msgs = await getMessages('t', 'c', { myId: 'aad-me' });
        expect(msgs.find(m => m.id === 'm2').text).toBe('두번째 메시지');
    });

    it('isMine: 발신자 id 가 내 id 와 같으면 true', async () => {
        mockGraphGet.mockResolvedValue(msgFixture());
        const msgs = await getMessages('t', 'c', { myId: 'aad-me' });
        expect(msgs.find(m => m.id === 'm1').isMine).toBe(true);   // 내가 보냄
        expect(msgs.find(m => m.id === 'm2').isMine).toBe(false);  // 홍길동이 보냄
    });

    it('limit 은 1~50 으로 클램프되어 $top 에 반영된다', async () => {
        mockGraphGet.mockResolvedValue({ value: [] });
        await getMessages('t', 'c', { limit: 999, myId: 'aad-me' });
        const url = mockGraphGet.mock.calls[0][0];
        expect(url).toContain('$top=50');
    });
});

describe('chatService.sendMessage', () => {
    it('Graph POST body 는 {body:{contentType:text, content}} 형식', async () => {
        mockGraphPost.mockResolvedValue({
            id: 'new-1', createdDateTime: '2026-07-01T06:00:00Z',
            body: { plainTextContent: '보냄' }, from: { user: { id: 'aad-me', displayName: '나' } },
        });
        const sent = await sendMessage('t', '19:c@thread.v2', '보냄');
        const [url, token, body] = mockGraphPost.mock.calls[0];
        expect(url).toContain('/chats/19%3Ac%40thread.v2/messages');
        expect(token).toBe('t');
        expect(body).toEqual({ body: { contentType: 'text', content: '보냄' } });
        expect(sent.isMine).toBe(true);
        expect(sent.text).toBe('보냄');
    });
});

// ══════════════════════════════════════════════════════════════════
// server.js 라우트 (supertest)
// ══════════════════════════════════════════════════════════════════
describe('GET /api/chats', () => {
    it('토큰 없으면 401 not_authenticated', async () => {
        mockRefreshToken.mockResolvedValue(null);
        const res = await request(app).get('/api/chats');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('not_authenticated');
    });

    it('정상: 방 목록 반환', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        mockGraphGet.mockResolvedValue({
            value: [{
                id: 'c1', chatType: 'oneOnOne', topic: null, lastUpdatedDateTime: '2026-07-01T05:00:00Z',
                members: [{ userId: 'aad-me', displayName: '나' }, { userId: 'aad-x', displayName: 'X' }],
            }],
        });
        const res = await request(app).get('/api/chats');
        expect(res.status).toBe(200);
        expect(res.body[0]).toMatchObject({ chatId: 'c1', title: 'X' });
    });

    it('Graph 에러(403) → 동일 상태코드 graph_error 전파', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        const err = new Error('Graph API 403'); err.status = 403;
        mockGraphGet.mockRejectedValue(err);
        const res = await request(app).get('/api/chats');
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('graph_error');
    });
});

describe('GET /api/chats/:chatId/messages', () => {
    it('토큰 없으면 401', async () => {
        mockRefreshToken.mockResolvedValue(null);
        const res = await request(app).get('/api/chats/19%3Ac%40thread.v2/messages');
        expect(res.status).toBe(401);
    });

    it('정상: 메시지 배열(오래된→최신) 반환', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        mockGraphGet.mockResolvedValue({
            value: [
                { id: 'b', createdDateTime: '2026-07-01T05:02:00Z', messageType: 'message', body: { plainTextContent: 'B' }, from: { user: { id: 'aad-hong', displayName: '홍' } } },
                { id: 'a', createdDateTime: '2026-07-01T05:01:00Z', messageType: 'message', body: { plainTextContent: 'A' }, from: { user: { id: 'aad-me', displayName: '나' } } },
            ],
        });
        const res = await request(app).get('/api/chats/19%3Ac%40thread.v2/messages?limit=20');
        expect(res.status).toBe(200);
        expect(res.body.map(m => m.id)).toEqual(['a', 'b']);
        expect(res.body.find(m => m.id === 'a').isMine).toBe(true);
    });
});

describe('POST /api/chats/:chatId/messages', () => {
    it('빈 텍스트 → 400 empty_message (Graph 미호출)', async () => {
        const res = await request(app)
            .post('/api/chats/19%3Ac%40thread.v2/messages')
            .send({ text: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('empty_message');
        expect(mockGraphPost).not.toHaveBeenCalled();
    });

    it('토큰 없으면 401', async () => {
        mockRefreshToken.mockResolvedValue(null);
        const res = await request(app)
            .post('/api/chats/19%3Ac%40thread.v2/messages')
            .send({ text: '안녕' });
        expect(res.status).toBe(401);
    });

    it('정상: 201 + 전송 메시지(isMine:true)', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        mockGraphPost.mockResolvedValue({
            id: 'sent-1', createdDateTime: '2026-07-01T06:00:00Z',
            body: { plainTextContent: '안녕' }, from: { user: { id: 'aad-me', displayName: '나' } },
        });
        const res = await request(app)
            .post('/api/chats/19%3Ac%40thread.v2/messages')
            .send({ text: '안녕' });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ id: 'sent-1', text: '안녕', isMine: true });
    });

    it('Graph 에러(403) → 동일 상태코드 graph_error 전파', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        const err = new Error('Graph API 403'); err.status = 403;
        mockGraphPost.mockRejectedValue(err);
        const res = await request(app)
            .post('/api/chats/19%3Ac%40thread.v2/messages')
            .send({ text: '안녕' });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('graph_error');
    });
});
