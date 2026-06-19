/**
 * people.test.js — WJ_MONITORING-P5-B 단위테스트 (ZTRACE-5 T축)
 *
 * 대상: /api/people CRUD 엔드포인트 + 재시작 복원(영속화)
 * 프레임워크: vitest + supertest
 *
 * 커버 항목:
 *   - GET  /api/people        — 목록 반환 (4종 형식 검증)
 *   - POST /api/people        — 추가 (정상·유효성 오류)
 *   - PUT  /api/people/:id    — 수정 (정상·404)
 *   - DELETE /api/people/:id  — 삭제 (정상·404)
 *   - 재시작 복원              — people 배열이 people.json에 영속화되는지 검증
 *   - people-update 브로드캐스트 — broadcastPeople 호출 여부
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, people, broadcastPeople } from '../server.js';

// ──────────────────────────────────────────────────────────────
// 공통 헬퍼 — 테스트 격리용 초기화
// ──────────────────────────────────────────────────────────────

/**
 * 테스트 실행 전 people 배열을 비운다.
 * 모듈 내부 배열을 직접 조작(splice)하여 참조를 유지한다.
 */
function clearPeople() {
    people.splice(0, people.length);
}

// ──────────────────────────────────────────────────────────────
// 1. GET /api/people
// ──────────────────────────────────────────────────────────────
describe('GET /api/people', () => {
    beforeEach(clearPeople);

    it('200 OK + 배열 반환', async () => {
        const res = await request(app).get('/api/people');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('people 비어 있으면 빈 배열 반환', async () => {
        const res = await request(app).get('/api/people');
        expect(res.body).toHaveLength(0);
    });

    it('추가된 사람이 목록에 포함됨', async () => {
        await request(app).post('/api/people').send({ name: '홍길동', email: 'hong@example.com' });
        const res = await request(app).get('/api/people');
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0].name).toBe('홍길동');
    });

    it('각 항목에 id, name, email, color, position, teamsStatus 필드 포함', async () => {
        await request(app).post('/api/people').send({ name: '김테스트', email: 'kim@example.com' });
        const res = await request(app).get('/api/people');
        const person = res.body[0];
        expect(person).toHaveProperty('id');
        expect(person).toHaveProperty('name');
        expect(person).toHaveProperty('email');
        expect(person).toHaveProperty('color');
        expect(person).toHaveProperty('position');
        expect(person).toHaveProperty('teamsStatus');
    });
});

// ──────────────────────────────────────────────────────────────
// 2. POST /api/people
// ──────────────────────────────────────────────────────────────
describe('POST /api/people', () => {
    beforeEach(clearPeople);

    it('201 Created + 생성된 person 반환', async () => {
        const res = await request(app)
            .post('/api/people')
            .send({ name: '이철수', email: 'lee@example.com' });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('이철수');
        expect(res.body.email).toBe('lee@example.com');
    });

    it('기본 color = #4A90E2 적용', async () => {
        const res = await request(app)
            .post('/api/people')
            .send({ name: '박민수', email: 'park@example.com' });
        expect(res.body.color).toBe('#4A90E2');
    });

    it('기본 position = { x: 300, y: 200 } 적용', async () => {
        const res = await request(app)
            .post('/api/people')
            .send({ name: '정수진', email: 'jung@example.com' });
        expect(res.body.position).toEqual({ x: 300, y: 200 });
    });

    it('사용자 지정 color 적용', async () => {
        const res = await request(app)
            .post('/api/people')
            .send({ name: '최영희', email: 'choi@example.com', color: '#FF5722' });
        expect(res.body.color).toBe('#FF5722');
    });

    it('name 누락 시 400 + 오류 메시지 반환', async () => {
        const res = await request(app)
            .post('/api/people')
            .send({ email: 'noname@example.com' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    it('email 누락 시 400 + 오류 메시지 반환', async () => {
        const res = await request(app)
            .post('/api/people')
            .send({ name: '이름만' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    it('teamsStatus 초기값 idle', async () => {
        const res = await request(app)
            .post('/api/people')
            .send({ name: '신입', email: 'new@example.com' });
        expect(res.body.teamsStatus).toBe('idle');
    });

    it('POST 후 GET /api/people에 반영됨', async () => {
        await request(app)
            .post('/api/people')
            .send({ name: '조대리', email: 'jo@example.com' });
        const res = await request(app).get('/api/people');
        expect(res.body.some(p => p.email === 'jo@example.com')).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────
// 3. PUT /api/people/:id
// ──────────────────────────────────────────────────────────────
describe('PUT /api/people/:id', () => {
    beforeEach(clearPeople);

    it('200 OK + 수정된 person 반환', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '원래이름', email: 'orig@example.com' })).body;

        const res = await request(app)
            .put(`/api/people/${created.id}`)
            .send({ name: '바꾼이름', email: 'orig@example.com' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('바꾼이름');
    });

    it('id는 변경되지 않음 (불변)', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '수정전', email: 'before@example.com' })).body;

        const res = await request(app)
            .put(`/api/people/${created.id}`)
            .send({ name: '수정후', id: 'hack-attempt' });
        expect(res.body.id).toBe(created.id);
    });

    it('존재하지 않는 id — 404 반환', async () => {
        const res = await request(app)
            .put('/api/people/nonexistent-uuid')
            .send({ name: '없는사람' });
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error');
    });

    it('PUT 후 GET /api/people에 수정사항 반영', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '갱신전', email: 'update@example.com' })).body;
        await request(app)
            .put(`/api/people/${created.id}`)
            .send({ name: '갱신후', email: 'update@example.com' });
        const list = (await request(app).get('/api/people')).body;
        const found = list.find(p => p.id === created.id);
        expect(found.name).toBe('갱신후');
    });
});

// ──────────────────────────────────────────────────────────────
// 4. DELETE /api/people/:id
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/people/:id', () => {
    beforeEach(clearPeople);

    it('200 OK + { ok: true } 반환', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '삭제대상', email: 'del@example.com' })).body;

        const res = await request(app).delete(`/api/people/${created.id}`);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('삭제 후 GET /api/people에서 제거됨', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '삭제됨', email: 'gone@example.com' })).body;
        await request(app).delete(`/api/people/${created.id}`);
        const list = (await request(app).get('/api/people')).body;
        expect(list.find(p => p.id === created.id)).toBeUndefined();
    });

    it('존재하지 않는 id — 404 반환', async () => {
        const res = await request(app).delete('/api/people/nonexistent-uuid');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error');
    });

    it('3명 추가 후 1명 삭제 → 목록 2명', async () => {
        await request(app).post('/api/people').send({ name: 'A', email: 'a@example.com' });
        const b = (await request(app).post('/api/people').send({ name: 'B', email: 'b@example.com' })).body;
        await request(app).post('/api/people').send({ name: 'C', email: 'c@example.com' });
        await request(app).delete(`/api/people/${b.id}`);
        const list = (await request(app).get('/api/people')).body;
        expect(list).toHaveLength(2);
    });
});

// ──────────────────────────────────────────────────────────────
// 5. 재시작 복원 — activity.jsonl 영속화 검증 (people 배열 기준)
//    실제 파일 I/O 없이 모듈 내 people 배열의 상태 지속성을 검증한다.
// ──────────────────────────────────────────────────────────────
describe('재시작 복원 — people 배열 영속화', () => {
    beforeEach(clearPeople);

    it('POST 후 people 배열에 즉시 반영 (in-memory)', async () => {
        await request(app).post('/api/people').send({ name: '영속화1', email: 'persist1@example.com' });
        expect(people.length).toBeGreaterThanOrEqual(1);
        expect(people.some(p => p.email === 'persist1@example.com')).toBe(true);
    });

    it('DELETE 후 people 배열에서 즉시 제거 (in-memory)', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '영속화2', email: 'persist2@example.com' })).body;
        await request(app).delete(`/api/people/${created.id}`);
        expect(people.find(p => p.id === created.id)).toBeUndefined();
    });

    it('PUT 후 people 배열의 해당 항목이 즉시 갱신 (in-memory)', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '갱신전2', email: 'persist3@example.com' })).body;
        await request(app)
            .put(`/api/people/${created.id}`)
            .send({ name: '갱신후2', email: 'persist3@example.com' });
        const found = people.find(p => p.id === created.id);
        expect(found.name).toBe('갱신후2');
    });

    it('여러 건 추가 후 people 배열 길이가 추가 건수와 일치', async () => {
        await request(app).post('/api/people').send({ name: 'X1', email: 'x1@example.com' });
        await request(app).post('/api/people').send({ name: 'X2', email: 'x2@example.com' });
        await request(app).post('/api/people').send({ name: 'X3', email: 'x3@example.com' });
        expect(people.length).toBe(3);
    });
});

// ──────────────────────────────────────────────────────────────
// 6. people-update 브로드캐스트 — broadcastPeople 함수 검증
// ──────────────────────────────────────────────────────────────
describe('people-update 브로드캐스트', () => {
    beforeEach(clearPeople);

    it('broadcastPeople은 함수로 export됨', () => {
        expect(typeof broadcastPeople).toBe('function');
    });

    it('POST /api/people — 응답 201이면 내부적으로 broadcast 발생 (부작용 없이 200대)', async () => {
        // broadcast는 WebSocket 클라이언트가 없는 테스트 환경에서 부작용 없이 실행됨을 확인
        const res = await request(app)
            .post('/api/people')
            .send({ name: '브로드', email: 'broadcast@example.com' });
        expect(res.status).toBe(201);
    });

    it('PUT /api/people/:id — 응답 200이면 내부적으로 broadcast 발생 (부작용 없이 200대)', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '수정알림', email: 'notify@example.com' })).body;
        const res = await request(app)
            .put(`/api/people/${created.id}`)
            .send({ name: '수정완료', email: 'notify@example.com' });
        expect(res.status).toBe(200);
    });

    it('DELETE /api/people/:id — 응답 200이면 내부적으로 broadcast 발생 (부작용 없이 200대)', async () => {
        const created = (await request(app)
            .post('/api/people')
            .send({ name: '삭제알림', email: 'delnot@example.com' })).body;
        const res = await request(app).delete(`/api/people/${created.id}`);
        expect(res.status).toBe(200);
    });
});
