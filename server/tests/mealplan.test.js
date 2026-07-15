/**
 * mealplan.test.js — MEALPLAN-01 단위테스트
 *
 * 대상: /api/mealplan 엔드포인트 3종 (server.js)
 * 프레임워크: vitest + supertest (people.test.js 관례 준수)
 *
 * 커버 항목:
 *   - GET  /api/mealplan          — 상태 조회(available/sourceUrl 필드)
 *   - GET  /api/mealplan/image    — 캐시 없음 404 / PNG·JPEG 캐시 서빙(Content-Type 판별)
 *   - POST /api/mealplan/refresh  — 미인증(no_token) 시에도 200 + 폴백 상태 보고
 *
 * 격리: vitest.config.js 의 MEALPLAN_IMAGE 가 OS 임시경로를 가리킨다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { writeFileSync, rmSync } from 'fs';
import { app } from '../server.js';

const IMAGE_PATH = process.env.MEALPLAN_IMAGE;

/** 테스트 전 캐시 이미지 제거(없어도 무해) */
function clearImage() {
    try { rmSync(IMAGE_PATH, { force: true }); } catch { /* noop */ }
}

// ──────────────────────────────────────────────────────────────
// 1. GET /api/mealplan — 상태 조회
// ──────────────────────────────────────────────────────────────
describe('GET /api/mealplan', () => {
    beforeEach(clearImage);

    it('200 OK + 상태 객체(available·sourceUrl) 반환', async () => {
        const res = await request(app).get('/api/mealplan');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('available');
        expect(res.body).toHaveProperty('sourceUrl');
        expect(res.body.sourceUrl).toContain('sharepoint.com');
    });

    it('캐시 이미지 없으면 available=false', async () => {
        const res = await request(app).get('/api/mealplan');
        expect(res.body.available).toBe(false);
    });

    it('캐시 이미지 있으면 available=true', async () => {
        writeFileSync(IMAGE_PATH, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));   // JPEG 매직
        const res = await request(app).get('/api/mealplan');
        expect(res.body.available).toBe(true);
    });
});

// ──────────────────────────────────────────────────────────────
// 2. GET /api/mealplan/image — 이미지 서빙
// ──────────────────────────────────────────────────────────────
describe('GET /api/mealplan/image', () => {
    beforeEach(clearImage);

    it('캐시 없으면 404 + no_image', async () => {
        const res = await request(app).get('/api/mealplan/image');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('no_image');
    });

    it('JPEG 캐시 → 200 + image/jpeg', async () => {
        writeFileSync(IMAGE_PATH, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x01, 0x02]));
        const res = await request(app).get('/api/mealplan/image');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/jpeg');
    });

    it('PNG 캐시 → 200 + image/png (매직바이트 판별)', async () => {
        writeFileSync(IMAGE_PATH, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]));
        const res = await request(app).get('/api/mealplan/image');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
    });

    it('바이너리 본문이 캐시 내용과 일치', async () => {
        const payload = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0xAA, 0xBB, 0xCC]);
        writeFileSync(IMAGE_PATH, payload);
        const res = await request(app).get('/api/mealplan/image');
        expect(Buffer.compare(res.body, payload)).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────
// 3. POST /api/mealplan/refresh — 수동 갱신(미인증 폴백)
// ──────────────────────────────────────────────────────────────
describe('POST /api/mealplan/refresh', () => {
    beforeEach(clearImage);

    it('토큰 없어도 200 + ok:true + 폴백 상태 보고(no_token)', async () => {
        const res = await request(app).post('/api/mealplan/refresh');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.updated).toBe(false);
        expect(res.body.status).toBe('no_token');
    });

    it('갱신 실패 시 기존 캐시 유지(파괴적이지 않음)', async () => {
        writeFileSync(IMAGE_PATH, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
        await request(app).post('/api/mealplan/refresh');
        const res = await request(app).get('/api/mealplan/image');
        expect(res.status).toBe(200);   // 캐시 그대로 서빙
    });
});
