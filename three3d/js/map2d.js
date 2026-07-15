// ============================================
// map2d.js — 게더타운식 2D 탑다운 뷰 (3D ↔ 2D 전환)
// ============================================
//
// 동작 원리:
//  - 레이아웃: 2D 맵은 3D 배치를 그대로 투영하지 않고, 메인 스트리트 양쪽에 건물을
//    일렬로 정렬한 전용 레이아웃(게더타운·메이플 마을 스타일)을 쓴다.
//    각 존은 3D 월드 사각형(x0..x1,z0..z1)과 2D 레이아웃 위치(lay)를 함께 가지며,
//    존 내부 좌표는 평행이동(ox,oz)으로 1:1 매핑된다 → 건물 안 아바타는 3D와 정확히 동기화.
//    존 밖(길·잔디)은 항등 매핑으로 근사한다(로비 성격이라 허용).
//  - 아바타: 실사용자만 매 프레임 스프라이트(원 + 방향점 + 이름 + 말풍선 + 층 배지)로 그린다.
//  - 이동: 방향키/WASD를 capture 단계에서 소비, 벽은 슬라이드로 막히고 문(포탈)로만 입장.
//    포탈 진입 시 줌인+페이드 후 3D로 전환(메이플식 맵 이동), 3D 위치는 그 건물 입구로 텔레포트.
//  - 성능: 2D 활성 시 scene.js animate가 window.__map2dActive 가드로 3D 렌더를 스킵한다.

const WORLD = { minX: -60, maxX: 52, minZ: -42, maxZ: 34 };   // 레이아웃 잔디 영역
const SPEED = 5;          // 이동 속도(world unit/s) — 3D 키보드 이동과 동일
const MOVE_KEYS = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
};

// ---- 건물(존) 정의 ----
// x0..z1 = 3D 월드 사각형(아바타 동기화 기준·불변), lay = 2D 레이아웃 좌상단(크기는 동일).
// 북쪽 라인(문 z=-10, 남향)과 남쪽 라인(문 z=2, 북향)이 메인 스트리트(z=-6)를 사이에 두고 정렬.
// entry = 3D 입장 시 텔레포트 지점(월드), door.at = 문 위치(월드 좌표, 그릴 때 오프셋 적용)
const ZONES = [
    {
        id: 'complex', x0: -52, x1: -18, z0: -53, z1: -29, lay: { x: -54, z: -34 },
        icon: '🏛', name: '오피스 단지', desc: '부서별 6실 + 중정 · 팀 홈',
        pad: 0.4,
        floor: '#EDE7DA', wall: '#8A7B62', face: '#A99878', entry: { x: -35, z: -27.5 },
        door: { side: 'S', at: -35 }, view3d: { pos: [-35, 16, -26], target: [-35, 1.5, -42] },
        rooms: [
            { x0: -51.5, x1: -44.5, z0: -44, z1: -38, label: '👑 대표님' },
            { x0: -42.5, x1: -35.5, z0: -52.5, z1: -46.5, label: '💻 개발 1팀' },
            { x0: -34.5, x1: -27.5, z0: -52.5, z1: -46.5, label: '💻 개발 2팀' },
            { x0: -25.5, x1: -18.5, z0: -44, z1: -38, label: '🖥 시스템 운영' },
            { x0: -42.5, x1: -35.5, z0: -35.5, z1: -29.5, label: '🔧 인프라' },
            { x0: -34.5, x1: -27.5, z0: -35.5, z1: -29.5, label: '📦 창고' },
        ],
        court: { x0: -43, x1: -27, z0: -46, z1: -36 },
        plaqueZ: -41.8,
    },
    {
        id: 'cafe', x0: -32, x1: -16, z0: -24, z1: -12, lay: { x: -14, z: -22 },
        icon: '☕', name: 'CAFE 타워', desc: '1F 텐퍼센트 · 2F 식당 · 3F 매점 · 4F 안마',
        floor: '#F6E7CE', wall: '#9C6B3F', face: '#B5834F', entry: { x: -27, z: -10 },
        door: { side: 'S', at: -27 }, awning: ['#E25B55', '#FFF4E6'],
        view3d: { pos: [-24, 9, 1], target: [-24, 5.5, -18] },   // 정면(남쪽)에서 4층 타워 정시
        chips: [{ id: 'mealplan', label: '🍚 식단표 보기' }],
    },
    {
        id: 'office2', x0: -14, x1: -6, z0: -21, z1: -15, lay: { x: 6, z: -16 },
        icon: '🏢', name: '2층 사무실', desc: '계단 위 업무 공간',
        floor: '#ECE5F4', wall: '#71618C', face: '#8B7BA6', entry: { x: -10, z: -13 },
        door: { side: 'S', at: -10 }, view3d: { pos: [-10, 4.5, -8], target: [-10, 2, -18] },   // 정면(남쪽)
    },
    {
        id: 'office', x0: -6, x1: 6, z0: -22, z1: -14, lay: { x: 18, z: -18 },
        icon: '💼', name: '본관 오피스', desc: 'AI 에이전트 데스크 · 근무 현황',
        floor: '#E6EDF3', wall: '#54687A', face: '#6D8296', entry: { x: 0, z: -12 },
        door: { side: 'S', at: 0 }, awning: ['#4A7FB5', '#E8F1F8'],
        view3d: { pos: [0, 5, -5], target: [0, 1.8, -18] },   // 정면(남쪽 통유리 앞)
    },
    {
        id: 'jumptower', x0: 25, x1: 31, z0: -16, z1: -10, lay: { x: 34, z: -16 },
        icon: '🗼', name: '왁뿌 타워', desc: '점프맵 게임 — 3D에서 포탈 SPACE 입장',
        floor: '#ECDFF8', wall: '#6C4BA8', face: '#8563BE', entry: { x: 28, z: -7.5 },
        door: { side: 'S', at: 28 }, view3d: { pos: [28, 7, 0], target: [28, 5, -13] },   // 정면(남쪽)
    },
    {
        id: 'tetristower', x0: 37, x1: 43, z0: -16, z1: -10, lay: { x: 42, z: -16 },
        icon: '🧱', name: '테트리스 타워', desc: '테트리스 게임 — 3D에서 포탈 SPACE 시작',
        floor: '#E8F6FB', wall: '#8E24AA', face: '#AB47BC', entry: { x: 40, z: -7.5 },
        door: { side: 'S', at: 40 }, view3d: { pos: [40, 7, 0], target: [40, 5, -13] },   // 정면(남쪽)
    },
    {
        id: 'warehouse', x0: -40.5, x1: -31.5, z0: 18, z1: 26, lay: { x: -54, z: 2 },
        icon: '📦', name: '물류창고', desc: '자재 랙 · 지게차/AGV 하역',
        floor: '#E4DCCB', wall: '#6E6152', face: '#8A7B68', entry: { x: -36, z: 16.5 },
        door: { side: 'N', at: -36 }, view3d: { pos: [-36, 7, 34], target: [-36, 1.5, 22] },   // 정면(남쪽)
    },
    {
        id: 'factory', x0: -29, x1: -15, z0: 4, z1: 32, lay: { x: -41, z: 2 },
        icon: '🏭', name: '공장', desc: 'ITR/OTR 생산라인 · POP 단말',
        floor: '#D9DCDF', wall: '#57626B', face: '#6E7A84', entry: { x: -13.5, z: 8 },
        door: { side: 'N', at: -22 }, plaqueZ: 17,
        view3d: { pos: [-50, 5, 18], target: [-22, 2, 18] },
    },
    {
        id: 'guam', x0: -2, x1: 4, z0: -11, z1: -5, lay: { x: -23, z: 2 },
        icon: '🏝', name: '괌 정자', desc: '야외 회의 테이블',
        floor: '#F5E7C0', wall: '#C9A96B', open: true, entry: { x: 1, z: -8 },
    },
    {
        id: 'resort', x0: 6, x1: 24, z0: -20, z1: 4, lay: { x: -13, z: 2 },
        icon: '🏖', name: '리조트 비치', desc: '수영장 · 오키나와/보라카이 정자',
        floor: '#F4E5B8', wall: '#C9A96B', open: true, entry: { x: 12, z: -9 },
        pool: { x0: 9, x1: 15, z0: -15.5, z1: -11.5 },
        pavilions: [{ x: 18, z: -13, label: '오키나와' }, { x: 16, z: 0, label: '보라카이' }],
        plaqueZ: -18.2,
    },
];
// 레이아웃 사각형·평행이동 오프셋 계산 (존 내부 좌표 = 월드 + (ox,oz))
for (const z of ZONES) {
    z.lx0 = z.lay.x; z.lz0 = z.lay.z;
    z.lx1 = z.lay.x + (z.x1 - z.x0);
    z.lz1 = z.lay.z + (z.z1 - z.z0);
    z.ox = z.lx0 - z.x0; z.oz = z.lz0 - z.z0;
}
// 로터리 광장(랜드마크) + 메인 스트리트 + 각 문 스퍼 — 레이아웃 좌표
const PLAZA = { x: 16, z: -6, r: 3.5 };
const ROADS = [{ x0: -56, x1: 46, z: -6 }];
const PATH_SPURS = [
    [-37, -10, -6], [-9, -10, -6], [10, -10, -6], [24, -10, -6], [37, -10, -6], [45, -10, -6],   // 북쪽 라인 문 앞
    [-49.5, -6, 2], [-34, -6, 2], [-20, -6, 2], [-4, -6, 2],                      // 남쪽 라인 문 앞
];
// 장식(레이아웃 좌표): 나무·꽃·풀숲 — 건물·도로를 피한 고정 좌표
const TREES = [
    [-17, -12], [4, -12], [32, -12], [50, -12], [-43, 0], [-25, 0], [-15, 0],
    [8, 14], [9, 26], [-57, -14], [-57, 4], [40, 6], [36, 20], [-30, -37],
    [20, -24], [10, -30], [-8, -26], [28, 8], [-46, 24], [16, 24],
];
const FLOWERS = [
    [-50, -4], [-30, -4], [-12, -4], [2, -4], [20, -4], [30, -4],
    [-46, -8.2], [-22, -8.2], [12, -8.2], [28, -8.2],
];
const TUFTS = [
    [-56, -24], [-40, -16], [-16, -20], [8, -22], [26, -20], [38, -16],
    [-50, 14], [-22, 12], [8, 6], [16, 12], [-58, 26], [40, 26],
    [-4, 30], [24, -30], [-36, -38], [0, -36],
];

export function initMap2D(deps) {
    let active = false;
    let cv = null, ctx = null, bar = null;
    let raf = 0, lastT = 0;
    const keys = new Set();
    let wasMoving = false;
    let myLay = null;                         // 내 레이아웃 위치 캐시 — 존 밖 항등 근사의 순간이동 방지(아래 frame 참조)
    let myLayW = null;                        // 캐시가 유효한 월드 좌표(외부 텔레포트 감지용)
    let followMe = true;                      // 내 아바타 자동 추적(드래그하면 해제)
    const view = { cx: -6, cz: -8, s: 16 };   // 2D 카메라: 레이아웃 중심 + 줌(px/unit)
    let drag = null;
    let mouse = null;                         // 호버 좌표(스크린)
    let hoverZone = null;
    let chipRects = [];                       // 이번 프레임 클릭 칩 히트 영역
    let transitioning = false;                // 페이드 전환 중(입력·재진입 잠금)
    let doorAnim = null;                      // 입장 연출: 문 쪽으로 줌인 애니메이션
    let fadeEl = null;                        // 페이드 오버레이(2D↔3D 전환 공용)
    let jump = null;                          // 점프 중({t0}) — SPACE, 포물선 궤적
    const listeners = [];
    const JUMP_DUR = 550, JUMP_H = 1.5;       // 점프 시간(ms)·최고 높이(world unit)

    /** 현재 점프 높이(world unit) — 포물선 4H·k(1-k). 끝나면 상태 해제 */
    function jumpOffsetUnits() {
        if (!jump) return 0;
        const k = (performance.now() - jump.t0) / JUMP_DUR;
        if (k >= 1) { jump = null; return 0; }
        return 4 * JUMP_H * k * (1 - k);
    }

    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    const emit = () => listeners.forEach((fn) => { try { fn(active); } catch { /* noop */ } });
    const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    // ---- 좌표 매핑 (3D 월드 ↔ 2D 레이아웃) ----
    const zoneAtWorld = (wx, wz) => ZONES.find((z) => wx >= z.x0 && wx <= z.x1 && wz >= z.z0 && wz <= z.z1) || null;
    const zoneAtLay = (lx, lz) => ZONES.find((z) => lx >= z.lx0 && lx <= z.lx1 && lz >= z.lz0 && lz <= z.lz1) || null;
    const solidAtLay = (lx, lz) => { const z = zoneAtLay(lx, lz); return (z && !z.open) ? z : null; };
    /** 월드 → 레이아웃: 존 안이면 평행이동, 밖(길·잔디)이면 항등 근사 */
    const w2l = (wx, wz) => { const z = zoneAtWorld(wx, wz); return z ? { x: wx + z.ox, z: wz + z.oz } : { x: wx, z: wz }; };
    /** 레이아웃 → 월드: 역방향 */
    const l2w = (lx, lz) => { const z = zoneAtLay(lx, lz); return z ? { x: lx - z.ox, z: lz - z.oz } : { x: lx, z: lz }; };
    /** 그리기 전용 여백 — 이웃 건물과 시각적 간격 */
    const padOf = (z) => (z.open ? 0 : (z.pad !== undefined ? z.pad : 0.7));
    /** 문(포탈) 위치 — 월드 좌표(벽 라인 위) */
    function doorWorldPos(z) {
        const d = z.door;
        if (!d) return { x: z.entry.x, z: z.entry.z };
        const pad = padOf(z);
        if (d.side === 'S') return { x: d.at, z: z.z1 - pad };
        if (d.side === 'N') return { x: d.at, z: z.z0 + pad };
        if (d.side === 'E') return { x: z.x1 - pad, z: d.at };
        return { x: z.x0 + pad, z: d.at };
    }
    /** 문(포탈) 위치 — 레이아웃 좌표 */
    function doorLayPos(z) {
        const dp = doorWorldPos(z);
        return { x: dp.x + z.ox, z: dp.z + z.oz };
    }
    /** 라운드 사각형 path (Chrome roundRect, 구형 폴백 rect) */
    function rr(x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    }
    // ---- 페이드 전환(2D↔3D 공용) — 메이플식 맵 이동 연출 ----
    function fadeTo(op) {
        if (!fadeEl) {
            fadeEl = document.createElement('div');
            fadeEl.style.cssText = 'position:fixed; inset:0; z-index:1400; background:#000; opacity:0;'
                + ' pointer-events:none; transition:opacity 0.3s ease;';
            document.body.appendChild(fadeEl);
        }
        fadeEl.style.opacity = String(op);
    }
    function withFade(fn) {
        if (transitioning) return;
        transitioning = true;
        fadeTo(1);
        setTimeout(() => {
            fn();
            setTimeout(() => { fadeTo(0); transitioning = false; }, 120);   // 새 화면 첫 프레임 후 페이드 인
        }, 320);
    }

    // ---- UI (캔버스 + 하단 툴바) ----
    function buildUI() {
        cv = document.createElement('canvas');
        cv.id = 'map2d-canvas';
        // z=50: 채팅 런처(100)·뷰 스위처(850)·모달(1500+)보다 아래, 3D 라벨보다는 위(라벨은 매 프레임 숨김)
        cv.style.cssText = 'position:fixed; inset:0; z-index:50; display:none; cursor:grab;';
        document.body.appendChild(cv);
        ctx = cv.getContext('2d');

        bar = document.createElement('div');
        bar.style.cssText = 'position:fixed; bottom:18px; left:50%; transform:translateX(-50%); z-index:860;'
            + ' display:none; gap:6px; align-items:center; background:rgba(0,0,0,0.62); border:1px solid #2a3550;'
            + ' border-radius:10px; padding:6px 8px; font-family:monospace; backdrop-filter:blur(4px);';
        const mkBtn = (txt, title, fn) => {
            const b = document.createElement('button');
            b.textContent = txt; b.title = title;
            b.style.cssText = 'background:rgba(255,255,255,0.08); color:#cfe0ff; border:none; border-radius:7px;'
                + ' padding:6px 11px; font-family:monospace; font-size:12px; cursor:pointer; white-space:nowrap;';
            b.onclick = fn;
            return b;
        };
        const hint = document.createElement('span');
        hint.textContent = '이동 ↑↓←→/WASD · SPACE 점프 · 포탈로 입장(3D) · 휠 줌';
        hint.style.cssText = 'color:#8fa4c8; font-size:11px; padding:0 6px;';
        bar.append(
            mkBtn('🏙 3D로 전환', '3D 뷰로 돌아가기', () => withFade(exit)),
            mkBtn('🎯 내 위치', '내 아바타 따라가기', () => { followMe = true; }),
            mkBtn('＋', '확대', () => zoomBy(1.25)),
            mkBtn('－', '축소', () => zoomBy(0.8)),
            hint,
        );
        document.body.appendChild(bar);

        cv.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
        }, { passive: false });
        cv.addEventListener('pointerdown', (e) => {
            drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false };
            cv.setPointerCapture(e.pointerId);
        });
        cv.addEventListener('pointermove', (e) => {
            mouse = { x: e.clientX, y: e.clientY };
            if (!drag) return;
            if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) { drag.moved = true; followMe = false; cv.style.cursor = 'grabbing'; }
            if (drag.moved) {
                view.cx = drag.cx - (e.clientX - drag.x) / view.s;
                view.cz = drag.cz - (e.clientY - drag.y) / view.s;
            }
        });
        cv.addEventListener('pointerup', (e) => {
            const wasClick = drag && !drag.moved;
            drag = null; cv.style.cursor = 'grab';
            if (wasClick) handleClick(e.clientX, e.clientY);
        });
        cv.addEventListener('pointercancel', () => { drag = null; cv.style.cursor = 'grab'; });
        cv.addEventListener('pointerleave', () => { mouse = null; });
        window.addEventListener('resize', () => { if (active) resize(); });
    }

    /** 클릭: ① 기능 칩(식단표 등) ② 건물 존 → 문 앞으로 이동(야외 존은 안쪽으로) */
    function handleClick(px, py) {
        if (transitioning) return;
        for (const c of chipRects) {
            if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
                if (c.id === 'mealplan' && deps.openMealPlan) deps.openMealPlan();
                return;
            }
        }
        const W = innerWidth, H = innerHeight;
        const lx = view.cx + (px - W / 2) / view.s;
        const lz = view.cz + (py - H / 2) / view.s;
        const zone = zoneAtLay(lx, lz);
        if (!zone) return;
        // 이동 목표(레이아웃): 야외 존=입구(존 안, 존 매핑으로 정확 변환) / 건물=문 앞 한 걸음 바깥
        let target;
        if (zone.open) {
            target = { x: zone.entry.x + zone.ox, z: zone.entry.z + zone.oz };
        } else {
            const dp = doorLayPos(zone);
            const d = zone.door.side;
            target = { x: dp.x + (d === 'E' ? 1.5 : d === 'W' ? -1.5 : 0), z: dp.z + (d === 'S' ? 1.5 : d === 'N' ? -1.5 : 0) };
        }
        const wpos = l2w(target.x, target.z);
        if (deps.moveMy(wpos.x, wpos.z, 0)) {
            deps.persistMy();
            followMe = true;
            deps.showToast(`${zone.icon} ${zone.name} — ${zone.desc}`);
        } else {
            deps.showToast('로그인 후 본인 아바타가 있을 때 이동할 수 있어요');
        }
    }

    function resize() {
        cv.width = Math.round(innerWidth * dpr());
        cv.height = Math.round(innerHeight * dpr());
        cv.style.width = '100%'; cv.style.height = '100%';
    }

    /** 줌(커서 기준). mx/my 생략 시 화면 중앙 기준 */
    function zoomBy(k, mx, my) {
        const W = innerWidth, H = innerHeight;
        const px = (mx === undefined) ? W / 2 : mx;
        const py = (my === undefined) ? H / 2 : my;
        const wx = view.cx + (px - W / 2) / view.s;   // 커서 아래 레이아웃 좌표 고정
        const wz = view.cz + (py - H / 2) / view.s;
        view.s = Math.min(60, Math.max(6, view.s * k));
        view.cx = wx - (px - W / 2) / view.s;
        view.cz = wz - (py - H / 2) / view.s;
    }

    // ---- 키 입력 (capture 단계에서 소비 → 3D 단축키·OrbitControls와 충돌 방지) ----
    function onKeyDown(e) {
        if (isTyping(e.target)) return;
        if (e.code === 'Space') {   // 점프(메이플식) — 이동 중에도 가능
            e.preventDefault(); e.stopImmediatePropagation();
            if (!jump && !transitioning && !doorAnim) jump = { t0: performance.now() };
            return;
        }
        if (MOVE_KEYS[e.code]) { keys.add(e.code); e.preventDefault(); e.stopImmediatePropagation(); }
    }
    function onKeyUp(e) {
        if (MOVE_KEYS[e.code]) { keys.delete(e.code); e.stopImmediatePropagation(); }
    }

    // ---- 프레임 루프 ----
    function frame(t) {
        if (!active) return;
        const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
        lastT = t;
        // 아바타를 레이아웃 좌표로 변환해 이동·그리기에 공용 사용
        const avatars = deps.getAvatars().map((a) => {
            const p = w2l(a.x, a.z);
            return { ...a, lx: p.x, lz: p.z };
        });
        // 내 아바타는 레이아웃 좌표를 캐시로 이어간다 — 길·잔디(항등 근사) 위치의 월드 좌표가
        // 개방 존(리조트·괌)의 월드 사각형 안에 들어가면 w2l 재유도가 존 레이아웃으로 좌표를
        // 튕기는 순간이동이 생기기 때문. 월드 좌표가 밖에서 바뀌면(클릭 텔레포트 등) 재유도한다.
        const meAv = avatars.find((a) => a.isMe);
        if (meAv) {
            if (myLay && myLayW && Math.abs(meAv.x - myLayW.x) < 0.01 && Math.abs(meAv.z - myLayW.z) < 0.01) {
                meAv.lx = myLay.x; meAv.lz = myLay.z;
            } else {
                myLay = { x: meAv.lx, z: meAv.lz };
                myLayW = { x: meAv.x, z: meAv.z };
            }
        } else { myLay = null; myLayW = null; }
        step(dt, avatars);
        draw(avatars, t);
        deps.hideOverlays();   // 3D용 DOM 라벨·말풍선이 떠오르지 않게 매 프레임 정리(새로 생기는 것 포함)
        raf = requestAnimationFrame(frame);
    }

    function step(dt, avatars) {
        // 입장 연출 중: 문 쪽으로 부드럽게 줌인(smoothstep), 이동 입력 무시
        if (doorAnim) {
            const k = Math.min(1, (performance.now() - doorAnim.t0) / doorAnim.dur);
            const e = k * k * (3 - 2 * k);
            view.s = doorAnim.fromS + (doorAnim.toS - doorAnim.fromS) * e;
            view.cx = doorAnim.fromX + (doorAnim.toX - doorAnim.fromX) * e;
            view.cz = doorAnim.fromZ + (doorAnim.toZ - doorAnim.fromZ) * e;
            return;
        }
        if (transitioning) return;
        let dx = 0, dz = 0;
        for (const k of keys) { const v = MOVE_KEYS[k]; dx += v[0]; dz += v[1]; }
        const moving = (dx !== 0 || dz !== 0);
        const me = avatars.find((a) => a.isMe) || null;
        if (moving && me) {
            const l = Math.hypot(dx, dz); dx /= l; dz /= l;
            let nx = me.lx + dx * SPEED * dt, nz = me.lz + dz * SPEED * dt;
            const ry = Math.atan2(dx, dz);
            const from = solidAtLay(me.lx, me.lz);
            const to = solidAtLay(nx, nz);
            if (to && to !== from) {
                // 바깥→건물(또는 옆 건물): 문(포탈) 근처만 통과 → 입장. 그 외 벽은 슬라이드(메이플식)
                const dp = doorLayPos(to);
                if (Math.hypot(nx - dp.x, nz - dp.z) < 2.2) {
                    enterBuilding(to);
                    return;
                }
                if (!solidAtLay(nx, me.lz) || solidAtLay(nx, me.lz) === from) nz = me.lz;        // x축만 이동(벽 따라 슬라이드)
                else if (!solidAtLay(me.lx, nz) || solidAtLay(me.lx, nz) === from) nx = me.lx;   // z축만 이동
                else { nx = me.lx; nz = me.lz; }                                                 // 코너: 정지
            }
            if (nx !== me.lx || nz !== me.lz) {
                const wpos = l2w(nx, nz);
                if (deps.moveMy(wpos.x, wpos.z, ry)) {
                    myLay = { x: nx, z: nz };             // 레이아웃 캐시 갱신(다음 프레임 w2l 재유도 대체)
                    myLayW = { x: wpos.x, z: wpos.z };
                }
                me.lx = nx; me.lz = nz;   // 카메라 추적용 즉시 갱신
            }
        }
        if (!moving && wasMoving) deps.persistMy();   // 멈춘 순간 위치 영속화(3D와 동일 규약)
        wasMoving = moving;
        if (followMe && me) {
            const a = 1 - Math.exp(-8 * dt);
            view.cx += (me.lx - view.cx) * a;
            view.cz += (me.lz - view.cz) * a;
        }
    }

    /** 문(포탈)으로 걸어 들어옴 → 줌인+페이드 연출 후 3D 전환 + 해당 건물 조망 (메이플식 맵 이동) */
    function enterBuilding(zone) {
        if (transitioning) return;
        transitioning = true;
        keys.clear();
        followMe = false;
        // 3D 아바타를 그 건물 입구(월드)로 텔레포트 — 2D 레이아웃과 3D 배치가 달라도 자연스럽게 이어짐
        deps.moveMy(zone.entry.x, zone.entry.z, 0);
        deps.persistMy();
        const dp = doorLayPos(zone);
        doorAnim = {
            t0: performance.now(), dur: 430,
            fromS: view.s, toS: Math.min(60, view.s * 1.9),
            fromX: view.cx, fromZ: view.cz, toX: dp.x, toZ: dp.z,
        };
        fadeTo(1);
        setTimeout(() => {
            doorAnim = null;
            exit();
            if (zone.view3d && deps.focus3D) deps.focus3D(zone.view3d);
            deps.showToast(`${zone.icon} ${zone.name} 입장! — 🗺 2D 버튼으로 맵 복귀`);
            setTimeout(() => { fadeTo(0); transitioning = false; }, 150);   // 3D 첫 프레임 뒤 페이드 인
        }, 440);
    }

    // ---- 렌더 ----
    function draw(avatars, t) {
        const W = innerWidth, H = innerHeight;
        ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
        const s = view.s;
        const X = (lx) => (lx - view.cx) * s + W / 2;
        const Y = (lz) => (lz - view.cz) * s + H / 2;
        chipRects = [];

        // 맵 밖 + 잔디(은은한 체커)
        ctx.fillStyle = '#0d131c'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#77C55F';
        ctx.fillRect(X(WORLD.minX), Y(WORLD.minZ), (WORLD.maxX - WORLD.minX) * s, (WORLD.maxZ - WORLD.minZ) * s);
        ctx.fillStyle = '#71BE59';
        const gx0 = Math.max(WORLD.minX, Math.floor((view.cx - W / 2 / s) / 2) * 2);
        const gx1 = Math.min(WORLD.maxX, view.cx + W / 2 / s);
        const gz0 = Math.max(WORLD.minZ, Math.floor((view.cz - H / 2 / s) / 2) * 2);
        const gz1 = Math.min(WORLD.maxZ, view.cz + H / 2 / s);
        for (let ix = gx0; ix < gx1; ix += 2) {
            for (let iz = gz0; iz < gz1; iz += 2) {
                if (((ix + iz) / 2) % 2 === 0) ctx.fillRect(X(ix), Y(iz), 2 * s, 2 * s);
            }
        }
        // 풀숲(작은 풀잎 3가닥)
        if (s >= 9) {
            ctx.strokeStyle = '#5DA94B'; ctx.lineWidth = Math.max(1, s * 0.07); ctx.lineCap = 'round';
            for (const [tx, tz] of TUFTS) {
                const bx = X(tx), by = Y(tz);
                ctx.beginPath();
                ctx.moveTo(bx - s * 0.18, by); ctx.lineTo(bx - s * 0.22, by - s * 0.3);
                ctx.moveTo(bx, by); ctx.lineTo(bx, by - s * 0.4);
                ctx.moveTo(bx + s * 0.18, by); ctx.lineTo(bx + s * 0.22, by - s * 0.3);
                ctx.stroke();
            }
            ctx.lineCap = 'butt';
        }

        // 산책로(테두리 있는 라운드 길) + 로터리 광장
        const road = (x0, y0, x1, y1, w) => {
            ctx.lineCap = 'round';
            ctx.strokeStyle = '#CBB37E'; ctx.lineWidth = w * s + Math.max(2, s * 0.14);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.strokeStyle = '#EBDCAE'; ctx.lineWidth = w * s;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.lineCap = 'butt';
        };
        for (const r of ROADS) road(X(r.x0), Y(r.z), X(r.x1), Y(r.z), 2.4);
        for (const [px0, pz0, pz1] of PATH_SPURS) road(X(px0), Y(pz0), X(px0), Y(pz1), 1.6);
        // 로터리 광장: 원형 포장 + 방사 무늬
        ctx.beginPath(); ctx.arc(X(PLAZA.x), Y(PLAZA.z), PLAZA.r * s, 0, Math.PI * 2);
        ctx.fillStyle = '#EFE2B9'; ctx.fill();
        ctx.strokeStyle = '#CBB37E'; ctx.lineWidth = Math.max(2, s * 0.14); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,138,90,0.35)'; ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            ctx.beginPath(); ctx.moveTo(X(PLAZA.x), Y(PLAZA.z));
            ctx.lineTo(X(PLAZA.x) + Math.cos(ang) * PLAZA.r * s, Y(PLAZA.z) + Math.sin(ang) * PLAZA.r * s);
            ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(X(PLAZA.x), Y(PLAZA.z), PLAZA.r * s * 0.35, 0, Math.PI * 2);
        ctx.strokeStyle = '#CBB37E'; ctx.lineWidth = Math.max(1, s * 0.1); ctx.stroke();
        if (s >= 9) smallText('⛲ 광장', X(PLAZA.x), Y(PLAZA.z), Math.min(12, s * 0.6), '#8A7440');

        // 꽃밭(도로변)
        if (s >= 8) for (const [fx, fz] of FLOWERS) drawFlower(X(fx), Y(fz), s);

        // 건물 존 → 나무 순서(캐노피가 건물 위로 겹치게)
        for (const z of ZONES) drawZone(z, X, Y, s, t);
        for (const [tx, tz] of TREES) drawTree(X(tx), Y(tz), s);

        // 호버 하이라이트 + 툴팁
        hoverZone = null;
        if (mouse && !drag) {
            const lx = view.cx + (mouse.x - W / 2) / s;
            const lz = view.cz + (mouse.y - H / 2) / s;
            hoverZone = zoneAtLay(lx, lz);
            const onChip = chipRects.some((c) => mouse.x >= c.x && mouse.x <= c.x + c.w && mouse.y >= c.y && mouse.y <= c.y + c.h);
            cv.style.cursor = (hoverZone || onChip) ? 'pointer' : 'grab';
            if (hoverZone) {
                const hp = padOf(hoverZone);
                rr(X(hoverZone.lx0 + hp) - 2, Y(hoverZone.lz0 + hp) - 2,
                    (hoverZone.lx1 - hoverZone.lx0 - hp * 2) * s + 4, (hoverZone.lz1 - hoverZone.lz0 - hp * 2) * s + 4, Math.min(12, s * 0.55));
                ctx.strokeStyle = '#FFD600'; ctx.lineWidth = 3; ctx.stroke();
                const enterHint = hoverZone.open ? '클릭=이동' : '클릭=이동 · 포탈로 들어가면 3D';
                drawTooltip(`${hoverZone.icon} ${hoverZone.name} — ${hoverZone.desc}  (${enterHint})`, mouse.x + 14, mouse.y + 18);
            }
        }

        // 화면 아래쪽(z 큰) 아바타가 위에 그려지게 정렬
        avatars.sort((a, b) => a.lz - b.lz);
        const myJump = jumpOffsetUnits();
        for (const a of avatars) drawAvatar(a, X, Y, a.isMe ? myJump : 0);
    }

    // ---- 장식 ----
    function drawTree(px, py, s) {
        ctx.beginPath(); ctx.ellipse(px, py + s * 0.55, s * 0.7, s * 0.24, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, s * 1.05, 0, Math.PI * 2);
        ctx.fillStyle = '#3E9B47'; ctx.fill();
        ctx.strokeStyle = '#2F7A38'; ctx.lineWidth = Math.max(1.5, s * 0.1); ctx.stroke();
        ctx.beginPath(); ctx.arc(px - s * 0.3, py - s * 0.32, s * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#59B65F'; ctx.fill();
    }
    function drawFlower(px, py, s) {
        const petal = Math.max(1.6, s * 0.11);
        for (const [ox, oy, c] of [[-0.35, 0, '#FF8FB1'], [0.35, 0.12, '#FFD166'], [0, -0.3, '#FFFFFF'], [0.12, 0.35, '#FF8FB1']]) {
            ctx.beginPath(); ctx.arc(px + ox * s, py + oy * s, petal, 0, Math.PI * 2);
            ctx.fillStyle = c; ctx.fill();
        }
    }

    // ---- 건물 ----
    function drawZone(z, X, Y, s, t) {
        // 존 내부 좌표(월드 값)를 레이아웃으로 평행이동해 그리는 로컬 변환
        const ZX = (wx) => X(wx + z.ox);
        const ZY = (wz) => Y(wz + z.oz);
        const pad = padOf(z);
        const x = ZX(z.x0 + pad), y = ZY(z.z0 + pad);
        const w = (z.x1 - z.x0 - pad * 2) * s, h = (z.z1 - z.z0 - pad * 2) * s;
        const rad = Math.min(12, s * 0.55);

        // 그림자 + 바닥
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = s * 0.5; ctx.shadowOffsetY = s * 0.28;
        rr(x, y, w, h, rad); ctx.fillStyle = z.floor; ctx.fill();
        ctx.restore();

        // 바닥 타일 결(가로선)
        ctx.save();
        rr(x, y, w, h, rad); ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
        for (let iz = Math.ceil(z.z0); iz < z.z1; iz += 1.5) {
            ctx.beginPath(); ctx.moveTo(x, ZY(iz)); ctx.lineTo(x + w, ZY(iz)); ctx.stroke();
        }
        ctx.restore();

        // 외벽
        rr(x, y, w, h, rad);
        ctx.strokeStyle = z.wall; ctx.lineWidth = Math.max(2, s * 0.2);
        if (z.open) ctx.setLineDash([s * 0.55, s * 0.4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // 북쪽 벽면(2.5D) + 창문 + 어닝
        if (!z.open && z.face) {
            const wallH = Math.min(h * 0.26, 1.5 * s);
            rr(x, y, w, wallH, [rad, rad, 0, 0]);
            ctx.fillStyle = z.face; ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, y + wallH); ctx.lineTo(x + w, y + wallH); ctx.stroke();
            const winW = 1.1 * s, winH = Math.min(wallH * 0.55, 0.75 * s);
            const n = Math.max(1, Math.floor(w / (2.4 * s)));
            for (let i = 0; i < n; i++) {
                const wx = x + (w / (n + 1)) * (i + 1) - winW / 2;
                const wy = y + (wallH - winH) / 2;
                rr(wx, wy, winW, winH, Math.min(4, s * 0.15));
                ctx.fillStyle = '#CBE7F5'; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, s * 0.07); ctx.stroke();
                ctx.strokeStyle = 'rgba(120,160,180,0.6)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(wx + winW / 2, wy); ctx.lineTo(wx + winW / 2, wy + winH); ctx.stroke();
            }
            if (z.awning && z.door && z.door.side === 'S') {   // 입구 위 줄무늬 어닝(남쪽 하단)
                const aw = 4.4 * s, ah = 0.65 * s;
                const ax = ZX(z.door.at) - aw / 2, ay = y + h - ah / 2;
                const stripes = 7;
                for (let i = 0; i < stripes; i++) {
                    ctx.fillStyle = z.awning[i % 2];
                    ctx.fillRect(ax + (aw / stripes) * i, ay, aw / stripes + 0.5, ah);
                }
                ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
                ctx.strokeRect(ax, ay, aw, ah);
            }
        }

        // 문 + 도어매트 + 포탈 (open 존 제외)
        if (!z.open && z.door) {
            const dw = 1.3 * s, dd = Math.max(3, s * 0.24);
            if (z.door.side === 'S' || z.door.side === 'N') {
                const dx = ZX(z.door.at) - dw / 2;
                const dy = z.door.side === 'S' ? y + h - dd / 2 - 1 : y - dd / 2 + 1;
                const my2 = z.door.side === 'S' ? y + h + dd / 2 : y - dd / 2 - s * 0.5;
                ctx.fillStyle = '#F2E3C8'; ctx.fillRect(dx + dw * 0.05, my2, dw * 0.9, s * 0.5);                 // 매트
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.strokeRect(dx + dw * 0.05, my2, dw * 0.9, s * 0.5);
                rr(dx, dy, dw, dd, dd / 2); ctx.fillStyle = '#7A4E2D'; ctx.fill();        // 문(가로)
                ctx.strokeStyle = '#5C3A20'; ctx.lineWidth = 1; ctx.stroke();
            } else {
                const dx = (z.door.side === 'E' ? x + w - dd / 2 - 1 : x - dd / 2 + 1);
                const dy = ZY(z.door.at) - dw / 2;
                rr(dx, dy, dd, dw, dd / 2); ctx.fillStyle = '#7A4E2D'; ctx.fill();        // 문(세로)
                ctx.strokeStyle = '#5C3A20'; ctx.lineWidth = 1; ctx.stroke();
            }
            // 포탈(메이플식): 문 바깥에 맥동하는 발광 오벌 + 궤도 입자 → "여기로 들어간다"는 신호
            const dp = doorLayPos(z);
            const off = 0.95;
            const px2 = X(dp.x + (z.door.side === 'E' ? off : z.door.side === 'W' ? -off : 0));
            const py2 = Y(dp.z + (z.door.side === 'S' ? off : z.door.side === 'N' ? -off : 0));
            const pulse = 0.55 + Math.sin(t / 300 + dp.x) * 0.25;
            const pr = s * 0.85;
            const glow = ctx.createRadialGradient(px2, py2, pr * 0.1, px2, py2, pr);
            glow.addColorStop(0, `rgba(120,255,220,${0.7 * pulse})`);
            glow.addColorStop(1, 'rgba(80,220,190,0)');
            ctx.beginPath(); ctx.ellipse(px2, py2, pr, pr * 0.55, 0, 0, Math.PI * 2);
            ctx.fillStyle = glow; ctx.fill();
            ctx.beginPath(); ctx.ellipse(px2, py2, pr * 0.62, pr * 0.34, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(64,224,190,${0.5 + pulse * 0.4})`; ctx.lineWidth = Math.max(1.5, s * 0.09); ctx.stroke();
            for (let i = 0; i < 3; i++) {   // 궤도 반짝이
                const ang = t / 450 + (i / 3) * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(px2 + Math.cos(ang) * pr * 0.55, py2 + Math.sin(ang) * pr * 0.28, Math.max(1.2, s * 0.07), 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(210,255,242,0.9)'; ctx.fill();
            }
        }

        drawZoneDetails(z, ZX, ZY, s, t);

        // 현판(간판): 아이콘 + 이름 + 기능
        const plaqueY = z.plaqueZ !== undefined ? ZY(z.plaqueZ) : y + h / 2;
        drawPlaque(z, x + w / 2, plaqueY, s);

        // 기능 칩(클릭 액션)
        if (z.chips && s >= 8) {
            let cy = plaqueY + s * 1.5;
            for (const chip of z.chips) {
                ctx.font = `bold ${Math.max(10, Math.min(13, s * 0.6))}px sans-serif`;
                const tw = ctx.measureText(chip.label).width;
                const bw = tw + 18, bh = Math.max(17, s * 0.95);
                const bx = x + w / 2 - bw / 2;
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
                rr(bx, cy, bw, bh, bh / 2); ctx.fillStyle = '#2E7D32'; ctx.fill();
                ctx.restore();
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(chip.label, x + w / 2, cy + bh / 2 + 1);
                ctx.textBaseline = 'alphabetic';
                chipRects.push({ x: bx, y: cy, w: bw, h: bh, id: chip.id });
                cy += bh + 4;
            }
        }
    }

    function drawZoneDetails(z, ZX, ZY, s, t) {
        if (z.id === 'resort') {
            // 수영장: 물 그라데이션 + 물결 + 사다리 + 튜브
            const p = z.pool;
            const px = ZX(p.x0), py = ZY(p.z0), pw = (p.x1 - p.x0) * s, ph = (p.z1 - p.z0) * s;
            const grad = ctx.createLinearGradient(0, py, 0, py + ph);
            grad.addColorStop(0, '#55D4EC'); grad.addColorStop(1, '#2FA8C9');
            rr(px, py, pw, ph, Math.min(10, s * 0.5)); ctx.fillStyle = grad; ctx.fill();
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(2, s * 0.14); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1, s * 0.06);
            for (let i = 0; i < 3; i++) {
                const wy = py + ph * (0.28 + i * 0.24);
                ctx.beginPath();
                for (let k = 0.06; k < 0.95; k += 0.04) {
                    ctx.lineTo(px + pw * k, wy + Math.sin(k * 14 + t / 400 + i) * s * 0.08);
                }
                ctx.stroke();
            }
            // 사다리(우상단)
            ctx.strokeStyle = '#E8F4F8'; ctx.lineWidth = Math.max(1.5, s * 0.09);
            ctx.beginPath();
            ctx.moveTo(px + pw - s * 0.7, py + 2); ctx.lineTo(px + pw - s * 0.7, py + s * 0.9);
            ctx.moveTo(px + pw - s * 0.35, py + 2); ctx.lineTo(px + pw - s * 0.35, py + s * 0.9);
            ctx.moveTo(px + pw - s * 0.7, py + s * 0.4); ctx.lineTo(px + pw - s * 0.35, py + s * 0.4);
            ctx.moveTo(px + pw - s * 0.7, py + s * 0.7); ctx.lineTo(px + pw - s * 0.35, py + s * 0.7);
            ctx.stroke();
            // 튜브(둥실 애니)
            const bob = Math.sin(t / 700) * s * 0.08;
            ctx.beginPath(); ctx.arc(px + pw * 0.3, py + ph * 0.55 + bob, s * 0.42, 0, Math.PI * 2);
            ctx.strokeStyle = '#FF6B6B'; ctx.lineWidth = Math.max(3, s * 0.22); ctx.stroke();
            ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, s * 0.07);
            for (let i = 0; i < 4; i++) {
                const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
                ctx.beginPath();
                ctx.arc(px + pw * 0.3, py + ph * 0.55 + bob, s * 0.42, ang - 0.15, ang + 0.15); ctx.stroke();
            }
            // 파라솔(비치)
            drawParasol(ZX(10.5), ZY(-8.5), s, '#FF8A5C');
            drawParasol(ZX(21), ZY(-17), s, '#5CA8FF');
            for (const pv of z.pavilions) drawPavilion(ZX(pv.x), ZY(pv.z), s, pv.label);
        }
        if (z.id === 'guam') {
            drawPavilion(ZX(1), ZY(-8), s, null);
        }
        if (z.id === 'factory') {
            // 생산 라인: 컨베이어(진회색) + 흐르는 화살표 + 기계 블록 + 안전선
            for (const [lx, tag] of [[z.x0 + 4, 'ITR'], [z.x1 - 4, 'OTR']]) {
                const cx0 = ZX(lx - 1.1), cw = 2.2 * s;
                const cz0 = ZY(z.z0 + 3.5), chh = (z.z1 - z.z0 - 7) * s;
                // 안전선(노랑-검정 빗금 테두리)
                ctx.save();
                rr(cx0 - s * 0.5, cz0 - s * 0.5, cw + s, chh + s, 4); ctx.clip();
                ctx.fillStyle = '#F4C020'; ctx.fillRect(cx0 - s * 0.5, cz0 - s * 0.5, cw + s, chh + s);
                ctx.strokeStyle = '#3A3A3A'; ctx.lineWidth = s * 0.16;
                for (let k = -chh; k < cw + s; k += s * 0.5) {
                    ctx.beginPath(); ctx.moveTo(cx0 - s * 0.5 + k, cz0 - s * 0.5); ctx.lineTo(cx0 - s * 0.5 + k + chh + s, cz0 + chh + s * 0.5); ctx.stroke();
                }
                ctx.restore();
                // 컨베이어 벨트
                rr(cx0, cz0, cw, chh, 3); ctx.fillStyle = '#4C555C'; ctx.fill();
                // 흐르는 화살표(생산 흐름)
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                const flow = (t / 30) % (s * 1.6);
                for (let ay = cz0 + flow; ay < cz0 + chh - s * 0.4; ay += s * 1.6) {
                    ctx.beginPath();
                    ctx.moveTo(cx0 + cw / 2 - s * 0.28, ay);
                    ctx.lineTo(cx0 + cw / 2 + s * 0.28, ay);
                    ctx.lineTo(cx0 + cw / 2, ay + s * 0.4);
                    ctx.closePath(); ctx.fill();
                }
                // 기계 블록(상·하)
                for (const my of [cz0 - s * 0.2, cz0 + chh - s * 1.1]) {
                    rr(cx0 - s * 0.25, my, cw + s * 0.5, s * 1.3, 4);
                    ctx.fillStyle = '#8B98A2'; ctx.fill();
                    ctx.strokeStyle = '#5F6B73'; ctx.lineWidth = 1; ctx.stroke();
                    ctx.fillStyle = '#3ECF6E';
                    ctx.beginPath(); ctx.arc(cx0 + cw + s * 0.05, my + s * 0.3, Math.max(1.5, s * 0.09), 0, Math.PI * 2); ctx.fill();
                }
                if (s >= 9) smallText(tag, ZX(lx), ZY(z.z0 + 2.2), s * 0.55, '#4A555E');
            }
        }
        if (z.id === 'warehouse') {
            // 자재 랙(선반 + 상자들)
            for (let i = 0; i < 3; i++) {
                const ry = ZY(z.z0 + 1.8 + i * 2.2), rh = 1.1 * s;
                const rx = ZX(z.x0 + 1.2), rw = (z.x1 - z.x0 - 2.4) * s;
                rr(rx, ry, rw, rh, 3); ctx.fillStyle = '#C9A96B'; ctx.fill();
                ctx.strokeStyle = '#A98850'; ctx.lineWidth = 1; ctx.stroke();
                for (let bx = 0; bx < 4; bx++) {
                    const boxX = rx + rw * (0.08 + bx * 0.24), boxW = rw * 0.14;
                    ctx.fillStyle = ['#D98E4A', '#B8763C', '#E0A860', '#C9853F'][bx];
                    ctx.fillRect(boxX, ry + rh * 0.15, boxW, rh * 0.7);
                    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(boxX, ry + rh * 0.15, boxW, rh * 0.7);
                }
            }
        }
        if (z.id === 'office') {
            // 데스크 아일랜드 2열×3 + 모니터 + 의자
            for (let i = 0; i < 3; i++) for (const ox of [-3.2, 0.9]) {
                const dx = ZX(z.x0 + 4 + ox), dy = ZY(z.z0 + 2 + i * 2.1);
                const dw = 3 * s, dh = 1.1 * s;
                rr(dx, dy, dw, dh, 4); ctx.fillStyle = '#C7B299'; ctx.fill();
                ctx.strokeStyle = '#A6927B'; ctx.lineWidth = 1; ctx.stroke();
                for (let m = 0; m < 2; m++) {
                    ctx.fillStyle = '#37474F';
                    ctx.fillRect(dx + dw * (0.2 + m * 0.42), dy + dh * 0.2, dw * 0.18, dh * 0.35);
                }
                ctx.fillStyle = '#90A4AE';   // 의자
                ctx.beginPath(); ctx.arc(dx + dw * 0.3, dy + dh + s * 0.35, s * 0.24, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(dx + dw * 0.72, dy + dh + s * 0.35, s * 0.24, 0, Math.PI * 2); ctx.fill();
            }
        }
        if (z.id === 'office2') {
            // 회의 테이블 + 의자 6개
            const cx = ZX(-10), cy = ZY(-18);
            rr(cx - 1.8 * s, cy - 0.8 * s, 3.6 * s, 1.6 * s, 8);
            ctx.fillStyle = '#B98755'; ctx.fill();
            ctx.strokeStyle = '#96693F'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#8FA6B8';
            for (const [ox, oy] of [[-1.1, -1.25], [0, -1.25], [1.1, -1.25], [-1.1, 1.25], [0, 1.25], [1.1, 1.25]]) {
                ctx.beginPath(); ctx.arc(cx + ox * s, cy + oy * s, s * 0.26, 0, Math.PI * 2); ctx.fill();
            }
        }
        if (z.id === 'cafe') {
            // 카운터(북측) + 원형 테이블 4개(컵 얹힘)
            rr(ZX(-31), ZY(-22.2), 5 * s, 1.2 * s, 5);
            ctx.fillStyle = '#8B5E3C'; ctx.fill();
            ctx.strokeStyle = '#6E4526'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#D7A86E'; ctx.fillRect(ZX(-31), ZY(-22.2), 5 * s, 0.28 * s);
            for (const [tx, tz] of [[-29, -15], [-25.5, -20.5], [-20, -15.5], [-18.5, -20.5]]) {
                ctx.beginPath(); ctx.arc(ZX(tx), ZY(tz), s * 0.75, 0, Math.PI * 2);
                ctx.fillStyle = '#C89A6B'; ctx.fill();
                ctx.strokeStyle = '#A47B4C'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.stroke();
                ctx.beginPath(); ctx.arc(ZX(tx), ZY(tz), s * 0.16, 0, Math.PI * 2);
                ctx.fillStyle = '#FFF7EA'; ctx.fill();
                ctx.fillStyle = '#90A4AE';   // 의자 2개
                ctx.beginPath(); ctx.arc(ZX(tx) - s * 1.05, ZY(tz), s * 0.24, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(ZX(tx) + s * 1.05, ZY(tz), s * 0.24, 0, Math.PI * 2); ctx.fill();
            }
        }
        if (z.id === 'complex') {
            // 중정(포장 + 분수 + 나무 4그루) + 방 6실
            const c = z.court;
            rr(ZX(c.x0), ZY(c.z0), (c.x1 - c.x0) * s, (c.z1 - c.z0) * s, 6);
            ctx.fillStyle = '#DFD3AC'; ctx.fill();
            ctx.strokeStyle = '#C4B48A'; ctx.lineWidth = 1; ctx.stroke();
            const fx = ZX((c.x0 + c.x1) / 2), fy = ZY((c.z0 + c.z1) / 2);
            ctx.beginPath(); ctx.arc(fx, fy, s * 0.85, 0, Math.PI * 2);
            ctx.fillStyle = '#CBBD93'; ctx.fill();
            ctx.beginPath(); ctx.arc(fx, fy, s * 0.62, 0, Math.PI * 2);
            ctx.fillStyle = '#5C9ADB'; ctx.fill();
            const rip = (t / 900) % 1;   // 분수 물결
            ctx.beginPath(); ctx.arc(fx, fy, s * 0.62 * rip, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - rip)})`; ctx.lineWidth = 1.5; ctx.stroke();
            for (const [ox, oy] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) drawTree(ZX(-35 + ox), ZY(-41 + oy), s * 0.7);
            for (const r of z.rooms) {
                rr(ZX(r.x0), ZY(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s, 5);
                ctx.fillStyle = '#FBF7EE'; ctx.fill();
                ctx.strokeStyle = z.wall; ctx.lineWidth = Math.max(1.5, s * 0.12); ctx.stroke();
                const rcx = ZX((r.x0 + r.x1) / 2), rcy = ZY((r.z0 + r.z1) / 2);
                rr(rcx - 0.9 * s, rcy + 0.35 * s, 1.8 * s, 0.7 * s, 3);   // 미니 데스크
                ctx.fillStyle = '#C7B299'; ctx.fill();
                if (s >= 10) smallText(r.label, rcx, rcy - 0.2 * s, Math.min(13, s * 0.55), '#5A4F3C');
            }
        }
        if (z.id === 'jumptower') {
            // 층층이 좁아지는 타워(높이 표현) + 포탈 링
            const cx = ZX(28), czy = ZY(-13);
            for (let i = 0; i < 3; i++) {
                const half = (2.4 - i * 0.65) * s;
                rr(cx - half, czy - half, half * 2, half * 2, 6);
                ctx.fillStyle = ['#DCC9F2', '#CBB2EA', '#B999E0'][i]; ctx.fill();
                ctx.strokeStyle = '#8E6CC2'; ctx.lineWidth = 1; ctx.stroke();
            }
            ctx.fillStyle = '#FFD166';   // 꼭대기 깃발
            ctx.beginPath(); ctx.moveTo(cx, czy - s * 0.9); ctx.lineTo(cx + s * 0.7, czy - s * 0.65); ctx.lineTo(cx, czy - s * 0.4);
            ctx.closePath(); ctx.fill();
        }
    }

    function drawParasol(px, py, s, color) {
        ctx.beginPath(); ctx.ellipse(px + s * 0.15, py + s * 0.2, s * 0.75, s * 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, s * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, s * 0.07);
        for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            ctx.beginPath(); ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(ang) * s * 0.8, py + Math.sin(ang) * s * 0.8); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(px, py, s * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
    }

    function drawPavilion(px, py, s, label) {
        const half = 2.3 * s;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = s * 0.4; ctx.shadowOffsetY = s * 0.22;
        rr(px - half, py - half, half * 2, half * 2, 8);
        ctx.fillStyle = '#E25B55'; ctx.fill();
        ctx.restore();
        ctx.strokeStyle = '#B24540'; ctx.lineWidth = Math.max(1.5, s * 0.1);
        rr(px - half, py - half, half * 2, half * 2, 8); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;   // 지붕 능선
        ctx.beginPath();
        ctx.moveTo(px - half, py - half); ctx.lineTo(px + half, py + half);
        ctx.moveTo(px + half, py - half); ctx.lineTo(px - half, py + half);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, s * 0.35, 0, Math.PI * 2);   // 지붕 꼭지
        ctx.fillStyle = '#F2D0CE'; ctx.fill();
        ctx.strokeStyle = '#B24540'; ctx.stroke();
        if (label && s >= 9) {
            ctx.font = `bold ${Math.max(9, Math.min(12, s * 0.5))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText(label, px, py + half - s * 0.4);
        }
    }

    function drawPlaque(z, cx, cy, s) {
        const nameFs = Math.max(11, Math.min(16, s * 0.72));
        const descFs = Math.max(9, Math.min(12, s * 0.52));
        const showDesc = s >= 10;
        ctx.font = `bold ${nameFs}px sans-serif`;
        const nameW = ctx.measureText(`${z.icon} ${z.name}`).width;
        ctx.font = `${descFs}px sans-serif`;
        const descW = showDesc ? ctx.measureText(z.desc).width : 0;
        const bw = Math.max(nameW, descW) + 22;
        const bh = showDesc ? nameFs + descFs + 16 : nameFs + 12;
        const bx = cx - bw / 2, by = cy - bh / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
        rr(bx, by, bw, bh, 8); ctx.fillStyle = 'rgba(255,253,246,0.94)'; ctx.fill();
        ctx.restore();
        rr(bx, by, bw, bh, 8);
        ctx.strokeStyle = z.wall; ctx.lineWidth = 2; ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `bold ${nameFs}px sans-serif`;
        ctx.fillStyle = '#2B2418';
        ctx.fillText(`${z.icon} ${z.name}`, cx, by + nameFs + 4);
        if (showDesc) {
            ctx.font = `${descFs}px sans-serif`;
            ctx.fillStyle = '#6B5F4C';
            ctx.fillText(z.desc, cx, by + nameFs + descFs + 9);
        }
    }

    function smallText(txt, cx, cy, fs, color) {
        ctx.font = `bold ${Math.max(9, fs)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(txt, cx, cy + fs * 0.35);
    }

    function drawTooltip(txt, px, py) {
        ctx.font = '12px sans-serif';
        const tw = ctx.measureText(txt).width;
        const bw = tw + 16, bh = 24;
        const bx = Math.min(px, innerWidth - bw - 8), by = Math.min(py, innerHeight - bh - 8);
        rr(bx, by, bw, bh, 6);
        ctx.fillStyle = 'rgba(15,22,35,0.92)'; ctx.fill();
        ctx.fillStyle = '#E8F0FF'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx + 8, by + bh / 2 + 1);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    }

    function drawAvatar(a, X, Y, jumpU = 0) {
        const sx = X(a.lx), sy = Y(a.lz);   // sy = 발 위치(지면)
        const s = view.s;
        const r = Math.max(7, s * 0.42);
        const jpx = jumpU * s;                                   // 점프 높이(px) — 몸만 뜨고 그림자는 지면
        const shrink = 1 - 0.35 * (jumpU / JUMP_H);              // 공중일수록 그림자 축소
        const sp = deps.getSprite ? deps.getSprite(a.id) : null;
        let headY;   // 말풍선 기준(머리 위)
        if (sp) {
            // 실제 캐릭터 스프라이트(3D 모델 정면 렌더)
            const hpx = Math.max(34, s * 2.5);
            const wpx = hpx * (sp.width / sp.height);
            ctx.beginPath(); ctx.ellipse(sx, sy + s * 0.1, wpx * 0.36 * shrink, s * 0.22 * shrink, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,0,0,${0.2 * shrink})`; ctx.fill();   // 발밑 그림자
            if (a.isMe) {   // 내 아바타: 발밑 펄스 링
                const pulse = 0.5 + Math.sin(performance.now() / 300) * 0.25;
                ctx.beginPath(); ctx.ellipse(sx, sy + s * 0.1, wpx * 0.5, s * 0.3, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,214,0,${pulse})`; ctx.lineWidth = 2.5; ctx.stroke();
            }
            const flip = Math.sin(a.ry) < -0.25;   // 왼쪽으로 이동 중이면 좌우 반전(생동감)
            ctx.save();
            if (flip) { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.translate(-sx, 0); }
            ctx.drawImage(sp, sx - wpx / 2, sy - hpx + s * 0.18 - jpx, wpx, hpx);
            ctx.restore();
            headY = sy - hpx + s * 0.18 - jpx;
        } else {
            // 폴백: 색상 원 + 방향점
            ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.85, r * 0.85 * shrink, r * 0.32 * shrink, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,0,0,${0.18 * shrink})`; ctx.fill();
            if (a.isMe) {
                const pulse = 0.5 + Math.sin(performance.now() / 300) * 0.25;
                ctx.beginPath(); ctx.arc(sx, sy - jpx, r + 5, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255,214,0,${pulse})`; ctx.lineWidth = 2; ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(sx, sy - jpx, r, 0, Math.PI * 2);
            ctx.fillStyle = a.color; ctx.fill();
            ctx.lineWidth = a.isMe ? 3 : 2;
            ctx.strokeStyle = a.isMe ? '#FFD600' : 'rgba(255,255,255,0.9)';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(sx + Math.sin(a.ry) * r * 0.62, sy - jpx + Math.cos(a.ry) * r * 0.62, Math.max(2, r * 0.18), 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill();
            headY = sy - jpx - r;
        }
        // 이름(+ 층 배지) — 발 아래
        const fs = Math.max(10, Math.min(13, s * 0.6));
        const floor = deps.floorLabel(a.y);
        const label = floor ? `${a.name} · ${floor}` : a.name;
        ctx.font = `bold ${fs}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(label, sx, sy + Math.max(r, s * 0.35) + fs + 4);
        ctx.fillStyle = '#fff'; ctx.fillText(label, sx, sy + Math.max(r, s * 0.35) + fs + 4);
        // 말풍선(채팅) — 머리 위 흰 박스 + 꼬리
        if (a.bubble) {
            const txt = a.bubble.length > 26 ? a.bubble.slice(0, 25) + '…' : a.bubble;
            ctx.font = `${fs}px sans-serif`;
            const bw = ctx.measureText(txt).width + 14, bh = fs + 10;
            const bx = sx - bw / 2, by = headY - bh - 8;
            rr(bx, by, bw, bh, 6);
            ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
            ctx.beginPath();   // 꼬리
            ctx.moveTo(sx - 4, by + bh); ctx.lineTo(sx + 4, by + bh); ctx.lineTo(sx, by + bh + 5); ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillText(txt, sx, by + bh - 7);
        }
    }

    // ---- 전환 ----
    function enter() {
        if (active) return;
        deps.onEnter();          // 점프맵 복귀·키 초기화·3D 캔버스 숨김
        if (!cv) buildUI();
        resize();
        const me = deps.getAvatars().find((a) => a.isMe);
        if (me) { const p = w2l(me.x, me.z); view.cx = p.x; view.cz = p.z; }
        followMe = true;
        cv.style.display = 'block'; bar.style.display = 'flex';
        active = true; window.__map2dActive = true;
        try { localStorage.setItem('tp_view2d', 'on'); } catch { /* noop */ }
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        lastT = performance.now();
        raf = requestAnimationFrame(frame);
        emit();
    }

    function exit() {
        if (!active) return;
        active = false; window.__map2dActive = false;
        try { localStorage.setItem('tp_view2d', 'off'); } catch { /* noop */ }
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
        keys.clear();
        if (wasMoving) { deps.persistMy(); wasMoving = false; }
        cv.style.display = 'none'; bar.style.display = 'none';
        deps.onExit();           // 3D 캔버스 복귀 (라벨은 updatePersonLabels가 다음 프레임에 복원)
        emit();
    }

    const api = {
        enter, exit,
        toggle: () => withFade(() => (active ? exit() : enter())),   // 페이드 전환(메이플식)
        isActive: () => active,
        onChange: (fn) => listeners.push(fn),
    };
    window.__map2d = api;        // 디버그/외부 접근용
    return api;
}
