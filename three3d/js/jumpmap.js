// ============================================
// 점프맵 — 타워 외형 + 포탈 + 별도 점프맵 공간
// ------------------------------------------------------------------
// "맵 이동" 구현 방식: 별도 THREE.Scene 스왑은 scene.js 전반이 단일
// scene/camera/아바타를 참조하므로 회피한다. 대신 같은 씬 안에서
//   (1) 오피스 그룹들을 숨기고  (2) 점프맵 그룹을 보이며  (3) 아바타를
//   점프맵 좌표로 텔레포트하는 방식으로 전환한다.
// 점프맵 공간은 오피스에서 멀리(카메라 far 밖) 떨어뜨려 배치해 좌표 충돌·
//   잔상 렌더를 원천 차단한다.
//
// 이 모듈은 순수 지오메트리 + 포탈 애니메이션만 담당한다. 실제 맵 전환
//   로직(가시성 토글·텔레포트·jumpTargets 스왑)은 상태에 접근할 수 있는
//   scene.js가 담당한다.
// ============================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// updateJumpmap에서 매 프레임 애니메이션할 포탈 목록
const _portals = [];

// ---- 왁뿌(왁스 부수기) 상태 ----
// 각 발판을 크림색 왁스가 얇게(두께 0.02) 감싼다 — 면마다 보로노이 균열로 쪼갠 다각형 조각들.
// 착지 시 즉시 벗겨지지 않고: 금이 가고(조각 미세 이탈 + 크런치음 + 가루) → 조각이 하나씩 벗겨져 속 발판이 서서히 드러난다.
// 셸은 착지면(targets)에 넣지 않는 순수 비주얼 — 물리(jumpTargets)는 발판만으로 안정 유지.
const _waxShells = [];   // 발판 waxIdx와 1:1 — [{ pieces, queue, timer, broken, cx, top, cz, w, d, group }]
const _shards = [];      // 튀는 왁스 파편 [{ mesh, mat, vx, vy, vz, rx, rz, age, life }]
const _shardGeo = new THREE.BoxGeometry(1, 1, 1);   // 공유 지오메트리(파편 크기는 scale로)
let _audioCtx = null;    // 조각 "톡" 사운드용 lazy AudioContext(첫 사용 시 생성) — 크런치는 mp3 재생
// 왁스 코팅 — 광택 파라핀 느낌. clearcoat(Physical)는 조각 수백 개에 쓰기엔 셰이더가 무거워
// 점프 버벅임을 유발했다 → 저 roughness Standard로 광택을 내되 비용은 기존 수준 유지.
const WAX_MAT = new THREE.MeshStandardMaterial({
    color: 0xFBF0D8, roughness: 0.26, metalness: 0.06,
    emissive: 0xFFF3D8, emissiveIntensity: 0.12,
});
// 속 발판 — 버터 스틱(연한 크림색·둥근 모서리·밟으면 출렁). 실물 버터바 레퍼런스 기준.
const BUTTER_MAT = new THREE.MeshStandardMaterial({
    color: 0xF5ECBB, roughness: 0.42, metalness: 0.0,
    emissive: 0xFFF3C4, emissiveIntensity: 0.1,
});

// ---- 버터 포장 프린트("SALTED / BUTTER / 4oz.") — 파란 잉크, 투명 배경 데칼 텍스처 ----
let _butterTopTex = null, _butterSideTex = null;
function butterTopTex() {
    if (_butterTopTex) return _butterTopTex;
    // 가로로 긴 발판 윗면(약 2.3:1) 비율에 맞춘 와이드 레이아웃 — 실물 버터바 인쇄 배치
    const c = document.createElement('canvas');
    c.width = 512; c.height = 224;
    const x = c.getContext('2d');
    x.fillStyle = '#2B6CB0'; x.textAlign = 'center';
    x.font = 'bold 22px sans-serif';
    x.fillText('SALTED', 330, 62);
    x.font = 'bold 76px sans-serif';
    x.fillText('BUTTER', 330, 136);
    x.font = 'bold 30px sans-serif';
    x.fillText('4oz.', 92, 118);
    x.font = 'bold 20px sans-serif';
    x.fillText('NET WT. (113 G)', 330, 178);
    _butterTopTex = new THREE.CanvasTexture(c);
    _butterTopTex.colorSpace = THREE.SRGBColorSpace;
    return _butterTopTex;
}
function butterSideTex() {
    if (_butterSideTex) return _butterSideTex;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#2B6CB0'; x.textAlign = 'center';
    x.font = 'bold 30px sans-serif';
    x.fillText('4oz.', 96, 60);
    x.font = 'bold 58px sans-serif';
    x.fillText('BUTTER', 300, 68);
    _butterSideTex = new THREE.CanvasTexture(c);
    _butterSideTex.colorSpace = THREE.SRGBColorSpace;
    return _butterSideTex;
}
/** 버터 블록(바닥 원점, w×0.4×d)에 포장 프린트 데칼(윗면 + 4옆면)을 붙인다 — 왁스가 깨지면 드러남 */
function addButterPrint(p, w, d) {
    const topMat = new THREE.MeshStandardMaterial({ map: butterTopTex(), transparent: true, roughness: 0.42 });
    const sideMat = new THREE.MeshStandardMaterial({ map: butterSideTex(), transparent: true, roughness: 0.42 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.35, d - 0.35).rotateX(-Math.PI / 2), topMat);
    top.position.y = 0.406;
    p.add(top);
    const sw = w - 0.4, sh = 0.26;
    const mk = (rx, rz, ry, ww) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, sh), sideMat);
        m.position.set(rx, 0.2, rz);
        m.rotation.y = ry;
        p.add(m);
    };
    mk(0, d / 2 + 0.006, 0, sw);                 // +z(정면)
    mk(0, -d / 2 - 0.006, Math.PI, sw);          // -z
    mk(w / 2 + 0.006, 0, Math.PI / 2, d - 0.4);  // +x
    mk(-w / 2 - 0.006, 0, -Math.PI / 2, d - 0.4); // -x
}

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...opts });
}

// ---- 키캡 브랜치 상태 — 밟으면 클릭음 + RGB 백라이트 플래시 + 눌림 애니 ----
const _keycaps = [];   // [{ body, plate, glow, baseY, plateY, glowState, pressT, hue }]

// ---- 퐁실 푸딩 상태 — 버터 사이 징검다리. 밟으면 보잉음 + 젤리 출렁 ----
const _puddings = [];   // [{ jelly, wobbleT, phase }]

/** 키캡 상판 각인 텍스처(투명 배경) — map·emissiveMap 겸용. ink=글자색, wu=키 폭(u — 와이드 키 비율 유지) */
function keycapTex(ch, ink = '#FFFFFF', wu = 1) {
    const c = document.createElement('canvas');
    c.width = Math.round(128 * Math.min(4, wu)); c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold ${[...ch].length > 1 ? 44 : 72}px sans-serif`;   // 'Ctrl' 같은 다중 글자는 축소
    x.fillText(ch, c.width / 2, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/** 푸딩 보잉음 — 사인 피치가 출렁 내려갔다 되튕기는 "보용~"(WebAudio 합성, 파일 불필요) */
function _boing() {
    try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _audioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, t0);
        osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.16);
        osc.frequency.exponentialRampToValueAtTime(190, t0 + 0.24);   // 되튕김
        osc.frequency.exponentialRampToValueAtTime(130, t0 + 0.34);
        g.gain.setValueAtTime(0.12, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.38);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.4);
    } catch { /* 오디오 불가 환경 — 무음 진행 */ }
}

/** 기계식 키보드 클릭음 — 고주파 클릭 + 저주파 보텀아웃(WebAudio 합성, 파일 불필요) */
function _keyClick() {
    try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _audioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator(), g = ctx.createGain();   // "딸깍" 클릭
        osc.type = 'square';
        osc.frequency.setValueAtTime(2400 + Math.random() * 500, t0);
        osc.frequency.exponentialRampToValueAtTime(800, t0 + 0.03);
        g.gain.setValueAtTime(0.11, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.06);
        const osc2 = ctx.createOscillator(), g2 = ctx.createGain(); // "톡" 보텀아웃
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(150, t0 + 0.015);
        g2.gain.setValueAtTime(0.14, t0 + 0.015);
        g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
        osc2.connect(g2); g2.connect(ctx.destination);
        osc2.start(t0 + 0.015); osc2.stop(t0 + 0.1);
    } catch { /* 오디오 불가 환경 — 무음 진행 */ }
}

/** 키캡 착지 훅 — scene.js _onJumpmapLanded에서 호출. 클릭음 + 백라이트 + 눌림. */
export function onKeycapStep(mesh) {
    const idx = mesh && mesh.userData.keycapIdx;
    const kc = _keycaps[idx];
    if (!kc) return;
    _lastWalkKeyIdx = idx;   // 착지 직후 걷기 훅이 같은 키를 중복 발동하지 않게 동기화
    kc.glowState = 1;
    kc.pressT = 0;
    _keyClick();
}

/** 키캡 걷기 훅 — 걷는 동안 매 프레임 발밑 메시로 호출(scene.js updateSelfVertical).
 *  다른 키로 넘어가는 순간마다 클릭음 + 백라이트 발동 → 키보드 위를 "타이핑하듯" 걷는다. */
let _lastWalkKeyIdx = -1;
export function onKeycapWalk(mesh) {
    const idx = mesh && mesh.userData.keycapIdx;
    if (idx === undefined || idx === null) { _lastWalkKeyIdx = -1; return; }   // 키캡 밖 — 리셋
    if (idx === _lastWalkKeyIdx) return;                                        // 같은 키 위 — no-op(저렴)
    _lastWalkKeyIdx = idx;
    const kc = _keycaps[idx];
    if (!kc) return;
    kc.glowState = 1;
    kc.pressT = 0;
    _keyClick();
}

// ---- 타워 외벽(창문 격자) 캔버스 텍스처 — 가구 없이 "겉만" 저비용 표현 ----
function makeFacadeTexture(bg = '#2b3a44', win = '#0e1418') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 1024;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    const cols = 4, rows = 20;
    const mx = 14, my = 12;                    // 여백
    const cw = (c.width - mx * (cols + 1)) / cols;
    const ch = (c.height - my * (rows + 1)) / rows;
    for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
            const x = mx + col * (cw + mx);
            const y = my + r * (ch + my);
            // 일부 창은 불이 켜진 느낌(청록/노랑), 나머지는 어두운 유리
            const lit = ((r * 7 + col * 3) % 5) === 0;
            ctx.fillStyle = lit ? (((r + col) % 2) ? '#7fe0ff' : '#ffe08a') : win;
            ctx.fillRect(x, y, cw, ch);
            // 유리 하이라이트
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(x, y, cw, ch * 0.35);
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

// ---- 캔버스 간판 ----
function makeSignTexture(title, subtitle, bg = '#0d1421', fg = '#00E5FF') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = fg; ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(title, 256, 62);
    ctx.fillStyle = '#ffffff'; ctx.font = '20px monospace';
    ctx.fillText(subtitle, 256, 100);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/**
 * 서 있는 발광 포탈(링 + 소용돌이 디스크 + 바닥 패드).
 * @returns {{ group: THREE.Group, ring: THREE.Mesh, disc: THREE.Mesh }}
 * 그룹은 로컬 원점 기준(바닥 y=0). 근접 판정(x,z)은 호출부가 월드 좌표로 계산한다.
 */
function makePortal(color = 0x00E5FF, r = 1.25) {
    const g = new THREE.Group();
    const cy = r + 0.2;                        // 링 중심 높이(바닥 위에 세움)

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.16, 12, 40),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 })
    );
    ring.position.y = cy;
    g.add(ring);

    const disc = new THREE.Mesh(
        new THREE.CircleGeometry(r - 0.05, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
    );
    disc.position.y = cy;
    g.add(disc);

    // 바닥 발광 패드(위치 인지용)
    const pad = new THREE.Mesh(
        new THREE.CircleGeometry(r + 0.35, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 })
    );
    pad.position.y = 0.03;
    g.add(pad);

    _portals.push({ ring, disc, baseInt: 1.4 });
    return { group: g, ring, disc };
}

/**
 * 빈 타워(겉모습만) + 입구 앞 포탈을 만든다. scene 루트(envGroup 밖)에 추가할 것.
 * @param {{x:number, z:number}} pos 타워가 설 월드 위치(지면 y=0)
 * @returns {{ group: THREE.Group, portal: {x:number,z:number,y:number,r:number} }}
 */
export function createJumpTower(pos) {
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);

    const W = 7, D = 7, H = 30;
    const baseY = 0.6;                         // 플린스 상단

    // 지반 플린스
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 2.6, baseY, D + 2.6), mat(0x455A64, { roughness: 0.95 }));
    plinth.position.y = baseY / 2;
    plinth.castShadow = true; plinth.receiveShadow = true;
    g.add(plinth);

    // 타워 본체(창문 텍스처) — 가구 없이 겉면만
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(W, H, D),
        new THREE.MeshStandardMaterial({ map: makeFacadeTexture(), roughness: 0.5, metalness: 0.25 })
    );
    body.position.y = baseY + H / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // 상단 캡 + 옥탑 + 안테나 + 항공장애등
    const capY = baseY + H;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.9, D + 0.8), mat(0x37474F));
    cap.position.y = capY + 0.45; cap.castShadow = true; g.add(cap);

    const penthouse = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 3), mat(0x263238));
    penthouse.position.y = capY + 0.9 + 0.9; penthouse.castShadow = true; g.add(penthouse);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 8), mat(0x90A4AE));
    antenna.position.y = capY + 1.8 + 2; g.add(antenna);

    const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 1.6 })
    );
    beacon.position.y = capY + 1.8 + 4; g.add(beacon);

    // 입구(정면 +z) — 문틀 + 간판
    const door = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 0.3), mat(0x1c262b));
    door.position.set(0, baseY + 1.7, D / 2 + 0.02); g.add(door);

    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 1.1),
        new THREE.MeshBasicMaterial({ map: makeSignTexture('왁뿌 타워', 'WAX-POP ▸ ENTER') })
    );
    sign.position.set(0, baseY + 5.4, D / 2 + 0.12); g.add(sign);

    // 입구 앞 포탈(+z 쪽 지면)
    const portalLocalZ = D / 2 + 2.4;
    const portal = makePortal(0x00E5FF, 1.25);
    portal.group.position.set(0, 0, portalLocalZ);
    g.add(portal.group);

    return {
        group: g,
        portal: { x: pos.x, z: pos.z + portalLocalZ, y: 0, r: 1.25 },
    };
}

// ---- 테트리스 타워 외벽 — 테트리스 보드(쌓인 블록 + 낙하 중인 피스) 캔버스 텍스처 ----
function makeTetrisFacadeTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 1024;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, c.width, c.height);
    const cols = 8, rows = 32;
    const cw = c.width / cols, ch = c.height / rows;
    const palette = ['#26C6DA', '#5C7CFA', '#FFA726', '#FFD54F', '#66BB6A', '#AB47BC', '#EF5350'];
    const block = (col, row, color) => {
        const x = col * cw, y = row * ch;
        ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x + 1, y + 1, cw - 2, ch * 0.2);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 1, y + ch - ch * 0.18, cw - 2, ch * 0.18 - 1);
    };
    // 희미한 그리드
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, c.height); ctx.stroke(); }
    for (let j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(c.width, j * ch); ctx.stroke(); }
    // 아래쪽 절반: 빈틈 섞인 블록 더미(결정적 패턴 — 텍스처 4면 재사용에도 자연스러움)
    for (let row = 17; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (((row * 5 + col * 3) % 7) === 0) continue;         // 군데군데 구멍
            block(col, row, palette[(row * 3 + col * 5) % palette.length]);
        }
    }
    // 위쪽: 낙하 중인 T·L 피스
    [[3, 5], [2, 6], [3, 6], [4, 6]].forEach(([col, row]) => block(col, row, '#AB47BC'));
    [[6, 11], [6, 12], [6, 13], [7, 13]].forEach(([col, row]) => block(col, row, '#FFA726'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

// ---- 테트리스 순위판(타워 정면) — 캔버스 텍스처. refreshTetrisRanking으로 갱신 ----
let _tetrisRankCv = null, _tetrisRankTex = null;

/** 순위판 캔버스 다시 그리기(TOP 5). list: [{ name, score }] 점수 내림차순 */
function _drawTetrisRanking(list) {
    if (!_tetrisRankCv) return;
    const c = _tetrisRankCv, x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = '#0d1117'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#E040FB'; x.lineWidth = 6;
    x.strokeRect(3, 3, c.width - 6, c.height - 6);
    x.fillStyle = '#E040FB'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = 'bold 42px sans-serif';
    x.fillText('🏆 TETRIS TOP 5', c.width / 2, 60);
    x.strokeStyle = 'rgba(224,64,251,.4)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(28, 80); x.lineTo(c.width - 28, 80); x.stroke();
    if (!Array.isArray(list) || !list.length) {
        x.fillStyle = '#546E7A'; x.font = 'bold 28px sans-serif';
        x.fillText('아직 기록이 없어요', c.width / 2, 220);
        x.fillText('포탈에서 SPACE — 1등을 노려보세요!', c.width / 2, 262);
    } else {
        const medals = ['🥇', '🥈', '🥉'];
        list.slice(0, 5).forEach((t, i) => {
            const y = 134 + i * 56;
            x.textAlign = 'left'; x.fillStyle = '#ECEFF1'; x.font = 'bold 30px sans-serif';
            x.fillText(`${medals[i] || (i + 1) + '.'} ${t.name}`, 32, y, 330);   // maxWidth로 긴 이름 압축
            x.textAlign = 'right'; x.fillStyle = '#FFD54F';
            x.fillText(Number(t.score).toLocaleString(), c.width - 32, y);
        });
    }
    if (_tetrisRankTex) _tetrisRankTex.needsUpdate = true;
}

/**
 * 테트리스 순위판 갱신 — scene.js에서 호출(테트리스 종료 시·WS tetris-ranking 수신 시).
 * ranking을 주면 그대로 그리고, 없으면 서버에서 조회(실패 시 기존 표시 유지).
 */
export function refreshTetrisRanking(ranking) {
    if (Array.isArray(ranking)) { _drawTetrisRanking(ranking); return; }
    fetch('/api/tetris/ranking')
        .then((r) => r.json())
        .then((d) => _drawTetrisRanking(d.ranking || []))
        .catch(() => { /* 서버 불가 — 기존 표시 유지 */ });
}

/** 단위 큐브 4개짜리 3D 테트로미노 장식. cells: [[x,y],...] (로컬 격자), s: 큐브 한 변. */
function makeTetromino3D(cells, color, s = 1.0) {
    const g = new THREE.Group();
    const m = mat(color, { roughness: 0.4, emissive: color, emissiveIntensity: 0.25 });
    for (const [cx, cy] of cells) {
        const cube = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m);
        cube.position.set(cx * s, cy * s + s / 2, 0);
        cube.castShadow = true;
        g.add(cube);
    }
    return g;
}

/**
 * 테트리스 타워(겉모습만) + 입구 앞 포탈. 왁뿌 타워와 동일하게 scene 루트에 추가할 것.
 * 포탈은 맵 전환이 아니라 테트리스 오버레이(tetris.js) 실행 트리거 — 처리와 근접 판정은 scene.js 담당.
 * @param {{x:number, z:number}} pos 타워가 설 월드 위치(지면 y=0)
 * @returns {{ group: THREE.Group, portal: {x:number,z:number,y:number,r:number} }}
 */
export function createTetrisTower(pos) {
    const g = new THREE.Group();
    g.position.set(pos.x, 0, pos.z);

    const W = 6, D = 6, H = 16;
    const baseY = 0.6;

    // 지반 플린스
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, baseY, D + 2.4), mat(0x455A64, { roughness: 0.95 }));
    plinth.position.y = baseY / 2;
    plinth.castShadow = true; plinth.receiveShadow = true;
    g.add(plinth);

    // 본체 — 테트리스 보드 텍스처
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(W, H, D),
        new THREE.MeshStandardMaterial({ map: makeTetrisFacadeTexture(), roughness: 0.5, metalness: 0.2 })
    );
    body.position.y = baseY + H / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    // 상단 캡 + 옥상의 T-피스 조형물(타워 시그니처)
    const capY = baseY + H;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, 0.8, D + 0.7), mat(0x37474F));
    cap.position.y = capY + 0.4; cap.castShadow = true; g.add(cap);

    const roofT = makeTetromino3D([[-1, 0], [0, 0], [1, 0], [0, 1]], 0xAB47BC, 1.2);
    roofT.position.set(0, capY + 0.8, 0);
    roofT.rotation.y = Math.PI / 6;
    g.add(roofT);

    // 입구 좌우 기단 장식 — 기대 세운 L·I 피스
    const baseL = makeTetromino3D([[0, 0], [0, 1], [0, 2], [1, 0]], 0xFFA726, 0.55);
    baseL.position.set(-W / 2 - 1.0, baseY, D / 2 - 0.6);
    baseL.rotation.y = Math.PI / 5;
    g.add(baseL);
    const baseI = makeTetromino3D([[0, 0], [0, 1], [0, 2], [0, 3]], 0x26C6DA, 0.55);
    baseI.position.set(W / 2 + 1.0, baseY, D / 2 - 0.6);
    baseI.rotation.z = -0.16;                              // 살짝 기울여 세워둔 느낌
    g.add(baseI);

    // 입구(정면 +z) — 문틀 + 간판
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.2, 0.3), mat(0x1c262b));
    door.position.set(0, baseY + 1.6, D / 2 + 0.02); g.add(door);

    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 1.1),
        new THREE.MeshBasicMaterial({ map: makeSignTexture('테트리스 타워', 'TETRIS ▸ PLAY', '#0d1117', '#E040FB') })
    );
    sign.position.set(0, baseY + 5.0, D / 2 + 0.12); g.add(sign);

    // 순위판(정면, 간판 위) — 서버 리더보드 TOP 5. refreshTetrisRanking이 캔버스를 갱신한다.
    _tetrisRankCv = document.createElement('canvas');
    _tetrisRankCv.width = 512; _tetrisRankCv.height = 384;
    _tetrisRankTex = new THREE.CanvasTexture(_tetrisRankCv);
    _tetrisRankTex.colorSpace = THREE.SRGBColorSpace;
    _tetrisRankTex.anisotropy = 4;
    const rankBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(4.6, 3.45),
        new THREE.MeshBasicMaterial({ map: _tetrisRankTex })
    );
    rankBoard.position.set(0, baseY + 8.2, D / 2 + 0.12);
    g.add(rankBoard);
    _drawTetrisRanking([]);        // 로드 전 빈 보드 즉시 렌더(텍스처 공백 방지)
    refreshTetrisRanking();        // 서버 순위 조회

    // 입구 앞 포탈(+z 쪽 지면) — 마젠타(왁뿌 시안·리턴 주황과 구분)
    const portalLocalZ = D / 2 + 2.4;
    const portal = makePortal(0xE040FB, 1.25);
    portal.group.position.set(0, 0, portalLocalZ);
    g.add(portal.group);

    return {
        group: g,
        portal: { x: pos.x, z: pos.z + portalLocalZ, y: 0, r: 1.25 },
    };
}

/**
 * 점프맵 공간(최초 숨김). 오피스에서 멀리 떨어진 별도 영역에 바닥 + 스폰 + 리턴 포탈 +
 *   안내판(+ 제작 참고용 예시 발판 몇 개)을 배치한다. 실제 점프 발판은 추후 이 그룹 안에 추가.
 * @param {{x:number, z:number}} origin 점프맵 중심 월드 위치
 * @returns {{ group: THREE.Group, spawn:{x,y,z}, returnPortal:{x,z,y,r}, targets: THREE.Mesh[] }}
 */
export function createJumpMapArea(origin) {
    const g = new THREE.Group();
    g.position.set(origin.x, 0, origin.z);
    g.visible = false;                         // 최초 숨김(오피스에서 시작)

    const targets = [];                        // 착지 가능한 면(jumpTargets로 스왑)

    // 바닥(격자 느낌) — 발밑 레이캐스트 대상
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.9, metalness: 0.1 })
    );
    floor.position.y = 0.02; floor.receiveShadow = true;
    floor.userData.jmFloor = true;                 // 착지 실패 판정용(코스 시작 후 바닥 착지 = 리스폰)
    g.add(floor); targets.push(floor);

    // 바닥 그리드 선(장식)
    const grid = new THREE.GridHelper(60, 30, 0x2f6f7f, 0x24525e);
    grid.position.y = 0.03; g.add(grid);

    // 스폰 표시(발광 원반)
    const spawnPad = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0.18 })
    );
    spawnPad.position.set(0, 0.04, 2); g.add(spawnPad);

    // 안내판
    const guide = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 2),
        new THREE.MeshBasicMaterial({ map: makeSignTexture('왁뿌 타워', '왁스를 밟아 부수며 꼭대기까지!', '#101820', '#ffd98a'), transparent: true })
    );
    guide.position.set(0, 3.2, -4); g.add(guide);

    // ---- 왁뿌 코스: 중심 나선(반경 3.2, 45°/스텝)으로 상승하는 왁스 발판 + 골 — 단일 루트 ----
    // 점프 물리(scene.js JUMP_SPEED 8·GRAVITY 22 → 최고 상승 1.45, +1.0 상승 착지 수평거리 ≈2.8)에 맞춰
    // 이웃 발판 중심거리 2.45·상승 1.0으로 배치. 1번 발판(top 0.6)은 STEP_UP(0.6) 이내 → 걸어 올라 시작.
    // 6번째 스텝(i=5, top 5.6) 자리는 발판 대신 기계식 키보드 다리(아래 키캡 구간)가 코스 중간을
    // 잇는다: idx4(4.6) → 키보드(5.85 평탄) → idx6(6.6, +0.75 점프). idx4→idx6 직접 점프는
    // 상승 2.0이라 불가 → 키보드가 유일한 길(루트 단일화).
    _waxShells.length = 0;
    const RINGC = { x: 0, z: 8 }, RINGR = 3.2;
    const specs = [];
    for (let i = 0; i < 12; i++) {
        if (i === 5) continue;                   // 이 자리는 키보드 다리가 대체
        if (i === 2) continue;                   // 3번째 스텝 자리는 퐁실 푸딩이 대체
        const a = Math.PI + (Math.PI / 4) * i;   // 스폰 쪽(남)에서 시작해 나선 상승(1.5바퀴)
        specs.push({ x: RINGC.x + Math.sin(a) * RINGR, z: RINGC.z + Math.cos(a) * RINGR, top: 0.6 + i, w: 3.2, d: 1.6 });   // 버터 스틱 비율(가로로 긴 직사각형)
    }
    specs.push({ x: -0.6, z: 8.6, top: 12.2, w: 4, d: 2.4, goal: true });   // 골(마지막에서 +0.6 상승·거리 ≈2.3) — 큰 버터 스틱

    specs.forEach((s, i) => {
        // 속 발판 — 버터 말랑이: 둥근 모서리 버터 블록. 바닥 기준 스케일(밟으면 위가 눌리는 스퀴시)을
        // 위해 지오메트리 원점을 바닥면으로 내려 굽는다(geometry.translate).
        const bGeo = new RoundedBoxGeometry(s.w, 0.4, s.d, 3, 0.13);
        bGeo.translate(0, 0.2, 0);                     // 원점 = 바닥면 중심
        const p = new THREE.Mesh(bGeo, BUTTER_MAT.clone());
        p.position.set(s.x, s.top - 0.4, s.z);         // 바닥면 위치(윗면 = s.top 유지 → 점프 물리 불변)
        p.castShadow = true; p.receiveShadow = true;
        p.userData.waxIdx = i;
        if (s.goal) p.userData.jmGoal = true;
        addButterPrint(p, s.w, s.d);                   // 포장 프린트(SALTED/BUTTER/4oz.) — 왁스 깨지면 드러남
        g.add(p); targets.push(p);

        // 왁스 셸 — 발판을 얇게 감싸는 크러스트(면별 보로노이 균열 조각, 두께 0.02).
        // targets 미포함(비주얼 전용) → 물리 불변. 착지 시 금이 간 뒤 조각이 하나씩 떨어져 나간다.
        const shellG = new THREE.Group();
        shellG.position.set(s.x, s.top - 0.2, s.z);    // 크러스트는 발판 '중심' 기준(기존 좌표계 유지)
        g.add(shellG);

        // 왁스 드립 — 윗면 가장자리에서 흘러내려 굳은 촛농 방울들(비주얼 전용, 깨지면 함께 사라짐)
        // 성능: 방울 지오메트리를 발판당 1개 메시로 병합(드로우콜 10개 → 1개), 그림자 제외.
        const dripMat = WAX_MAT.clone();
        const dripGeos = [];
        for (let k = 0; k < 5; k++) {
            const side = k % 4;                        // ±x·±z 면에 고르게
            const along = (Math.random() - 0.5) * (side < 2 ? s.d : s.w) * 0.78;
            const len = 0.14 + Math.random() * 0.22;
            const dx = side === 0 ? s.w / 2 + 0.03 : side === 1 ? -s.w / 2 - 0.03 : along;
            const dz = side === 2 ? s.d / 2 + 0.03 : side === 3 ? -s.d / 2 - 0.03 : along;
            const body = new THREE.CylinderGeometry(0.045, 0.07, len, 6);
            body.translate(dx, 0.2 - len / 2, dz);
            const tip = new THREE.SphereGeometry(0.075, 8, 6);
            tip.translate(dx, 0.2 - len, dz);
            dripGeos.push(body, tip);
        }
        const dripMesh = new THREE.Mesh(mergeGeometries(dripGeos), dripMat);
        shellG.add(dripMesh);
        const drips = [dripMesh];

        _waxShells[i] = {
            pieces: _buildWaxPieces(shellG, s.w, 0.4, s.d),
            queue: [], timer: 0, broken: false,
            cx: s.x, top: s.top, cz: s.z, w: s.w, d: s.d, group: g,
            butter: p, squishT: 9,                     // 말랑이 스퀴시 상태(9=휴지)
            drips, dripMat, dripFade: 1,
        };

        if (s.goal) {   // 골 깃발 — 왁스를 심지처럼 뚫고 나온 폴
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), mat(0x8D6E63));
            pole.position.set(s.x + s.w / 2 - 0.4, s.top + 1.1, s.z);
            g.add(pole);
            const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ color: 0xFF5252, side: THREE.DoubleSide }));
            flag.position.set(s.x + s.w / 2 - 0.87, s.top + 1.85, s.z);
            g.add(flag);
        }
    });

    // ---- 퐁실 푸딩 스텝: 3번째 계단(i=2, top 2.6)을 대형 푸딩 1개가 대체 ----
    // 코스 흐름 불변: i=1(1.6) → 푸딩(2.6) → i=3(3.6). 접시 지름 ≈ 6.5(발판의 2배)라
    // 원래 링 자리(반경 3.2)에선 이웃 발판과 몸통이 겹쳐 → 같은 각도에서 링 바깥(반경 6.0)으로
    // 밀어 배치. 점프 검증: i=1→푸딩 상면 가장자리 +1.0 상승·간격 ≈2.45 ✓ / 푸딩→i=3 동일 ✓.
    // 밟으면 보잉음 + 눌렸다 되튕기는 젤리 출렁, 서 있는 동안은 눌린 채 유지(버터와 동일 패턴).
    _puddings.length = 0;
    const custardMat = mat(0xFFD469, { roughness: 0.45, metalness: 0.05 });
    const caramelMat = mat(0x8A4B14, { roughness: 0.35, metalness: 0.05 });
    const saucerMat  = mat(0xF6F3EC, { roughness: 0.6, metalness: 0.05 });
    const PUD_S = 3.7;                                 // 스케일 — 접시 지름 ≈ 6.5(발판 가로폭의 2배)
    // 위치: 다음 발판(i=3) 쪽으로 붙인 지점 — 상면 가장자리→i=3 이 한 걸음 홉(간격 ≈1.0)이 되고,
    // i=1→푸딩 진입도 간격 ≈2.2(+1.0)로 기존보다 쉬움. 이웃 발판 몸통과 3D 비겹침 검증 좌표.
    const PUD_SPOTS = [
        { x: -4.9, z: 8.9 },
    ];
    const pudTop = 0.6 + 2;                            // 카라멜 윗면(착지면) 2.6 — 대체한 발판과 동일
    PUD_SPOTS.forEach((sp, i) => {
        const pTop = pudTop;
        const pgrp = new THREE.Group();
        pgrp.position.set(sp.x, pTop - 0.66 * PUD_S, sp.z);   // 스케일 반영해 윗면 = pTop 유지
        pgrp.scale.setScalar(PUD_S);
        g.add(pgrp);
        const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.88, 0.06, 24), saucerMat);
        saucer.position.y = 0.03;
        saucer.castShadow = true; saucer.receiveShadow = true;
        pgrp.add(saucer);
        const jelly = new THREE.Group();               // 출렁이는 부분 — 원점 = 접시 윗면(바닥 기준 스케일)
        jelly.position.y = 0.06;
        pgrp.add(jelly);
        const flanGeo = new THREE.CylinderGeometry(0.52, 0.68, 0.5, 24);
        flanGeo.translate(0, 0.25, 0);
        const flan = new THREE.Mesh(flanGeo, custardMat);
        flan.castShadow = true; flan.receiveShadow = true;
        flan.userData.puddingIdx = _puddings.length;
        jelly.add(flan); targets.push(flan);
        const capGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.12, 24);
        capGeo.translate(0, 0.54, 0);                  // 윗면 0.6 → 월드 pTop
        const cap = new THREE.Mesh(capGeo, caramelMat);
        cap.castShadow = true;
        cap.userData.puddingIdx = flan.userData.puddingIdx;
        jelly.add(cap); targets.push(cap);
        // 카라멜 드립 — 윗단 가장자리에서 흘러내린 방울(왁스 드립처럼 병합 1메시, 그림자 제외)
        const dripGeos2 = [];
        for (let k = 0; k < 4; k++) {
            const da = (k / 4) * Math.PI * 2 + i * 0.9;
            const len = 0.12 + Math.random() * 0.14;
            const dx = Math.sin(da) * 0.56, dz = Math.cos(da) * 0.56;
            const b = new THREE.CylinderGeometry(0.05, 0.07, len, 6);
            b.translate(dx, 0.5 - len / 2, dz);
            const t = new THREE.SphereGeometry(0.075, 8, 6);
            t.translate(dx, 0.5 - len, dz);
            dripGeos2.push(b, t);
        }
        jelly.add(new THREE.Mesh(mergeGeometries(dripGeos2), caramelMat));
        _puddings.push({ jelly, wobbleT: 9, phase: i * 2 });   // 둘이 어긋나게 숨쉬도록 위상 분리
    });

    // ---- 키캡 구간: 코스 중간(빠진 6번째 스텝 자리)을 잇는 "거대 기계식 키보드" 다리 ----
    // 로블록스 키캡 발판 스타일: 다크 플레이트 케이스 위에 파스텔 키캡을 실제 배열로 깐다 —
    // 높이 6칸(Ctrl→⇧→ASDF→QWERTY→숫자→F열) + 와이드 Shift/Enter/⌫ + 스페이스바(3u) + 스태거.
    // 키필드 폭(5.5u)을 행 깊이(6u)보다 좁혀 진행 방향으로 세로로 눕힌 포트레이트 배치.
    // 키·케이스 모두 단차 없는 평탄(전 키 top 5.85) — 걸어서 통과.
    // 아래열 Ctrl 키가 idx4(top 4.6) 북쪽 모서리 바로 위(+1.25)라 수직 점프로 진입하고,
    // 맨 윗열(F열) 왼쪽 Esc에서 idx6(top 6.6)으로 +0.75 점프해 합류 — 코스의 유일한 중간 통로.
    // 키만 착지면(targets) — 케이스는 비주얼 전용이며 키를 서로 0.02 겹쳐 발 빠질 틈이 없다.
    // 밟으면 클릭음 + 백라이트 플래시 + 눌림 애니.
    _keycaps.length = 0;
    const PASTEL = [0xFFC1CC, 0xB5EAD7, 0xFFF3B0, 0xC7CEEA, 0xFFDAB9, 0xAEE1F9, 0xD4F0C0, 0xFFB7B2, 0xE2C6F5];
    const KB_U = 0.95;                                 // 1u 키 피치(월드 단위)
    const KB_W = 5.5;                                  // 키필드 전체 폭(u) — 좌측 끝 v = -KB_W/2
    const KB_ROWS = [                                  // 아래(진입)행 → 위. [각인, 폭(u)], off = 스태거(u)
        { off: 0,    keys: [['Ctrl', 1.25], ['🐾', 3], ['뿌', 1.25]] },
        { off: 0,    keys: [['⇧', 1.5], ['Z', 1], ['X', 1], ['C', 1], ['V', 1]] },
        { off: 0,    keys: [['A', 1], ['S', 1], ['D', 1], ['F', 1], ['⏎', 1.5]] },
        { off: 0.25, keys: [['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1]] },
        { off: 0,    keys: [['1', 1], ['2', 1], ['3', 1], ['4', 1], ['⌫', 1.5]] },
        { off: 0,    keys: [['Esc', 1.5], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1]] },
    ];
    const KB_N = KB_ROWS.length;                       // 행 수(높이 6칸)
    // 다리 축: 아래열 중심 KA → idx6 방향 (0.8,-0.6), 수직 (0.6,0.8).
    // KA는 키필드 폭(5.5u) 기준으로 Ctrl 키가 idx4 북쪽 모서리 바로 위에 오도록 잡은 위치.
    const KA = { x: 1.395, z: 13.86 }, KDIR = { x: 0.8, z: -0.6 }, KPERP = { x: 0.6, z: 0.8 };
    const KYAW = Math.atan2(KDIR.x, KDIR.z);
    const KB_TOP = 5.85;                               // 전 키 공통 top — 단차 없는 평탄 키보드
    const kbPos = (u, v) => ({ x: KA.x + KDIR.x * u + KPERP.x * v, z: KA.z + KDIR.z * u + KPERP.z * v });

    // 케이스(다크 플레이트) — 키 밑면보다 0.58 아래(백라이트 갭), 수평. 비주얼 전용(targets 미포함).
    const caseTopMidY = KB_TOP - 0.58;                 // 키 높이 기준 케이스 상면
    const caseC = kbPos((KB_N - 1) / 2 * KB_U, 0);
    const kbCase = new THREE.Mesh(
        new RoundedBoxGeometry(KB_W * KB_U + 0.5, 0.35, KB_N * KB_U + 0.6, 2, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x353A45, roughness: 0.55, metalness: 0.3 })
    );
    kbCase.position.set(caseC.x, caseTopMidY - 0.175, caseC.z);
    kbCase.rotation.y = KYAW;
    kbCase.castShadow = true; kbCase.receiveShadow = true;
    g.add(kbCase);

    let kbIdx = 0;
    KB_ROWS.forEach((rowDef, row) => {
        const rowTop = KB_TOP;
        let cum = rowDef.off;
        for (const [ch, wu] of rowDef.keys) {
            const v = (cum + wu / 2 - KB_W / 2) * KB_U;
            cum += wu;
            const p = kbPos(row * KB_U, v);
            const kw = wu * KB_U + 0.02, kd = KB_U + 0.02;         // 이웃 키와 0.02 겹침
            // 몸체 — 파스텔 키캡(광택 플라스틱) + 동색 백라이트(emissive)
            const accent = PASTEL[(row * 4 + Math.round(cum * 2)) % PASTEL.length];
            const body = new THREE.Mesh(
                new RoundedBoxGeometry(kw, 0.5, kd, 2, 0.09),
                new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.05, emissive: accent, emissiveIntensity: 0.12 })
            );
            body.position.set(p.x, rowTop - 0.25, p.z);
            body.rotation.y = KYAW;
            body.castShadow = true; body.receiveShadow = true;
            body.userData.keycapIdx = kbIdx;
            g.add(body); targets.push(body);
            // 상판 각인 — 진한 잉크 글자(이모지는 자체 색). emissiveMap으로 은은한 투과광.
            const tex = keycapTex(ch, '#5B5566', wu);
            const plate = new THREE.Mesh(
                new THREE.PlaneGeometry(kw - 0.16, kd - 0.16).rotateX(-Math.PI / 2),
                new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.5 })
            );
            plate.position.set(p.x, rowTop + 0.006, p.z);
            plate.rotation.y = KYAW;
            g.add(plate);
            // 언더글로우 — 케이스 바닥 아래에서 새어 나오는 RGB(수평)
            const glow = new THREE.Mesh(
                new THREE.PlaneGeometry(kw + 0.4, kd + 0.4).rotateX(-Math.PI / 2),
                new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
            );
            glow.position.set(p.x, caseTopMidY - 0.38, p.z);
            glow.rotation.y = KYAW;
            g.add(glow);
            _keycaps.push({ body, plate, glow, baseY: body.position.y, plateY: plate.position.y, glowState: 0, pressT: 9 });
            kbIdx++;
        }
    });

    // 리턴 포탈(주황) — 스폰 앞쪽에 배치(스폰과 떨어뜨려 즉시 재전환 방지)
    const retLocal = { x: 0, z: -7 };
    const ret = makePortal(0xFF7043, 1.3);
    ret.group.position.set(retLocal.x, 0, retLocal.z);
    g.add(ret.group);

    return {
        group: g,
        spawn: { x: origin.x, y: 0, z: origin.z + 2 },
        returnPortal: { x: origin.x + retLocal.x, z: origin.z + retLocal.z, y: 0, r: 1.3 },
        targets,
    };
}

// ============================================
// 왁뿌 — 착지 시 금 가기 → 조각이 하나씩 떨어져 나가기
// ============================================

/** 폴리곤을 반평면((p-mid)·dir ≤ 0 쪽 유지)으로 클리핑 — Sutherland-Hodgman. */
function _clipHalfPlane(poly, mx, my, dx, dy) {
    const out = [];
    const side = (p) => (p[0] - mx) * dx + (p[1] - my) * dy;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const sp = side(p), sq = side(q);
        if (sp <= 0) out.push(p);
        if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
            const t = sp / (sp - sq);
            out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
    }
    return out;
}

/**
 * 사각형(fw×fh, 원점 중심)을 보로노이 셀로 쪼갠다 — "쩍 갈라진" 다각형 균열 조각.
 * 씨앗점은 지터 그리드(균등 커버리지 + 랜덤)로 뿌리고,
 * 각 셀 = 사각형을 다른 모든 씨앗과의 수직이등분 반평면으로 클리핑한 볼록 다각형.
 */
function _voronoiCells(fw, fh, cell = 0.85) {   // 성능: 셀 0.7→0.85 — 조각 수 ~30% 감소(균열 look 유지)
    const nx = Math.max(2, Math.round(fw / cell)), ny = Math.max(1, Math.round(fh / cell));
    const seeds = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        seeds.push([
            -fw / 2 + (i + 0.15 + Math.random() * 0.7) * (fw / nx),
            -fh / 2 + (j + 0.15 + Math.random() * 0.7) * (fh / ny),
        ]);
    }
    const cells = [];
    for (let a = 0; a < seeds.length; a++) {
        let poly = [[-fw / 2, -fh / 2], [fw / 2, -fh / 2], [fw / 2, fh / 2], [-fw / 2, fh / 2]];
        for (let b = 0; b < seeds.length && poly.length; b++) {
            if (b === a) continue;
            poly = _clipHalfPlane(
                poly,
                (seeds[a][0] + seeds[b][0]) / 2, (seeds[a][1] + seeds[b][1]) / 2,
                seeds[b][0] - seeds[a][0], seeds[b][1] - seeds[a][1]
            );
        }
        if (poly.length >= 3) cells.push(poly);
    }
    return cells;
}

/**
 * 발판(w×h×d, parent 원점이 발판 중심)을 얇게 감싸는 왁스 크러스트를 보로노이 조각으로 채운다.
 * 구성: 윗판(두께 t) + 옆면 4방향 스커트(두께 t, 발판 높이) — 밑면은 안 보여 생략.
 * 각 면을 보로노이 균열로 쪼개 다각형 조각을 두께 t로 압출 — 초기엔 빈틈없이 한 덩어리 코팅으로 보인다.
 * 조각 재질은 페이드용 개별 클론(리셋 복구를 위해 dispose하지 않고 재사용).
 */
function _buildWaxPieces(parent, w, h, d, t = 0.02) {
    const pieces = [];
    const W = w + 2 * t, D = d + 2 * t;                // 윗판은 옆면 두께까지 덮어 모서리 이음새 감춤
    // [면 폭, 면 높이, 압출 방향 회전(지오메트리에 굽기), 셀 기준점(cu,cv) → 조각 위치]
    // ±x 스커트는 코너까지(D 전체) 두르고, ±z 스커트는 그 사이(w)만 채워 겹침 없이 밀착
    const faces = [
        [W, D, (ge) => ge.rotateX(-Math.PI / 2), (cu, cv) => [cu, h / 2, -cv]],    // 윗판(압출 +y)
        [D, h, (ge) => ge.rotateY(Math.PI / 2), (cu, cv) => [w / 2, cv, -cu]],     // +x 스커트(압출 +x)
        [D, h, (ge) => ge.rotateY(-Math.PI / 2), (cu, cv) => [-w / 2, cv, cu]],    // -x 스커트(압출 -x)
        [w, h, null, (cu, cv) => [cu, cv, d / 2]],                                 // +z 스커트(압출 +z)
        [w, h, (ge) => ge.rotateY(Math.PI), (cu, cv) => [-cu, cv, -d / 2]],        // -z 스커트(압출 -z)
    ];
    for (const [fw, fh, bake, place] of faces) {
        for (const poly of _voronoiCells(fw, fh)) {
            // 기준점(꼭짓점 평균)을 지오메트리 원점으로 → 낙하 회전축이 조각 중심이 된다
            let cu = 0, cv = 0;
            for (const pt of poly) { cu += pt[0]; cv += pt[1]; }
            cu /= poly.length; cv /= poly.length;
            const shape = new THREE.Shape();
            poly.forEach((pt, k) => (k ? shape.lineTo(pt[0] - cu, pt[1] - cv) : shape.moveTo(pt[0] - cu, pt[1] - cv)));
            const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
            if (bake) bake(geo);
            const [px, py, pz] = place(cu, cv);
            // 성능: 재질은 공유(WAX_MAT) — 페이드용 클론은 조각이 실제로 떨어질 때(_detachPiece) 지연 생성
            const m = new THREE.Mesh(geo, WAX_MAT);
            m.position.set(px, py, pz);
            m.castShadow = false;   // 성능: 조각 수백 개가 그림자 패스에 들어가면 착지 순간 프레임 드랍(발판 그림자로 충분)
            parent.add(m);
            pieces.push({
                mesh: m, mat: null,                    // 낙하 시작 시 클론 재질 할당(이후 재사용)
                hx: px, hy: py, hz: pz,                // 원위치(리셋 복구용)
                state: 0,                              // 0 붙어있음 · 1 낙하 중 · 2 소멸
                vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, age: 0, life: 1,
            });
        }
    }
    return pieces;
}

/**
 * 착지/올라선 메시가 왁스 발판이면 셸에 금을 낸다(크런치음 + 가루).
 * 조각은 바로 안 떨어지고 updateJumpmap이 타이머로 하나씩 떼어낸다.
 * scene.js의 수직 물리(updateSelfVertical)에서 착지 메시로 호출. 이미 깨졌으면 no-op.
 * @returns {boolean} 이번 호출로 새로 깨졌으면 true
 */
export function onWaxStep(mesh) {
    const idx = mesh && mesh.userData.waxIdx;
    if (idx === undefined || idx === null) return false;
    const wx = _waxShells[idx];
    if (!wx) return false;
    wx.squishT = 0;                                    // 버터 말랑이 — 밟을 때마다 출렁(깨진 뒤에도)
    if (wx.broken) return false;
    wx.broken = true;
    // 금 가기 — 조각들이 제자리에서 미세하게 어긋나며 균열선만 드러난다(아직 안 떨어짐)
    for (const pc of wx.pieces) {
        pc.mesh.position.set(
            pc.hx + (Math.random() - 0.5) * 0.05,
            pc.hy + (Math.random() - 0.5) * 0.04,
            pc.hz + (Math.random() - 0.5) * 0.05
        );
        pc.mesh.rotation.set((Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.09);
    }
    // 낙하 순서 큐(셔플) — 어느 조각부터 떨어질지 매번 다르게
    wx.queue = wx.pieces.map((_, k) => k);
    for (let k = wx.queue.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [wx.queue[k], wx.queue[j]] = [wx.queue[j], wx.queue[k]];
    }
    wx.timer = 0.25;                                   // 첫 조각까지 잠깐 버티는 맛
    _spawnShards(wx);                                  // 임팩트 순간의 잔가루
    _crunch();
    return true;
}

/** 푸딩 밟음/서 있음 — 서 있는 동안 매 프레임 호출돼 눌린 채 유지(no-op 저렴). landed=true(첫 착지)면 보잉음. */
export function onPuddingStep(mesh, landed = false) {
    const idx = mesh && mesh.userData.puddingIdx;
    if (idx === undefined || idx === null) return false;
    const pd = _puddings[idx];
    if (!pd) return false;
    if (landed) _boing();
    pd.wobbleT = 0;                                    // 0 유지 → 눌림, 떠나면 감쇠 진동으로 되튕김
    return true;
}

/** 조각 하나를 셸에서 떼어내 낙하 시작(바깥쪽으로 살짝 밀리며 톡 소리). */
function _detachPiece(pc) {
    if (pc.state !== 0) return;
    pc.state = 1;
    if (!pc.mat) { pc.mat = WAX_MAT.clone(); }         // 페이드용 클론 재질 — 낙하 시점에 지연 생성(이후 재사용)
    pc.mesh.material = pc.mat;
    const len = Math.hypot(pc.hx, pc.hz) || 1;
    const sp = 0.4 + Math.random() * 0.6;
    pc.vx = (pc.hx / len) * sp + (Math.random() - 0.5) * 0.3;
    pc.vz = (pc.hz / len) * sp + (Math.random() - 0.5) * 0.3;
    pc.vy = 0.5 + Math.random() * 0.9;                 // 살짝 톡 튀어오른 뒤 낙하
    pc.rx = (Math.random() - 0.5) * 7;
    pc.rz = (Math.random() - 0.5) * 7;
    pc.age = 0;
    pc.life = 1.1 + Math.random() * 0.5;
    _tick();
}

/** 코스를 시작했는지(하나라도 깨졌는지) — 바닥 착지 실패 판정에 사용. */
export function isWaxStarted() { return _waxShells.some((w) => w.broken); }

/** 왁스 전체 복구(리스폰·재입장 시) — 조각을 원위치·원상태로 되돌린다. */
export function resetWax() {
    for (const w of _waxShells) {
        w.broken = false; w.queue.length = 0; w.timer = 0;
        // 버터·드립 원상 복구
        w.squishT = 9;
        if (w.butter) w.butter.scale.set(1, 1, 1);
        if (w.dripMat) { w.dripFade = 1; w.dripMat.opacity = 1; w.dripMat.transparent = false; }
        if (w.drips) for (const d of w.drips) d.visible = true;
        for (const pc of w.pieces) {
            pc.state = 0;
            pc.mesh.visible = true;
            pc.mesh.position.set(pc.hx, pc.hy, pc.hz);
            pc.mesh.rotation.set(0, 0, 0);
            if (pc.mat) { pc.mat.opacity = 1; pc.mat.transparent = false; }   // 클론은 낙하 경험 조각에만 존재
        }
    }
}

/** 금 가는 순간의 잔가루 — 작은 파편 몇 개만 사방으로 튀긴다(본 덩어리는 조각 낙하가 담당). */
function _spawnShards(wx) {
    const n = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
        const shardMat = WAX_MAT.clone();           // 파편별 페이드용 클론(소멸 시 dispose)
        shardMat.transparent = true;
        const m = new THREE.Mesh(_shardGeo, shardMat);
        const sc = 0.05 + Math.random() * 0.09;
        m.scale.set(sc, sc * (0.5 + Math.random() * 0.6), sc);
        m.position.set(
            wx.cx + (Math.random() - 0.5) * wx.w,
            wx.top + 0.12,
            wx.cz + (Math.random() - 0.5) * wx.d
        );
        m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        wx.group.add(m);
        const ang = Math.random() * Math.PI * 2;
        const sp = 1.2 + Math.random() * 2.2;
        _shards.push({
            mesh: m, mat: m.material,
            vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp, vy: 2.2 + Math.random() * 2.4,
            rx: (Math.random() - 0.5) * 12, rz: (Math.random() - 0.5) * 12,
            age: 0, life: 0.8 + Math.random() * 0.4,
        });
    }
}

// 크런치음 — assets/crush1~4.mp3 중 랜덤 재생. 미리 만들어 둔 풀에서 cloneNode로 재생해
// 연속으로 밟아도 소리가 겹쳐 날 수 있게 한다(원본은 preload 캐시용으로만 유지).
const _crushPool = ['crush1', 'crush2', 'crush3', 'crush4'].map((n) => {
    const a = new Audio(`/3d/assets/${n}.mp3`);
    a.preload = 'auto';
    return a;
});

function _crunch() {
    try {
        const a = _crushPool[Math.floor(Math.random() * _crushPool.length)].cloneNode();
        a.volume = 0.8;
        a.play().catch(() => {});                      // 자동재생 차단 등 — 무음 진행
    } catch { /* 오디오 불가 환경 — 무음 진행 */ }
}

/** 조각 하나가 떨어질 때의 "톡" — 짧은 노이즈 그레인 1개(크런치보다 훨씬 작게). */
function _tick() {
    try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _audioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const dur = 0.01 + Math.random() * 0.015;
        const buf = ctx.createBuffer(1, Math.max(8, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let s = 0; s < ch.length; s++) ch[s] = (Math.random() * 2 - 1) * (1 - s / ch.length);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1400 + Math.random() * 2600;
        bp.Q.value = 8;
        const gg = ctx.createGain();
        gg.gain.value = 0.10 + Math.random() * 0.08;
        src.connect(bp); bp.connect(gg); gg.connect(ctx.destination);
        src.start(ctx.currentTime);
    } catch { /* 무음 진행 */ }
}

/** 포탈 링 애니메이션 + 왁스 조각 탈락·낙하 + 파편 물리. animate에서 매 프레임 호출. */
export function updateJumpmap(elapsed, delta = 0) {
    for (const p of _portals) {
        p.ring.rotation.z = elapsed * 0.8;
        const pulse = 1 + Math.sin(elapsed * 3) * 0.35;
        p.ring.material.emissiveIntensity = p.baseInt * pulse;
        if (p.disc) p.disc.material.opacity = 0.28 + Math.sin(elapsed * 3) * 0.12;
    }
    // 키캡: 눌림(가라앉았다 복귀) + 백라이트 플래시 감쇠 + 평상시 RGB 브리딩
    for (let i = 0; i < _keycaps.length; i++) {
        const kc = _keycaps[i];
        if (kc.pressT < 0.5) {   // 눌림 애니(0.18s 반주기 사인)
            kc.pressT += delta;
            const dip = Math.max(0, Math.sin(Math.min(1, kc.pressT / 0.18) * Math.PI)) * 0.07;
            kc.body.position.y = kc.baseY - dip;
            kc.plate.position.y = kc.plateY - dip;
        }
        if (kc.glowState > 0.01) kc.glowState *= Math.exp(-3.2 * delta);
        else kc.glowState = 0;
        const breath = 0.06 + Math.sin(elapsed * 2 + i * 1.15) * 0.05;   // RGB 브리딩
        kc.body.material.emissiveIntensity = 0.1 + breath + kc.glowState * 1.7;
        kc.glow.material.opacity = 0.1 + breath * 0.8 + kc.glowState * 0.6;
        kc.plate.material.emissiveIntensity = 0.45 + kc.glowState * 0.9;
    }
    // 버터 말랑이: 밟으면 스퀴시(감쇠 진동) + 평상시 미세 숨쉬기 · 크러스트 깨지면 드립도 함께 사라짐
    for (let i = 0; i < _waxShells.length; i++) {
        const wx = _waxShells[i];
        if (!wx.butter) continue;
        let off = Math.sin(elapsed * 1.7 + i * 1.3) * 0.018;   // 숨쉬기(아주 미세)
        if (wx.squishT < 1.2) {
            wx.squishT += delta;
            off += -0.3 * Math.exp(-5 * wx.squishT) * Math.cos(12 * wx.squishT);   // 눌렸다 되튕기는 감쇠 진동
        }
        wx.butter.scale.set(1 - off * 0.55, 1 + off, 1 - off * 0.55);   // 눌리면 옆으로 퍼짐(부피 보존 느낌)
        if (wx.broken && wx.dripFade > 0) {
            wx.dripFade = Math.max(0, wx.dripFade - delta * 1.6);
            wx.dripMat.transparent = true;
            wx.dripMat.opacity = wx.dripFade;
            if (wx.dripFade === 0) for (const d of wx.drips) d.visible = false;
        }
    }
    // 퐁실 푸딩: 평상시 탱글 숨쉬기 + 밟으면 눌렸다 되튕기는 젤리 출렁(감쇠 진동·좌우 살랑)
    for (const pd of _puddings) {
        let sy = 1 + Math.sin(elapsed * 2.2 + pd.phase * 2.1) * 0.03;
        let lean = Math.sin(elapsed * 1.6 + pd.phase * 1.7) * 0.02;
        if (pd.wobbleT < 1.5) {
            pd.wobbleT += delta;
            const osc = Math.exp(-4 * pd.wobbleT);
            sy += -0.34 * osc * Math.cos(13 * pd.wobbleT);
            lean += 0.09 * osc * Math.sin(10 * pd.wobbleT);
        }
        const sxz = 1 - (sy - 1) * 0.65;               // 눌리면 옆으로 퍼짐(부피 보존 느낌)
        pd.jelly.scale.set(sxz, sy, sxz);
        pd.jelly.rotation.z = lean;
        pd.jelly.rotation.x = lean * 0.6;
    }
    // 금 간 셸: 타이머마다 큐에서 조각을 하나씩 떼어내고, 떨어지는 조각의 물리를 갱신
    for (const wx of _waxShells) {
        if (!wx.broken) continue;
        if (wx.queue.length) {
            wx.timer -= delta;
            while (wx.timer <= 0 && wx.queue.length) {
                _detachPiece(wx.pieces[wx.queue.shift()]);
                // 조각 수와 무관하게 전체 탈락이 ~2초 안에 끝나도록 간격 스케일
                wx.timer += (2.0 / wx.pieces.length) * (0.5 + Math.random());
            }
        }
        for (const pc of wx.pieces) {
            if (pc.state !== 1) continue;
            pc.age += delta;
            const m = pc.mesh;
            if (pc.age >= pc.life) {
                pc.state = 2; m.visible = false;
                pc.mat.opacity = 1; pc.mat.transparent = false;    // 리셋 대비 원상 복구
                continue;
            }
            pc.vy -= 10 * delta;                       // 왁스 덩어리 — 가볍게 툭 떨어짐
            m.position.x += pc.vx * delta;
            m.position.y += pc.vy * delta;
            m.position.z += pc.vz * delta;
            m.rotation.x += pc.rx * delta;
            m.rotation.z += pc.rz * delta;
            const k = pc.age / pc.life;
            if (k > 0.55) {
                pc.mat.transparent = true;
                pc.mat.opacity = 1 - (k - 0.55) / 0.45;
            }
        }
    }
    // 파편: 중력 낙하 + 회전, 수명 후반 40% 페이드 아웃 → 제거·dispose
    for (let i = _shards.length - 1; i >= 0; i--) {
        const s = _shards[i];
        s.age += delta;
        if (s.age >= s.life) {
            if (s.mesh.parent) s.mesh.parent.remove(s.mesh);
            s.mat.dispose();
            _shards.splice(i, 1);
            continue;
        }
        s.vy -= 14 * delta;                        // 왁스 조각 — 가볍게 톡톡 떨어지는 중력
        s.mesh.position.x += s.vx * delta;
        s.mesh.position.y += s.vy * delta;
        s.mesh.position.z += s.vz * delta;
        s.mesh.rotation.x += s.rx * delta;
        s.mesh.rotation.z += s.rz * delta;
        const k = s.age / s.life;
        if (k > 0.6) s.mat.opacity = 1 - (k - 0.6) / 0.4;
    }
}
