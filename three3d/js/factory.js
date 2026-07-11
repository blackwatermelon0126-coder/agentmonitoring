// ============================================
// CTR 창원 1공장 — ITR / OTR 조립 라인
// ============================================
import * as THREE from 'three';
import { createDetailedPerson } from './character.js';

// ---- 공장 레이아웃 상수 ----
// 공장은 로컬 좌표에서 정면(+z)을 향해 만들어지며, createFactory에서
// 그룹을 -90도 회전하여 월드 좌표에서 정면이 동쪽(+x)을 향하게 한다.
const FACTORY = {
    cx: 0,        // 중심 x (로컬, 회전 전)
    cz: 0,        // 중심 z (로컬, 회전 전)
    w: 28,        // 너비 (x)
    d: 14,        // 깊이 (z, 정면 = +d/2)
    h: 5          // 높이
};
// 월드에서 공장 그룹이 배치될 위치 (오피스 앞쪽, 약간 우측)
const FACTORY_WORLD_POS = { x: -22, z: 18 };  // 왼쪽 아래 (왼쪽=-x, 아래=+z 카메라쪽)
const FACTORY_WORLD_ROT_Y = Math.PI / 2;       // 정면을 -x(서쪽)으로 — 이전과 반대편

const LINE_Z = {
    ITR: FACTORY.cz - 3,   // -19
    OTR: FACTORY.cz + 3    // -13
};

// 라인 따라 흐르는 구간 (x 좌표)
const FLOW = {
    start: -10,
    inputEnd: -4,
    agingStart: -4,
    agingEnd: 4,
    outputStart: 4,
    end: 10
};

const CONVEYOR_Y = 0.5;        // 컨베이어 벨트 윗면 높이
const PRODUCT_SPEED = 1.0;     // m/s

// 애니메이션 대상
const products = [];
const robotArms = [];
const agingChambers = [];
const popMonitors = [];
const popScreens = [];        // 클릭 가능한 POP 화면/베젤 메쉬 (레이캐스트 픽 대상) — scene.js가 getPopScreens()로 조회
const lineAnchors = [];       // 라인별 홀로그램 HUD 앵커(월드 좌표 계산용) — scene.js getLineAnchors()로 조회
// 라인 식별 메타 (ITR/OTR 물리 라인 → 라인번호·이름·액센트색). 멀티라인 HUD 구분용.
const LINE_META = {
    ITR: { lineId: '2151', lineName: '엔드모듈라인',   accent: '#4C8DFF' },
    OTR: { lineId: '2152', lineName: '엔드모듈라인 2', accent: '#35C275' },
};
const porters = [];          // 자재 운반 작업자 (왼쪽 입력): { person, line, lineZ, idleX, pickupX, z, faceY, carryBox, phaseStart }
const inspectors = [];       // 검수 작업자 (오른쪽 입력): { person, line, x, z, faceY, phase }

// ── 물류(팔레트·지게차·AGV) 상태 ──
const lifts = [];            // 소모 시 컨베이어로 올라가는 유닛 박스 애니메이션
const lineStaging = { ITR: [], OTR: [] };   // 라인별 투입 팔레트(최대 2). 각 팔레트 units=2.
let forkliftObj = null, agvObj = null;
const consumeTimer = { ITR: 2.0, OTR: 3.2 };   // 라인별 소모 카운트다운(초)
// 물류 좌표(로컬): 서쪽 도크에서 지게차 하역 → AGV가 라인 투입부 슬롯으로 운반.
const DOCK_X = -13.0;                          // 하역 도크 x
const STAGE_X = [-9.2, -8.2];                  // 라인 투입 팔레트 2슬롯 x
const LINE_Z_LIST = [['ITR', -3], ['OTR', 3]];

// 헬퍼
function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
        color, roughness: 0.6, metalness: 0.2, ...opts
    });
}
function box(w, h, d, color, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
}
function cyl(rT, rB, h, color, seg = 16, opts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, seg), mat(color, opts));
    m.castShadow = true; m.receiveShadow = true;
    return m;
}

// ============================================
// 캔버스 텍스처 (간판, POP 모니터)
// ============================================
function makeSignTexture(title, subtitle, bg = '#1565C0', fg = '#FFFFFF') {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const ctx = c.getContext('2d');
    // 배경 그라데이션
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, bg);
    g.addColorStop(1, '#0D47A1');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    // 테두리
    ctx.strokeStyle = '#FFCC00';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 1008, 240);
    // 제목
    ctx.fillStyle = fg;
    ctx.font = 'bold 96px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 512, subtitle ? 100 : 128);
    if (subtitle) {
        ctx.font = 'bold 56px sans-serif';
        ctx.fillStyle = '#FFEB3B';
        ctx.fillText(subtitle, 512, 188);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    return tex;
}

function makePopScreenTexture(label) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 384;
    const ctx = c.getContext('2d');
    // 어두운 배경
    ctx.fillStyle = '#0a1929';
    ctx.fillRect(0, 0, 512, 384);
    // 헤더
    ctx.fillStyle = '#1565C0';
    ctx.fillRect(0, 0, 512, 48);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CTR POP System', 14, 33);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#FFEB3B';
    ctx.textAlign = 'right';
    ctx.fillText(label, 498, 33);
    // 데이터 행
    const rows = [
        ['LOT', 'CT-2026-0524-A'],
        ['MODEL', 'ITR/OTR HYBRID'],
        ['QTY', '128 / 500'],
        ['STATUS', 'RUNNING'],
        ['CYCLE', '14.2 s'],
        ['UPH', '256']
    ];
    ctx.font = '20px monospace';
    rows.forEach((r, i) => {
        const y = 90 + i * 42;
        ctx.fillStyle = '#5fb3f0';
        ctx.textAlign = 'left';
        ctx.fillText(r[0], 24, y);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(r[1], 488, y);
        ctx.strokeStyle = '#1a3550';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(24, y + 8); ctx.lineTo(488, y + 8); ctx.stroke();
    });
    // 하단 배지
    ctx.fillStyle = '#2e7d32';
    ctx.fillRect(24, 344, 120, 28);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ONLINE', 84, 363);
    return new THREE.CanvasTexture(c);
}

// ============================================
// 공장 건물 (격납고)
// ============================================
function buildShell(group) {
    const { cx, cz, w, d, h } = FACTORY;

    // 바닥 (콘크리트)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshStandardMaterial({ color: 0xB0B0B0, roughness: 0.85, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.03, cz);
    floor.receiveShadow = true;
    group.add(floor);

    // 바닥 안전선 (노란 줄)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFD600 });
    [LINE_Z.ITR, LINE_Z.OTR].forEach(lz => {
        for (const off of [-0.9, 0.9]) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, 0.08), lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(cx, 0.04, lz + off);
            group.add(line);
        }
    });

    // 외벽 — 통유리 (커튼월) + 알루미늄 프레임
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xE3F2FD, transparent: true, opacity: 0.18,
        transmission: 0.92, roughness: 0.04, metalness: 0.0,
        ior: 1.5, thickness: 0.1, side: THREE.DoubleSide
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xCFCFD3, metalness: 0.7, roughness: 0.3 });
    function glassWall(ww, wh, wd, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), glassMat);
        m.position.set(x, y, z);
        group.add(m);
        return m;
    }
    function frameBeam(ww, wh, wd, x, y, z) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), frameMat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        group.add(m);
        return m;
    }
    // 뒷벽 유리 (z = cz - d/2)
    glassWall(w, h, 0.08, cx, h / 2, cz - d / 2);
    // 좌벽 유리 (x = cx - w/2)
    glassWall(0.08, h, d, cx - w / 2, h / 2, cz);
    // 우벽 유리 (x = cx + w/2)
    glassWall(0.08, h, d, cx + w / 2, h / 2, cz);
    // 정면 유리 (z = cz + d/2) — 통창
    glassWall(w, h, 0.08, cx, h / 2, cz + d / 2);

    // 알루미늄 프레임 (외곽선 — 4면 둘레)
    // 상단/하단 가로 보 (앞/뒤)
    for (const zo of [-d / 2, d / 2]) {
        frameBeam(w, 0.14, 0.14, cx, h, cz + zo);              // 상단
        frameBeam(w, 0.10, 0.14, cx, 0.05, cz + zo);           // 하단
    }
    // 상단/하단 가로 보 (좌/우)
    for (const xo of [-w / 2, w / 2]) {
        frameBeam(0.14, 0.14, d, cx + xo, h, cz);
        frameBeam(0.14, 0.10, d, cx + xo, 0.05, cz);
    }
    // 코너 수직 기둥
    for (const xo of [-w / 2, w / 2]) {
        for (const zo of [-d / 2, d / 2]) {
            frameBeam(0.14, h, 0.14, cx + xo, h / 2, cz + zo);
        }
    }
    // 정면 수직 멀리언 (창틀 분할)
    for (let i = 1; i < 6; i++) {
        const xPos = cx - w / 2 + (i * w / 6);
        frameBeam(0.08, h - 0.2, 0.08, xPos, h / 2, cz + d / 2);
    }
    // 측면 수직 멀리언
    for (const xo of [-w / 2, w / 2]) {
        for (let i = 1; i < 4; i++) {
            const zPos = cz - d / 2 + (i * d / 4);
            frameBeam(0.08, h - 0.2, 0.08, cx + xo, h / 2, zPos);
        }
    }
    // 정면 상단 간판 띠 (불투명, 간판 부착용)
    const headerMat = new THREE.MeshStandardMaterial({ color: 0x0D47A1, roughness: 0.5, metalness: 0.3 });
    const header = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.18), headerMat);
    header.position.set(cx, h - 0.5, cz + d / 2);
    header.castShadow = true;
    group.add(header);

    // 트러스 지붕 (강철 보)
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x6c7a89, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 7; i++) {
        const xPos = cx - w / 2 + (i + 0.5) * (w / 7);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, d), trussMat);
        beam.position.set(xPos, h - 0.1, cz);
        group.add(beam);
    }
    // 종방향 보
    for (const zo of [-d / 3, 0, d / 3]) {
        const beam2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.12), trussMat);
        beam2.position.set(cx, h - 0.05, cz + zo);
        group.add(beam2);
    }

    // 천장 조명 (형광등 4개)
    for (let i = 0; i < 4; i++) {
        const xPos = cx - w / 2 + 4 + i * 6;
        const fluo = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 0.08, 0.3),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff8e0, emissiveIntensity: 1.2 })
        );
        fluo.position.set(xPos, h - 0.25, cz);
        group.add(fluo);
        const pl = new THREE.PointLight(0xfff8e0, 2.0, 12, 1.2);
        pl.position.set(xPos, h - 0.5, cz);
        group.add(pl);
    }

    // 정면 간판 "CTR 창원 1공장"
    const signTex = makeSignTexture('CTR 창원 1공장', 'CHANGWON FACTORY #1', '#0D47A1');
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 2.0),
        new THREE.MeshBasicMaterial({ map: signTex })
    );
    sign.position.set(cx, h - 0.5, cz + d / 2 + 0.15);
    group.add(sign);

    // 진입 표시 (바닥 화살표 — 정면)
    const entryMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const entry = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.25), entryMat);
    entry.rotation.x = -Math.PI / 2;
    entry.position.set(cx, 0.05, cz + d / 2 + 1.5);
    group.add(entry);
}

// ============================================
// 컨베이어 벨트
// ============================================
function buildConveyor(group, lineZ, lineLabel) {
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.95 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x90A4AE, metalness: 0.7, roughness: 0.3 });
    const rollerMat = new THREE.MeshStandardMaterial({ color: 0x37474F, metalness: 0.8, roughness: 0.4 });

    const beltLen = FLOW.end - FLOW.start; // 20m
    const cx = (FLOW.start + FLOW.end) / 2;

    // 벨트 윗면
    const belt = new THREE.Mesh(
        new THREE.BoxGeometry(beltLen, 0.04, 0.8),
        beltMat
    );
    belt.position.set(cx, CONVEYOR_Y, lineZ);
    belt.receiveShadow = true; belt.castShadow = true;
    group.add(belt);

    // 프레임 (양쪽 측면)
    for (const zo of [-0.5, 0.5]) {
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(beltLen, 0.35, 0.08),
            frameMat
        );
        frame.position.set(cx, CONVEYOR_Y - 0.15, lineZ + zo);
        frame.castShadow = true;
        group.add(frame);
    }

    // 다리 (5개 위치)
    const legMat = frameMat;
    for (let i = 0; i < 6; i++) {
        const xLeg = FLOW.start + (i * beltLen) / 5;
        for (const zo of [-0.4, 0.4]) {
            const leg = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, CONVEYOR_Y - 0.05, 0.08),
                legMat
            );
            leg.position.set(xLeg, (CONVEYOR_Y - 0.05) / 2, lineZ + zo);
            leg.castShadow = true;
            group.add(leg);
        }
    }

    // 롤러 (벨트 양 끝)
    for (const xo of [FLOW.start - 0.05, FLOW.end + 0.05]) {
        const r = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 1.0, 16),
            rollerMat
        );
        r.rotation.x = Math.PI / 2;
        r.position.set(xo, CONVEYOR_Y - 0.02, lineZ);
        group.add(r);
    }

    // 라인 라벨
    const labelTex = makeSignTexture(lineLabel, 'ASSEMBLY LINE', lineLabel === 'ITR' ? '#E65100' : '#1565C0');
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 0.55),
        new THREE.MeshBasicMaterial({ map: labelTex })
    );
    label.position.set(FLOW.start - 0.5, 2.0, lineZ);
    label.rotation.y = Math.PI / 2;
    group.add(label);
}

// ============================================
// 에이징 챔버 (큰 박스 + 글로우)
// ============================================
function buildAgingChamber(group, lineZ, lineLabel) {
    const cx = (FLOW.agingStart + FLOW.agingEnd) / 2;
    const len = FLOW.agingEnd - FLOW.agingStart; // 8m

    // 외부 케이스
    const caseMat = new THREE.MeshStandardMaterial({
        color: 0x37474F, roughness: 0.5, metalness: 0.6
    });
    const caseTop = new THREE.Mesh(
        new THREE.BoxGeometry(len, 1.6, 1.6),
        caseMat
    );
    caseTop.position.set(cx, CONVEYOR_Y + 0.85, lineZ);
    caseTop.castShadow = true;
    group.add(caseTop);

    // 유리창 (양 측면)
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xFFB300, transparent: true, opacity: 0.45,
        transmission: 0.6, roughness: 0.1, ior: 1.4,
        emissive: 0xFF6F00, emissiveIntensity: 0.4
    });
    for (const zo of [-0.81, 0.81]) {
        const win = new THREE.Mesh(
            new THREE.PlaneGeometry(len - 0.6, 1.0),
            glassMat
        );
        win.position.set(cx, CONVEYOR_Y + 0.85, lineZ + zo);
        win.rotation.y = zo > 0 ? Math.PI : 0;
        group.add(win);
    }

    // 내부 LED (애니메이션 대상)
    const led = new THREE.PointLight(0xff8a3d, 3.0, 6, 1.5);
    led.position.set(cx, CONVEYOR_Y + 1.0, lineZ);
    group.add(led);
    agingChambers.push({ light: led, baseIntensity: 3.0, phase: Math.random() * Math.PI * 2 });

    // 라벨 패널
    const lblTex = makeSignTexture('AGING', '120 ℃ / 24 h', '#BF360C');
    const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 0.45),
        new THREE.MeshBasicMaterial({ map: lblTex })
    );
    lbl.position.set(cx, CONVEYOR_Y + 1.75, lineZ + 0.85);
    group.add(lbl);

    // 입구/출구 슬릿 (어두운 직사각형)
    for (const xo of [FLOW.agingStart, FLOW.agingEnd]) {
        const slit = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.5),
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        slit.position.set(xo + (xo < cx ? 0.005 : -0.005), CONVEYOR_Y + 0.35, lineZ);
        slit.rotation.y = xo < cx ? Math.PI / 2 : -Math.PI / 2;
        group.add(slit);
    }
}

// ============================================
// 자재 / 완성품 작업대
// ============================================
function buildWorkstation(group, x, lineZ, kind) {
    // kind: 'input' | 'output'
    const deskMat = new THREE.MeshStandardMaterial({ color: 0xCFD8DC, metalness: 0.4, roughness: 0.5 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.7), deskMat);
    desk.position.set(x, 0.45, lineZ + (kind === 'input' ? -1.6 : 1.6));
    desk.castShadow = true;
    group.add(desk);

    // 자재 박스 / 완성품 박스 더미
    const boxColor = kind === 'input' ? 0xC68B5C : 0x4CAF50;
    for (let i = 0; i < 4; i++) {
        const xo = -0.55 + (i % 2) * 0.55;
        const yo = 0.9 + Math.floor(i / 2) * 0.32;
        const zo = (kind === 'input' ? -1.6 : 1.6) + (Math.random() - 0.5) * 0.15;
        const b = box(0.45, 0.3, 0.45, boxColor);
        b.position.set(x + xo, yo + 0.05, lineZ + zo);
        group.add(b);
    }

    // 작업대 위 안내 표지
    const sigTex = makeSignTexture(
        kind === 'input' ? '자재 투입' : '완성품',
        kind === 'input' ? 'MATERIAL IN' : 'FINISHED OUT',
        kind === 'input' ? '#37474F' : '#1B5E20'
    );
    const sig = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.32),
        new THREE.MeshBasicMaterial({ map: sigTex })
    );
    sig.position.set(x, 1.45, lineZ + (kind === 'input' ? -1.26 : 1.26));
    sig.rotation.y = kind === 'input' ? 0 : Math.PI;
    group.add(sig);
}

// ============================================
// 로봇 팔
// ============================================
function buildRobotArm(group, x, lineZ, side, color = 0xFF9800) {
    // side: -1 (앞쪽, z 작음) or +1 (뒤쪽, z 큼)
    const arm = new THREE.Group();
    const zOff = side * 1.05;
    arm.position.set(x, 0, lineZ + zOff);

    // 받침대 (원기둥)
    const base = cyl(0.32, 0.36, 0.25, 0x424242, 16, { metalness: 0.7, roughness: 0.3 });
    base.position.y = 0.125;
    arm.add(base);

    // 하단 회전축
    const pivot = cyl(0.18, 0.18, 0.3, color, 12);
    pivot.position.y = 0.4;
    arm.add(pivot);

    // 1단 팔 (긴 실린더)
    const upperPivot = new THREE.Group();
    upperPivot.position.y = 0.55;
    arm.add(upperPivot);
    const upper = cyl(0.1, 0.13, 1.1, color, 12);
    upper.position.y = 0.55;
    upper.rotation.z = -0.4; // 살짝 기울임
    upperPivot.add(upper);

    // 2단 팔 (관절 + 실린더)
    const elbow = new THREE.Group();
    elbow.position.set(-0.4, 1.05, 0);
    upperPivot.add(elbow);
    const joint = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.8, roughness: 0.2 })
    );
    elbow.add(joint);
    const forearm = cyl(0.08, 0.1, 0.85, color, 12);
    forearm.position.set(0.3, -0.05, 0);
    forearm.rotation.z = Math.PI / 2 + 0.5;
    elbow.add(forearm);

    // 그리퍼 (집게)
    const tcp = new THREE.Group();
    tcp.position.set(0.75, -0.35, 0);
    elbow.add(tcp);
    const wrist = cyl(0.06, 0.06, 0.15, 0x212121, 8);
    wrist.rotation.z = Math.PI / 2;
    tcp.add(wrist);
    for (const yo of [-0.07, 0.07]) {
        const finger = box(0.04, 0.18, 0.04, 0xE0E0E0);
        finger.position.set(0.12, yo, 0);
        tcp.add(finger);
    }

    // LED (애니메이션)
    const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00E676 })
    );
    led.position.set(0, 0.18, 0.13);
    pivot.add(led);

    // 정면 향하도록 회전 (라인 향함)
    arm.rotation.y = side > 0 ? Math.PI : 0;
    group.add(arm);

    robotArms.push({
        group: arm,
        upperPivot,
        elbow,
        tcp,
        led,
        phase: Math.random() * Math.PI * 2,
        speed: 0.7 + Math.random() * 0.6
    });
}

// ============================================
// POP 시스템 단말기
// ============================================
function buildPopTerminal(group, x, z, label) {
    const term = new THREE.Group();
    term.position.set(x, 0, z);

    // 받침대 (회색 박스)
    const base = box(0.9, 1.05, 0.55, 0x37474F, { metalness: 0.5, roughness: 0.5 });
    base.position.y = 0.525;
    term.add(base);

    // 키보드 영역 (경사판)
    const kb = box(0.85, 0.05, 0.32, 0x263238);
    kb.position.set(0, 1.07, 0.06);
    kb.rotation.x = -0.25;
    term.add(kb);

    // 모니터 스탠드
    const stand = box(0.08, 0.45, 0.08, 0x212121);
    stand.position.set(0, 1.32, -0.18);
    term.add(stand);

    // 모니터 (베젤)
    const monBezel = box(1.05, 0.75, 0.06, 0x111111);
    monBezel.position.set(0, 1.65, -0.18);
    monBezel.rotation.x = -0.15;
    term.add(monBezel);

    // 화면 (캔버스 텍스처)
    const screenTex = makePopScreenTexture(label);
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.65),
        new THREE.MeshBasicMaterial({ map: screenTex })
    );
    screen.position.set(0, 1.65, -0.14);
    screen.rotation.x = -0.15;
    term.add(screen);

    // 클릭 상호작용: 화면·베젤을 POP 픽 대상으로 등록(아바타가 앞에서 클릭 → 실제 POP 모달).
    screen.userData.popScreen = true;   screen.userData.popLabel = label;
    monBezel.userData.popScreen = true; monBezel.userData.popLabel = label;
    popScreens.push(screen, monBezel);

    // 바코드 스캐너 (상단)
    const scanner = box(0.18, 0.1, 0.08, 0x1A1A1A);
    scanner.position.set(0.36, 1.12, 0.25);
    term.add(scanner);
    const laser = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.01),
        new THREE.MeshBasicMaterial({ color: 0xFF1744 })
    );
    laser.position.set(0.36, 1.07, 0.30);
    laser.rotation.x = -Math.PI / 2;
    term.add(laser);

    // 단말기 상단 표시등
    const ind = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00E676 })
    );
    ind.position.set(-0.4, 1.1, 0.25);
    term.add(ind);

    group.add(term);
    popMonitors.push({ ind, phase: Math.random() * Math.PI * 2 });
}

// ============================================
// 작업자 (안전복 + 헬멧)
// ============================================
function buildWorker(group, x, z, ry = 0, helmetColor = 0xFFEB3B) {
    const traits = {
        gender: Math.random() > 0.3 ? 'male' : 'female',
        skinColor: 0xFFCC99,
        hairColor: 0x3E2723,
        shirtColor: Math.random() > 0.5 ? 0xFF9800 : 0xFFC107, // 안전 주황
        pantsColor: 0x263238,
        shoeColor: 0x212121,
        hairStyle: 'short'
    };
    const personObj = createDetailedPerson(traits);
    const person = personObj.group;
    person.position.set(x, 0, z);
    person.rotation.y = ry;
    person.scale.set(0.95, 0.95, 0.95);

    // 헬멧 추가 (머리 위) — head는 pelvis>torso>neck>headGroup 안에 있어서
    // 월드 위치 기준으로 person 그룹에 직접 부착
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.4, metalness: 0.1 })
    );
    helmet.position.y = 1.85;
    helmet.castShadow = true;
    person.add(helmet);
    // 헬멧 챙
    const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.025, 16),
        new THREE.MeshStandardMaterial({ color: helmetColor })
    );
    brim.position.y = 1.79;
    brim.position.z = 0.04;
    person.add(brim);

    group.add(person);
    return personObj;
}

// ============================================
// 흐르는 제품 (컨베이어 위)
// ============================================
function spawnProducts(group) {
    // 각 라인에 4개씩 초기 배치 (간격 두고)
    for (const [lineName, lineZ] of Object.entries(LINE_Z)) {
        for (let i = 0; i < 4; i++) {
            const p = createProductMesh(lineName);
            const x = FLOW.start + (i * (FLOW.end - FLOW.start)) / 4 + Math.random() * 0.5;
            p.position.set(x, CONVEYOR_Y + 0.13, lineZ);
            group.add(p);
            products.push({
                mesh: p,
                lineZ,
                lineName,
                x,
                holdUntil: 0,   // 에이징에서 멈추는 시간
                state: 'flowing' // 'flowing' | 'aging'
            });
        }
    }
}

function createProductMesh(lineName) {
    const isITR = lineName === 'ITR';
    const g = new THREE.Group();
    // 본체
    const body = box(
        0.5, 0.22, 0.5,
        isITR ? 0xFF7043 : 0x42A5F5,
        { metalness: 0.3, roughness: 0.45 }
    );
    body.position.y = 0.11;
    g.add(body);
    // 상단 라벨
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.36, 0.1),
        new THREE.MeshBasicMaterial({ color: isITR ? 0xFFFFFF : 0xFFFFFF })
    );
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.225;
    g.add(label);
    // 라벨 텍스트
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 128; texCanvas.height = 32;
    const ctx = texCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = isITR ? '#BF360C' : '#0D47A1';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lineName, 64, 17);
    const tex = new THREE.CanvasTexture(texCanvas);
    label.material.map = tex;
    label.material.needsUpdate = true;
    return g;
}

// ============================================
// 물류 (팔레트 · 지게차 · AGV)  — STEP2
// ============================================
let logisticsGroup = null;   // 팔레트 재부모용(=factory group)

/** 팔레트 1개: 나무 받침 + 유닛 박스 2개(소모 시 하나씩 숨김). units=2. */
function makePallet() {
    const g = new THREE.Group();
    const deck = box(1.0, 0.08, 0.8, 0x8D6E63); deck.position.y = 0.16; g.add(deck);
    for (let i = -1; i <= 1; i++) { const sk = box(0.14, 0.16, 0.8, 0x6D4C41); sk.position.set(i * 0.4, 0.08, 0); g.add(sk); }
    const cargo = [];
    for (let i = 0; i < 2; i++) {
        const c = box(0.42, 0.42, 0.62, 0xB0BEC5, { roughness: 0.85 });
        c.position.set(-0.24 + i * 0.48, 0.41, 0); g.add(c); cargo.push(c);
        const strap = box(0.44, 0.03, 0.64, 0x455A64); strap.position.set(-0.24 + i * 0.48, 0.5, 0); g.add(strap);
        c.userData.strap = strap;
    }
    return { group: g, units: 2, cargo };
}

/** 지게차(포크리프트): 노란 차체 + 롤케이지 + 마스트/포크 + 바퀴. carriage로 리프트 애니메이션. */
function makeForklift() {
    const g = new THREE.Group();
    const bodyM = box(0.9, 0.55, 1.4, 0xFDD835); bodyM.position.y = 0.5; g.add(bodyM);
    const counter = box(0.9, 0.35, 0.5, 0xF9A825); counter.position.set(0, 0.75, -0.55); g.add(counter);
    for (const xo of [-0.38, 0.38]) for (const zo of [-0.1, 0.5]) { const p = box(0.05, 0.9, 0.05, 0x424242); p.position.set(xo, 1.15, zo); g.add(p); }
    const roof = box(0.85, 0.06, 0.7, 0x424242); roof.position.set(0, 1.6, 0.2); g.add(roof);
    const mast = new THREE.Group(); mast.position.set(0, 0, 0.75);
    for (const xo of [-0.3, 0.3]) { const bar = box(0.06, 1.5, 0.06, 0x616161); bar.position.set(xo, 0.75, 0); mast.add(bar); }
    const carriage = new THREE.Group();
    for (const xo of [-0.22, 0.22]) { const fork = box(0.08, 0.05, 0.7, 0x9E9E9E); fork.position.set(xo, 0, 0.35); carriage.add(fork); }
    carriage.position.y = 0.25; mast.add(carriage); g.add(mast);
    for (const xo of [-0.42, 0.42]) for (const zo of [-0.45, 0.45]) { const w = cyl(0.22, 0.22, 0.16, 0x212121, 12); w.rotation.z = Math.PI / 2; w.position.set(xo, 0.22, zo); g.add(w); }
    return { group: g, carriage };
}

/** AGV(무인 물류 로봇): 낮은 플랫폼 + 발광 LED + 바퀴. 팔레트를 위에 얹어 운반. */
function makeAGV() {
    const g = new THREE.Group();
    const plat = box(1.1, 0.28, 1.3, 0x263238, { metalness: 0.6, roughness: 0.4 }); plat.position.y = 0.24; g.add(plat);
    const led = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 1.36), new THREE.MeshStandardMaterial({ color: 0x00E5FF, emissive: 0x00E5FF, emissiveIntensity: 0.9 }));
    led.position.y = 0.37; g.add(led);
    const top = box(1.0, 0.06, 1.15, 0x37474F); top.position.y = 0.43; g.add(top);
    for (const xo of [-0.5, 0.5]) for (const zo of [-0.5, 0.5]) { const w = cyl(0.16, 0.16, 0.12, 0x111111, 10); w.rotation.z = Math.PI / 2; w.position.set(xo, 0.16, zo); g.add(w); }
    return { group: g, carried: null, state: 'idle', target: null, t: 0, _slot: 0, led };
}

/** 물류 설비 배치: 도크·공급 스택·지게차·AGV + 라인별 초기 팔레트 2개. */
function buildLogistics(group) {
    logisticsGroup = group;
    const dock = box(3.2, 0.05, 6, 0x455A64); dock.position.set(DOCK_X, 0.03, 0); group.add(dock);
    for (let i = 0; i < 2; i++) { const p = makePallet(); p.group.position.set(DOCK_X - 0.5, i * 0.5, -1.7); group.add(p.group); }  // 공급 스택(시각)
    forkliftObj = makeForklift(); forkliftObj.group.position.set(DOCK_X + 0.3, 0, 1.7); forkliftObj.group.rotation.y = Math.PI / 2; group.add(forkliftObj.group);
    agvObj = makeAGV(); agvObj.group.position.set(DOCK_X + 1.5, 0, 0); group.add(agvObj.group);
    for (const [ln, lz] of LINE_Z_LIST) {
        for (let s = 0; s < 2; s++) {
            const p = makePallet(); p.group.position.set(STAGE_X[s], 0, lz); group.add(p.group);
            p.slotX = STAGE_X[s]; p.lineZ = lz; lineStaging[ln].push(p);
        }
    }
}

/** obj를 (tx,tz)로 이동(진행방향 회전). 도착 시 true. */
function _moveXZ(o, tx, tz, spd, dt) {
    const dx = tx - o.position.x, dz = tz - o.position.z, d = Math.hypot(dx, dz);
    if (d < 0.06) return true;
    const step = Math.min(spd * dt, d);
    o.position.x += dx / d * step; o.position.z += dz / d * step;
    o.rotation.y = Math.atan2(dx, dz);
    return false;
}

/** 소모 시 컨베이어 시작쪽으로 올라가며 사라지는 유닛 박스 스폰. */
function _spawnLift(x, z) {
    const b = box(0.42, 0.42, 0.62, 0x90CAF9, { transparent: true, opacity: 1 });
    b.position.set(x, CONVEYOR_Y + 0.25, z);
    logisticsGroup.add(b);
    lifts.push({ mesh: b, sx: x, sz: z, t: 0 });
}

/** 매 프레임 물류 업데이트: 소모(라인별) + AGV 운반 + 지게차/리프트 애니메이션. */
function updateLogistics(delta, elapsed) {
    if (!logisticsGroup) return;

    // 1) 라인별 소모 — 팔레트 units 하나씩 소진(2번 올리면 그 팔레트 비워짐 → 제거)
    for (const [ln] of LINE_Z_LIST) {
        consumeTimer[ln] -= delta;
        if (consumeTimer[ln] <= 0) {
            consumeTimer[ln] = 3.5;
            const st = lineStaging[ln];
            if (st.length && st[0].units > 0) {
                const p = st[0], idx = p.units - 1, cbox = p.cargo[idx];
                if (cbox) { cbox.visible = false; if (cbox.userData.strap) cbox.userData.strap.visible = false; _spawnLift(p.slotX, p.lineZ); }
                p.units--;
                if (p.units <= 0) {                       // 팔레트 비워짐 → 제거 + 뒤 팔레트 당김
                    logisticsGroup.remove(p.group); st.shift();
                    if (st[0]) { st[0].group.position.x = STAGE_X[0]; st[0].slotX = STAGE_X[0]; }
                }
            }
        }
    }

    // 2) AGV 상태머신 — 부족한 라인에 팔레트 보충
    const a = agvObj;
    if (a) {
        if (a.state === 'idle') {
            let need = null;
            for (const [ln, lz] of LINE_Z_LIST) if (lineStaging[ln].length < 2) { need = { ln, lz }; break; }
            if (need) { a.state = 'toDock'; a.target = need; }
        } else if (a.state === 'toDock') {
            if (_moveXZ(a.group, DOCK_X + 1.5, 0, 2.6, delta)) { a.state = 'loading'; a.t = 1.0; }
        } else if (a.state === 'loading') {
            a.t -= delta;
            if (a.t <= 0) { const p = makePallet(); p.group.position.set(0, 0.46, 0); a.group.add(p.group); a.carried = p; a.state = 'toLine'; }
        } else if (a.state === 'toLine') {
            a._slot = lineStaging[a.target.ln].length;    // 다음 빈 슬롯
            if (a._slot > 1) { a.state = 'return'; }       // 그새 찼으면 복귀
            else if (_moveXZ(a.group, STAGE_X[a._slot], a.target.lz - 1.1, 2.6, delta)) { a.state = 'unloading'; a.t = 0.6; }
        } else if (a.state === 'unloading') {
            a.t -= delta;
            if (a.t <= 0) {
                const p = a.carried; a.group.remove(p.group);
                p.group.position.set(STAGE_X[a._slot], 0, a.target.lz);
                logisticsGroup.add(p.group); p.slotX = STAGE_X[a._slot]; p.lineZ = a.target.lz;
                lineStaging[a.target.ln].push(p); a.carried = null; a.state = 'return';
            }
        } else if (a.state === 'return') {
            if (_moveXZ(a.group, DOCK_X + 1.5, 0, 2.6, delta)) { a.state = 'idle'; }
        }
        a.led.material.emissiveIntensity = 0.6 + Math.sin(elapsed * 6) * 0.35;   // LED 점멸
    }

    // 3) 지게차 — 마스트 리프트 오르내림 + 소폭 왕복(작업 연출)
    if (forkliftObj) {
        forkliftObj.carriage.position.y = 0.25 + (Math.sin(elapsed * 1.1) * 0.5 + 0.5) * 0.95;
        forkliftObj.group.position.z = 1.7 + Math.sin(elapsed * 0.5) * 0.5;
    }

    // 4) 리프트 유닛 애니메이션(컨베이어로 올라가며 페이드)
    for (let i = lifts.length - 1; i >= 0; i--) {
        const L = lifts[i]; L.t += delta; const k = Math.min(1, L.t / 1.3);
        L.mesh.position.x = L.sx + (FLOW.start - L.sx) * k;
        L.mesh.position.y = CONVEYOR_Y + 0.25 + k * 0.5;
        L.mesh.material.opacity = 1 - k;
        if (k >= 1) { logisticsGroup.remove(L.mesh); lifts.splice(i, 1); }
    }
}

// ============================================
// 메인 빌더
// ============================================
/** 클릭 가능한 POP 화면/베젤 메쉬 목록 반환 (scene.js 레이캐스트용). createFactory 이후 유효. */
export function getPopScreens() { return popScreens; }

/** 라인별 HUD 앵커 목록 반환 [{lineId, lineName, accent, lineKey, obj}]. createFactory 이후 유효. */
export function getLineAnchors() { return lineAnchors; }

export function createFactory(scene) {
    const group = new THREE.Group();
    group.name = 'CTR_Factory';

    buildShell(group);

    // 두 라인 (ITR, OTR)
    for (const [lineName, lineZ] of Object.entries(LINE_Z)) {
        buildConveyor(group, lineZ, lineName);
        buildAgingChamber(group, lineZ, lineName);
        buildWorkstation(group, FLOW.start + 1.5, lineZ, 'input');
        buildWorkstation(group, FLOW.end - 1.5, lineZ, 'output');

        // 라인별 홀로그램 HUD 앵커 — 라인 투입부 위 허공 (scene.js가 월드좌표로 변환해 패널 배치)
        const _lineAnc = new THREE.Object3D();
        _lineAnc.position.set(FLOW.start + 1.0, 1.8, lineZ);
        group.add(_lineAnc);
        lineAnchors.push({ ...LINE_META[lineName], lineKey: lineName, obj: _lineAnc });

        // 로봇 팔: 투입쪽 2개, 에이징쪽 2개, 후반부 1개
        // 투입 (전반부): x = -7, -5
        buildRobotArm(group, -7, lineZ, -1, 0xFF9800);
        buildRobotArm(group, -5, lineZ,  1, 0xFF9800);
        // 에이징 (양쪽): 챔버 양 측 — x = -3.5(입구), 3.5(출구)
        buildRobotArm(group, -3.5, lineZ, -1, 0xFFC107);
        buildRobotArm(group,  3.5, lineZ,  1, 0xFFC107);
        // 후반부: x = 6
        buildRobotArm(group, 6, lineZ, -1, 0x4CAF50);

        // 작업자
        const helmetColors = [0xFFEB3B, 0xFF5252, 0x00BCD4];

        // === 투입 구역 ===
        // 라인별로 자재 큐(외부) 쪽 z를 정함 — 큐와 정렬된 작업자가 포터
        const isITR = lineName === 'ITR';
        // 포터(왼쪽): 자재 큐 ↔ 라인 컨베이어 시작점 왕복
        const porterZ      = lineZ + (isITR ? -2.0 : 2.0);
        const porterFaceY  = isITR ? 0 : Math.PI;
        const porterIdleX  = isITR ? -7 : -5;
        const porterPickupX = -11;     // 공장 외벽 바깥(자재 큐 영역)
        const porterObj = buildWorker(group, porterIdleX, porterZ, porterFaceY, helmetColors[0]);
        // 운반용 박스(처음엔 숨김)
        const carryColor = isITR ? 0xFF7043 : 0x42A5F5;
        const carryBox = box(0.45, 0.3, 0.45, carryColor);
        carryBox.position.set(0, 1.0, 0.4);   // 가슴 앞쪽
        carryBox.visible = false;
        porterObj.group.add(carryBox);
        porters.push({
            person: porterObj, line: lineName, lineZ,
            idleX: porterIdleX, pickupX: porterPickupX,
            z: porterZ, faceY: porterFaceY, carryBox,
            phaseStart: Math.random() * 6.0,
        });

        // 검수자(오른쪽): 라인 앞에 서서 지나가는 제품 검수
        const inspZ     = lineZ + (isITR ? 2.0 : -2.0);
        const inspFaceY = isITR ? Math.PI : 0;
        const inspX     = isITR ? -5 : -7;
        const inspObj = buildWorker(group, inspX, inspZ, inspFaceY, helmetColors[0]);
        inspectors.push({
            person: inspObj, line: lineName,
            x: inspX, z: inspZ, faceY: inspFaceY,
            phase: Math.random() * Math.PI * 2,
        });

        // 에이징 구역
        buildWorker(group, -3.5, lineZ + 2.0, Math.PI, helmetColors[1]);
        buildWorker(group,  3.5, lineZ - 2.0, 0, helmetColors[1]);
        // 후반부
        buildWorker(group, 6, lineZ - 2.0, 0, helmetColors[2]);
        buildWorker(group, 6, lineZ + 2.0, Math.PI, helmetColors[2]);
    }

    // POP 단말기: 자재 투입 쪽 1대 (왼쪽 중앙), 완성품 쪽 1대 (오른쪽 중앙)
    buildPopTerminal(group, FLOW.start + 0.5, FACTORY.cz, '자재 투입');
    buildPopTerminal(group, FLOW.end - 0.5, FACTORY.cz, '완성품 입고');

    // 물류(팔레트·지게차·AGV) — 자재가 팔레트로 하역 → AGV가 라인 투입부로 → 2팔레트 소모
    buildLogistics(group);

    // 흐르는 제품
    spawnProducts(group);

    // 그룹 전체를 월드 위치로 이동 + 90도 회전 (정면 → 동쪽)
    group.position.set(FACTORY_WORLD_POS.x, 0, FACTORY_WORLD_POS.z);
    group.rotation.y = FACTORY_WORLD_ROT_Y;

    scene.add(group);
    return group;
}

// ============================================
// 작업자 애니메이션 헬퍼
// ============================================
function resetPose(person) {
    const { pelvis, torso, neck, headGroup, armL, armR, legL, legR } = person;
    pelvis.position.y = 0.9;
    torso.rotation.set(0, 0, 0);
    neck.rotation.set(0, 0, 0);
    headGroup.rotation.set(0, 0, 0);
    armL.shoulder.rotation.set(0, 0, 0);
    armR.shoulder.rotation.set(0, 0, 0);
    armL.elbow.rotation.set(0, 0, 0);
    armR.elbow.rotation.set(0, 0, 0);
    armL.wrist.rotation.set(0, 0, 0);
    armR.wrist.rotation.set(0, 0, 0);
    legL.hip.rotation.set(0, 0, 0);
    legL.knee.rotation.set(0, 0, 0);
    legR.hip.rotation.set(0, 0, 0);
    legR.knee.rotation.set(0, 0, 0);
}

function poseWalk(person, time, carrying) {
    resetPose(person);
    const { pelvis, torso, armL, armR, legL, legR } = person;
    const speed = 8, stride = 0.5;
    legL.hip.rotation.x  = Math.sin(time * speed) * stride;
    legL.knee.rotation.x = Math.max(0, -Math.sin(time * speed) * stride * 1.5);
    legR.hip.rotation.x  = Math.sin(time * speed + Math.PI) * stride;
    legR.knee.rotation.x = Math.max(0, -Math.sin(time * speed + Math.PI) * stride * 1.5);
    pelvis.position.y    = 0.9 + Math.abs(Math.sin(time * speed)) * 0.05;
    torso.rotation.y     = Math.sin(time * speed) * 0.08;
    if (carrying) {
        // 양손으로 박스 안고 걷기
        armL.shoulder.rotation.x = -Math.PI / 2.1;
        armR.shoulder.rotation.x = -Math.PI / 2.1;
        armL.shoulder.rotation.z =  0.25;
        armR.shoulder.rotation.z = -0.25;
        armL.elbow.rotation.x = -0.35;
        armR.elbow.rotation.x = -0.35;
    } else {
        armL.shoulder.rotation.x = Math.sin(time * speed + Math.PI) * stride;
        armR.shoulder.rotation.x = Math.sin(time * speed) * stride;
        armL.elbow.rotation.x = -0.15;
        armR.elbow.rotation.x = -0.15;
    }
}

function poseBendPick(person, t01) {
    // t01: 0~1 진행도 (집는 동작)
    resetPose(person);
    const { torso, headGroup, armL, armR } = person;
    const bend = 0.6;
    torso.rotation.x   = bend;
    headGroup.rotation.x = 0.25;
    // 양손 앞으로 뻗어 박스 집기
    armL.shoulder.rotation.x = -Math.PI / 2.4;
    armR.shoulder.rotation.x = -Math.PI / 2.4;
    armL.elbow.rotation.x = -0.5 + Math.sin(t01 * Math.PI) * 0.3;
    armR.elbow.rotation.x = -0.5 + Math.sin(t01 * Math.PI) * 0.3;
}

function poseIdle(person, time) {
    resetPose(person);
    const { headGroup } = person;
    headGroup.rotation.y = Math.sin(time * 0.7) * 0.1;
}

function poseInspect(person, time, intensity) {
    resetPose(person);
    const { torso, headGroup, armL, armR } = person;
    if (intensity <= 0) {
        headGroup.rotation.y = Math.sin(time * 0.7) * 0.1;
        return;
    }
    const wobble = Math.sin(time * 6) * 0.08;
    torso.rotation.x       = 0.22 * intensity + wobble * 0.3;
    headGroup.rotation.x   = 0.32 * intensity;
    headGroup.rotation.y   = Math.sin(time * 3) * 0.15 * intensity;
    // 오른손: 제품 위 가리키며 손가락질
    armR.shoulder.rotation.x = -Math.PI / 2.2;
    armR.shoulder.rotation.z = -0.35;
    armR.elbow.rotation.x = -0.6 + Math.sin(time * 5) * 0.25 * intensity;
    // 왼손: 클립보드 든 듯 앞 가슴 높이
    armL.shoulder.rotation.x = -Math.PI / 3;
    armL.shoulder.rotation.z = 0.4;
    armL.elbow.rotation.x = -1.0;
}

// ============================================
// 매 프레임 업데이트
// ============================================
export function updateFactory(delta, elapsed) {
    updateLogistics(delta, elapsed);   // 팔레트·지게차·AGV·소모
    // 제품 흐름
    for (const p of products) {
        if (p.state === 'aging') {
            if (elapsed >= p.holdUntil) {
                p.state = 'flowing';
            } else {
                continue; // 멈춰 있음
            }
        }
        p.x += PRODUCT_SPEED * delta;
        // 에이징 진입
        if (p.state === 'flowing' && p.x >= FLOW.agingStart && p.x < FLOW.agingStart + 0.05) {
            p.state = 'aging';
            p.holdUntil = elapsed + 2.5; // 2.5초 대기
        }
        // 라인 끝 도달 → 시작점으로 순환
        if (p.x > FLOW.end + 0.5) {
            p.x = FLOW.start - 0.5;
        }
        p.mesh.position.x = p.x;
        // 살짝 흔들림 (현실감)
        p.mesh.position.y = CONVEYOR_Y + 0.13 + Math.sin(elapsed * 8 + p.x) * 0.005;
    }

    // 로봇 팔 애니메이션
    for (const arm of robotArms) {
        const t = elapsed * arm.speed + arm.phase;
        arm.group.rotation.y = (arm.group.rotation.y % (Math.PI * 2));
        arm.upperPivot.rotation.y = Math.sin(t) * 0.5;
        arm.elbow.rotation.z = Math.sin(t * 1.3) * 0.3;
        arm.tcp.rotation.x = Math.sin(t * 1.7) * 0.4;
        // LED 깜빡임
        const blink = (Math.sin(t * 4) + 1) / 2;
        arm.led.material.color.setRGB(0, 0.5 + blink * 0.5, 0.2 + blink * 0.2);
    }

    // 에이징 챔버 LED 펄스
    for (const ac of agingChambers) {
        const pulse = (Math.sin(elapsed * 2 + ac.phase) + 1) / 2;
        ac.light.intensity = ac.baseIntensity * (0.7 + pulse * 0.6);
    }

    // POP 표시등 펄스
    for (const pm of popMonitors) {
        const pulse = (Math.sin(elapsed * 3 + pm.phase) + 1) / 2;
        pm.ind.material.color.setRGB(0, 0.6 + pulse * 0.4, 0.3);
    }

    // === 자재 운반 작업자 (왼쪽 입력) ===
    const CYCLE = 7.0;
    const T_GO = 2.2, T_PICK = T_GO + 0.8, T_BACK = T_PICK + 2.2, T_DROP = T_BACK + 0.8;
    for (const p of porters) {
        const t = (elapsed + p.phaseStart) % CYCLE;
        let x, ry, carrying, phase, t01;
        if (t < T_GO) {
            phase = 'go';
            const f = t / T_GO;
            x = p.idleX + (p.pickupX - p.idleX) * f;
            ry = -Math.PI / 2;   // -x 방향 향함 (자재 큐 쪽)
            carrying = false;
        } else if (t < T_PICK) {
            phase = 'pick';
            x = p.pickupX;
            ry = -Math.PI / 2;
            t01 = (t - T_GO) / (T_PICK - T_GO);
            carrying = t01 > 0.5;
        } else if (t < T_BACK) {
            phase = 'back';
            const f = (t - T_PICK) / (T_BACK - T_PICK);
            x = p.pickupX + (p.idleX - p.pickupX) * f;
            ry = Math.PI / 2;    // +x 방향 (라인 쪽)
            carrying = true;
        } else if (t < T_DROP) {
            phase = 'drop';
            x = p.idleX;
            ry = p.faceY;        // 라인 정면
            t01 = (t - T_BACK) / (T_DROP - T_BACK);
            carrying = t01 < 0.5;
        } else {
            phase = 'idle';
            x = p.idleX;
            ry = p.faceY;
            carrying = false;
        }
        p.person.group.position.x = x;
        p.person.group.rotation.y = ry;
        p.carryBox.visible = carrying;

        if (phase === 'go' || phase === 'back') {
            poseWalk(p.person, elapsed, carrying);
        } else if (phase === 'pick' || phase === 'drop') {
            poseBendPick(p.person, t01);
        } else {
            poseIdle(p.person, elapsed);
        }
    }

    // === 검수 작업자 (오른쪽 입력): 라인에 제품이 앞에 오면 검수 ===
    const INSPECT_RANGE = 1.3;
    for (const insp of inspectors) {
        let nearest = Infinity;
        for (const p of products) {
            if (p.lineName !== insp.line) continue;
            if (p.state === 'aging') continue;
            const d = Math.abs(p.x - insp.x);
            if (d < nearest) nearest = d;
        }
        const intensity = Math.max(0, 1 - nearest / INSPECT_RANGE);
        poseInspect(insp.person, elapsed + insp.phase, intensity);
    }
}
