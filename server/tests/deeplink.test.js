/**
 * deeplink.test.js — Teams 딥링크 URL 생성 순수 함수 단위테스트 (ZTRACE-5 T축)
 *
 * 대상:
 *   buildTeamsDeeplink(meta)  (three3d/js/deeplink.js)
 *
 * 프레임워크: vitest
 *
 * 설계 (Design_Monitoring_P5E_TeamsBubble_Deeplink.md §2.2):
 *   A (1순위) chatId 있음        → /l/chat/<chatId>/conversations
 *   C (폴백)  senderEmail(UPN) 있음 → /l/chat/0/0?users=<email>&tenantId=<tid>
 *   불가      둘 다 없음          → null
 *
 * deeplink.js 는 THREE 등 브라우저 전역에 의존하지 않는 순수 모듈이므로
 * jsdom 없이 그대로 import 하여 검증한다.
 */
import { describe, it, expect } from 'vitest';
import { buildTeamsDeeplink } from '../../three3d/js/deeplink.js';

describe('buildTeamsDeeplink (A: chatId 1순위)', () => {
    it('chatId 있으면 웹앱 직행 경로(_#/conversations/<chatId>?ctx=chat) 반환', () => {
        const url = buildTeamsDeeplink({ chatId: '19:abc@thread.v2' });
        expect(url).toBe(
            'https://teams.microsoft.com/_#/conversations/19%3Aabc%40thread.v2?ctx=chat',
        );
    });

    it('chatId가 senderEmail보다 우선(둘 다 있으면 A)', () => {
        const url = buildTeamsDeeplink({
            chatId: '19:xyz@thread.v2',
            senderEmail: 'hong@formationlabs.co.kr',
            tenantId: '7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f',
        });
        expect(url).toContain('/_#/conversations/19%3Axyz%40thread.v2?ctx=chat');
        expect(url).not.toContain('users=');
    });

    it('chatId 경로 세그먼트의 `:`·`@`를 encodeURIComponent 인코딩', () => {
        const url = buildTeamsDeeplink({ chatId: '19:meeting_id@unq.gbl.spaces' });
        // `:` → %3A, `@` → %40 (점은 인코딩 비대상)
        expect(url).toBe(
            'https://teams.microsoft.com/_#/conversations/19%3Ameeting_id%40unq.gbl.spaces?ctx=chat',
        );
    });
});

describe('buildTeamsDeeplink (C: senderEmail 폴백)', () => {
    it('chatId 없고 senderEmail 있으면 /l/chat/0/0?users=...&tenantId=...', () => {
        const url = buildTeamsDeeplink({
            senderEmail: 'hong@formationlabs.co.kr',
            tenantId: '7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f',
        });
        expect(url).toBe(
            'https://teams.microsoft.com/l/chat/0/0?users=hong%40formationlabs.co.kr' +
                '&tenantId=7626d4cb-4eb7-40ae-96db-5fd0b9c7db8f',
        );
    });

    it('email의 `@`·`+` 등을 encodeURIComponent 인코딩', () => {
        const url = buildTeamsDeeplink({
            senderEmail: 'user+tag@formationlabs.co.kr',
            tenantId: 'tid-1',
        });
        expect(url).toContain('users=user%2Btag%40formationlabs.co.kr');
        expect(url).toContain('tenantId=tid-1');
    });

    it('tenantId 부재 시에도 graceful(빈 tenantId)', () => {
        const url = buildTeamsDeeplink({ senderEmail: 'a@formationlabs.co.kr' });
        expect(url).toBe(
            'https://teams.microsoft.com/l/chat/0/0?users=a%40formationlabs.co.kr&tenantId=',
        );
    });
});

describe('buildTeamsDeeplink (불가: null)', () => {
    it('chatId·senderEmail 모두 없으면 null', () => {
        expect(buildTeamsDeeplink({})).toBeNull();
        expect(buildTeamsDeeplink({ messageId: 'm1', tenantId: 'tid' })).toBeNull();
    });

    it('meta 자체가 undefined/null이면 null (방어)', () => {
        expect(buildTeamsDeeplink(undefined)).toBeNull();
        expect(buildTeamsDeeplink(null)).toBeNull();
    });

    it('chatId가 빈 문자열이면 senderEmail 폴백, 둘 다 빈 문자열이면 null', () => {
        // 빈 chatId는 falsy → senderEmail 폴백으로 진행
        const url = buildTeamsDeeplink({ chatId: '', senderEmail: 'b@formationlabs.co.kr', tenantId: 't' });
        expect(url).toContain('/l/chat/0/0?users=b%40formationlabs.co.kr');
        // 둘 다 빈 문자열 → null
        expect(buildTeamsDeeplink({ chatId: '', senderEmail: '' })).toBeNull();
    });
});
