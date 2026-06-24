// ============================================
// deeplink.js — Teams 채팅 딥링크 URL 생성 (순수 함수)
// ============================================
//
// P5-E-B: 아바타 머리 위 말풍선 클릭 시 발신자의 Teams 채팅으로 연계한다.
// 외부 상태(브라우저 전역·THREE 등)에 의존하지 않는 순수 모듈로 분리하여
// 브라우저(scene.js)·vitest(deeplink.test.js) 양쪽에서 import 가능하게 한다.
//
// 스킴 출처: Microsoft Learn — "Deep link to a Teams chat" (2026-03-26)
// 설계서 §2.2 스킴 선택 로직을 그대로 구현한다.

const TEAMS_BASE = 'https://teams.microsoft.com/l/chat';
// 웹앱 직행 경로(_# SPA 라우트). 런처 링크(l/)와 달리 msteams: 프로토콜을 호출하지 않으므로
// "데스크톱 앱에서 열기?" 프롬프트 없이 브라우저(Teams 웹)에서 바로 채팅이 열린다.
const TEAMS_WEB_BASE = 'https://teams.microsoft.com/_#/conversations';

/**
 * 딥링크 메타로부터 Teams 채팅 딥링크 URL을 생성한다.
 *
 * 우선순위 (설계서 §2.2):
 *   A (1순위) chatId 있음        → 그 대화로 직접 이동
 *   C (폴백)  senderEmail(UPN) 있음 → 그 사람과 1:1 채팅 열기/생성
 *   불가      둘 다 없음          → null (말풍선 클릭 비활성)
 *
 * @param {object} [meta] - { chatId, senderEmail, tenantId } (messageId는 향후용·미사용)
 * @returns {string|null} 딥링크 URL 또는 null(딥링크 불가)
 */
export function buildTeamsDeeplink(meta) {
    if (!meta) return null;

    // A: 기존 대화로 직접 이동 — 웹앱 직행 경로(_#) 사용 → 데스크톱 앱 실행 프롬프트 없이 웹으로 열린다.
    // chatId 형식 `19:...@thread.v2` 의 `:`·`@` 를 encodeURIComponent 로 인코딩한다.
    if (meta.chatId) {
        return `${TEAMS_WEB_BASE}/${encodeURIComponent(meta.chatId)}?ctx=chat`;
    }

    // C: 이메일(UPN)로 1:1 채팅 열기/생성. users=는 UPN(이메일)만 허용.
    if (meta.senderEmail) {
        const users = encodeURIComponent(meta.senderEmail);
        const tid = encodeURIComponent(meta.tenantId || '');
        return `${TEAMS_BASE}/0/0?users=${users}&tenantId=${tid}`;
    }

    // 딥링크 식별자(chatId·senderEmail)가 모두 없음 → 클릭 비활성.
    return null;
}
