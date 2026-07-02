/**
 * three3d/js/notifications.js
 *
 * Windows(OS) 데스크톱 알림 — Web Notifications API (WJ CHAT-01 후속)
 *
 * METAOFFICE에서 발생하는 이벤트를 카테고리별로 OS 알림(Windows 토스트)으로 띄운다.
 * localhost 는 보안 컨텍스트로 취급되어 http://localhost:3300 에서도 Notification API 사용 가능.
 *
 * 카테고리:
 *   chat    💬 Teams 채팅        (teams-notification)
 *   agent   ✅ 에이전트 완료      (agent-update: working→idle 전이)
 *   meeting 📹 화상회의          (meeting-status: inMeeting)
 *   system  🔔 METAOFFICE 기타   (확장용)
 *
 * scene.js 가 WS 이벤트 수신 시 notify(category, ...) 를 호출한다.
 */

const CATEGORIES = {
    chat:    { emoji: '💬', label: 'Teams 채팅' },
    agent:   { emoji: '✅', label: '에이전트 완료' },
    meeting: { emoji: '📹', label: '화상회의' },
    system:  { emoji: '🔔', label: 'METAOFFICE' },
};

// 카테고리별 on/off (기본 전체 on) — setCategoryEnabled 로 토글 가능
const enabled = { chat: true, agent: true, meeting: true, system: true };
let permission = 'default';

/**
 * 알림 권한을 요청/초기화한다. scene.js 에서 1회 호출.
 * - 로드 시 requestPermission 시도(대부분 브라우저 허용).
 * - 제스처가 필요한 브라우저 대비, 첫 사용자 클릭 시 1회 재요청.
 */
export function initNotifications() {
    if (!('Notification' in window)) {
        console.warn('[notify] 이 브라우저는 Notification API를 지원하지 않습니다.');
        return;
    }
    permission = Notification.permission;
    if (permission === 'default') {
        Notification.requestPermission().then((p) => { permission = p; }).catch(() => {});
        // 제스처 필요 브라우저 폴백: 첫 클릭에서 1회 재요청
        window.addEventListener('click', () => {
            if (permission === 'default') {
                Notification.requestPermission().then((p) => { permission = p; }).catch(() => {});
            }
        }, { once: true });
    }
}

/**
 * OS 알림을 띄운다.
 * @param {'chat'|'agent'|'meeting'|'system'} category
 * @param {string} title - 제목(이모지 자동 접두)
 * @param {string} [body] - 본문
 * @param {{ tag?: string, ttl?: number, silent?: boolean, renotify?: boolean, onClick?: () => void }} [opts]
 */
export function notify(category, title, body, opts = {}) {
    if (!('Notification' in window) || permission !== 'granted') return;
    if (enabled[category] === false) return;

    const cat = CATEGORIES[category] || CATEGORIES.system;
    try {
        const n = new Notification(`${cat.emoji} ${title}`, {
            body: body || '',
            tag: opts.tag || category,        // 동일 tag는 교체 → 스팸 방지
            renotify: !!opts.renotify,
            silent: !!opts.silent,
        });
        // 알림 클릭 → 항상 METAOFFICE 창 포커스 + (있으면) 기능 연결 콜백 실행
        n.onclick = () => {
            try {
                window.focus();
                if (typeof opts.onClick === 'function') opts.onClick();
            } finally {
                n.close();
            }
        };
        // 일정 시간 후 자동 닫힘(일부 OS는 자체 정책 우선)
        setTimeout(() => { try { n.close(); } catch { /* noop */ } }, opts.ttl || 8000);
    } catch {
        /* 알림 생성 실패는 무해화 */
    }
}

/** 카테고리 알림 on/off */
export function setCategoryEnabled(category, on) {
    if (category in enabled) enabled[category] = !!on;
}

/** 현재 권한·카테고리 상태 조회 */
export function getNotificationState() {
    return { permission, enabled: { ...enabled }, categories: Object.keys(CATEGORIES) };
}
