/**
 * org-users.test.js — 조직 사용자 피커 백엔드 엔드포인트 단위테스트 (ZTRACE-5 T축)
 *
 * 대상:
 *   GET /api/org-users
 *
 * 프레임워크: vitest + supertest
 *
 * 설계:
 *   - 실제 data/token.json 유무에 관계없이 결정적으로 테스트하기 위해
 *     ../auth/msalClient.js (refreshTokenIfNeeded) 와
 *     ../teams/teamsPoller.js (graphGet) 를 vi.mock 으로 스텁한다.
 *   - 라이브 Graph 호출 없이 토큰 없음(401)·정상·도메인 필터·정렬·Graph 에러 경로를 검증한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── 모킹: 토큰 획득과 Graph 호출을 제어한다 ──────────────────────
// refreshTokenIfNeeded 의 반환값을 테스트마다 바꿔 401 / 정상 경로를 만든다.
const mockRefreshToken = vi.fn();
const mockGraphGet = vi.fn();

vi.mock('../auth/msalClient.js', () => ({
    // server.js 가 import 하는 심볼만 스텁 (나머지는 미사용)
    refreshTokenIfNeeded: () => mockRefreshToken(),
    getDeviceCodeUrl: vi.fn(),
    getAuthStatus: () => ({ authenticated: false, account: null }),
}));

vi.mock('../teams/teamsPoller.js', () => ({
    startPolling: vi.fn(),
    graphGet: (url, token) => mockGraphGet(url, token),
    GRAPH_BASE: 'https://graph.microsoft.com/v1.0',
}));

// app 은 위 모킹이 적용된 상태로 import 되어야 한다.
const { app } = await import('../server.js');

beforeEach(() => {
    mockRefreshToken.mockReset();
    mockGraphGet.mockReset();
});

// ──────────────────────────────────────────────────────────────
// GET /api/org-users
// ──────────────────────────────────────────────────────────────
describe('GET /api/org-users', () => {
    it('토큰 없으면 401 not_authenticated', async () => {
        mockRefreshToken.mockResolvedValue(null);
        const res = await request(app).get('/api/org-users');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('not_authenticated');
    });

    it('정상: [{ displayName, email, jobTitle }] 반환 + displayName 오름차순 정렬', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        mockGraphGet.mockResolvedValue({
            value: [
                { displayName: 'Hong', mail: 'hong@formationlabs.co.kr', userPrincipalName: 'hong@formationlabs.co.kr', jobTitle: 'Developer' },
                { displayName: 'Bae', mail: 'bae@formationlabs.co.kr', jobTitle: '' },
            ],
        });
        const res = await request(app).get('/api/org-users');
        expect(res.status).toBe(200);
        // localeCompare 정렬: Bae < Hong
        expect(res.body).toEqual([
            { displayName: 'Bae', email: 'bae@formationlabs.co.kr', jobTitle: '' },
            { displayName: 'Hong', email: 'hong@formationlabs.co.kr', jobTitle: 'Developer' },
        ]);
    });

    it('@formationlabs.co.kr 도메인만 필터 (ctr.co.kr · 빈 mail 제외, 대소문자 무시)', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        mockGraphGet.mockResolvedValue({
            value: [
                { displayName: 'AInternal', mail: 'in@formationlabs.co.kr', jobTitle: 'A' },
                { displayName: 'BCtr',      mail: 'someone@ctr.co.kr', jobTitle: 'B' },
                { displayName: 'CNoMail',   mail: null, jobTitle: 'C' },
                { displayName: 'DCapDomain', mail: 'CAP@Formationlabs.co.kr', jobTitle: 'D' },
            ],
        });
        const res = await request(app).get('/api/org-users');
        expect(res.status).toBe(200);
        // AInternal + DCapDomain 2명만 통과 (정렬: AInternal < DCapDomain)
        expect(res.body.map(u => u.email)).toEqual([
            'in@formationlabs.co.kr',
            'CAP@Formationlabs.co.kr',
        ]);
        expect(res.body[0]).toHaveProperty('displayName');
        expect(res.body[0]).toHaveProperty('email');
        expect(res.body[0]).toHaveProperty('jobTitle');
    });

    it('Graph 에러(403) → 동일 상태코드로 graceful 전파', async () => {
        mockRefreshToken.mockResolvedValue('fake-token');
        const err = new Error('Graph API 403');
        err.status = 403;
        mockGraphGet.mockRejectedValue(err);
        const res = await request(app).get('/api/org-users');
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('graph_error');
    });
});
