/**
 * lunchgame.js — 간식 내기 게임 시스템 (P7)
 *
 * 게임 3종:
 *   🔫 러시안 룰렛   — 대형 원판 회전, 총알 칸에 멈추면 면제, 최후 생존자가 간식 당번
 *   🪜 사다리 타기   — 운명의 사다리, 간식 당번 배정
 *   ✂️ 가위바위보    — 토너먼트, 결승 패배자가 간식 심부름
 *
 * 트리거: 12:00·18:00 자동 (하루 각 1회) + G 키 수동.
 * 참가자: people.json 등록 조직 인원만. 2명 미만이면 안내 토스트.
 */

// ─── 상태 ────────────────────────────────────────────────
let _getPeople  = () => [];
let _floatText  = () => {};
let _gameActive = false;

// ─── 공개 API ────────────────────────────────────────────

export function initLunchGame({ getPeople, addFloatingText }) {
    _getPeople  = getPeople        || (() => []);
    _floatText  = addFloatingText  || (() => {});
}

export function triggerLunchGame() {
    if (_gameActive) return;
    const people = _getPeople();
    if (people.length < 2) {
        _toast('간식 내기 게임을 시작하려면\n조직 인원을 2명 이상 등록해주세요.\n(우측 상단 👥 버튼으로 추가)');
        return;
    }
    _showMenu(people);
}

// ─── DOM 헬퍼 ────────────────────────────────────────────

function $el(tag, css, html = '') {
    const d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (html) d.innerHTML = html;
    return d;
}

function _overlay(closeable = true) {
    const o = $el('div', `
        position:fixed;inset:0;z-index:9000;
        background:rgba(0,0,0,.9);backdrop-filter:blur(4px);
        display:flex;flex-direction:column;align-items:center;
        justify-content:center;overflow:auto;
        animation:lgFadeIn .25s ease;
    `);
    if (!document.getElementById('lg-style')) {
        const st = document.createElement('style');
        st.id = 'lg-style';
        st.textContent = `
            @keyframes lgFadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
            @keyframes lgShake{0%,100%{transform:translateX(0)}25%,75%{transform:translateX(-8px)}50%{transform:translateX(8px)}}
            @keyframes lgBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
            @keyframes lgFlash{0%,100%{opacity:1}50%{opacity:0.3}}
        `;
        document.head.appendChild(st);
    }
    if (closeable) {
        const x = $el('div', `
            position:absolute;top:16px;right:20px;font-size:26px;color:#555;
            cursor:pointer;line-height:1;z-index:1;transition:color .15s;user-select:none;
        `, '✕');
        x.onmouseover = () => x.style.color = '#ccc';
        x.onmouseout  = () => x.style.color = '#555';
        x.onclick     = () => { o.remove(); _gameActive = false; };
        o.appendChild(x);
    }
    return o;
}

function _toast(msg) {
    const t = $el('div', `
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
        background:#222;color:#fff;padding:12px 22px;border-radius:10px;
        font-family:monospace;font-size:13px;z-index:9999;
        white-space:pre-line;text-align:center;border:1px solid #444;
    `, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function _chip(p) {
    return `<span style="
        display:inline-block;background:${p.color||'#444'}22;
        border:1px solid ${p.color||'#555'};color:#ddd;
        font-size:12px;padding:2px 10px;border-radius:12px;margin:3px;font-family:monospace;
    ">${p.name}</span>`;
}

function _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 게임 선택 메뉴 ──────────────────────────────────────

function _showMenu(participants) {
    _gameActive = true;
    const o = _overlay(true);
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const label = now.getHours() < 15 ? '점심 간식' : '저녁 간식';

    o.appendChild($el('div', `text-align:center;margin-bottom:24px;`, `
        <div style="font-size:48px;margin-bottom:6px;">🍿</div>
        <div style="font-size:28px;font-weight:bold;color:#fff;letter-spacing:2px;">간식 내기!</div>
        <div style="font-size:13px;color:#f39c12;margin-top:4px;">${label} 사러 갈 사람 결정</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">${hhmm} · ${participants.length}명 참가</div>
        <div style="margin-top:8px;">${participants.map(_chip).join('')}</div>
    `));

    const grid = $el('div', `display:flex;gap:18px;justify-content:center;flex-wrap:wrap;`);
    [
        { id:'roulette', emoji:'🔫', name:'러시안 룰렛',
          desc:'원판을 돌려라!\n총알 칸에 걸리면 면제\n최후 생존자가 간식 당번',
          color:'#e74c3c', bg:'#1a0505' },
        { id:'ladder',   emoji:'🪜', name:'사다리 타기',
          desc:'운명의 사다리\n간식·음료 당번 배정\n공정한 추첨으로 결정',
          color:'#3498db', bg:'#05101a' },
        { id:'rps',      emoji:'✂️', name:'가위바위보',
          desc:'토너먼트 브래킷\n결승 패배자가\n간식 심부름 담당',
          color:'#2ecc71', bg:'#051a0a' },
    ].forEach(g => {
        const card = $el('div', `
            width:162px;padding:26px 14px;border-radius:16px;
            background:${g.bg};border:2px solid ${g.color}55;
            cursor:pointer;text-align:center;transition:all .18s;
            color:#fff;font-family:monospace;user-select:none;
        `, `
            <div style="font-size:42px;margin-bottom:12px;">${g.emoji}</div>
            <div style="font-size:15px;font-weight:bold;color:${g.color};margin-bottom:8px;">${g.name}</div>
            <div style="font-size:11px;color:#777;white-space:pre-line;line-height:1.7;">${g.desc}</div>
        `);
        card.onmouseover = () => { card.style.transform='scale(1.06)'; card.style.border=`2px solid ${g.color}`; card.style.boxShadow=`0 0 22px ${g.color}44`; };
        card.onmouseout  = () => { card.style.transform='scale(1)';    card.style.border=`2px solid ${g.color}55`; card.style.boxShadow='none'; };
        card.onclick = () => {
            o.remove();
            const sh = [...participants].sort(() => Math.random() - .5);
            if (g.id === 'roulette') _startRoulette(sh);
            else if (g.id === 'ladder') _startLadder(sh);
            else _startRPS(sh);
        };
        grid.appendChild(card);
    });
    o.appendChild(grid);
    document.body.appendChild(o);
}

// ══════════════════════════════════════════════════════════
// 게임 1 — 🔫 러시안 룰렛 (대형 회전 원판)
// ══════════════════════════════════════════════════════════

async function _startRoulette(participants) {
    const players = participants.slice(0, 8);
    const o = _overlay(true);
    document.body.appendChild(o);

    // 타이틀
    o.appendChild($el('div', `
        font-size:18px;font-weight:bold;color:#e74c3c;font-family:monospace;
        letter-spacing:2px;margin-bottom:8px;text-align:center;
    `, `🔫 러시안 룰렛 — ${players.length}인 간식 내기`));

    // 현재 플레이어
    const curEl = $el('div', `
        font-size:15px;font-family:monospace;text-align:center;min-height:24px;margin-bottom:8px;
    `);
    o.appendChild(curEl);

    // ── 원판 캔버스 ───────────────────────────────────────
    const CW = 300, CH = 300;
    const cv  = document.createElement('canvas');
    cv.width  = CW; cv.height = CH;
    cv.style.cssText = 'display:block;margin:0 auto;';
    o.appendChild(cv);
    const ctx  = cv.getContext('2d');
    const cx   = CW / 2, cy = CH / 2, R = 116;

    const SEG   = 6;
    const SEGA  = (Math.PI * 2) / SEG;
    // 총알은 원판 위 고정 위치 (게임 시작 시 1회 결정)
    const BULLET = Math.floor(Math.random() * SEG);
    let wAngle   = Math.random() * Math.PI * 2;  // 초기 랜덤 각도
    let hlSeg    = -1;     // 결과 공개할 세그먼트 (-1 = 미공개)
    let hlBang   = false;

    // 세그먼트 색상 (어두운 6가지)
    const SCOLS = ['#1c1e2e','#221c2e','#1c2e1e','#2e1c1c','#1c2a2e','#2e261c'];

    function topSeg() {
        // 포인터 = 12시(-π/2). 그 방향에 해당하는 세그먼트
        const rel = ((-Math.PI / 2 - wAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        return Math.floor(rel / SEGA) % SEG;
    }

    function drawWheel() {
        ctx.clearRect(0, 0, CW, CH);

        // 외곽 베젤
        ctx.beginPath();
        ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
        ctx.fillStyle = '#111'; ctx.fill();
        ctx.strokeStyle = '#383838'; ctx.lineWidth = 3; ctx.stroke();

        // 베젤 눈금
        for (let i = 0; i < SEG; i++) {
            const a = wAngle + i * SEGA;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * (R + 5),  cy + Math.sin(a) * (R + 5));
            ctx.lineTo(cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14));
            ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke();
        }

        // 세그먼트
        for (let i = 0; i < SEG; i++) {
            const sa = wAngle + i * SEGA;
            const ea = sa + SEGA;
            const isBulletRev = (hlSeg === i && hlBang);
            const isSafeRev   = (hlSeg === i && !hlBang);

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, R, sa, ea);
            ctx.closePath();

            if (isBulletRev) {
                ctx.fillStyle = '#6b0000';
                ctx.shadowBlur = 28; ctx.shadowColor = '#e74c3c';
            } else if (isSafeRev) {
                ctx.fillStyle = '#0a2a0a';
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = SCOLS[i];
                ctx.shadowBlur = 0;
            }
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.5; ctx.stroke();

            // 탄창 구멍
            const ma  = sa + SEGA / 2;
            const hx  = cx + Math.cos(ma) * R * 0.60;
            const hy  = cy + Math.sin(ma) * R * 0.60;

            ctx.beginPath();
            ctx.arc(hx, hy, 13, 0, Math.PI * 2);
            ctx.fillStyle   = isBulletRev ? '#3d0000' : '#080808';
            ctx.strokeStyle = isBulletRev ? '#e74c3c' : isSafeRev ? '#2ecc71' : '#3a3a3a';
            ctx.lineWidth = 2;
            ctx.fill(); ctx.stroke();

            // 총알 (빨간 원)
            if (isBulletRev) {
                ctx.beginPath();
                ctx.arc(hx, hy, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#e74c3c';
                ctx.shadowBlur = 14; ctx.shadowColor = '#e74c3c';
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // 세그먼트 번호 (외곽)
            const nx = cx + Math.cos(ma) * R * 0.86;
            const ny = cy + Math.sin(ma) * R * 0.86;
            ctx.fillStyle = '#4a4a4a';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${i + 1}`, nx, ny);
        }

        // 중앙 허브
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#181818'; ctx.fill();
        ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 2.5; ctx.stroke();

        // 포인터 (12시 방향 적색 삼각형)
        const pY = cy - R - 4;
        ctx.beginPath();
        ctx.moveTo(cx, pY);
        ctx.lineTo(cx - 11, pY - 19);
        ctx.lineTo(cx + 11, pY - 19);
        ctx.closePath();
        ctx.fillStyle = '#e74c3c';
        ctx.shadowBlur = 10; ctx.shadowColor = '#e74c3c';
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    drawWheel();

    // 스핀 → Promise<hitSegIdx>
    function spin() {
        return new Promise(resolve => {
            // 초기 각도에 랜덤 오프셋 추가 (매 스핀 결과 예측 방지)
            wAngle += Math.random() * Math.PI * 2;
            let v = 30 + Math.random() * 20;  // rad/s
            let lastTs = null;

            function frame(ts) {
                if (!lastTs) lastTs = ts;
                const dt = Math.min((ts - lastTs) / 1000, 0.05);
                lastTs = ts;
                wAngle += v * dt;
                v *= Math.pow(0.975, dt * 60);
                drawWheel();
                if (v > 0.25) requestAnimationFrame(frame);
                else resolve(topSeg());
            }
            requestAnimationFrame(frame);
        });
    }

    // ── 플레이어 카드 ─────────────────────────────────────
    const pGrid = $el('div', `display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin:12px 0 8px;`);
    const pEls  = {};
    players.forEach(p => {
        const card = $el('div', `
            width:70px;padding:8px 4px;border-radius:10px;
            background:#181818;border:2px solid ${p.color||'#555'};
            text-align:center;font-family:monospace;transition:all .28s;
        `, `
            <div style="font-size:20px;margin-bottom:3px;">😐</div>
            <div style="font-size:10px;color:${p.color||'#aaa'};font-weight:bold;
                 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name.slice(0,7)}</div>
        `);
        pGrid.appendChild(card);
        pEls[p.id] = card;
    });
    o.appendChild(pGrid);

    // 메시지 / 버튼
    const msgEl  = $el('div', `font-size:13px;color:#888;font-family:monospace;text-align:center;min-height:20px;margin-bottom:10px;`);
    const btnRow = $el('div', `text-align:center;`);
    const btn    = $el('button', `
        background:#e74c3c;color:#fff;border:none;border-radius:10px;
        padding:10px 28px;font-size:14px;cursor:pointer;font-family:monospace;
        font-weight:bold;letter-spacing:1px;transition:background .12s;
    `, '🔫 방아쇠 당기기');
    btn.onmouseover = () => btn.style.background = '#c0392b';
    btn.onmouseout  = () => btn.style.background = '#e74c3c';
    btnRow.appendChild(btn);
    o.appendChild(msgEl);
    o.appendChild(btnRow);

    // ── 게임 루프 ─────────────────────────────────────────
    const alive = [...players];
    let turn = 0, over = false;

    const setMsg = html => { msgEl.innerHTML = html; };

    function refreshCur() {
        if (over || alive.length <= 1) return;
        const p = alive[turn % alive.length];
        curEl.innerHTML = `<span style="color:#666;font-size:11px;">차례 ▶ </span><span style="color:${p.color||'#fff'};font-weight:bold;">${p.name}</span>`;
    }

    refreshCur();
    setMsg('방아쇠를 당겨보세요!');

    btn.onclick = async () => {
        if (over || alive.length <= 1) return;
        btn.disabled = true;

        const cur  = alive[turn % alive.length];
        const card = pEls[cur.id];

        // 현재 플레이어 강조
        card.style.border     = '2px solid #e74c3c';
        card.style.boxShadow  = '0 0 12px #e74c3c55';
        card.innerHTML = `
            <div style="font-size:20px;margin-bottom:3px;animation:lgBounce .5s infinite;">😰</div>
            <div style="font-size:10px;color:#e74c3c;font-weight:bold;
                 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cur.name.slice(0,7)}</div>
        `;

        setMsg('원판이 돌아갑니다...!');
        hlSeg = -1; hlBang = false;

        // 원판 스핀
        const hit   = await spin();
        const isBang = (hit === BULLET);

        // 멈춘 후 0.3초 대기 → 결과 공개
        await _wait(300);
        hlSeg  = hit;
        hlBang = isBang;
        drawWheel();
        await _wait(500);

        if (isBang) {
            // 💥 탕!
            card.style.animation = 'lgShake .4s';
            setTimeout(() => card.style.animation = '', 500);
            setMsg(`<span style="color:#e74c3c;font-size:18px;">💥 탕!!</span> <span style="color:#888">${cur.name} 탈락! 간식 면제~</span>`);
            await _wait(500);
            // 탈락 처리
            card.style.cssText += 'opacity:.28;filter:grayscale(1);animation:none;';
            card.style.border  = '2px solid #333';
            card.style.boxShadow = 'none';
            card.innerHTML = `
                <div style="font-size:20px;margin-bottom:3px;">😅</div>
                <div style="font-size:10px;color:#555;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cur.name.slice(0,7)}</div>
                <div style="font-size:9px;color:#2ecc71;">면제!</div>
            `;
            await _wait(900);

            alive.splice(alive.indexOf(cur), 1);
            turn = turn % Math.max(alive.length, 1);
            hlSeg = -1; hlBang = false; drawWheel();

            if (alive.length === 1) {
                over = true;
                const winner = alive[0];
                const wCard  = pEls[winner.id];
                wCard.style.border     = '2px solid #f39c12';
                wCard.style.boxShadow  = '0 0 22px #f39c1288';
                wCard.innerHTML = `
                    <div style="font-size:20px;margin-bottom:3px;animation:lgBounce .8s infinite;">🍿</div>
                    <div style="font-size:10px;color:#f39c12;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${winner.name.slice(0,7)}</div>
                    <div style="font-size:9px;color:#aaa;">간식 당번!</div>
                `;
                curEl.innerHTML = '';
                setMsg(`<span style="color:#f39c12;font-size:16px;">🍿 ${winner.name}님, 간식 사러 가세요!</span>`);
                _floatText(`🍿 ${winner.name} 간식 당번!`, '#F39C12');

                btn.textContent = '닫기';
                btn.style.cssText = 'background:#2a2a2a;color:#aaa;border:1px solid #444;border-radius:10px;padding:10px 28px;font-size:14px;cursor:pointer;font-family:monospace;';
                btn.disabled = false;
                btn.onclick  = () => { o.remove(); _gameActive = false; };
                return;
            }
        } else {
            // 딸깍
            card.style.border    = `2px solid ${cur.color||'#555'}`;
            card.style.boxShadow = 'none';
            card.innerHTML = `
                <div style="font-size:20px;margin-bottom:3px;">😮‍💨</div>
                <div style="font-size:10px;color:${cur.color||'#aaa'};font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cur.name.slice(0,7)}</div>
            `;
            setMsg(`<span style="color:#2ecc71;">딸깍~ ${cur.name} 살았다!</span>`);
            await _wait(900);
            hlSeg = -1; hlBang = false; drawWheel();
            turn = (turn + 1) % alive.length;
        }

        refreshCur();
        setMsg(`다음: <span style="color:${alive[turn%alive.length].color||'#fff'}">${alive[turn%alive.length].name}</span> — 방아쇠를 당겨보세요!`);
        btn.disabled = false;
    };
}

// ══════════════════════════════════════════════════════════
// 게임 2 — 🪜 사다리 타기
// ══════════════════════════════════════════════════════════

const LADDER_PRIZES = [
    '🍿 간식 사러 가기', '☕ 커피 사오기', '🧃 음료 당번',
    '🍦 아이스크림 쏘기', '🛒 편의점 심부름', '🍰 케이크 사오기',
    '🍜 라면 사오기', '🎉 이번 한 번 면제!',
];

async function _startLadder(participants) {
    const players = participants.slice(0, 8);
    const prizes  = [...LADDER_PRIZES].sort(() => Math.random() - .5).slice(0, players.length);
    const n = players.length;

    const o = _overlay(true);
    document.body.appendChild(o);

    o.appendChild($el('div', `
        font-size:18px;font-weight:bold;color:#3498db;font-family:monospace;
        letter-spacing:2px;margin-bottom:14px;text-align:center;
    `, `🪜 사다리 타기 — ${n}인 간식 내기`));

    const CW = Math.max(500, n * 86 + 60), CH = 420;
    const cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    cv.style.cssText = `border-radius:10px;background:#080d16;display:block;margin:0 auto;max-width:100%;`;
    o.appendChild(cv);
    const ctx = cv.getContext('2d');

    const PAD = 44, TOP = 56, BOT = 52;
    const colW = (CW - PAD * 2) / Math.max(n - 1, 1);
    const ROWS = 10, rowH = (CH - TOP - BOT) / ROWS;
    const colX = c => PAD + c * colW;
    const rowY = r => TOP + r * rowH;

    // 가로대 생성
    const rungs = [];
    for (let r = 1; r < ROWS; r++) {
        let last = -2;
        for (let c = 0; c < n - 1; c++) {
            if (c > last && Math.random() < 0.44) { rungs.push({ row: r, col: c }); last = c + 1; }
        }
    }

    // 경로 계산
    function calcPath(sc) {
        const path = [{ col: sc, row: 0 }];
        let col = sc;
        for (let row = 0; row <= ROWS; row++) {
            const lr = rungs.find(r => r.row === row && r.col === col);
            const rr = rungs.find(r => r.row === row && r.col === col - 1);
            if (lr) { col++; path.push({ col, row }); }
            else if (rr) { col--; path.push({ col, row }); }
            if (row < ROWS) path.push({ col, row: row + 1 });
        }
        return { path, end: col };
    }
    const paths = players.map((_, i) => calcPath(i));

    function drawStatic() {
        ctx.clearRect(0, 0, CW, CH);
        // 세로선
        ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 2;
        for (let c = 0; c < n; c++) {
            ctx.beginPath(); ctx.moveTo(colX(c), TOP); ctx.lineTo(colX(c), CH - BOT); ctx.stroke();
        }
        // 가로대
        ctx.strokeStyle = '#2a5a8f'; ctx.lineWidth = 2.5;
        rungs.forEach(({ row, col }) => {
            ctx.beginPath(); ctx.moveTo(colX(col), rowY(row)); ctx.lineTo(colX(col + 1), rowY(row)); ctx.stroke();
        });
        // 이름
        players.forEach((p, i) => {
            ctx.fillStyle = p.color || '#7a9abf';
            ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
            ctx.fillText(p.name.slice(0, 6), colX(i), TOP - 14);
        });
        // 결과 칸 (가림)
        prizes.forEach((_, i) => {
            ctx.fillStyle = '#0a1520';
            ctx.fillRect(colX(i) - 40, CH - BOT + 4, 80, 22);
        });
    }

    const msgEl  = $el('div', `font-size:13px;color:#888;font-family:monospace;text-align:center;margin-top:10px;min-height:20px;`);
    const btnRow = $el('div', `text-align:center;margin-top:10px;`);
    const btn    = $el('button', `
        background:#3498db;color:#fff;border:none;border-radius:10px;
        padding:10px 28px;font-size:14px;cursor:pointer;font-family:monospace;font-weight:bold;
    `, '🪜 사다리 출발!');
    o.appendChild(msgEl); o.appendChild(btnRow); btnRow.appendChild(btn);
    drawStatic();
    msgEl.textContent = '버튼을 눌러 사다리를 타세요!';

    btn.onclick = () => {
        btn.disabled = true;
        msgEl.textContent = '사다리 타는 중...';
        const STEP = 55;
        const maxSteps = Math.max(...paths.map(p => p.path.length));
        let step = 0;

        const iv = setInterval(() => {
            if (!document.body.contains(o)) { clearInterval(iv); return; }
            drawStatic();
            paths.forEach(({ path }, pi) => {
                const p = players[pi];
                const drawn = path.slice(0, step + 1);
                ctx.strokeStyle = p.color || '#5af';
                ctx.lineWidth = 3; ctx.shadowBlur = 7; ctx.shadowColor = p.color || '#5af';
                ctx.beginPath();
                drawn.forEach(({ col, row }, j) => {
                    j === 0 ? ctx.moveTo(colX(col), rowY(row)) : ctx.lineTo(colX(col), rowY(row));
                });
                ctx.stroke(); ctx.shadowBlur = 0;
                const cur = drawn[drawn.length - 1];
                ctx.fillStyle = p.color || '#5af';
                ctx.beginPath(); ctx.arc(colX(cur.col), rowY(cur.row), 5, 0, Math.PI * 2); ctx.fill();
            });
            step++;

            if (step >= maxSteps) {
                clearInterval(iv);
                // 결과 공개
                paths.forEach(({ end }, pi) => {
                    const pr = prizes[end];
                    ctx.fillStyle = players[pi].color || '#7a9abf';
                    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
                    ctx.fillText(pr, colX(end), CH - BOT + 18);
                });
                const lines = paths.map(({ end }, pi) => `${players[pi].name} → ${prizes[end]}`).join(' / ');
                msgEl.innerHTML = `<span style="color:#3498db;font-size:12px;">${lines}</span>`;

                // 간식 당번 플로팅 텍스트
                const snackIdx = paths.findIndex(({ end }) => !prizes[end].includes('면제'));
                if (snackIdx >= 0) _floatText(`🍿 ${players[snackIdx].name} 간식 당번!`, '#3498db');

                const closeBtn = $el('button', `
                    background:#1a2a3a;color:#7a9abf;border:1px solid #2a4a6a;border-radius:8px;
                    padding:8px 22px;font-size:13px;cursor:pointer;font-family:monospace;
                `, '닫기');
                closeBtn.onclick = () => { o.remove(); _gameActive = false; };
                btnRow.innerHTML = ''; btnRow.appendChild(closeBtn);
            }
        }, STEP);
    };
}

// ══════════════════════════════════════════════════════════
// 게임 3 — ✂️ 가위바위보 토너먼트
// ══════════════════════════════════════════════════════════

const RPS_EMOJI = { R:'✊', P:'🖐️', S:'✌️' };
const RPS_KEYS  = ['R','P','S'];

function _rpsWin(a, b) {
    if (a === b) return 'draw';
    return (a==='R'&&b==='S')||(a==='S'&&b==='P')||(a==='P'&&b==='R') ? 'a' : 'b';
}

function _bracket(players) {
    const n = Math.pow(2, Math.ceil(Math.log2(players.length)));
    const s = [...players];
    while (s.length < n) s.push(null);
    const rounds = [];
    let cur = s;
    while (cur.length > 1) {
        const round = [];
        for (let i = 0; i < cur.length; i += 2) round.push([cur[i], cur[i+1]]);
        rounds.push(round);
        cur = round.map(([a,b]) => (a&&b) ? null : (a||b));
    }
    return rounds;
}

async function _startRPS(participants) {
    const players = participants.slice(0, 8);
    const o = _overlay(true);
    document.body.appendChild(o);

    o.appendChild($el('div', `
        font-size:18px;font-weight:bold;color:#2ecc71;font-family:monospace;
        letter-spacing:2px;margin-bottom:14px;text-align:center;
    `, `✂️ 가위바위보 — ${players.length}강 간식 내기`));

    const bracket = _bracket(players);
    const matchEls = [];
    const bracketEl = $el('div', `display:flex;gap:28px;align-items:center;justify-content:center;flex-wrap:nowrap;overflow-x:auto;padding:6px;`);

    bracket.forEach((round, ri) => {
        const col = $el('div', `display:flex;flex-direction:column;gap:14px;align-items:center;`);
        col.appendChild($el('div', `font-size:11px;color:#2ecc7166;font-family:monospace;margin-bottom:3px;`, ri===bracket.length-1?'결승':`${round.length*2}강`));
        matchEls[ri] = [];
        round.forEach(([a, b], mi) => {
            const mel = $el('div', `background:#0a1a0a;border:1px solid #2ecc7122;border-radius:10px;padding:9px;min-width:128px;font-family:monospace;text-align:center;`);
            const mkSlot = p => $el('div', `
                padding:4px 7px;border-radius:6px;font-size:11px;margin:2px 0;
                display:flex;align-items:center;justify-content:space-between;gap:5px;
                ${p ? `background:${p.color||'#333'}22;border:1px solid ${p.color||'#444'};color:${p.color||'#aaa'};` : 'background:#111;border:1px dashed #2a2a2a;color:#333;'}
            `, p ? `<span>${p.name.slice(0,8)}</span><span class="rh">❓</span>` : `<span>BYE</span>`);
            const sA = mkSlot(a), vs = $el('div',`font-size:9px;color:#333;`,'VS'), sB = mkSlot(b);
            mel.appendChild(sA); mel.appendChild(vs); mel.appendChild(sB);
            col.appendChild(mel);
            matchEls[ri][mi] = { mel, sA, sB };
        });
        bracketEl.appendChild(col);
    });
    o.appendChild(bracketEl);

    const msgEl  = $el('div', `font-size:13px;color:#888;font-family:monospace;text-align:center;margin-top:10px;min-height:20px;`);
    const btnRow = $el('div', `text-align:center;margin-top:10px;`);
    const btn    = $el('button', `
        background:#2ecc71;color:#000;border:none;border-radius:10px;
        padding:10px 26px;font-size:14px;cursor:pointer;font-family:monospace;font-weight:bold;
    `, '✂️ 토너먼트 시작!');
    o.appendChild(msgEl); o.appendChild(btnRow); btnRow.appendChild(btn);
    msgEl.textContent = '버튼을 눌러 토너먼트를 시작하세요';

    btn.onclick = async () => {
        btn.disabled = true;

        for (let ri = 0; ri < bracket.length; ri++) {
            const winners = [];
            for (let mi = 0; mi < bracket[ri].length; mi++) {
                if (!document.body.contains(o)) return;
                let [a, b] = bracket[ri][mi];
                if (!a || !b) { winners.push(a||b); continue; }

                const { mel, sA, sB } = matchEls[ri][mi];
                mel.style.border = '1px solid #2ecc71';
                mel.style.boxShadow = '0 0 10px #2ecc7133';
                msgEl.innerHTML = `<span style="color:${a.color||'#fff'}">${a.name}</span> vs <span style="color:${b.color||'#fff'}">${b.name}</span>`;
                await _wait(450);

                for (const c of ['3','2','1','짠!']) {
                    msgEl.innerHTML = `<span style="font-size:18px;color:#2ecc71;">${c}</span>`;
                    await _wait(380);
                }

                let winner, hA, hB;
                do {
                    hA = RPS_KEYS[Math.floor(Math.random()*3)];
                    hB = RPS_KEYS[Math.floor(Math.random()*3)];
                    const r = _rpsWin(hA, hB);
                    winner = r==='a' ? a : r==='b' ? b : null;
                } while (!winner);

                const loser = winner.id === a.id ? b : a;
                const setHand = (el, h) => { const s = el.querySelector('.rh'); if(s) s.textContent = RPS_EMOJI[h]; };
                setHand(sA, hA); setHand(sB, hB);
                await _wait(280);

                if (winner.id === a.id) {
                    sA.style.background = `${a.color||'#2ecc71'}33`;
                    sB.style.opacity = '0.3'; sB.style.filter = 'grayscale(1)';
                } else {
                    sB.style.background = `${b.color||'#2ecc71'}33`;
                    sA.style.opacity = '0.3'; sA.style.filter = 'grayscale(1)';
                }
                msgEl.innerHTML = `
                    <span style="color:${a.color||'#fff'}">${a.name}</span> ${RPS_EMOJI[hA]}
                    &nbsp;vs&nbsp;
                    ${RPS_EMOJI[hB]} <span style="color:${b.color||'#fff'}">${b.name}</span>
                    &nbsp;→&nbsp;<span style="color:#2ecc71;font-weight:bold;">🏆 ${winner.name} 승!</span>
                `;
                mel.style.border = `1px solid ${winner.color||'#2ecc71'}`;
                winners.push(winner);
                await _wait(850);

                if (ri === bracket.length - 1) {
                    // 결승
                    const snack = loser;
                    msgEl.innerHTML = `
                        <span style="color:#888;font-size:12px;">🏆 ${winner.name} 우승! &nbsp;|&nbsp;</span>
                        <span style="color:#f39c12;font-size:16px;font-weight:bold;">🍿 ${snack.name}님이 간식 사러 가세요!</span>
                    `;
                    _floatText(`🍿 ${snack.name} 간식 심부름!`, '#F39C12');
                    const closeBtn = $el('button', `
                        background:#1a2a1a;color:#5ab;border:1px solid #2a4a2a;border-radius:8px;
                        padding:8px 22px;font-size:13px;cursor:pointer;font-family:monospace;
                    `, '닫기');
                    closeBtn.onclick = () => { o.remove(); _gameActive = false; };
                    btnRow.innerHTML = ''; btnRow.appendChild(closeBtn);
                    return;
                }
            }

            // 다음 라운드 슬롯 업데이트
            if (ri < bracket.length - 1) {
                winners.forEach((w, i) => {
                    if (!w || !bracket[ri+1]) return;
                    const nm = matchEls[ri+1][Math.floor(i/2)];
                    if (!nm) return;
                    const slot = i%2===0 ? nm.sA : nm.sB;
                    slot.style.cssText = `padding:4px 7px;border-radius:6px;font-size:11px;margin:2px 0;display:flex;align-items:center;justify-content:space-between;gap:5px;background:${w.color||'#333'}22;border:1px solid ${w.color||'#444'};color:${w.color||'#aaa'};`;
                    slot.innerHTML = `<span>${w.name.slice(0,8)}</span><span class="rh">❓</span>`;
                });
                bracket[ri+1] = bracket[ri+1].map(([,], mi) => [winners[mi*2]||null, winners[mi*2+1]||null]);
            }
        }
    };
}

// ─── 유틸 ────────────────────────────────────────────────
