/**
 * server/menu/mealPlan.js
 *
 * MEALPLAN-01 — 2F 식당 주간 식단표
 *
 * SharePoint 공유 URL의 PowerPoint(.pptx) 첫 슬라이드를 Graph 썸네일 API로 받아 캐시한다.
 *   - 식단표는 "1장짜리(매주 내용만 교체)" 구조 → 첫 슬라이드 = 이번 주.
 *   - eTag 변경감지로 내용이 그대로면 재다운로드를 스킵한다.
 *   - 폴백: Graph 실패/미인증 시 기존 캐시 이미지를 그대로 유지한다.
 *           권한 승인 전이라도 data/mealplan.img 파일을 수동으로 넣어두면 그대로 서빙된다.
 *
 * 관례: server.js /api/org-users·chatService 와 동일하게 teamsPoller 의 graphGet/GRAPH_BASE 를
 *       재사용하고, 토큰 획득(refreshTokenIfNeeded)·스케줄·에러 로깅은 server.js 가 담당한다.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { graphGet, GRAPH_BASE } from '../teams/teamsPoller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const IMAGE_PATH = process.env.MEALPLAN_IMAGE || path.join(DATA_DIR, 'mealplan.img');
const META_PATH = path.join(DATA_DIR, 'mealplan.meta.json');

// 식단표 공유 링크(주간식단표.pptx). 필요 시 MEALPLAN_URL 로 덮어쓴다.
const MEALPLAN_URL = process.env.MEALPLAN_URL
    || 'https://ctrcentral.sharepoint.com/:p:/r/sites/CTR-News/_layouts/15/Doc.aspx?sourcedoc=%7BA713FB0F-B068-4C75-9F9D-525827278974%7D&file=CTR%EB%B9%8C%EB%94%A9%20%EC%A3%BC%EA%B0%84%EC%8B%9D%EB%8B%A8%ED%91%9C.pptx&action=edit&mobileredirect=true';

// Graph 썸네일 커스텀 사이즈(첫 슬라이드 렌더). 실패 시 large 로 폴백한다.
const THUMB_SIZE = process.env.MEALPLAN_THUMB || 'c1600x1200';

/** 공유 URL → Graph /shares 인코딩 토큰(u!{base64url}) */
function encodeShareUrl(url) {
    const b64 = Buffer.from(url, 'utf8').toString('base64');
    return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

function loadMeta() {
    try { if (existsSync(META_PATH)) return JSON.parse(readFileSync(META_PATH, 'utf8')); } catch { /* noop */ }
    return {};
}
function saveMeta(meta) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');
}

/** 이미지 매직바이트로 Content-Type 판별(그래프=JPEG, 수동 업로드=PNG/JPEG 대응) */
function sniffContentType(buf) {
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
    return 'image/jpeg';
}

/** 캐시 상태 조회 (GET /api/mealplan 용) */
function getMealPlanStatus() {
    const meta = loadMeta();
    return {
        available: existsSync(IMAGE_PATH),
        fetchedAt: meta.fetchedAt || null,
        source: meta.source || (existsSync(IMAGE_PATH) ? 'manual' : null),
        name: meta.name || null,
        error: meta.lastError || null,
        sourceUrl: MEALPLAN_URL,
    };
}

/** 캐시된 이미지 읽기 (GET /api/mealplan/image 용). 없으면 null */
function readImage() {
    if (!existsSync(IMAGE_PATH)) return null;
    try {
        const buffer = readFileSync(IMAGE_PATH);
        return { buffer, contentType: sniffContentType(buffer) };
    } catch {
        return null;
    }
}

/**
 * Graph에서 식단표 첫 슬라이드 썸네일을 받아 캐시한다.
 * 실패해도 예외를 던지지 않고 상태 문자열로 보고한다(폴백: 기존 캐시 유지).
 *
 * @param {string|null} token - Graph access token (없으면 no_token)
 * @param {(o:object, msg?:string)=>void} log - 구조화 로거(선택)
 * @returns {Promise<{updated:boolean, status:string}>}
 */
async function refreshFromGraph(token, log = () => {}) {
    if (!token) return { updated: false, status: 'no_token' };
    const meta = loadMeta();

    // 1) 공유 URL → driveItem (driveId/itemId/eTag)
    let item;
    try {
        const share = encodeShareUrl(MEALPLAN_URL);
        item = await graphGet(`${GRAPH_BASE}/shares/${share}/driveItem?$select=id,eTag,cTag,name,parentReference`, token);
    } catch (e) {
        saveMeta({ ...meta, lastError: `share_resolve_${e.status || ''}: ${e.message}` });
        log({ event: 'mealplan_share_error', status: e.status, err: e.message }, '식단표 공유 URL 해석 실패');
        return { updated: false, status: 'share_error' };
    }

    const driveId = item.parentReference && item.parentReference.driveId;
    const itemId = item.id;
    const eTag = item.cTag || item.eTag || null;   // cTag=내용 변경(우선), eTag=메타 변경
    if (!driveId || !itemId) {
        saveMeta({ ...meta, lastError: 'no_drive_item' });
        return { updated: false, status: 'no_drive_item' };
    }

    // eTag(내용) 동일 + 이미지 존재 → 재다운로드 스킵
    if (eTag && meta.eTag === eTag && existsSync(IMAGE_PATH)) {
        return { updated: false, status: 'unchanged' };
    }

    // 2) 첫 슬라이드 썸네일 url — 커스텀 사이즈 우선, 실패 시 large 폴백
    let thumbUrl = null;
    try {
        const t = await graphGet(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}/thumbnails/0/${THUMB_SIZE}`, token);
        thumbUrl = t && t.url;
    } catch {
        try {
            const coll = await graphGet(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}/thumbnails`, token);
            const set = (coll && coll.value && coll.value[0]) || {};
            const best = set.large || set.medium || set.small;
            thumbUrl = best && best.url;
        } catch (e2) {
            saveMeta({ ...meta, lastError: `thumb_${e2.status || ''}: ${e2.message}` });
            log({ event: 'mealplan_thumb_error', status: e2.status, err: e2.message }, '식단표 썸네일 조회 실패');
            return { updated: false, status: 'thumb_error' };
        }
    }
    if (!thumbUrl) {
        saveMeta({ ...meta, lastError: 'no_thumb_url' });
        return { updated: false, status: 'no_thumb_url' };
    }

    // 3) 썸네일 바이너리 다운로드 (pre-authenticated URL — Bearer 헤더 불필요)
    try {
        const res = await fetch(thumbUrl);
        if (!res.ok) throw new Error(`thumb download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
        writeFileSync(IMAGE_PATH, buf);
        saveMeta({ eTag, fetchedAt: new Date().toISOString(), source: 'graph', name: item.name || null, lastError: null });
        log({ event: 'mealplan_updated', bytes: buf.length, name: item.name }, '식단표 이미지 갱신 완료');
        return { updated: true, status: 'updated' };
    } catch (e) {
        saveMeta({ ...meta, lastError: `download: ${e.message}` });
        log({ event: 'mealplan_download_error', err: e.message }, '식단표 이미지 다운로드 실패');
        return { updated: false, status: 'download_error' };
    }
}

export { refreshFromGraph, getMealPlanStatus, readImage, MEALPLAN_URL };
