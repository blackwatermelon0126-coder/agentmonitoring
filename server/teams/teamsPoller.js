/**
 * server/teams/teamsPoller.js
 *
 * Microsoft Graph API Teams 채팅 폴링 모듈 (P5-C)
 *
 * 동작 흐름:
 *   1. 15초 간격으로 GET /me/chats?$expand=members 호출
 *   2. data/people.json email 목록과 채팅 참여자를 매칭 → 모니터링 대상 chatId 확정
 *   3. 각 대상 채팅에서 GET /chats/{chatId}/messages?$top=10 최신 메시지 조회
 *   4. data/teams-lastSeen.json에 저장된 마지막 확인 시각 이후 신규 메시지만 감지
 *   5. 신규 메시지 → WebSocket broadcast { type: 'teams-notification', ... }
 *
 * 에러 처리:
 *   - 토큰 없음: 폴링 미시작 (에러 없음)
 *   - 401: 토큰 갱신 후 1회 재시도
 *   - 429/500: 해당 사이클 건너뜀 (다음 사이클 재시도)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTokenFromCache, refreshTokenIfNeeded } from '../auth/msalClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAST_SEEN_PATH = path.join(__dirname, '..', 'data', 'teams-lastSeen.json');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const POLL_INTERVAL_MS = 15_000; // 15초

// 딥링크 C(이메일 기반 1:1 채팅) 주입용 테넌트 ID.
// 모듈 로드 시 1회 읽어 상수화한다 (프론트 하드코딩 금지 — 백엔드가 페이로드로 공급).
const TENANT_ID = process.env.AZURE_TENANT_ID || '';

// ── LastSeen 영속화 ───────────────────────────────────────────────

function loadLastSeen() {
    try {
        if (!fs.existsSync(LAST_SEEN_PATH)) return {};
        return JSON.parse(fs.readFileSync(LAST_SEEN_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveLastSeen(lastSeen) {
    const dir = path.dirname(LAST_SEEN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LAST_SEEN_PATH, JSON.stringify(lastSeen, null, 2), 'utf8');
}

// ── Graph API 호출 헬퍼 ───────────────────────────────────────────

async function graphGet(url, accessToken) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const err = new Error(`Graph API ${res.status}: ${url}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

// ── 폴링 1 사이클 ─────────────────────────────────────────────────

async function pollOnce({ getPeople, broadcast, accessToken, lastSeen, freshnessMs = 90_000 }) {
    // 1. 내 채팅 목록 조회 (참여자 포함)
    const chatsData = await graphGet(
        `${GRAPH_BASE}/me/chats?$expand=members&$top=50`,
        accessToken
    );
    const chats = chatsData.value || [];

    // 2. people.json email 목록 → 모니터링 대상 채팅 매칭
    //    Graph Chat API 멤버 객체는 email이 비어있는 경우가 많으므로
    //    email → userId(aadObjectId) → userPrincipalName 순서로 폴백 매칭한다.
    const peopleList = getPeople();
    const peopleEmails  = new Map(peopleList.filter(p => p.email).map(p => [p.email.toLowerCase(), p]));
    const peopleUserIds = new Map(peopleList.filter(p => p.userId).map(p => [p.userId.toLowerCase(), p]));
    const peopleUpns    = new Map(peopleList.filter(p => p.userPrincipalName).map(p => [p.userPrincipalName.toLowerCase(), p]));
    const peopleNames   = new Map(peopleList.filter(p => p.name).map(p => [p.name.toLowerCase().trim(), p]));

    /**
     * Graph 멤버 객체와 people 목록을 email → UPN → userId → displayName 순서로 매칭한다.
     *
     * Graph /me/chats?$expand=members 응답에서 members[].email은 비어있거나 null일 수 있으므로
     * userPrincipalName / userId(aadObjectId) / displayName 폴백을 순서대로 시도한다.
     *
     * @param {object} member - Graph aadUserConversationMember 객체
     * @returns {object|null} 매칭된 person 또는 null
     */
    function matchMemberToPerson(member) {
        const lower = (s) => (s || '').toLowerCase().trim();

        // 1) email 직접 매칭
        const email = lower(member.email);
        if (email) {
            const byEmail = peopleEmails.get(email);
            if (byEmail) return byEmail;
        }

        // 2) userPrincipalName → email Map 폴백
        //    (Graph은 email이 비어 있어도 UPN은 대부분 반환한다)
        const upn = lower(member.userPrincipalName);
        if (upn) {
            const byEmailViaUpn = peopleEmails.get(upn);   // UPN이 email과 동일한 경우
            if (byEmailViaUpn) return byEmailViaUpn;
            const byUpn = peopleUpns.get(upn);
            if (byUpn) return byUpn;
        }

        // 3) userId(aadObjectId) 폴백
        const userId = lower(member.userId);
        if (userId) {
            const byUserId = peopleUserIds.get(userId);
            if (byUserId) return byUserId;
        }

        // 4) displayName → people.name 폴백 (최후 수단)
        const displayName = lower(member.displayName);
        if (displayName) {
            const byName = peopleNames.get(displayName);
            if (byName) return byName;
        }

        return null;
    }

    let changed = false;

    for (const chat of chats) {
        const members = chat.members || [];

        // 채팅 참여자 중 people.json에 등록된 사람을 전부 수집한다 (member ↔ person).
        const registered = [];
        for (const member of members) {
            const person = matchMemberToPerson(member);
            if (person) registered.push({ member, person });
        }
        if (registered.length === 0) continue;

        const chatId = chat.id;

        // 3. 해당 채팅 최신 메시지 조회
        let messagesData;
        try {
            messagesData = await graphGet(
                `${GRAPH_BASE}/chats/${encodeURIComponent(chatId)}/messages?$top=10&$orderby=createdDateTime desc`,
                accessToken
            );
        } catch (e) {
            // 개별 채팅 조회 실패는 건너뜀
            continue;
        }

        const messages = messagesData.value || [];
        const lastSeenAt = lastSeen[chatId]
            ? new Date(lastSeen[chatId])
            : new Date(0);

        let latestAt = lastSeenAt;

        for (const msg of messages) {
            if (!msg.createdDateTime || !msg.body) continue;

            const msgAt = new Date(msg.createdDateTime);
            if (msgAt <= lastSeenAt) continue;   // 이미 확인한 메시지

            // 시스템 메시지 제외
            if (msg.messageType && msg.messageType !== 'message') continue;

            // 과거 메시지(앱 시작 전·오래된 이력)는 알림하지 않고 lastSeen만 전진시킨다.
            // → 신규 인물 등록·서버 재시작 시 과거 메시지가 편지봉투로 폭주하는 것을 방지.
            if (Date.now() - msgAt.getTime() > freshnessMs) {
                if (msgAt > latestAt) latestAt = msgAt;
                continue;
            }

            // 신규 메시지 — broadcast
            const text = msg.body.plainTextContent
                || msg.body.content?.replace(/<[^>]*>/g, '') // HTML 태그 제거
                || '';

            const senderName = msg.from?.user?.displayName
                || msg.from?.application?.displayName
                || '알 수 없음';
            const senderId = (msg.from?.user?.id || '').toLowerCase();

            // 알림은 '받는 사람' 머리 위에 띄운다 → 등록 멤버 중 발신자가 아닌 사람(수신자)에게 broadcast.
            // (발신자 id를 알 수 없으면 등록 멤버 전원에게 표시 — 폴백)
            const receivers = registered.filter(r =>
                !senderId || (r.member.userId || '').toLowerCase() !== senderId
            );

            for (const r of receivers) {
                broadcast({
                    type:       'teams-notification',
                    personId:   r.person.id,
                    personName: r.person.name,
                    message: {
                        text:        text.slice(0, 200),
                        senderName,
                        timestamp:   msg.createdDateTime,
                        chatId,
                        // P5-E-A 딥링크 식별자 보강
                        senderEmail: r.person.email || '', // 딥링크 C(이메일=UPN) 폴백용. 추가 Graph 호출 불요
                        messageId:   msg.id,                      // 향후 딥링크 B(특정 메시지) 승격용 — 실어만 둠
                        tenantId:    TENANT_ID,                   // 딥링크 C tenantId 주입용 (모듈 상수)
                    },
                });
            }

            if (msgAt > latestAt) latestAt = msgAt;
        }

        // 4. lastSeen 업데이트
        if (latestAt > lastSeenAt) {
            lastSeen[chatId] = latestAt.toISOString();
            changed = true;
        }
    }

    if (changed) saveLastSeen(lastSeen);
}

// ── 회의(화상회의) 폴링 1 사이클 ──────────────────────────────────

/**
 * 로그인 사용자(/me)의 캘린더에서 '진행 중인 온라인 회의'를 탐지하여
 * 등록 인물 아바타를 회의실로 이동시키도록 meeting-status를 broadcast한다.
 *
 * 동작:
 *   1. account(=로그인 사용자)와 매칭되는 people 등록 인물을 찾는다
 *      (displayName 소문자 일치 또는 username(이메일/UPN) 일치). 없으면 이동 대상 없음 → return.
 *   2. GET /me/calendarView (now±5분) 로 현재 시각 주변 이벤트를 조회한다.
 *   3. 그중 isOnlineMeeting && onlineMeeting.joinUrl 가 있고 start<=now<=end 인 회의를 찾는다.
 *   4. 상태 변화(inMeeting / joinUrl)가 있을 때만 broadcast하여 스팸을 방지한다.
 *
 * calendarView 의 start/end.dateTime 은 기본 TZ=UTC 이며 오프셋이 없으므로 'Z'를 붙여 파싱한다.
 *
 * @param {object}   opts
 * @param {() => object[]} opts.getPeople     - people 목록 공급 함수
 * @param {(msg:object)=>void} opts.broadcast - WebSocket broadcast 함수
 * @param {string}   opts.accessToken         - Graph access token
 * @param {object}   opts.account             - 로그인 사용자 account ({ name, username, ... })
 * @param {object}   opts.meetingState        - personId → { inMeeting, joinUrl } 직전 상태 캐시
 */
async function pollMeetingsOnce({ getPeople, broadcast, accessToken, account, meetingState }) {
    if (!account) return;

    // 1. 로그인 사용자 ↔ 등록 인물 매칭
    const lower = (s) => (s || '').toLowerCase().trim();
    const acctName = lower(account.name);          // displayName
    const acctUser = lower(account.username);       // 이메일/UPN

    const peopleList = getPeople();
    const me = peopleList.find((p) => {
        const name  = lower(p.name);
        const email = lower(p.email);
        const upn   = lower(p.userPrincipalName);
        if (acctName && name === acctName) return true;
        if (acctUser && (email === acctUser || upn === acctUser)) return true;
        return false;
    });
    if (!me) return; // 이동 대상(나) 미등록 → 회의 이동 불가

    // 2. now±5분 calendarView 조회
    const now = new Date();
    const startISO = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const endISO   = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const url =
        `${GRAPH_BASE}/me/calendarView` +
        `?startDateTime=${encodeURIComponent(startISO)}` +
        `&endDateTime=${encodeURIComponent(endISO)}` +
        `&$select=subject,start,end,isOnlineMeeting,onlineMeeting` +
        `&$orderby=start/dateTime&$top=20`;

    const data = await graphGet(url, accessToken);
    const events = data.value || [];

    // calendarView dateTime(오프셋 없음, UTC)을 Date로 파싱.
    // 이미 오프셋(Z 또는 ±hh:mm)이 있으면 그대로, 없으면 'Z'를 붙여 UTC로 해석.
    const parseGraphDate = (dt) => {
        if (!dt) return null;
        const hasOffset = /[zZ]|[+-]\d{2}:?\d{2}$/.test(dt);
        return new Date(hasOffset ? dt : dt + 'Z');
    };

    // 3. 진행 중 온라인 회의 탐색
    let inMeeting = false;
    let joinUrl = null;
    let subject = null;
    for (const ev of events) {
        if (!ev.isOnlineMeeting) continue;
        const url = ev.onlineMeeting?.joinUrl;
        if (!url) continue;
        const start = parseGraphDate(ev.start?.dateTime);
        const end   = parseGraphDate(ev.end?.dateTime);
        if (!start || !end) continue;
        if (start <= now && now <= end) {
            inMeeting = true;
            joinUrl = url;
            subject = ev.subject || '';
            break;
        }
    }

    // 4. 상태 변화 시에만 broadcast (스팸 방지)
    const prev = meetingState[me.id];
    if (prev && prev.inMeeting === inMeeting && prev.joinUrl === joinUrl) {
        return; // 동일 상태 → skip
    }
    meetingState[me.id] = { inMeeting, joinUrl };

    broadcast({
        type:       'meeting-status',
        personId:   me.id,
        personName: me.name,
        inMeeting,
        joinUrl,
        subject,
    });
}

// ── 폴링 시작 ─────────────────────────────────────────────────────

/**
 * Teams 채팅 폴링을 시작한다.
 *
 * @param {{ getPeople: () => object[], broadcast: (msg: object) => void }} options
 */
function startPolling({ getPeople, broadcast }) {
    const lastSeen = loadLastSeen();

    const log = (msg, ...args) => console.log(`[TeamsPoller] ${msg}`, ...args);
    const warn = (msg, ...args) => console.warn(`[TeamsPoller] ${msg}`, ...args);

    // 폴링 1회 실행
    async function tick() {
        // 토큰 없으면 조용히 대기
        const cached = getTokenFromCache();
        if (!cached) return;

        let accessToken;
        try {
            accessToken = await refreshTokenIfNeeded();
        } catch (e) {
            warn('토큰 갱신 실패:', e.message);
            return;
        }

        if (!accessToken) return;

        try {
            log('폴링 시작');
            await pollOnce({ getPeople, broadcast, accessToken, lastSeen });
            log('폴링 완료');
        } catch (e) {
            if (e.status === 401) {
                // 토큰 만료 — 1회 갱신 후 재시도
                warn('401 감지 — 토큰 갱신 후 재시도');
                try {
                    accessToken = await refreshTokenIfNeeded();
                    if (accessToken) {
                        await pollOnce({ getPeople, broadcast, accessToken, lastSeen });
                    }
                } catch (retryErr) {
                    warn('재시도 실패:', retryErr.message);
                }
            } else {
                // 429/500 등 — 이번 사이클 건너뜀
                warn(`폴링 오류 (건너뜀): ${e.message}`);
            }
        }
    }

    // 최초 즉시 실행 후 15초 간격
    tick();
    setInterval(tick, POLL_INTERVAL_MS);

    log('폴링 등록 완료 (간격: 15초)');
}

export { startPolling, pollOnce, graphGet, GRAPH_BASE, TENANT_ID };
