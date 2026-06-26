/**
 * meeting-status.test.js — P6 pollMeetingsOnce() 단위 테스트 (ZTRACE-5 T축)
 *
 * 검증 요지:
 *   - 진행 중 온라인 회의 감지 시 meeting-status(inMeeting=true) broadcast
 *   - 회의 없음 시 meeting-status(inMeeting=false) broadcast
 *   - 동일 상태 반복 시 broadcast 생략 (스팸 방지)
 *   - 로그인 사용자가 people 목록에 미등록이면 broadcast 없음
 *   - account 없으면 broadcast 없음
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.AZURE_TENANT_ID = '7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f';

const { pollMeetingsOnce } = await import('../teams/teamsPoller.js');

const PERSON = { id: 'p-kim', name: 'Kim', email: 'kim@formationlabs.co.kr' };
const ACCOUNT = { name: 'Kim', username: 'kim@formationlabs.co.kr' };

// now ± 5분 범위에 걸치는 온라인 회의 이벤트
const NOW_ISO = new Date().toISOString();
const START_ISO = new Date(Date.now() - 60_000).toISOString(); // 1분 전 시작
const END_ISO   = new Date(Date.now() + 60_000).toISOString(); // 1분 후 종료

const ONLINE_EVENT = {
    subject: '주간 스프린트 리뷰',
    isOnlineMeeting: true,
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/test' },
    start: { dateTime: START_ISO },
    end:   { dateTime: END_ISO },
};

const NO_EVENT_RESPONSE   = { value: [] };
const MEETING_RESPONSE    = { value: [ONLINE_EVENT] };

function makeFetch(calendarData) {
    return vi.fn(async () => ({ ok: true, status: 200, json: async () => calendarData }));
}

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

describe('pollMeetingsOnce — 회의 감지 및 broadcast', () => {
    let broadcast;
    beforeEach(() => { broadcast = vi.fn(); });

    it('진행 중 온라인 회의 있으면 inMeeting=true 로 broadcast', async () => {
        global.fetch = makeFetch(MEETING_RESPONSE);
        const meetingState = {};
        await pollMeetingsOnce({
            getPeople: () => [PERSON],
            broadcast,
            accessToken: 'tok',
            account: ACCOUNT,
            meetingState,
        });
        const calls = broadcast.mock.calls.map(([m]) => m).filter(m => m.type === 'meeting-status');
        expect(calls).toHaveLength(1);
        expect(calls[0].inMeeting).toBe(true);
        expect(calls[0].personId).toBe(PERSON.id);
        expect(calls[0].joinUrl).toBe(ONLINE_EVENT.onlineMeeting.joinUrl);
        expect(calls[0].subject).toBe(ONLINE_EVENT.subject);
    });

    it('회의 없으면 inMeeting=false 로 broadcast', async () => {
        global.fetch = makeFetch(NO_EVENT_RESPONSE);
        const meetingState = {};
        await pollMeetingsOnce({
            getPeople: () => [PERSON],
            broadcast,
            accessToken: 'tok',
            account: ACCOUNT,
            meetingState,
        });
        const calls = broadcast.mock.calls.map(([m]) => m).filter(m => m.type === 'meeting-status');
        expect(calls).toHaveLength(1);
        expect(calls[0].inMeeting).toBe(false);
        expect(calls[0].joinUrl).toBeNull();
    });
});

describe('pollMeetingsOnce — 중복 broadcast 방지 (상태 캐시)', () => {
    it('동일 inMeeting 상태가 반복되면 broadcast 생략', async () => {
        global.fetch = makeFetch(MEETING_RESPONSE);
        const meetingState = {};
        const broadcast = vi.fn();

        // 1회차: inMeeting=true → broadcast
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: ACCOUNT, meetingState });
        expect(broadcast).toHaveBeenCalledTimes(1);

        // 2회차: 동일 상태 → broadcast 없음
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: ACCOUNT, meetingState });
        expect(broadcast).toHaveBeenCalledTimes(1); // 추가 호출 없음
    });

    it('inMeeting 상태가 변하면 다시 broadcast', async () => {
        const broadcast = vi.fn();
        const meetingState = {};

        // 1회차: 회의 있음 → inMeeting=true
        global.fetch = makeFetch(MEETING_RESPONSE);
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: ACCOUNT, meetingState });
        expect(broadcast).toHaveBeenCalledTimes(1);

        // 2회차: 회의 끝남 → inMeeting=false, 상태 달라졌으므로 broadcast
        global.fetch = makeFetch(NO_EVENT_RESPONSE);
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: ACCOUNT, meetingState });
        expect(broadcast).toHaveBeenCalledTimes(2);
        const last = broadcast.mock.calls[1][0];
        expect(last.inMeeting).toBe(false);
    });
});

describe('pollMeetingsOnce — 가드 조건', () => {
    it('account 없으면 broadcast 없음', async () => {
        global.fetch = makeFetch(MEETING_RESPONSE);
        const broadcast = vi.fn();
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: null, meetingState: {} });
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('로그인 사용자가 people 목록에 없으면 broadcast 없음', async () => {
        global.fetch = makeFetch(MEETING_RESPONSE);
        const broadcast = vi.fn();
        const OTHER_ACCOUNT = { name: 'Unknown', username: 'unknown@other.com' };
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: OTHER_ACCOUNT, meetingState: {} });
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('isOnlineMeeting=false 이벤트는 무시한다', async () => {
        const offlineEvent = { ...ONLINE_EVENT, isOnlineMeeting: false };
        global.fetch = makeFetch({ value: [offlineEvent] });
        const broadcast = vi.fn();
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: ACCOUNT, meetingState: {} });
        const calls = broadcast.mock.calls.map(([m]) => m).filter(m => m.type === 'meeting-status');
        expect(calls[0].inMeeting).toBe(false);
    });

    it('joinUrl 없는 이벤트는 무시한다', async () => {
        const noUrlEvent = { ...ONLINE_EVENT, onlineMeeting: {} };
        global.fetch = makeFetch({ value: [noUrlEvent] });
        const broadcast = vi.fn();
        await pollMeetingsOnce({ getPeople: () => [PERSON], broadcast, accessToken: 'tok', account: ACCOUNT, meetingState: {} });
        const calls = broadcast.mock.calls.map(([m]) => m).filter(m => m.type === 'meeting-status');
        expect(calls[0].inMeeting).toBe(false);
    });
});
