/**
 * teams-payload.test.js — WJ_MONITORING-P5-E-A 페이로드 딥링크 식별자 보강 단위테스트 (ZTRACE-5 T축)
 *
 * 대상: server/teams/teamsPoller.js  pollOnce()
 *
 * 검증 요지:
 *   - 신규 메시지 감지 시 broadcast 페이로드 message 에
 *     chatId · senderEmail(=matchedPerson.email) · tenantId(=AZURE_TENANT_ID) · messageId(=msg.id) 포함
 *   - 기존 필드(text · senderName · timestamp · chatId) 회귀 없음
 *   - tenantId 는 process.env.AZURE_TENANT_ID 에서 공급 (하드코딩 없음)
 *
 * 설계:
 *   - 라이브 Graph 호출 없이 결정적으로 검증하기 위해 전역 fetch 를 vi.fn 으로 스텁한다.
 *     (graphGet 내부가 fetch 를 사용하므로, matchMemberToPerson·pollOnce 실제 로직은 그대로 동작)
 *   - 모듈 로드 시 1회 읽히는 TENANT_ID 상수가 테스트 값을 받도록
 *     import 이전에 process.env.AZURE_TENANT_ID 를 설정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── 모듈 로드 전 테넌트 ID 주입 ────────────────────────────────────
// teamsPoller.js 의 TENANT_ID 는 모듈 로드 시점에 1회 읽히므로 import 보다 먼저 설정해야 한다.
const TEST_TENANT_ID = '7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f';
process.env.AZURE_TENANT_ID = TEST_TENANT_ID;

const { pollOnce } = await import('../teams/teamsPoller.js');

// ── Graph 응답 픽스처 ─────────────────────────────────────────────
const CHAT_ID = '19:abcdef0123@thread.v2';

// 등록 인물 (people.json 형상) — email 로 매칭된다
const REGISTERED_PERSON = {
    id: 'p-hong',
    name: 'Hong',
    email: 'hong@formationlabs.co.kr',
};

// /me/chats?$expand=members 응답: 등록 인물이 참여한 채팅 1건
const chatsResponse = {
    value: [
        {
            id: CHAT_ID,
            members: [
                { email: 'hong@formationlabs.co.kr', userPrincipalName: 'hong@formationlabs.co.kr' },
                { email: 'other@formationlabs.co.kr' },
            ],
        },
    ],
};

// /chats/{chatId}/messages 응답: 신규 메시지 1건 (lastSeen=epoch 이후)
const messagesResponse = {
    value: [
        {
            id: 'msg-100',
            createdDateTime: '2026-06-24T01:00:00Z',
            messageType: 'message',
            body: { contentType: 'text', content: '안녕하세요 테스트 메시지', plainTextContent: '안녕하세요 테스트 메시지' },
            from: { user: { displayName: 'Hong' } },
        },
    ],
};

/**
 * 전역 fetch 스텁: 호출 URL 에 따라 chats / messages 응답을 반환한다.
 * graphGet 은 res.ok·res.json() 만 사용하므로 최소 형상으로 충분하다.
 */
function makeFetchStub() {
    return vi.fn(async (url) => {
        const body = url.includes('/messages') ? messagesResponse : chatsResponse;
        return {
            ok: true,
            status: 200,
            json: async () => body,
        };
    });
}

describe('pollOnce — teams-notification 페이로드 딥링크 식별자 보강 (P5-E-A)', () => {
    let broadcast;
    let fetchStub;
    const originalFetch = global.fetch;

    beforeEach(() => {
        broadcast = vi.fn();
        fetchStub = makeFetchStub();
        global.fetch = fetchStub;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    /** broadcast 된 첫 teams-notification 페이로드를 반환한다. */
    async function runPoll() {
        await pollOnce({
            getPeople: () => [REGISTERED_PERSON],
            broadcast,
            accessToken: 'fake-token',
            lastSeen: {}, // epoch → 모든 메시지가 신규
            freshnessMs: Infinity, // 픽스처는 과거 타임스탬프 → 신선도 필터 비활성화
        });
        const call = broadcast.mock.calls.find(
            ([m]) => m.type === 'teams-notification'
        );
        expect(call, 'teams-notification 이 broadcast 되어야 한다').toBeTruthy();
        return call[0];
    }

    it('신규 메시지 감지 시 teams-notification 을 broadcast 한다', async () => {
        const payload = await runPoll();
        expect(payload.type).toBe('teams-notification');
        expect(payload.personId).toBe(REGISTERED_PERSON.id);
        expect(payload.personName).toBe(REGISTERED_PERSON.name);
    });

    it('페이로드 message 에 chatId · senderEmail · tenantId 포함', async () => {
        const { message } = await runPoll();
        expect(message.chatId).toBe(CHAT_ID);
        expect(message.senderEmail).toBe(REGISTERED_PERSON.email); // 매칭 person.email
        expect(message.tenantId).toBe(TEST_TENANT_ID);
    });

    it('messageId(msg.id) 도 함께 실린다 (향후 딥링크 B 승격용)', async () => {
        const { message } = await runPoll();
        expect(message.messageId).toBe('msg-100');
    });

    it('기존 필드(text · senderName · timestamp) 회귀 없음', async () => {
        const { message } = await runPoll();
        expect(message.text).toBe('안녕하세요 테스트 메시지');
        expect(message.senderName).toBe('Hong');
        expect(message.timestamp).toBe('2026-06-24T01:00:00Z');
    });

    it('tenantId 는 process.env.AZURE_TENANT_ID 에서 공급된다 (하드코딩 아님)', async () => {
        const { message } = await runPoll();
        // 모듈 로드 전 주입한 env 값과 동일해야 한다
        expect(message.tenantId).toBe(process.env.AZURE_TENANT_ID);
    });

    it('발신자 email 조회용 추가 Graph 호출 없음 (chats + 채팅별 messages 만 호출)', async () => {
        await runPoll();
        // 호출은 /me/chats 1회 + /chats/{id}/messages 1회 = 2회. 발신자 조회용 추가 호출 없음
        const urls = fetchStub.mock.calls.map(([u]) => u);
        const chatsCalls = urls.filter((u) => u.includes('/me/chats')).length;
        const msgCalls = urls.filter((u) => u.includes('/messages')).length;
        const userLookupCalls = urls.filter((u) => /\/users\/|\/people\//.test(u)).length;
        expect(chatsCalls).toBe(1);
        expect(msgCalls).toBe(1);
        expect(userLookupCalls).toBe(0);
    });
});

describe('pollOnce — 받는 사람(수신자) 머리 위 표시 (발신자 제외)', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    it('발신자가 등록 멤버여도, 알림은 발신자가 아닌 등록 수신자에게 broadcast된다', async () => {
        const SENDER   = { id: 'p-a', name: 'Alice', email: 'alice@formationlabs.co.kr' };
        const RECEIVER = { id: 'p-b', name: 'Bob',   email: 'bob@formationlabs.co.kr' };
        const chats = { value: [ { id: '19:room@thread.v2', members: [
            { email: 'alice@formationlabs.co.kr', userId: 'aad-alice' },
            { email: 'bob@formationlabs.co.kr',   userId: 'aad-bob' },
        ] } ] };
        const msgs = { value: [ {
            id: 'm1', createdDateTime: '2026-06-24T03:00:00Z', messageType: 'message',
            body: { plainTextContent: 'hi bob' },
            from: { user: { id: 'aad-alice', displayName: 'Alice' } }, // Alice(=등록 멤버)가 발신
        } ] };
        global.fetch = vi.fn(async (url) => ({
            ok: true, status: 200,
            json: async () => (url.includes('/messages') ? msgs : chats),
        }));

        const broadcast = vi.fn();
        await pollOnce({ getPeople: () => [SENDER, RECEIVER], broadcast, accessToken: 't', lastSeen: {}, freshnessMs: Infinity });

        const notes = broadcast.mock.calls.map(([m]) => m).filter(m => m.type === 'teams-notification');
        // 수신자(Bob)에게만 표시, 발신자(Alice)에게는 미표시
        expect(notes.some(m => m.personId === 'p-b')).toBe(true);
        expect(notes.some(m => m.personId === 'p-a')).toBe(false);
    });
});
