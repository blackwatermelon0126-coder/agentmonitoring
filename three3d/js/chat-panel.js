/**
 * three3d/js/chat-panel.js
 *
 * 인앱 Teams 채팅 UI (WJ METAOFFICE-CHAT-01)
 *
 * 구성:
 *   - 런처 버튼(💬 채팅)      : 채팅방 목록 사이드패널 토글
 *   - 사이드패널(방 목록)      : GET /api/chats — 방 클릭 시 채팅창 오픈, 안읽음 배지
 *   - 채팅창(오버레이)         : GET/POST /api/chats/:id/messages — 말풍선·입력·전송, 8초 폴링
 *
 * 실시간 수신(설계 §4 이중 전략):
 *   1) 열린 창 8초 폴링(주)   — 등록/미등록 상대 모두 커버
 *   2) teams-notification WS(부) — scene.js 가 handleTeamsNotification 로 전달 → 열린 창 즉시 갱신·닫힌 방 배지
 *
 * 스타일: org-picker 패널과 일관 (rgba(0,0,0,0.6)·monospace·backdrop-blur).
 * 설계 근거: docs/design/_Design/Design_METAOFFICE-CHAT-01.md · MULTIUSER-01 §5(P2: 브라우저 직접 Graph)
 *
 * P2: 채팅은 **본인 MSAL 토큰으로 MS Graph 직접 호출**(chat-graph.js) — 서버 단일토큰 미사용(신분 격리).
 */

import { getAccessToken, getAccount } from './auth-msal.js';
import { listChats as graphListChats, getMessages as graphGetMessages, sendMessage as graphSendMessage } from './chat-graph.js';

const POLL_INTERVAL_MS = 8000;

// ── 모듈 상태 ─────────────────────────────────────────────────────
let API_BASE = '';
let listEl = null;        // 방 목록 컨테이너
let searchEl = null;      // 방 검색 입력창
let windowEl = null;      // 채팅창 컨테이너
let msgAreaEl = null;     // 메시지 스크롤 영역
let inputEl = null;       // 입력창
let titleEl = null;       // 채팅창 헤더 제목

let chats = [];                     // 방 목록 캐시
const unread = new Map();           // chatId → 안읽음 수
let openChatId = null;              // 현재 열린 방
let seenMsgIds = new Set();         // 열린 방에서 렌더된 메시지 id (중복 방지)
let pollTimer = null;

// ── 유틸 ──────────────────────────────────────────────────────────

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 로그인 사용자 식별자(본인 토큰 Graph 호출·isMine용) */
function getMe() {
    const a = getAccount();
    return { id: (a && a.localAccountId) || '', username: (a && a.username) || '' };
}

function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── 방 목록 ───────────────────────────────────────────────────────

async function loadChats() {
    setListStatus('채팅방 불러오는 중…');
    try {
        const token = await getAccessToken();
        if (!token) { setListStatus('로그인이 필요합니다.'); return; }
        chats = await graphListChats(token, getMe());
        if (!Array.isArray(chats) || chats.length === 0) {
            setListStatus('채팅방이 없습니다.');
            return;
        }
        renderChatList();
    } catch (e) {
        setListStatus(e.status === 401 ? '인증 필요 (재로그인 후 사용)' : `조회 실패 (${e.status || '오류'})`);
    }
}

function setListStatus(msg) {
    if (!listEl) return;
    listEl.innerHTML = `<div style="color:#888; font-size:10px; padding:6px 0;">${esc(msg)}</div>`;
}

function renderChatList() {
    if (!listEl) return;
    // 검색: 채팅방 명칭(title) 또는 멤버 이름(memberNames)으로 필터 (대소문자 무시)
    const q = ((searchEl && searchEl.value) || '').toLowerCase().trim();
    const filtered = q
        ? chats.filter((c) =>
            (c.title || '').toLowerCase().includes(q)
            || (c.memberNames || []).some((n) => (n || '').toLowerCase().includes(q)))
        : chats;

    listEl.innerHTML = '';
    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#888; font-size:10px; padding:6px 0;';
        empty.textContent = q ? '검색 결과 없음' : '채팅방이 없습니다.';
        listEl.appendChild(empty);
        return;
    }
    filtered.forEach((c) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-top:1px solid #2a2a2a; cursor:pointer;';
        const n = unread.get(c.chatId) || 0;
        row.innerHTML = `
            <div style="min-width:0;">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(c.title)}</div>
                <div style="color:#888; font-size:10px;">${esc(c.chatType || '')}</div>
            </div>
            ${n > 0 ? `<span style="flex:none; background:#E74C3C; color:#fff; border-radius:10px; padding:1px 7px; font-size:10px; font-weight:bold;">${n}</span>` : ''}
        `;
        row.onmouseover = () => { row.style.background = 'rgba(255,255,255,0.06)'; };
        row.onmouseout = () => { row.style.background = 'transparent'; };
        row.onclick = () => openChat(c.chatId, c.title);
        listEl.appendChild(row);
    });
}

// ── 채팅창 ────────────────────────────────────────────────────────

/**
 * 특정 채팅방을 연다. (아바타 말풍선 클릭 연동 진입점)
 * @param {string} chatId
 * @param {string} title
 */
export async function openChat(chatId, title) {
    openChatId = chatId;
    seenMsgIds = new Set();
    unread.set(chatId, 0);
    renderChatList();

    if (titleEl) titleEl.textContent = title || '채팅';
    if (windowEl) windowEl.style.display = 'flex';
    if (msgAreaEl) msgAreaEl.innerHTML = '<div style="color:#888; font-size:11px; padding:6px;">불러오는 중…</div>';

    await loadMessages(true);
    startPoll();
    if (inputEl) inputEl.focus();
}

function closeChat() {
    openChatId = null;
    stopPoll();
    if (windowEl) windowEl.style.display = 'none';
}

async function loadMessages(initial) {
    if (!openChatId) return;
    try {
        const token = await getAccessToken();
        if (!token) return;
        const msgs = await graphGetMessages(token, openChatId, { limit: 30, myId: getMe().id });
        if (initial) {
            msgAreaEl.innerHTML = '';
            seenMsgIds = new Set();
        }
        let appended = 0;
        msgs.forEach((m) => {
            if (seenMsgIds.has(m.id)) return;
            seenMsgIds.add(m.id);
            appendMessage(m);
            appended++;
        });
        if (initial && msgs.length === 0) {
            msgAreaEl.innerHTML = '<div style="color:#888; font-size:11px; padding:6px;">메시지가 없습니다.</div>';
        }
        if (appended > 0) scrollToBottom();
    } catch (e) {
        if (initial) msgAreaEl.innerHTML = `<div style="color:#f66; font-size:11px; padding:6px;">불러오기 실패 (${e.status || '오류'})</div>`;
    }
}

function appendMessage(m) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex; flex-direction:column; margin:4px 0; align-items:${m.isMine ? 'flex-end' : 'flex-start'};`;

    if (!m.isMine) {
        const sender = document.createElement('div');
        sender.style.cssText = 'color:#aaa; font-size:10px; margin-bottom:2px;';
        sender.textContent = m.senderName || '';
        wrap.appendChild(sender);
    }

    const bubble = document.createElement('div');
    bubble.style.cssText = `
        max-width:80%; padding:6px 9px; border-radius:10px; font-size:12px; line-height:1.4;
        word-break:break-word; white-space:pre-wrap;
        background:${m.isMine ? '#2980B9' : '#3a3a3a'}; color:#fff;
    `;
    bubble.textContent = m.text || '';
    wrap.appendChild(bubble);

    const time = document.createElement('div');
    time.style.cssText = 'color:#777; font-size:9px; margin-top:2px;';
    time.textContent = fmtTime(m.createdDateTime);
    wrap.appendChild(time);

    msgAreaEl.appendChild(wrap);
}

function scrollToBottom() {
    if (msgAreaEl) msgAreaEl.scrollTop = msgAreaEl.scrollHeight;
}

async function sendCurrent() {
    if (!openChatId || !inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.disabled = true;
    try {
        const token = await getAccessToken();
        if (!token) { alert('로그인이 필요합니다 (재로그인 후 사용).'); return; }
        const sent = await graphSendMessage(token, openChatId, text);
        inputEl.value = '';
        // 전송 성공 응답으로만 append + 중복 방지 (설계 리스크 대응)
        if (sent && sent.id && !seenMsgIds.has(sent.id)) {
            seenMsgIds.add(sent.id);
            appendMessage(sent);
            scrollToBottom();
        }
    } catch (e) {
        alert(e.status === 401 ? '인증이 필요합니다 (재로그인 후 사용).' : `전송 실패 (${e.status || '오류'})`);
    } finally {
        inputEl.disabled = false;
        inputEl.focus();
    }
}

// ── 실시간 수신 ───────────────────────────────────────────────────

function startPoll() {
    stopPoll();
    pollTimer = setInterval(() => loadMessages(false), POLL_INTERVAL_MS);
}

function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/**
 * WS teams-notification 수신 처리 (scene.js 에서 호출).
 * 열린 방이면 즉시 갱신, 닫힌 방이면 안읽음 배지 +1.
 * @param {object} data - { message: { chatId, ... }, ... }
 */
export function handleTeamsNotification(data) {
    const chatId = data?.message?.chatId;
    if (!chatId) return;
    if (chatId === openChatId) {
        loadMessages(false);   // 열린 창 → 새 메시지만 append
    } else {
        unread.set(chatId, (unread.get(chatId) || 0) + 1);
        renderChatList();
    }
}

/** 특정 채팅창이 현재 열려 있는지 여부 (OS 알림 중복 억제용) */
export function isChatOpen(chatId) {
    return !!chatId && openChatId === chatId;
}

// ── 초기화 (런처·패널·채팅창 생성) ────────────────────────────────

/**
 * 채팅 UI를 초기화한다. scene.js 에서 1회 호출.
 * @param {{ apiBase: string }} opts
 */
export function initChatPanel({ apiBase }) {
    API_BASE = apiBase ?? ''; // '' = 같은 origin(상대경로). nginx HTTPS 뒤/로컬 3300 양쪽 동작

    // 런처 버튼 — '+ 사람 추가'(bottom:16px) 위에 배치
    const launcher = document.createElement('button');
    launcher.textContent = '💬 채팅';
    launcher.style.cssText = `
        position: fixed; bottom: 56px; right: 16px; z-index: 100;
        background: #2980B9; color: #fff; border: none; border-radius: 8px;
        padding: 8px 16px; font-size: 13px; font-family: monospace;
        cursor: pointer; font-weight: bold;
    `;
    launcher.onmouseover = () => { launcher.style.background = '#2471A3'; };
    launcher.onmouseout = () => { launcher.style.background = '#2980B9'; };

    // 방 목록 사이드패널
    const panel = document.createElement('div');
    panel.id = 'chat-list-panel';
    panel.style.cssText = `
        position: fixed; bottom: 96px; right: 16px; z-index: 100; display: none;
        color: #fff; font-family: monospace; font-size: 12px;
        background: rgba(0,0,0,0.6); padding: 10px 14px; border-radius: 8px;
        backdrop-filter: blur(4px); width: 280px; max-height: 50vh;
        flex-direction: column; overflow: hidden;
    `;
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;';
    header.innerHTML = `
        <span style="text-transform:uppercase; letter-spacing:1px; color:#888;">채팅방</span>
        <span id="chat-refresh" title="새로고침" style="color:#aaa; cursor:pointer;">⟳</span>
    `;
    // 검색창 — 채팅방 명칭·멤버 이름 필터 (org-picker 스타일과 일관)
    searchEl = document.createElement('input');
    searchEl.type = 'text';
    searchEl.placeholder = '채팅방·이름 검색…';
    searchEl.style.cssText = `
        background:rgba(255,255,255,0.06); color:#fff; border:1px solid #333;
        border-radius:4px; padding:5px 8px; font-family:monospace; font-size:11px;
        outline:none; margin-bottom:8px;
    `;
    searchEl.addEventListener('input', () => renderChatList());

    listEl = document.createElement('div');
    listEl.style.cssText = 'overflow-y:auto; min-height:0; max-height:44vh; scrollbar-width:thin; scrollbar-color:#444 transparent;';
    panel.appendChild(header);
    panel.appendChild(searchEl);
    panel.appendChild(listEl);

    // 채팅창
    windowEl = document.createElement('div');
    windowEl.id = 'chat-window';
    windowEl.style.cssText = `
        position: fixed; bottom: 96px; right: 308px; z-index: 101; display: none;
        flex-direction: column; width: 340px; height: 440px;
        color: #fff; font-family: monospace; font-size: 12px;
        background: rgba(0,0,0,0.72); border-radius: 8px; backdrop-filter: blur(4px);
        overflow: hidden;
    `;
    const winHeader = document.createElement('div');
    winHeader.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #333;';
    titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    titleEl.textContent = '채팅';
    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:#aaa; cursor:pointer; padding-left:8px;';
    closeBtn.onclick = closeChat;
    winHeader.appendChild(titleEl);
    winHeader.appendChild(closeBtn);

    msgAreaEl = document.createElement('div');
    msgAreaEl.style.cssText = 'flex:1; overflow-y:auto; padding:8px 12px; min-height:0; scrollbar-width:thin; scrollbar-color:#444 transparent;';

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex; gap:6px; padding:8px; border-top:1px solid #333;';
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.placeholder = '메시지 입력…';
    inputEl.style.cssText = `
        flex:1; background:rgba(255,255,255,0.06); color:#fff; border:1px solid #333;
        border-radius:4px; padding:6px 8px; font-family:monospace; font-size:12px; outline:none;
    `;
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendCurrent(); }
    });
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '전송';
    sendBtn.style.cssText = `
        flex:none; background:#2980B9; color:#fff; border:none; border-radius:4px;
        padding:6px 12px; font-family:monospace; font-size:12px; cursor:pointer; font-weight:bold;
    `;
    sendBtn.onclick = sendCurrent;
    inputRow.appendChild(inputEl);
    inputRow.appendChild(sendBtn);

    windowEl.appendChild(winHeader);
    windowEl.appendChild(msgAreaEl);
    windowEl.appendChild(inputRow);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    document.body.appendChild(windowEl);

    // 이벤트 배선
    let listLoaded = false;
    launcher.onclick = () => {
        const open = panel.style.display === 'none';
        panel.style.display = open ? 'flex' : 'none';
        if (open && !listLoaded) { listLoaded = true; loadChats(); }
        else if (open) { loadChats(); }
    };
    header.querySelector('#chat-refresh').onclick = () => loadChats();
}
