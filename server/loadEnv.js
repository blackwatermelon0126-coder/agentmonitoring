// .env 로더 — 외부 의존성 없이 server/.env 를 읽어 process.env 에 주입한다.
//
// 이유: msalClient.js·teamsPoller.js 는 모듈 로드 시점에 process.env.AZURE_* 를 읽어
// 상수화한다(예: teamsPoller TENANT_ID). 서버를 `node server.js` 로 바로 띄우면
// .env 가 자동 로드되지 않아 그 값들이 비어버린다(→ 딥링크 tenantId 공백 버그).
// 이 모듈을 server.js 의 '최상단 import'로 두면, 다른 모듈이 평가되기 전에
// process.env 가 채워진다. (하드코딩 금지 — 값은 .env 에서 공급)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '.env');

try {
    if (fs.existsSync(ENV_PATH)) {
        const raw = fs.readFileSync(ENV_PATH, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
            const s = line.trim();
            if (!s || s.startsWith('#')) continue;
            const eq = s.indexOf('=');
            if (eq === -1) continue;
            const key = s.slice(0, eq).trim();
            let val = s.slice(eq + 1).trim();
            // 양끝 따옴표 제거
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            // 이미 외부에서 주입된 값은 보존(덮어쓰지 않음)
            if (key && process.env[key] === undefined) process.env[key] = val;
        }
    }
} catch {
    // .env 로드 실패는 무해화 — 외부 주입 env 또는 모듈별 폴백에 의존
}
