/**
 * server/teams/chatService.js
 *
 * 인앱 Teams 채팅 서비스 (WJ METAOFFICE-CHAT-01)
 *
 * 3D 오피스 안에서 Teams 채팅을 이용하기 위한 Graph 호출 래퍼.
 *   - listChats   : 내 채팅방 목록 (제목 파생·정렬)
 *   - getMessages : 채팅 메시지 읽기 (오래된→최신 정형화)
 *   - sendMessage : 메시지 전송 (Chat.ReadWrite)
 *
 * 설계 근거: docs/design/_Design/Design_METAOFFICE-CHAT-01.md
 * 관례: server.js /api/org-users 라우트와 동일하게 graphGet/graphPost 헬퍼를 사용하고,
 *       server.js 라우트가 토큰 가드·에러 상태 매핑을 담당한다. 이 모듈은 순수 정형화 로직만 담는다.
 */

import { graphGet, graphPost, GRAPH_BASE } from './teamsPoller.js';

// ── 내부 유틸 ─────────────────────────────────────────────────────

const lower = (s) => (s || '').toLowerCase().trim();

/**
 * Graph chatMessage.body → 표시용 평문 추출.
 * teamsPoller.pollOnce 의 추출 규칙과 동일: plainTextContent 우선, 없으면 HTML 태그 제거.
 * @param {object} body - Graph chatMessage.body
 * @returns {string}
 */
function extractText(body) {
    if (!body) return '';
    return body.plainTextContent
        || (body.content ? body.content.replace(/<[^>]*>/g, '') : '')
        || '';
}

/**
 * Graph chat 멤버가 '나(로그인 사용자)'인지 판정한다.
 * userId(aadObjectId)=me.id 또는 UPN/email=me.username 이면 나로 본다.
 * @param {object} member - aadUserConversationMember
 * @param {{id?:string, username?:string}} me
 * @returns {boolean}
 */
function isMe(member, me) {
    const meId = lower(me.id);
    const meName = lower(me.username);
    const uid = lower(member.userId);
    const upn = lower(member.userPrincipalName) || lower(member.email);
    return (!!meId && uid === meId) || (!!meName && upn === meName);
}

// ── 1. 채팅방 목록 ────────────────────────────────────────────────

/**
 * 내 채팅방 목록을 조회한다.
 * 【절차】 1) GET /me/chats?$expand=members 2) 제목 파생(topic 없으면 나 제외 멤버명) 3) 최근순 정렬
 *
 * @param {string} accessToken - Graph access token
 * @param {{id?:string, username?:string}} me - 로그인 사용자 식별자(자기 자신 제외용)
 * @returns {Promise<Array<{chatId,title,chatType,memberNames,lastMessageAt}>>}
 */
async function listChats(accessToken, me = {}) {
    // 1) 채팅 목록 조회 (참여자 포함)
    const data = await graphGet(
        `${GRAPH_BASE}/me/chats?$expand=members&$top=50`,
        accessToken
    );
    const chats = data.value || [];

    // 2) 표시용 정형화
    const shaped = chats.map((chat) => {
        const members = chat.members || [];
        const memberNames = members.map((m) => m.displayName).filter(Boolean);
        // 제목: topic(그룹) → 나 제외 멤버명 조인(1:1/무제목) → 폴백
        const others = members.filter((m) => !isMe(m, me));
        const otherNames = others.map((m) => m.displayName).filter(Boolean);
        const title = chat.topic || otherNames.join(', ') || '(제목 없음)';
        return {
            chatId: chat.id,
            title,
            chatType: chat.chatType || '',
            memberNames,
            lastMessageAt: chat.lastUpdatedDateTime || null,
        };
    });

    // 3) 최근 갱신순 정렬 (없는 방은 뒤로)
    shaped.sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0;
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });
    return shaped;
}

// ── 2. 메시지 읽기 ────────────────────────────────────────────────

/**
 * 특정 채팅의 최근 메시지를 조회한다.
 * 【절차】 1) GET /chats/{id}/messages(desc) 2) 시스템메시지 제외·평문 추출·isMine 3) 오래된→최신 반환
 *
 * @param {string} accessToken
 * @param {string} chatId
 * @param {{limit?:number|string, myId?:string}} opts - limit 기본 20·최대 50, myId=내 aadObjectId
 * @returns {Promise<Array<{id,text,senderName,senderId,createdDateTime,isMine}>>} 오래된→최신
 */
async function getMessages(accessToken, chatId, { limit = 20, myId = '' } = {}) {
    const top = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const data = await graphGet(
        `${GRAPH_BASE}/chats/${encodeURIComponent(chatId)}/messages?$top=${top}&$orderby=createdDateTime desc`,
        accessToken
    );
    const meId = lower(myId);
    const messages = (data.value || [])
        // 시스템 메시지(입장/이름변경 등) 제외 — teamsPoller 규칙과 일치
        .filter((m) => !m.messageType || m.messageType === 'message')
        // 본문이 없는 메시지(삭제됨 등) 제외
        .filter((m) => m.body)
        .map((m) => {
            const senderId = lower(m.from?.user?.id);
            return {
                id: m.id,
                text: extractText(m.body),
                senderName:
                    m.from?.user?.displayName
                    || m.from?.application?.displayName
                    || '알 수 없음',
                senderId,
                createdDateTime: m.createdDateTime,
                isMine: !!meId && senderId === meId,
            };
        });
    // Graph는 최신순(desc)으로 주므로, 화면 표시용으로 오래된→최신 반환
    return messages.reverse();
}

// ── 3. 메시지 전송 ────────────────────────────────────────────────

/**
 * 채팅에 텍스트 메시지를 전송한다. (Chat.ReadWrite)
 * 【절차】 1) POST /chats/{id}/messages {body:{contentType:text,content}} 2) 생성 메시지 정형화(isMine:true)
 *
 * @param {string} accessToken
 * @param {string} chatId
 * @param {string} text - 전송할 평문 (호출부에서 trim·검증 완료 전제)
 * @returns {Promise<{id,text,senderName,senderId,createdDateTime,isMine}>}
 */
async function sendMessage(accessToken, chatId, text) {
    const created = await graphPost(
        `${GRAPH_BASE}/chats/${encodeURIComponent(chatId)}/messages`,
        accessToken,
        { body: { contentType: 'text', content: text } }
    );
    return {
        id: created.id,
        text: extractText(created.body) || text,
        senderName: created.from?.user?.displayName || '나',
        senderId: lower(created.from?.user?.id),
        createdDateTime: created.createdDateTime || new Date().toISOString(),
        isMine: true,
    };
}

export { listChats, getMessages, sendMessage, extractText, isMe };
