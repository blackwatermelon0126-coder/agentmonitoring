/**
 * three3d/js/chat-graph.js
 *
 * 브라우저에서 **본인 MSAL 토큰**으로 MS Graph 채팅을 직접 호출 (WJ MULTIUSER-01 P2).
 *
 * 서버 chatService.js 로직을 브라우저로 이식했다. 서버에 사용자 토큰을 전송하지 않으므로
 * 각 사용자는 **본인 Teams** 만 조회/전송한다(신분 격리). Graph 는 SPA용 CORS를 지원.
 *   - listChats(token, me)                 : 내 채팅방 목록(제목 파생·최근순)
 *   - getMessages(token, chatId, {limit,myId}) : 메시지(오래된→최신·isMine)
 *   - sendMessage(token, chatId, text)     : 전송(Chat.ReadWrite)
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';
const lower = (s) => (s || '').toLowerCase().trim();

function extractText(body) {
    if (!body) return '';
    return body.plainTextContent
        || (body.content ? body.content.replace(/<[^>]*>/g, '') : '')
        || '';
}

/** Graph chat 멤버가 '나'인지 (userId=aadObjectId 또는 UPN/email 매칭) */
function isMe(member, me) {
    const meId = lower(me.id);
    const meName = lower(me.username);
    const uid = lower(member.userId);
    const upn = lower(member.userPrincipalName) || lower(member.email);
    return (!!meId && uid === meId) || (!!meName && upn === meName);
}

async function graphGet(url, token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const e = new Error(`Graph ${res.status}`); e.status = res.status; throw e; }
    return res.json();
}

async function graphPost(url, token, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) { const e = new Error(`Graph ${res.status}`); e.status = res.status; throw e; }
    return res.json();
}

/** 내 채팅방 목록 — GET /me/chats?$expand=members, 제목 파생·최근 갱신순 */
export async function listChats(token, me = {}) {
    const data = await graphGet(`${GRAPH}/me/chats?$expand=members&$top=50`, token);
    const chats = (data.value || []).map((chat) => {
        const members = chat.members || [];
        const others = members.filter((m) => !isMe(m, me));
        const title = chat.topic
            || others.map((m) => m.displayName).filter(Boolean).join(', ')
            || '(제목 없음)';
        return {
            chatId: chat.id,
            title,
            chatType: chat.chatType || '',
            memberNames: members.map((m) => m.displayName).filter(Boolean),
            lastMessageAt: chat.lastUpdatedDateTime || null,
        };
    });
    chats.sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0;
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });
    return chats;
}

/** 채팅 메시지 — GET /chats/{id}/messages(desc), 시스템메시지 제외·평문·isMine, 오래된→최신 반환 */
export async function getMessages(token, chatId, { limit = 20, myId = '' } = {}) {
    const top = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const data = await graphGet(
        `${GRAPH}/chats/${encodeURIComponent(chatId)}/messages?$top=${top}&$orderby=createdDateTime desc`,
        token
    );
    const meId = lower(myId);
    const msgs = (data.value || [])
        .filter((m) => !m.messageType || m.messageType === 'message')
        .filter((m) => m.body)
        .map((m) => {
            const senderId = lower(m.from && m.from.user && m.from.user.id);
            return {
                id: m.id,
                text: extractText(m.body),
                senderName:
                    (m.from && m.from.user && m.from.user.displayName)
                    || (m.from && m.from.application && m.from.application.displayName)
                    || '알 수 없음',
                senderId,
                createdDateTime: m.createdDateTime,
                isMine: !!meId && senderId === meId,
            };
        });
    return msgs.reverse();
}

/** 메시지 전송 — POST /chats/{id}/messages {body:{contentType:text,content}} */
export async function sendMessage(token, chatId, text) {
    const created = await graphPost(
        `${GRAPH}/chats/${encodeURIComponent(chatId)}/messages`,
        token,
        { body: { contentType: 'text', content: text } }
    );
    return {
        id: created.id,
        text: extractText(created.body) || text,
        senderName: (created.from && created.from.user && created.from.user.displayName) || '나',
        senderId: lower(created.from && created.from.user && created.from.user.id),
        createdDateTime: created.createdDateTime || new Date().toISOString(),
        isMine: true,
    };
}
