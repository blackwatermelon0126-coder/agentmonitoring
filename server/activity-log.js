/**
 * activity-log.js — 활동 이력 파일 영속화 모듈
 *
 * 각 이벤트를 JSON Lines(NDJSON) 형식으로 data/activity.jsonl 에 append 저장한다.
 * 서버 시작 시 파일에서 최근 50건을 읽어 메모리 링버퍼를 초기화한다.
 *
 * 파일 경로: ACTIVITY_LOG_PATH 환경변수 또는 기본값 ./data/activity.jsonl
 */

import fs from 'fs';
import path from 'path';

const ACTIVITY_LIMIT = 50;
const LOG_PATH = process.env.ACTIVITY_LOG_PATH || path.join(process.cwd(), 'data', 'activity.jsonl');

/**
 * 로그 파일 디렉토리가 없으면 생성 (graceful)
 */
function ensureDir() {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * 파일에서 최근 N개 항목을 읽어 배열로 반환한다.
 * 파일이 없거나 파싱 실패한 줄은 조용히 건너뛴다.
 *
 * @param {number} limit - 반환할 최대 항목 수 (기본 50)
 * @returns {Array<object>}
 */
function loadRecentEntries(limit = ACTIVITY_LIMIT) {
    try {
        if (!fs.existsSync(LOG_PATH)) return [];
        const content = fs.readFileSync(LOG_PATH, 'utf8');
        const lines = content.split('\n').filter(l => l.trim() !== '');
        const recent = lines.slice(-limit);
        return recent.reduce((acc, line) => {
            try {
                acc.push(JSON.parse(line));
            } catch {
                // 파싱 실패 줄 무시
            }
            return acc;
        }, []);
    } catch {
        return [];
    }
}

/**
 * 단일 이벤트를 파일에 append 한다.
 * 디렉토리가 없으면 자동 생성한다.
 *
 * @param {object} entry - 기록할 활동 이벤트 객체
 */
function appendEntry(entry) {
    try {
        ensureDir();
        fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
        // 파일 기록 실패 시 메모리 링버퍼는 유지 — 서버 동작 중단 없음
    }
}

export { loadRecentEntries, appendEntry, ACTIVITY_LIMIT, LOG_PATH };
