// ============================================
// tetris.js — 테트리스 타워 미니게임 (DOM 오버레이)
// ------------------------------------------------------------------
// 3D 씬과 독립된 캔버스 오버레이. 테트리스 타워 포탈에서 SPACE로 열린다.
// 열려 있는 동안 window.__tetrisActive = true 로 표시해 scene.js의
// 이동·점프·뷰 단축키가 키 입력을 소비하지 않게 한다(패턴: __map2dActive).
//
// 조작: ←→ 이동 · ↑ 회전 · ↓ 소프트드롭 · SPACE 하드드롭 · C 홀드 · P 일시정지 · ESC 종료
// 규칙: 7-bag 랜덤, 고스트 피스, 10줄마다 레벨업(낙하 가속), 표준 점수(100/300/500/800×레벨).
// 최고 점수는 localStorage('tetris.best')에 보존.
// 순위(TETRIS-RANK): 로그인 사용자는 게임오버 시 점수를 서버(/api/tetris/score)에 제출 —
// 개인 최고만 반영되고 배너에 전체 순위를 보여준다. 사이드 패널에 TOP 5 상시 표시.
// 비로그인/서버 불가 시엔 조용히 스킵(로컬 최고 점수만 동작).
// ============================================

const COLS = 10, ROWS = 20;
const BEST_KEY = 'tetris.best';

// 표준 테트로미노 — 스폰 방향 행렬 + 대표색
const PIECES = {
    I: { c: '#26C6DA', m: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    J: { c: '#5C7CFA', m: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { c: '#FFA726', m: [[0,0,1],[1,1,1],[0,0,0]] },
    O: { c: '#FFD54F', m: [[1,1],[1,1]] },
    S: { c: '#66BB6A', m: [[0,1,1],[1,1,0],[0,0,0]] },
    T: { c: '#AB47BC', m: [[0,1,0],[1,1,1],[0,0,0]] },
    Z: { c: '#EF5350', m: [[1,1,0],[0,1,1],[0,0,0]] },
};
const LINE_SCORE = [0, 100, 300, 500, 800];

let _open = false;

export function isTetrisOpen() { return _open; }

/**
 * 테트리스 오버레이 열기. 닫힐 때 onClose(finalScore) 호출.
 * player({ email, name })를 주면 게임오버 시 서버 순위에 점수를 제출한다(없으면 로컬 전용).
 * 이미 열려 있으면 no-op.
 */
export function openTetris({ onClose, player = null } = {}) {
    if (_open) return;
    _open = true;
    window.__tetrisActive = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    // ---- 상태 ----
    const board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null)); // null | 색상 문자열
    let bag = [];
    let cur = null;            // { m, c, x, y }
    let nextQ = [];            // 다음 피스 키 큐(화면 표시는 맨 앞 1개)
    let hold = null, holdUsed = false;
    let score = 0, lines = 0, level = 0;
    let best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    let over = false, paused = false;
    let dropAcc = 0, lastTs = 0, rafId = 0;

    // ---- DOM ----
    // 셀 크기 — 보드가 화면 높이를 거의 채우도록 열 때마다 동적 계산(작은 창에서도 최소 26px)
    const CELL = Math.max(26, Math.floor((window.innerHeight - 120) / ROWS));
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.88);'
        + 'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;'
        + 'font-family:sans-serif;color:#fff;';
    const panel = document.createElement('div');
    panel.style.cssText = 'display:flex;gap:18px;align-items:flex-start;background:#0d1117;'
        + 'border:1px solid #263238;border-radius:14px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.6);';
    overlay.appendChild(panel);

    const cv = document.createElement('canvas');
    cv.width = COLS * CELL; cv.height = ROWS * CELL;
    cv.style.cssText = 'border-radius:6px;background:#080b10;display:block;';
    panel.appendChild(cv);
    const ctx = cv.getContext('2d');

    const side = document.createElement('div');
    side.style.cssText = 'width:180px;display:flex;flex-direction:column;gap:14px;font-size:13.5px;';
    side.innerHTML = `
        <div style="font-size:20px;font-weight:800;letter-spacing:2px;color:#E040FB;">🧱 TETRIS</div>
        <div>NEXT<canvas id="ttrNext" width="140" height="80" style="display:block;background:#080b10;border-radius:6px;margin-top:4px;"></canvas></div>
        <div>HOLD (C)<canvas id="ttrHold" width="140" height="80" style="display:block;background:#080b10;border-radius:6px;margin-top:4px;"></canvas></div>
        <div id="ttrStats" style="line-height:1.8;"></div>
        <div>
            <div style="text-align:center;font-weight:800;letter-spacing:2px;color:#FFD54F;font-size:12.5px;text-shadow:0 0 10px rgba(255,213,79,.55);">🏆 순위 TOP 5</div>
            <div id="ttrRank" style="margin-top:5px;background:linear-gradient(180deg,#141008,#080b10 65%);border:1px solid rgba(255,213,79,.4);border-radius:8px;padding:6px 5px;font-size:12px;box-shadow:inset 0 0 16px rgba(255,213,79,.1),0 0 10px rgba(255,213,79,.12);min-height:34px;"></div>
        </div>
        <div style="color:#78909C;font-size:11px;line-height:1.7;">←→ 이동 · ↑ 회전<br>↓ 소프트드롭 · SPACE 하드드롭<br>C 홀드 · P 일시정지 · ESC 종료</div>`;
    panel.appendChild(side);
    document.body.appendChild(overlay);
    const nextCv = side.querySelector('#ttrNext'), nextCtx = nextCv.getContext('2d');
    const holdCv = side.querySelector('#ttrHold'), holdCtx = holdCv.getContext('2d');
    const statsEl = side.querySelector('#ttrStats');

    // 게임오버/일시정지 배너(캔버스 위 오버레이)
    const banner = document.createElement('div');
    banner.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;'
        + 'justify-content:center;gap:12px;background:rgba(8,11,16,.82);border-radius:6px;text-align:center;';
    const cvWrap = document.createElement('div');
    cvWrap.style.cssText = 'position:relative;';
    panel.insertBefore(cvWrap, cv); cvWrap.appendChild(cv); cvWrap.appendChild(banner);

    // ---- 사운드(작은 WebAudio 블립 — 실패해도 무음 진행) ----
    let audio = null;
    function blip(freq, dur = 0.07, gain = 0.08, type = 'square') {
        try {
            if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === 'suspended') audio.resume();
            const o = audio.createOscillator(), g = audio.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(gain, audio.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
            o.connect(g); g.connect(audio.destination);
            o.start(); o.stop(audio.currentTime + dur);
        } catch { /* 무음 진행 */ }
    }
    const sndClear = (n) => { for (let i = 0; i < n + 1; i++) setTimeout(() => blip(440 * Math.pow(1.26, i), 0.09, 0.1), i * 60); };
    const sndDrop = () => blip(140, 0.05, 0.09, 'triangle');
    const sndOver = () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.14, 0.09), i * 130)); };

    // ---- 순위(TETRIS-RANK) — 서버 리더보드. 실패해도 조용히 스킵(로컬 전용으로 동작) ----
    const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const myKey = player && player.email ? String(player.email).toLowerCase() : null;
    // 순위 렌더 — 금·은·동 티어별 배경/색, 내 기록은 마젠타 테두리 + ✦
    const HOF_TIER = [
        { medal: '🥇', color: '#FFD700', bg: 'linear-gradient(90deg,rgba(255,215,0,.26),rgba(255,215,0,.04))', size: 13.5 },
        { medal: '🥈', color: '#CFD8DC', bg: 'linear-gradient(90deg,rgba(176,190,197,.22),rgba(176,190,197,.03))', size: 12.5 },
        { medal: '🥉', color: '#E0A96D', bg: 'linear-gradient(90deg,rgba(205,127,50,.22),rgba(205,127,50,.03))', size: 12.5 },
    ];
    function renderRanking(list) {
        const el = side.querySelector('#ttrRank');
        if (!el) return;
        if (!Array.isArray(list) || !list.length) {
            el.innerHTML = '<div style="text-align:center;color:#8D6E63;padding:5px 0;line-height:1.6;">'
                + '아직 기록이 없어요<br><span style="color:#FFD54F;">1등을 노려보세요!</span></div>';
            return;
        }
        el.innerHTML = list.slice(0, 5).map((t, i) => {
            const tier = HOF_TIER[i];
            const me = myKey && t.email === myKey;
            const label = tier ? tier.medal : `<span style="opacity:.75;">${i + 1}.</span>`;
            const st = 'display:flex;justify-content:space-between;align-items:center;gap:6px;'
                + 'padding:3px 6px;border-radius:6px;margin:2px 0;'
                + (tier ? `background:${tier.bg};color:${tier.color};font-weight:800;font-size:${tier.size}px;`
                        : 'color:#90A4AE;font-size:12px;')
                + (me ? 'box-shadow:0 0 0 1px #E040FB,0 0 8px rgba(224,64,251,.45);' : '');
            return `<div style="${st}">`
                + `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label} ${esc(t.name)}${me ? ' ✦' : ''}</span>`
                + `<span style="font-variant-numeric:tabular-nums;">${Number(t.score).toLocaleString()}</span></div>`;
        }).join('');
    }
    function fetchRanking() {
        fetch('/api/tetris/ranking')
            .then((r) => r.json())
            .then((d) => { if (_open) renderRanking(d.ranking); })
            .catch(() => { /* 서버 불가 — 로컬 전용 진행 */ });
    }
    function submitScore() {
        if (!myKey || score <= 0) return;              // 비로그인·0점은 제출하지 않음
        const msgEl = banner.querySelector('#ttrRankMsg');
        if (msgEl) msgEl.textContent = '순위 집계 중…';
        fetch('/api/tetris/score', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: player.email, name: player.name || player.email, score, lines, level }),
        })
            .then((r) => r.json())
            .then((d) => {
                if (!_open || !d.ok) return;
                renderRanking(d.ranking);
                const el = banner.querySelector('#ttrRankMsg');   // 리트라이로 배너가 갈렸으면 사라짐 — null 안전
                if (el) {
                    const podium = d.rank <= 3;                   // TOP 3은 금색으로 축하
                    el.style.color = podium ? '#FFD700' : '#E040FB';
                    el.innerHTML = `${podium ? '👑' : '🏆'} 전체 <b>${d.rank}위</b> / ${d.total}명${d.improved ? ' · 개인 최고 갱신!' : ''}`;
                }
            })
            .catch(() => { const el = banner.querySelector('#ttrRankMsg'); if (el) el.textContent = ''; });
    }

    // ---- 코어 로직 ----
    function refillBag() {
        const keys = Object.keys(PIECES);
        for (let i = keys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [keys[i], keys[j]] = [keys[j], keys[i]];
        }
        bag.push(...keys);
    }
    function takeFromBag() {
        if (bag.length < 4) refillBag();
        return bag.shift();
    }
    function spawnPiece(key) {
        const src = PIECES[key];
        const m = src.m.map((r) => r.slice());
        const p = { key, m, c: src.c, x: Math.floor((COLS - m[0].length) / 2), y: 0 };
        // 스폰 셀이 이미 막혀 있으면 게임오버
        if (collides(p, 0, 0, p.m)) { gameOver(); return null; }
        return p;
    }
    function nextPiece() {
        while (nextQ.length < 4) nextQ.push(takeFromBag());
        cur = spawnPiece(nextQ.shift());
        holdUsed = false;
    }
    function collides(p, dx, dy, m) {
        for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
            if (!m[r][c]) continue;
            const x = p.x + c + dx, y = p.y + r + dy;
            if (x < 0 || x >= COLS || y >= ROWS) return true;
            if (y >= 0 && board[y][x]) return true;
        }
        return false;
    }
    function rotate() {
        if (!cur || cur.key === 'O') return;
        const n = cur.m.length;
        const rm = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => cur.m[n - 1 - c][r]));
        for (const kick of [0, -1, 1, -2, 2]) {          // 간이 월킥
            if (!collides(cur, kick, 0, rm)) { cur.m = rm; cur.x += kick; return; }
        }
    }
    function ghostY() {
        let dy = 0;
        while (!collides(cur, 0, dy + 1, cur.m)) dy++;
        return cur.y + dy;
    }
    function lockPiece() {
        for (let r = 0; r < cur.m.length; r++) for (let c = 0; c < cur.m[r].length; c++) {
            if (!cur.m[r][c]) continue;
            const y = cur.y + r;
            if (y >= 0) board[y][cur.x + c] = cur.c;
        }
        // 줄 삭제
        let cleared = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (board[r].every(Boolean)) {
                board.splice(r, 1);
                board.unshift(new Array(COLS).fill(null));
                cleared++; r++;                            // 당겨진 같은 행 재검사
            }
        }
        if (cleared) {
            lines += cleared;
            score += LINE_SCORE[cleared] * (level + 1);
            level = Math.floor(lines / 10);
            sndClear(cleared);
        }
        nextPiece();
    }
    function step() {                                      // 중력 1칸
        if (!cur) return;
        if (collides(cur, 0, 1, cur.m)) lockPiece();
        else cur.y++;
    }
    function hardDrop() {
        if (!cur) return;
        const dy = ghostY() - cur.y;
        cur.y += dy;
        score += dy * 2;
        sndDrop();
        lockPiece();
    }
    function doHold() {
        if (!cur || holdUsed) return;
        const prev = hold;
        hold = cur.key;
        cur = prev ? spawnPiece(prev) : null;
        if (!prev) nextPiece();
        holdUsed = true;
    }
    function gameOver() {
        over = true;
        if (score > best) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
        sndOver();
        banner.style.display = 'flex';
        banner.innerHTML = `
            <div style="font-size:24px;font-weight:800;">GAME OVER</div>
            <div style="font-size:15px;color:#B0BEC5;">점수 <b style="color:#fff;">${score.toLocaleString()}</b> · 최고 ${best.toLocaleString()}</div>
            <div id="ttrRankMsg" style="font-size:13px;color:#E040FB;min-height:18px;"></div>
            <div style="display:flex;gap:10px;">
                <button id="ttrRetry" style="padding:9px 20px;border:0;border-radius:9px;background:#E040FB;color:#fff;font-weight:700;cursor:pointer;">다시하기</button>
                <button id="ttrQuit" style="padding:9px 20px;border:0;border-radius:9px;background:#37474F;color:#fff;font-weight:700;cursor:pointer;">나가기 (ESC)</button>
            </div>`;
        banner.querySelector('#ttrRetry').onclick = restart;
        banner.querySelector('#ttrQuit').onclick = close;
        submitScore();                                 // 서버 순위 제출(비로그인·0점·서버 불가 시 조용히 스킵)
    }
    function restart() {
        for (const row of board) row.fill(null);
        bag.length = 0; nextQ.length = 0;
        hold = null; holdUsed = false;
        score = 0; lines = 0; level = 0;
        over = false; paused = false; dropAcc = 0;
        banner.style.display = 'none';
        nextPiece();
    }
    function togglePause() {
        if (over) return;
        paused = !paused;
        banner.style.display = paused ? 'flex' : 'none';
        if (paused) banner.innerHTML = '<div style="font-size:22px;font-weight:800;">⏸ PAUSED</div><div style="font-size:13px;color:#B0BEC5;">P 키로 계속</div>';
    }

    // ---- 렌더 ----
    function cell(g, x, y, size, color) {
        g.fillStyle = color;
        g.fillRect(x, y, size, size);
        g.fillStyle = 'rgba(255,255,255,.25)';             // 상단 하이라이트
        g.fillRect(x, y, size, Math.max(2, size * 0.18));
        g.fillStyle = 'rgba(0,0,0,.28)';                   // 하단 음영
        g.fillRect(x, y + size - Math.max(2, size * 0.16), size, Math.max(2, size * 0.16));
    }
    function drawMini(g, cvEl, key, cx, cy, size = 16) {
        if (!key) return;
        const { m, c } = PIECES[key];
        // 실제 채워진 셀 범위 기준 중앙 정렬
        let minR = 9, maxR = -1, minC = 9, maxC = -1;
        m.forEach((row, r) => row.forEach((v, cc) => { if (v) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, cc); maxC = Math.max(maxC, cc); } }));
        const w = (maxC - minC + 1) * size, h = (maxR - minR + 1) * size;
        m.forEach((row, r) => row.forEach((v, cc) => {
            if (v) cell(g, cx - w / 2 + (cc - minC) * size, cy - h / 2 + (r - minR) * size, size - 1, c);
        }));
    }
    function draw() {
        ctx.clearRect(0, 0, cv.width, cv.height);
        // 그리드 — 배경에서 또렷하게 보이도록 셀 바탕 체커 + 진한 격자선
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,.030)' : 'rgba(255,255,255,.012)';
            ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
        ctx.strokeStyle = 'rgba(255,255,255,.16)';
        ctx.lineWidth = 1;
        for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, cv.height); ctx.stroke(); }
        for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(cv.width, y * CELL + 0.5); ctx.stroke(); }
        // 쌓인 블록
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (board[r][c]) cell(ctx, c * CELL, r * CELL, CELL - 1, board[r][c]);
        }
        if (cur && !over) {
            // 고스트
            const gy = ghostY();
            ctx.globalAlpha = 0.22;
            cur.m.forEach((row, r) => row.forEach((v, c) => { if (v && gy + r >= 0) cell(ctx, (cur.x + c) * CELL, (gy + r) * CELL, CELL - 1, cur.c); }));
            ctx.globalAlpha = 1;
            // 현재 피스
            cur.m.forEach((row, r) => row.forEach((v, c) => { if (v && cur.y + r >= 0) cell(ctx, (cur.x + c) * CELL, (cur.y + r) * CELL, CELL - 1, cur.c); }));
        }
        // 사이드
        nextCtx.clearRect(0, 0, nextCv.width, nextCv.height);
        drawMini(nextCtx, nextCv, nextQ[0], 70, 40, 20);   // 다음 피스 1개만 미리보기
        holdCtx.clearRect(0, 0, holdCv.width, holdCv.height);
        drawMini(holdCtx, holdCv, hold, 70, 40, 20);
        statsEl.innerHTML = `점수 <b>${score.toLocaleString()}</b><br>줄 <b>${lines}</b> · 레벨 <b>${level}</b><br>최고 <b>${best.toLocaleString()}</b>`;
    }

    // ---- 루프 ----
    function loop(ts) {
        rafId = requestAnimationFrame(loop);
        const dt = lastTs ? ts - lastTs : 0;
        lastTs = ts;
        if (!over && !paused) {
            dropAcc += dt;
            const interval = Math.max(110, 780 - level * 65);  // 레벨업 → 낙하 가속
            while (dropAcc >= interval) { dropAcc -= interval; step(); if (over) break; }
        }
        draw();
    }

    // ---- 입력 ----
    function onKey(e) {
        if (!_open) return;
        // 오버레이가 모든 게임 키를 소비 — 페이지 스크롤·씬 단축키 차단
        const used = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', 'KeyC', 'KeyP', 'Escape'];
        if (!used.includes(e.code)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') { close(); return; }
        if (e.code === 'KeyP') { togglePause(); return; }
        if (over || paused || !cur) return;
        if (e.code === 'ArrowLeft' && !collides(cur, -1, 0, cur.m)) cur.x--;
        else if (e.code === 'ArrowRight' && !collides(cur, 1, 0, cur.m)) cur.x++;
        else if (e.code === 'ArrowDown') { if (!collides(cur, 0, 1, cur.m)) { cur.y++; score++; } dropAcc = 0; }
        else if (e.code === 'ArrowUp') rotate();
        else if (e.code === 'Space') hardDrop();
        else if (e.code === 'KeyC') doHold();
    }
    // capture 단계 등록 — scene.js 핸들러보다 확실히 선점(가드 __tetrisActive와 이중 안전)
    window.addEventListener('keydown', onKey, true);

    function close() {
        if (!_open) return;
        _open = false;
        window.__tetrisActive = false;
        cancelAnimationFrame(rafId);
        window.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (onClose) onClose(score);
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    nextPiece();
    fetchRanking();                                    // 사이드 TOP 5 로드
    rafId = requestAnimationFrame(loop);
}
