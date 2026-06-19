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

async function pollOnce({ getPeople, broadcast, accessToken, lastSeen }) {
    // 1. 내 채팅 목록 조회 (참여자 포함)
    const chatsData = await graphGet(
        `${GRAPH_BASE}/me/chats?$expand=members&$top=50`,
        accessToken
    );
    const chats = chatsData.value || [];

    // 2. people.json email 목록 → 모니터링 대상 채팅 매칭
    const peopleList = getPeople();
    const peopleEmails = new Map(
        peopleList.map(p => [p.email.toLowerCase(), p])
    );

    let changed = false;

    for (const chat of chats) {
        const members = chat.members || [];

        // 채팅 참여자 중 people.json에 등록된 사람 찾기
        const matchedPerson = members.reduce((found, member) => {
            if (found) return found;
            const email = (member.email || '').toLowerCase();
            return peopleEmails.get(email) || null;
        }, null);

        if (!matchedPerson) continue;

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

            // 신규 메시지 — broadcast
            const text = msg.body.plainTextContent
                || msg.body.content?.replace(/<[^>]*>/g, '') // HTML 태그 제거
                || '';

            const senderName = msg.from?.user?.displayName
                || msg.from?.application?.displayName
                || '알 수 없음';

            broadcast({
                type:       'teams-notification',
                personId:   matchedPerson.id,
                personName: matchedPerson.name,
                message: {
                    text:      text.slice(0, 200),
                    senderName,
                    timestamp: msg.createdDateTime,
                    chatId,
                },
            });

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

export { startPolling };
