/**
 * lunchgame.js — 간식 내기 게임 시스템 (P7)
 *
 * 게임 3종:
 *   🔫 러시안 룰렛   — 6발 탄창, 실탄 맞은 사람이 간식 사러 감
 *   🪜 사다리 타기   — 운명의 사다리, 간식 당번 결정
 *   ✂️ 가위바위보    — 토너먼트, 최후 패배자가 간식 심부름
 *
 * 12:00 · 18:00 자동 트리거 (하루 2회, 당일 한 번씩) 또는 G 키 수동 실행.
 * 참가자: people.json 등록 인물 우선, 없으면 5역할 에이전트 폴백.
 */

// ─── 내부 상태 ───────────────────────────────────────────
let _getPeople    = () => [];
let _floatText    = () => {};
let _gameActive   = false;

// ─── 공개 API ────────────────────────────────────────────

export function initLunchGame({ getPeople, addFloatingText }) {
    _getPeople    = getPeople    || (() => []);
    _floatText    = addFloatingText || (() => {});
}

/** 12:00 · 18:00 또는 G키에서 호출 */
export function triggerLunchGame() {
    if (_gameActive) return;
    const people = _getPeople();
    const participants = people.length >= 2 ? people : _agentFallback();
    if (participants.length < 2) {
        _toast('게임 참가자가 2명 이상 필요합니다.\n먼저 "사람 추가"로 등록해주세요!');
        return;
    }
    _showMenu(participants);
}

// ─── 헬퍼 ────────────────────────────────────────────────

function _agentFallback() {
    return [
        { id: 'developer', name: 'Developer', color: '#4A90D9' },
        { id: 'devops',    name: 'DevOps',    color: '#E67E22' },
        { id: 'qa',        name: 'QA',        color: '#27AE60' },
        { id: 'pm',        name: 'PM',        color: '#8E44AD' },
        { id: 'leader',    name: 'Leader',    color: '#E74C3C' },
    ];
}

function $el(tag, css, html = '') {
    const d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (html) d.innerHTML = html;
    return d;
}

function _overlay(closeable = true) {
    const o = $el('div', `
        position:fixed; inset:0; z-index:9000;
        background:rgba(0,0,0,.88); backdrop-filter:blur(4px);
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; gap:0; overflow:auto;
        animation: lgFadeIn .3s ease;
    `);
    if (!document.getElementById('lg-style')) {
        const st = document.createElement('style');
        st.id = 'lg-style';
        st.textContent = `
            @keyframes lgFadeIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
            @keyframes lgPop{0%{transform:scale(0)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
            @keyframes lgShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
            @keyframes lgSpin{from{transform:rotate(0deg)}to{transform:rotate(720deg)}}
            @keyframes lgBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
            @keyframes lgSlide{from{width:0}to{width:100%}}
        `;
        document.head.appendChild(st);
    }
    if (closeable) {
        const x = $el('div', `
            position:absolute;top:18px;right:22px;font-size:28px;
            color:#555;cursor:pointer;line-height:1;z-index:1;
        `, '✕');
        x.onclick = () => { o.remove(); _gameActive = false; };
        o.appendChild(x);
    }
    return o;
}

function _toast(msg) {
    const t = $el('div', `
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
        background:#333;color:#fff;padding:10px 20px;border-radius:10px;
        font-family:monospace;font-size:13px;z-index:9999;white-space:pre-line;text-align:center;
    `, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function _chip(person) {
    return `<span style="
        display:inline-block;background:${(person.color||'#444')}22;
        border:1px solid ${person.color||'#444'};color:#fff;
        font-size:12px;padding:2px 10px;border-radius:12px;margin:3px;font-family:monospace;
    ">${person.name}</span>`;
}

function _wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 메인 메뉴 ───────────────────────────────────────────

function _showMenu(participants) {
    _gameActive = true;
    const o = _overlay();

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const snackLabel = now.getHours() < 15 ? '점심 간식' : '저녁 간식';
    const header = $el('div', `text-align:center;margin-bottom:28px;`, `
        <div style="font-size:52px;margin-bottom:6px;">🍿</div>
        <div style="font-size:30px;font-weight:bold;color:#fff;letter-spacing:2px;">간식 내기!</div>
        <div style="font-size:14px;color:#f39c12;margin-top:4px;font-weight:bold;">${snackLabel} 사러 갈 사람 결정</div>
        <div style="font-size:13px;color:#666;margin-top:6px;">${timeStr} · 참가자 ${participants.length}명</div>
        <div style="margin-top:10px;color:#aaa;font-size:13px;">${participants.map(_chip).join('')}</div>
    `);
    o.appendChild(header);

    const grid = $el('div', `display:flex;gap:20px;justify-content:center;flex-wrap:wrap;`);

    [
        {
            id: 'roulette', emoji: '🔫', name: '러시안 룰렛',
            desc: '6발 탄창에 실탄 1발\n탕! 맞은 사람이\n간식 사러 간다!',
            color: '#e74c3c', bg: '#1a0505',
        },
        {
            id: 'ladder', emoji: '🪜', name: '사다리 타기',
            desc: '운명의 사다리\n간식 당번·음료 내기\n공정한 추첨으로 결정',
            color: '#3498db', bg: '#05101a',
        },
        {
            id: 'rps', emoji: '✂️', name: '가위바위보',
            desc: '토너먼트 브래킷\n최후 패배자가\n간식 심부름 담당!',
            color: '#2ecc71', bg: '#051a0a',
        },
    ].forEach(g => {
        const card = $el('div', `
            width:170px;padding:28px 16px;border-radius:18px;
            background:${g.bg};border:2px solid ${g.color}66;
            cursor:pointer;text-align:center;transition:all .18s;
            color:#fff;font-family:monospace;user-select:none;
        `, `
            <div style="font-size:44px;margin-bottom:14px;">${g.emoji}</div>
            <div style="font-size:16px;font-weight:bold;color:${g.color};margin-bottom:10px;">${g.name}</div>
            <div style="font-size:12px;color:#888;white-space:pre-line;line-height:1.7;">${g.desc}</div>
        `);
        card.onmouseover = () => {
            card.style.transform = 'scale(1.07)';
            card.style.border = `2px solid ${g.color}`;
            card.style.boxShadow = `0 0 24px ${g.color}55`;
        };
        card.onmouseout = () => {
            card.style.transform = 'scale(1)';
            card.style.border = `2px solid ${g.color}66`;
            card.style.boxShadow = 'none';
        };
        card.onclick = () => {
            o.remove();
            const shuffled = [...participants].sort(() => Math.random() - .5);
            if (g.id === 'roulette') _startRoulette(shuffled);
            else if (g.id === 'ladder') _startLadder(shuffled);
            else _startRPS(shuffled);
        };
        grid.appendChild(card);
    });

    o.appendChild(grid);
    document.body.appendChild(o);
}

// ══════════════════════════════════════════════════════════
// 게임 1 — 🔫 러시안 룰렛
// ══════════════════════════════════════════════════════════

async function _startRoulette(participants) {
    const MAX_PLAYERS = 6;
    const players = participants.slice(0, MAX_PLAYERS);
    const o = _overlay(false);
    document.body.appendChild(o);

    // 타이틀
    const title = $el('div', `
        font-size:22px;font-weight:bold;color:#e74c3c;font-family:monospace;
        letter-spacing:2px;margin-bottom:20px;text-align:center;
    `, `🔫 러시안 룰렛 — ${players.length}인 간식 내기`);
    o.appendChild(title);

    // 탄창 상태
    const chamberCount = 6;
    let bulletPos = Math.floor(Math.random() * chamberCount);
    let currentChamber = 0;
    const alive = [...players];

    // 탄창 표시
    const chamberRow = $el('div', `
        display:flex;gap:10px;justify-content:center;margin-bottom:18px;
    `);
    const chamberEls = Array.from({ length: chamberCount }, (_, i) => {
        const c = $el('div', `
            width:36px;height:36px;border-radius:50%;
            background:#2a2a2a;border:2px solid #555;
            display:flex;align-items:center;justify-content:center;
            font-size:16px;transition:all .3s;
        `, '⭕');
        chamberRow.appendChild(c);
        return c;
    });
    o.appendChild(chamberRow);

    // 참가자 그리드
    const pGrid = $el('div', `
        display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:22px;
    `);

    const playerEls = {};
    players.forEach(p => {
        const card = $el('div', `
            width:90px;padding:12px 8px;border-radius:12px;
            background:#1a1a1a;border:2px solid ${p.color||'#555'};
            text-align:center;font-family:monospace;transition:all .4s;
        `, `
            <div style="font-size:28px;margin-bottom:6px;">😐</div>
            <div style="font-size:12px;color:${p.color||'#aaa'};font-weight:bold;">${p.name}</div>
        `);
        pGrid.appendChild(card);
        playerEls[p.id] = card;
    });
    o.appendChild(pGrid);

    // 메시지 영역
    const msgEl = $el('div', `
        font-size:15px;color:#aaa;font-family:monospace;text-align:center;
        min-height:28px;margin-bottom:16px;
    `);
    o.appendChild(msgEl);

    // 진행 버튼
    const btnRow = $el('div', `text-align:center;`);
    const btn = $el('button', `
        background:#e74c3c;color:#fff;border:none;border-radius:10px;
        padding:12px 32px;font-size:15px;cursor:pointer;font-family:monospace;
        font-weight:bold;letter-spacing:1px;transition:background .15s;
    `, '🔫 방아쇠 당기기');
    btn.onmouseover = () => btn.style.background = '#c0392b';
    btn.onmouseout  = () => btn.style.background = '#e74c3c';
    btnRow.appendChild(btn);
    o.appendChild(btnRow);

    function setMsg(html) { msgEl.innerHTML = html; }
    function spinChambers() {
        chamberEls.forEach(c => { c.style.animation = 'lgSpin .6s ease-out'; });
        setTimeout(() => chamberEls.forEach(c => { c.style.animation = ''; }), 650);
    }

    await _wait(400);
    setMsg('탄창을 장전합니다...');
    spinChambers();
    await _wait(800);

    let turnIdx = 0;

    async function takeTurn() {
        if (alive.length === 1) {
            endGame(alive[0]);
            return;
        }

        const current = alive[turnIdx % alive.length];
        const card = playerEls[current.id];

        // 현재 플레이어 강조
        card.style.border = `2px solid #e74c3c`;
        card.style.boxShadow = `0 0 18px #e74c3c88`;
        card.innerHTML = `
            <div style="font-size:28px;margin-bottom:6px;animation:lgBounce .5s infinite;">😰</div>
            <div style="font-size:12px;color:${current.color||'#aaa'};font-weight:bold;">${current.name}</div>
        `;
        setMsg(`<span style="color:${current.color||'#fff'}">${current.name}</span>의 차례...`);
        btn.disabled = true;

        await _wait(700);

        // 탄창 회전
        setMsg('탄창 회전 중...');
        spinChambers();
        await _wait(800);

        const isBullet = (currentChamber % chamberCount) === bulletPos;
        currentChamber++;

        // 탄창 표시 업데이트
        const ci = currentChamber - 1;
        if (isBullet) {
            chamberEls[ci % chamberCount].style.background = '#e74c3c';
            chamberEls[ci % chamberCount].innerHTML = '💥';
        } else {
            chamberEls[ci % chamberCount].style.background = '#2ecc7133';
            chamberEls[ci % chamberCount].innerHTML = '✅';
        }

        if (isBullet) {
            // 탈락
            card.style.border = `2px solid #333`;
            card.style.boxShadow = 'none';
            card.style.opacity = '0.35';
            card.style.filter = 'grayscale(1)';
            card.innerHTML = `
                <div style="font-size:28px;margin-bottom:6px;animation:lgShake .4s;">💀</div>
                <div style="font-size:12px;color:#555;font-weight:bold;">${current.name}</div>
            `;
            setMsg(`<span style="color:#e74c3c;font-size:18px;">💥 탕!</span> <span style="color:#aaa">${current.name} 탈락! 간식 면제~</span>`);
            await _wait(1200);

            const idx = alive.indexOf(current);
            alive.splice(idx, 1);
            turnIdx = turnIdx % Math.max(alive.length, 1);
            bulletPos = Math.floor(Math.random() * chamberCount);
            currentChamber = 0;
            chamberEls.forEach(c => { c.style.background = '#2a2a2a'; c.innerHTML = '⭕'; c.style.border = '2px solid #555'; });
            if (alive.length > 1) {
                setMsg('탄창을 다시 장전합니다...');
                spinChambers();
                await _wait(700);
            }
        } else {
            // 생존
            card.innerHTML = `
                <div style="font-size:28px;margin-bottom:6px;">😮‍💨</div>
                <div style="font-size:12px;color:${current.color||'#aaa'};font-weight:bold;">${current.name}</div>
            `;
            card.style.border = `2px solid ${current.color||'#555'}`;
            card.style.boxShadow = 'none';
            setMsg(`<span style="color:#2ecc71">딸깍... 살았다!</span> <span style="color:#aaa">${current.name} 생존</span>`);
            turnIdx = (turnIdx + 1) % alive.length;
            await _wait(900);
        }

        if (alive.length === 1) {
            endGame(alive[0]);
        } else {
            btn.disabled = false;
            const next = alive[turnIdx % alive.length];
            setMsg(`다음: <span style="color:${next.color||'#fff'}">${next.name}</span>`);
        }
    }

    function endGame(winner) {
        btn.disabled = true;
        const wCard = playerEls[winner.id];
        wCard.style.border = `2px solid #f39c12`;
        wCard.style.boxShadow = `0 0 30px #f39c1299`;
        wCard.innerHTML = `
            <div style="font-size:32px;margin-bottom:6px;animation:lgBounce .7s infinite;">🍿</div>
            <div style="font-size:13px;color:#f39c12;font-weight:bold;">${winner.name}</div>
            <div style="font-size:10px;color:#aaa;margin-top:3px;">간식 당번!</div>
        `;
        setMsg(`<span style="color:#f39c12;font-size:18px;">🍿 ${winner.name}님 간식 사러 가세요~! 화이팅!</span>`);
        _floatText && _floatText(`🍿 ${winner.name} 간식 심부름`, '#F39C12');

        const closeBtn2 = $el('button', `
            background:#333;color:#aaa;border:none;border-radius:8px;
            padding:8px 24px;font-size:13px;cursor:pointer;margin-top:16px;
        `, '닫기');
        closeBtn2.onclick = () => { o.remove(); _gameActive = false; };
        btnRow.innerHTML = '';
        btnRow.appendChild(closeBtn2);
    }

    btn.onclick = takeTurn;
    await _wait(200);
    setMsg(`<span style="color:${players[0].color||'#fff'}">${players[0].name}</span>부터 시작!`);
    btn.disabled = false;
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
    const prizes  = _shuffled(LADDER_PRIZES).slice(0, players.length);
    const n = players.length;

    const o = _overlay(false);
    document.body.appendChild(o);

    const title = $el('div', `
        font-size:22px;font-weight:bold;color:#3498db;font-family:monospace;
        letter-spacing:2px;margin-bottom:16px;text-align:center;
    `, `🪜 사다리 타기 — ${n}인 간식 내기`);
    o.appendChild(title);

    // Canvas
    const CW = Math.max(520, n * 90 + 60);
    const CH = 440;
    const canvas = $el('canvas');
    canvas.width = CW; canvas.height = CH;
    canvas.style.cssText = `border-radius:12px;background:#0a0f1a;display:block;margin:0 auto;`;
    o.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const PAD_L = 40, PAD_T = 60, PAD_B = 60;
    const colW  = (CW - PAD_L * 2) / (n - 1 || 1);
    const ROWS  = 10;
    const rowH  = (CH - PAD_T - PAD_B) / ROWS;

    // 사다리 가로대 생성 (랜덤)
    const rungs = []; // { row, col } — col과 col+1 사이
    for (let r = 1; r < ROWS; r++) {
        let last = -2;
        for (let c = 0; c < n - 1; c++) {
            if (c > last && Math.random() < 0.45) {
                rungs.push({ row: r, col: c });
                last = c + 1;
            }
        }
    }

    // 각 플레이어의 경로 계산
    function calcPath(startCol) {
        const path = [{ col: startCol, row: 0 }];
        let col = startCol;
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

    function colX(c) { return PAD_L + c * colW; }
    function rowY(r) { return PAD_T + r * rowH; }

    function drawStatic() {
        ctx.clearRect(0, 0, CW, CH);
        ctx.strokeStyle = '#2a4070'; ctx.lineWidth = 2;

        // 세로선
        for (let c = 0; c < n; c++) {
            ctx.beginPath();
            ctx.moveTo(colX(c), PAD_T);
            ctx.lineTo(colX(c), CH - PAD_B);
            ctx.stroke();
        }
        // 가로대
        ctx.strokeStyle = '#3498db88';
        rungs.forEach(({ row, col }) => {
            ctx.beginPath();
            ctx.moveTo(colX(col), rowY(row));
            ctx.lineTo(colX(col + 1), rowY(row));
            ctx.stroke();
        });
        // 상단 이름
        players.forEach((p, i) => {
            ctx.fillStyle = p.color || '#aaa';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(p.name.slice(0, 6), colX(i), PAD_T - 12);
        });
        // 하단 결과 (가림)
        prizes.forEach((pr, i) => {
            ctx.fillStyle = '#1a2a3a';
            ctx.fillRect(colX(i) - 38, CH - PAD_B + 6, 76, 22);
        });
    }

    drawStatic();

    const msgEl = $el('div', `
        font-size:14px;color:#aaa;font-family:monospace;
        text-align:center;margin-top:12px;min-height:22px;
    `, '시작 버튼을 누르세요');
    o.appendChild(msgEl);

    const btnRow = $el('div', `text-align:center;margin-top:12px;`);
    const btn = $el('button', `
        background:#3498db;color:#fff;border:none;border-radius:10px;
        padding:10px 30px;font-size:14px;cursor:pointer;font-family:monospace;
        font-weight:bold;letter-spacing:1px;
    `, '🪜 사다리 출발!');
    btnRow.appendChild(btn);
    o.appendChild(btnRow);

    btn.onclick = async () => {
        btn.disabled = true;
        msgEl.textContent = '사다리 타는 중...';

        const STEP_MS = 60;
        const maxSteps = Math.max(...paths.map(p => p.path.length));
        let step = 0;

        const interval = setInterval(() => {
            drawStatic();
            // 각 플레이어의 현재까지 경로 그리기
            paths.forEach(({ path }, pi) => {
                const p = players[pi];
                const drawn = path.slice(0, step + 1);
                ctx.strokeStyle = p.color || '#fff';
                ctx.lineWidth = 3;
                ctx.shadowBlur = 8;
                ctx.shadowColor = p.color || '#fff';
                ctx.beginPath();
                drawn.forEach(({ col, row }, j) => {
                    const x = colX(col), y = rowY(row);
                    j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                });
                ctx.stroke();
                ctx.shadowBlur = 0;

                // 현재 위치 점
                const cur = drawn[drawn.length - 1];
                ctx.fillStyle = p.color || '#fff';
                ctx.beginPath();
                ctx.arc(colX(cur.col), rowY(cur.row), 5, 0, Math.PI * 2);
                ctx.fill();
            });

            step++;
            if (step >= maxSteps) {
                clearInterval(interval);
                // 결과 공개
                paths.forEach(({ end }, pi) => {
                    const p = players[pi];
                    const prize = prizes[end];
                    ctx.fillStyle = p.color || '#aaa';
                    ctx.font = 'bold 11px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(prize, colX(end), CH - PAD_B + 20);
                });
                // 결과 텍스트
                const resultLines = paths.map(({ end }, pi) =>
                    `${players[pi].name} → ${prizes[end]}`
                ).join(' | ');
                msgEl.innerHTML = `<span style="color:#3498db">${resultLines}</span>`;
                // 간식 사러 가는 사람 강조
                const snackPerson = paths.reduce((acc, { end }, pi) => {
                    const pr = prizes[end];
                    if (pr.includes('면제')) return acc;
                    return acc || players[pi].name;
                }, null);
                _floatText && _floatText(snackPerson ? `🍿 ${snackPerson} 간식 당번!` : '🪜 결과 공개!', '#3498db');

                const closeBtn2 = $el('button', `
                    background:#333;color:#aaa;border:none;border-radius:8px;
                    padding:8px 24px;font-size:13px;cursor:pointer;margin-top:0;
                `, '닫기');
                closeBtn2.onclick = () => { o.remove(); _gameActive = false; };
                btnRow.innerHTML = '';
                btnRow.appendChild(closeBtn2);
            }
        }, STEP_MS);
    };
}

// ══════════════════════════════════════════════════════════
// 게임 3 — ✂️ 가위바위보 토너먼트
// ══════════════════════════════════════════════════════════

const RPS_EMOJI = { R: '✊', P: '🖐️', S: '✌️' };
const RPS_KEYS  = ['R', 'P', 'S'];
const RPS_NAME  = { R: '바위', P: '보', S: '가위' };

function _rpsWinner(a, b) {
    if (a === b) return 'draw';
    if ((a==='R'&&b==='S')||(a==='S'&&b==='P')||(a==='P'&&b==='R')) return 'a';
    return 'b';
}

function _buildBracket(players) {
    // 2의 거듭제곱 올림 (BYE 포함)
    const n = Math.pow(2, Math.ceil(Math.log2(players.length)));
    const seeded = [...players];
    while (seeded.length < n) seeded.push(null); // BYE
    // 매치 생성
    const rounds = [];
    let current = seeded;
    while (current.length > 1) {
        const round = [];
        for (let i = 0; i < current.length; i += 2) {
            round.push([current[i], current[i + 1]]);
        }
        rounds.push(round);
        current = round.map(([a, b]) => (a && b) ? null : (a || b)); // BYE 자동 진출
    }
    return rounds;
}

async function _startRPS(participants) {
    const players = participants.slice(0, 8);
    const o = _overlay(false);
    document.body.appendChild(o);

    const title = $el('div', `
        font-size:22px;font-weight:bold;color:#2ecc71;font-family:monospace;
        letter-spacing:2px;margin-bottom:16px;text-align:center;
    `, `✂️ 가위바위보 — ${players.length}강 간식 내기`);
    o.appendChild(title);

    const bracket = _buildBracket(players);
    const results = []; // results[round][match] = winner

    // 브래킷 UI 컨테이너
    const bracketEl = $el('div', `
        display:flex;gap:32px;align-items:center;justify-content:center;
        flex-wrap:nowrap;overflow-x:auto;padding:8px;
    `);
    o.appendChild(bracketEl);

    const matchEls = []; // matchEls[round][match]

    bracket.forEach((round, ri) => {
        const roundEl = $el('div', `
            display:flex;flex-direction:column;gap:16px;align-items:center;
        `);
        const rLabel = $el('div', `
            font-size:12px;color:#2ecc7188;font-family:monospace;margin-bottom:4px;
        `, ri === bracket.length - 1 ? '결승' : `${round.length * 2}강`);
        roundEl.appendChild(rLabel);
        matchEls[ri] = [];
        round.forEach(([a, b], mi) => {
            const matchEl = $el('div', `
                background:#0a1a0a;border:1px solid #2ecc7133;
                border-radius:10px;padding:10px;min-width:130px;
                font-family:monospace;text-align:center;
            `);
            const makeSlot = (p) => {
                const sl = $el('div', `
                    padding:5px 8px;border-radius:6px;
                    ${p ? `background:${p.color||'#333'}22;border:1px solid ${p.color||'#444'};color:${p.color||'#aaa'};`
                        : 'background:#111;border:1px dashed #333;color:#333;'}
                    font-size:12px;margin:3px 0;
                    display:flex;align-items:center;gap:6px;justify-content:space-between;
                `, p ? `<span>${p.name}</span><span class="rps-hand">❓</span>` : `<span>BYE</span>`);
                return sl;
            };
            const slotA = makeSlot(a);
            const vsEl  = $el('div', `font-size:10px;color:#444;`, 'VS');
            const slotB = makeSlot(b);
            matchEl.appendChild(slotA);
            matchEl.appendChild(vsEl);
            matchEl.appendChild(slotB);
            roundEl.appendChild(matchEl);
            matchEls[ri][mi] = { matchEl, slotA, slotB };
        });
        bracketEl.appendChild(roundEl);
    });

    const msgEl = $el('div', `
        font-size:14px;color:#aaa;font-family:monospace;
        text-align:center;margin-top:12px;min-height:22px;
    `, '버튼을 눌러 토너먼트를 시작하세요');
    o.appendChild(msgEl);

    const btnRow = $el('div', `text-align:center;margin-top:10px;`);
    const btn = $el('button', `
        background:#2ecc71;color:#000;border:none;border-radius:10px;
        padding:10px 28px;font-size:14px;cursor:pointer;font-family:monospace;
        font-weight:bold;letter-spacing:1px;
    `, '✂️ 토너먼트 시작!');
    btnRow.appendChild(btn);
    o.appendChild(btnRow);

    btn.onclick = async () => {
        btn.disabled = true;
        let currentPlayers = players.map(p => p); // mutable

        for (let ri = 0; ri < bracket.length; ri++) {
            const round = bracket[ri];
            const roundWinners = [];

            for (let mi = 0; mi < round.length; mi++) {
                let [a, b] = round[mi];
                // BYE 자동 진출
                if (!a || !b) {
                    roundWinners.push(a || b);
                    continue;
                }
                const { slotA, slotB, matchEl } = matchEls[ri][mi];
                matchEl.style.border = '1px solid #2ecc71';
                matchEl.style.boxShadow = '0 0 12px #2ecc7144';
                msgEl.innerHTML = `<span style="color:${a.color||'#fff'}">${a.name}</span> vs <span style="color:${b.color||'#fff'}">${b.name}</span> — 승부!`;

                await _wait(500);

                // 3-2-1 카운트다운
                for (const cnt of ['3', '2', '1', '짠!']) {
                    msgEl.innerHTML = `<span style="font-size:20px;color:#2ecc71;">${cnt}</span>`;
                    await _wait(400);
                }

                // 무승부 시 재경기
                let winner, loser, hA, hB;
                do {
                    hA = RPS_KEYS[Math.floor(Math.random() * 3)];
                    hB = RPS_KEYS[Math.floor(Math.random() * 3)];
                    const res = _rpsWinner(hA, hB);
                    winner = res === 'a' ? a : res === 'b' ? b : null;
                    loser  = res === 'a' ? b : res === 'b' ? a : null;
                } while (!winner);

                // 결과 표시
                const showHand = (slotEl, hand) => {
                    const handEl = slotEl.querySelector('.rps-hand');
                    if (handEl) handEl.textContent = RPS_EMOJI[hand];
                };
                showHand(slotA, hA);
                showHand(slotB, hB);
                await _wait(300);

                // 승자/패자 스타일
                const winnerId = winner.id;
                if (a.id === winnerId) {
                    slotA.style.background = `${a.color||'#2ecc71'}44`;
                    slotA.style.fontWeight = 'bold';
                    slotB.style.opacity = '0.35';
                    slotB.style.filter = 'grayscale(1)';
                } else {
                    slotB.style.background = `${b.color||'#2ecc71'}44`;
                    slotB.style.fontWeight = 'bold';
                    slotA.style.opacity = '0.35';
                    slotA.style.filter = 'grayscale(1)';
                }

                msgEl.innerHTML = `
                    <span style="color:${a.color||'#fff'}">${a.name}</span> ${RPS_EMOJI[hA]}
                    &nbsp;vs&nbsp;
                    ${RPS_EMOJI[hB]} <span style="color:${b.color||'#fff'}">${b.name}</span>
                    &nbsp;→&nbsp;
                    <span style="color:#2ecc71;font-weight:bold;">🏆 ${winner.name} 승!</span>
                `;
                matchEl.style.border = `1px solid ${winner.color||'#2ecc71'}`;
                matchEl.style.boxShadow = `0 0 16px ${winner.color||'#2ecc71'}55`;
                roundWinners.push(winner);
                await _wait(900);
            }

            // 다음 라운드 슬롯 업데이트
            if (ri < bracket.length - 1) {
                roundWinners.forEach((w, i) => {
                    if (!w || !bracket[ri + 1]) return;
                    const nextMatch = matchEls[ri + 1][Math.floor(i / 2)];
                    if (!nextMatch) return;
                    const slot = i % 2 === 0 ? nextMatch.slotA : nextMatch.slotB;
                    slot.style.cssText = `
                        padding:5px 8px;border-radius:6px;
                        background:${w.color||'#333'}22;border:1px solid ${w.color||'#444'};
                        color:${w.color||'#aaa'};font-size:12px;margin:3px 0;
                        display:flex;align-items:center;gap:6px;justify-content:space-between;
                    `;
                    slot.innerHTML = `<span>${w.name}</span><span class="rps-hand">❓</span>`;
                });
                bracket[ri + 1] = bracket[ri + 1].map(([a, b], mi) => {
                    const wa = roundWinners[mi * 2];
                    const wb = roundWinners[mi * 2 + 1];
                    return [wa || null, wb || null];
                });
            } else {
                // 결승 — champion=우승자, finalLoser=결승 패배자(간식 당번)
                const champion = roundWinners[0];
                const finalMatch = bracket[ri][0];
                const finalLoser = (finalMatch[0] && finalMatch[0].id !== champion.id) ? finalMatch[0]
                                 : (finalMatch[1] && finalMatch[1].id !== champion.id) ? finalMatch[1]
                                 : null;
                const snackPerson = finalLoser || champion;
                msgEl.innerHTML = `
                    <span style="color:#aaa;font-size:13px;">🏆 ${champion.name} 우승!</span><br>
                    <span style="color:#f39c12;font-size:18px;font-weight:bold;">🍿 ${snackPerson.name}님이 간식 사러 가세요!</span>
                `;
                _floatText && _floatText(`🍿 ${snackPerson.name} 간식 심부름`, '#F39C12');
                const closeBtn2 = $el('button', `
                    background:#333;color:#aaa;border:none;border-radius:8px;
                    padding:8px 24px;font-size:13px;cursor:pointer;
                `, '닫기');
                closeBtn2.onclick = () => { o.remove(); _gameActive = false; };
                btnRow.innerHTML = '';
                btnRow.appendChild(closeBtn2);
            }
        }
    };
}

// ─── 유틸 ────────────────────────────────────────────────
function _shuffled(arr) { return [...arr].sort(() => Math.random() - .5); }
