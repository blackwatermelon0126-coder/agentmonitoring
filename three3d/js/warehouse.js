// ============================================
// 물류 창고 + 트럭 + 검사관 + 자재 흐름
// ============================================
// 공장(x=-22, z=18, 정면 -x) 왼쪽에 물류 창고를 배치
// 트럭이 수시로 와서 자재 내림 → 검사관 검수 → ITR/OTR 라인 앞 큐에 적층
// ============================================
import * as THREE from 'three';
import { createDetailedPerson } from './character.js';

// ---- 위치 상수 (월드 좌표) ----
const WH = { cx: -36, cz: 22, w: 9, d: 8, h: 4 };
const TRUCK_PATH = {
    start: { x: -52, z: 22 },   // 화면 밖 시작
    park:  { x: -39, z: 22 },   // 창고 정면 앞 정차
    exit:  { x: -52, z: 22 },   // 출차 (역방향)
};
const DOCK_POS    = { x: -36, z: 22 };   // 자재 내리는 하역장
const INSPECT_POS = { x: -32, z: 22 };   // 검사관 + 검수대
// 자재 큐: 공장 정면(-x) 외부 — 공장 라인 자재 투입쪽과 가까운 위치
const ITR_QUEUE_POS = { x: -27, z: 28 };
const OTR_QUEUE_POS = { x: -17, z: 28 };

// ---- 트럭 사이클 (총 16초) ----
const CYCLE = {
    inboundEnd: 3,    // 0~3: 들어옴
    unloadEnd:  10,   // 3~10: 정차 + 하역 (7초간 자재 4개 스폰)
    exitEnd:    13,   // 10~13: 출차
    waitEnd:    16,   // 13~16: 다음 사이클까지 대기
};

// ---- 자재 박스 흐름 (스폰 시점 기준 시간) ----
const FLOW = {
    onDock:  1.5,     // 0~1.5: 트럭 옆 하역장에서 검수대로 이동
    inspect: 3.0,     // 1.5~3.0: 검수 (검수대 위에서 잠시 머무름, 이후 소멸)
};

// ---- 상태 ----
let warehouseGroup = null;
let truckObj = null;
let truckDoor = null;
let inspectorObj = null;
let itrArm = null;
let otrArm = null;
const materials = [];           // 흐르는 박스: { mesh, spawnT, line }
let nextLineToggle = 0;
let lastSpawnT = -100;
let lastCycleIdx = -1;
let _flowOff = false;   // STEP2: 입하 물류를 검사반 앞 입하장으로 이관 → 창고 자체 트럭/지게차/자재흐름 중지

// ---- 지게차 (forklift) ----
let forkliftObj = null;          // { group, mast, forks, cargo }
let forkliftDropCycle = -1;      // 마지막으로 팔레트 떨군 사이클 번호
const droppedPallets = [];       // { mesh, dropT, line }
const FORKLIFT_PATH = {
    home:    { x: -30, z: 26 },  // 대기 위치 (창고 동측)
    pickup:  { x: -36, z: 22 },  // 트럭 뒷편 자재 픽업
    dropITR: { x: -27, z: 28 },  // ITR 라인 투입 위치 (포터 픽업 지점)
    dropOTR: { x: -17, z: 28 },  // OTR 라인 투입 위치
};
const FORKLIFT_CYCLE_T = 14;

// ---- 헬퍼 ----
function box(w, h, d, color, opts = {}) {
    const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...opts })
    );
    m.castShadow = true; m.receiveShadow = true;
    return m;
}

// ---- 창고 건물 ----
function buildShell(group) {
    const { cx, cz, w, d, h } = WH;

    // 바닥
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshStandardMaterial({ color: 0x9E9E9E, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.025, cz);
    floor.receiveShadow = true;
    group.add(floor);

    // 진입 노면 (하역장 콘크리트)
    const dock = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 5),
        new THREE.MeshStandardMaterial({ color: 0x616161, roughness: 0.9 })
    );
    dock.rotation.x = -Math.PI / 2;
    dock.position.set(cx - w / 2 - 3.5, 0.04, cz);
    dock.receiveShadow = true;
    group.add(dock);

    // ===== 사방 통유리 외벽 =====
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xB3E5FC,
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.85,
        thickness: 0.05,
        side: THREE.DoubleSide,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x37474F, metalness: 0.6, roughness: 0.4 });

    const inset = 0.4;       // 패널과 프레임 간 여백
    const wallH = h - 0.3;   // 패널 높이 (위/아래 프레임 빼고)
    const wallY = wallH / 2 + 0.15;

    // 4면 유리 패널
    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH, d - inset), glassMat);
    frontGlass.position.set(cx - w / 2 + 0.03, wallY, cz);
    group.add(frontGlass);
    const backGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, wallH, d - inset), glassMat);
    backGlass.position.set(cx + w / 2 - 0.03, wallY, cz);
    group.add(backGlass);
    const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(w - inset, wallH, 0.06), glassMat);
    leftGlass.position.set(cx, wallY, cz - d / 2 + 0.03);
    group.add(leftGlass);
    const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(w - inset, wallH, 0.06), glassMat);
    rightGlass.position.set(cx, wallY, cz + d / 2 - 0.03);
    group.add(rightGlass);

    // 4개 모서리 기둥
    for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.18), frameMat);
            post.position.set(cx + sx * (w / 2 - 0.09), h / 2, cz + sz * (d / 2 - 0.09));
            post.castShadow = true;
            group.add(post);
        }
    }
    // 상/하단 가로 프레임 — 전·후면 (z축)
    for (const sx of [-1, 1]) {
        for (const yy of [h - 0.1, 0.09]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, d), frameMat);
            rail.position.set(cx + sx * (w / 2 - 0.09), yy, cz);
            if (yy > 1) rail.castShadow = true;
            group.add(rail);
        }
    }
    // 상/하단 가로 프레임 — 좌·우면 (x축)
    for (const sz of [-1, 1]) {
        for (const yy of [h - 0.1, 0.09]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.18), frameMat);
            rail.position.set(cx, yy, cz + sz * (d / 2 - 0.09));
            if (yy > 1) rail.castShadow = true;
            group.add(rail);
        }
    }
    // 각 면 중앙 세로 멀리언
    for (const sx of [-1, 1]) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.14, wallH, 0.14), frameMat);
        v.position.set(cx + sx * (w / 2 - 0.09), wallY, cz);
        group.add(v);
    }
    for (const sz of [-1, 1]) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.14, wallH, 0.14), frameMat);
        v.position.set(cx, wallY, cz + sz * (d / 2 - 0.09));
        group.add(v);
    }
    // 각 면 중앙 가로 멀리언 (윗부분 1/3 지점)
    for (const sx of [-1, 1]) {
        const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, d - inset), frameMat);
        h2.position.set(cx + sx * (w / 2 - 0.09), h * 0.72, cz);
        group.add(h2);
    }
    for (const sz of [-1, 1]) {
        const h2 = new THREE.Mesh(new THREE.BoxGeometry(w - inset, 0.12, 0.14), frameMat);
        h2.position.set(cx, h * 0.72, cz + sz * (d / 2 - 0.09));
        group.add(h2);
    }

    // 지붕
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.2, d + 0.4),
        new THREE.MeshStandardMaterial({ color: 0x546E7A, metalness: 0.4, roughness: 0.5 })
    );
    roof.position.set(cx, h + 0.1, cz);
    roof.castShadow = true; group.add(roof);

    // 간판 "물류창고 / LOGISTICS"
    const sc = document.createElement('canvas');
    sc.width = 1024; sc.height = 192;
    {
        const c = sc.getContext('2d');
        const g = c.createLinearGradient(0, 0, 0, 192);
        g.addColorStop(0, '#E65100'); g.addColorStop(1, '#BF360C');
        c.fillStyle = g; c.fillRect(0, 0, 1024, 192);
        c.strokeStyle = '#FFFFFF'; c.lineWidth = 6; c.strokeRect(8, 8, 1008, 176);
        c.fillStyle = '#FFFFFF'; c.font = 'bold 72px sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('물류창고', 512, 70);
        c.font = 'bold 44px sans-serif'; c.fillStyle = '#FFEB3B';
        c.fillText('LOGISTICS WAREHOUSE', 512, 138);
    }
    const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 1.1),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc) })
    );
    sign.position.set(cx, h - 0.5, cz - d / 2 - 0.11);
    sign.rotation.y = Math.PI;
    group.add(sign);
    // 정면(서쪽) 간판
    const signFront = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 0.65),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc) })
    );
    signFront.position.set(cx - w / 2 - 0.06, h - 0.5, cz);
    signFront.rotation.y = -Math.PI / 2;
    group.add(signFront);

    // 내부 자재 선반 (스택 2개)
    for (const zo of [-2, 2]) {
        for (let lvl = 0; lvl < 2; lvl++) {
            const shelf = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 0.08, 0.7),
                new THREE.MeshStandardMaterial({ color: 0x8D6E63 })
            );
            shelf.position.set(cx + 2.5, 0.8 + lvl * 1.2, cz + zo);
            shelf.castShadow = true; shelf.receiveShadow = true;
            group.add(shelf);
            // 선반 위 자재
            for (let bi = 0; bi < 3; bi++) {
                const stockBox = box(0.5, 0.4, 0.5, [0xA1887F, 0x8D6E63, 0x6D4C41][bi]);
                stockBox.position.set(cx + 1.7 + bi * 0.8, 1.05 + lvl * 1.2, cz + zo);
                group.add(stockBox);
            }
        }
    }
}

// ---- 트럭 ----
function buildTruck() {
    const g = new THREE.Group();
    // 캐빈 (-x 쪽 = 진행 방향 앞)
    const cab = box(1.5, 1.3, 1.5, 0x1565C0);
    cab.position.set(-1.3, 0.95, 0);
    g.add(cab);
    // 캐빈 윈도우
    const cabWin = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.5, 1.55),
        new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.2, roughness: 0.1, transmission: 0.4 })
    );
    cabWin.position.set(-1.3, 1.35, 0);
    g.add(cabWin);
    // 헤드라이트
    for (const zo of [-0.5, 0.5]) {
        const hl = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xFFEB3B })
        );
        hl.position.set(-2.05, 0.7, zo);
        g.add(hl);
    }

    // 카고 컨테이너 (트렁크)
    const cargo = box(3.2, 1.8, 1.55, 0xFAFAFA);
    cargo.position.set(0.6, 1.1, 0);
    g.add(cargo);
    // 옆면 색띠
    for (const zo of [-0.79, 0.79]) {
        const stripe = new THREE.Mesh(
            new THREE.PlaneGeometry(3.1, 0.35),
            new THREE.MeshBasicMaterial({ color: 0xE65100 })
        );
        stripe.position.set(0.6, 1.05, zo);
        if (zo < 0) stripe.rotation.y = Math.PI;
        g.add(stripe);
    }

    // 트렁크 문 (+x 끝, 회전축은 +z 끝)
    const doorPivot = new THREE.Group();
    doorPivot.position.set(2.2, 1.1, 0.77); // 회전축 위치
    g.add(doorPivot);
    const door = box(0.08, 1.7, 1.55, 0xE0E0E0);
    door.position.set(0, 0, -0.77); // 피봇 기준 안쪽
    doorPivot.add(door);
    truckDoor = doorPivot;

    // 바퀴 (4개)
    for (const [px, pz] of [[-1.4, 0.78], [-1.4, -0.78], [1.2, 0.78], [1.2, -0.78]]) {
        const wh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        wh.rotation.x = Math.PI / 2;
        wh.position.set(px, 0.36, pz);
        g.add(wh);
        // 휠 캡 (실버)
        const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 0.30, 12),
            new THREE.MeshStandardMaterial({ color: 0xBDBDBD, metalness: 0.7 })
        );
        cap.rotation.x = Math.PI / 2;
        cap.position.set(px, 0.36, pz);
        g.add(cap);
    }
    return g;
}

// ---- 검사관 ----
function buildInspector(group, x, z) {
    const insp = createDetailedPerson({
        gender: 'male', skinColor: 0xFFCC99,
        hairColor: 0x3E2723, shirtColor: 0xFF9800,
        pantsColor: 0x37474F, shoeColor: 0x212121, hairStyle: 'short'
    });
    insp.group.position.set(x, 0, z);
    insp.group.rotation.y = Math.PI;     // 트럭(-x) 쪽을 바라봄
    insp.group.scale.set(0.95, 0.95, 0.95);

    // 흰색 안전모 (관리자)
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 })
    );
    helmet.position.y = 1.85;
    insp.group.add(helmet);
    const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.025, 16),
        new THREE.MeshStandardMaterial({ color: 0xFFFFFF })
    );
    brim.position.set(0, 1.79, 0.04);
    insp.group.add(brim);

    // 모바일/태블릿 (양손에 들고 있음)
    const tabletBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.36, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.4 })
    );
    tabletBody.position.set(0, 1.18, -0.22);
    tabletBody.rotation.x = -0.4;
    insp.group.add(tabletBody);
    // 태블릿 화면 (체크 표시)
    const tabletScr = document.createElement('canvas');
    tabletScr.width = 256; tabletScr.height = 360;
    {
        const c = tabletScr.getContext('2d');
        c.fillStyle = '#1B5E20'; c.fillRect(0, 0, 256, 360);
        c.fillStyle = '#4CAF50'; c.fillRect(8, 8, 240, 60);
        c.fillStyle = '#FFFFFF'; c.font = 'bold 24px sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('QC 검수', 128, 38);
        c.font = 'bold 16px monospace';
        c.fillStyle = '#A5D6A7';
        const lines = ['LOT:CT26-0524', 'MAT:ITR-A', 'QTY:50', 'TIME:14:32', '------', '□ 외관', '☑ 치수', '☑ 표면', '☑ 라벨'];
        lines.forEach((ln, i) => {
            c.textAlign = 'left';
            c.fillText(ln, 16, 90 + i * 28);
        });
        // OK 버튼
        c.fillStyle = '#4CAF50'; c.fillRect(60, 320, 136, 32);
        c.fillStyle = '#FFFFFF'; c.font = 'bold 18px sans-serif';
        c.textAlign = 'center'; c.fillText('합격 OK', 128, 336);
    }
    const tabletTex = new THREE.CanvasTexture(tabletScr);
    const tabletScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.32),
        new THREE.MeshBasicMaterial({ map: tabletTex })
    );
    tabletScreen.position.set(0, 1.18, -0.205);
    tabletScreen.rotation.x = -0.4;
    insp.group.add(tabletScreen);

    // 팔 자세 변경: 양손이 앞으로 (태블릿 들고 있는 듯)
    insp.armL.shoulder.rotation.x = -Math.PI / 3;
    insp.armR.shoulder.rotation.x = -Math.PI / 3;
    insp.armL.elbow.rotation.x = Math.PI / 4;
    insp.armR.elbow.rotation.x = Math.PI / 4;

    group.add(insp.group);
    return insp;
}

// ---- 로봇팔 ----
function buildArm(group, x, z, ry = 0, color = 0xFFC107) {
    const arm = new THREE.Group();
    arm.position.set(x, 0, z);
    arm.rotation.y = ry;

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.36, 0.25, 16),
        new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.7 })
    );
    base.position.y = 0.125; arm.add(base);

    const pivot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
    );
    pivot.position.y = 0.4; arm.add(pivot);

    const upperPivot = new THREE.Group();
    upperPivot.position.y = 0.55;
    arm.add(upperPivot);
    const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.13, 1.2, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
    );
    upper.position.y = 0.6;
    upper.rotation.z = -0.5;
    upperPivot.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(-0.55, 1.05, 0);
    upperPivot.add(elbow);
    const joint = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.7 })
    );
    elbow.add(joint);
    const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.9, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
    );
    forearm.position.set(0.4, -0.1, 0);
    forearm.rotation.z = Math.PI / 2 + 0.4;
    elbow.add(forearm);

    const tcp = new THREE.Group();
    tcp.position.set(0.85, -0.4, 0);
    elbow.add(tcp);
    for (const yo of [-0.07, 0.07]) {
        const finger = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.18, 0.04),
            new THREE.MeshStandardMaterial({ color: 0xE0E0E0 })
        );
        finger.position.set(0.12, yo, 0);
        tcp.add(finger);
    }
    const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00E676 })
    );
    led.position.set(0, 0.18, 0.13);
    pivot.add(led);

    group.add(arm);
    return { group: arm, upperPivot, elbow, tcp, led };
}

// ============================================
// 지게차 (forklift)
// ============================================
function buildForklift() {
    const g = new THREE.Group();
    const yellow = 0xFFB300;
    const dark   = 0x424242;

    // 차대
    const chassis = box(2.0, 0.4, 1.2, yellow);
    chassis.position.y = 0.45;
    g.add(chassis);

    // 카운터웨이트 (뒤쪽)
    const cw = box(0.55, 0.7, 1.05, 0x616161);
    cw.position.set(0.85, 0.95, 0);
    g.add(cw);

    // 운전석 베이스 + 의자
    const seatBase = box(0.7, 0.4, 0.9, 0x333333);
    seatBase.position.set(0.2, 0.85, 0);
    g.add(seatBase);
    const seat = box(0.55, 0.1, 0.55, 0x1A1A1A);
    seat.position.set(0.2, 1.12, 0);
    g.add(seat);
    const seatBack = box(0.08, 0.42, 0.55, 0x1A1A1A);
    seatBack.position.set(0.46, 1.33, 0);
    g.add(seatBack);

    // 핸들
    const wheelPost = box(0.06, 0.4, 0.06, dark);
    wheelPost.position.set(0.0, 1.22, 0);
    g.add(wheelPost);
    const steerWheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.025, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x1A1A1A })
    );
    steerWheel.position.set(0.0, 1.44, 0);
    steerWheel.rotation.x = Math.PI / 2;
    steerWheel.rotation.z = -0.3;
    g.add(steerWheel);

    // 오버헤드 가드 (안전 프레임)
    for (const [px, pz] of [[0.65, 0.55], [0.65, -0.55], [-0.25, 0.55], [-0.25, -0.55]]) {
        const post = box(0.07, 1.4, 0.07, yellow);
        post.position.set(px, 1.85, pz);
        g.add(post);
    }
    const roof = box(0.98, 0.08, 1.25, 0x222222);
    roof.position.set(0.2, 2.55, 0);
    roof.castShadow = true;
    g.add(roof);

    // 마스트 (앞쪽 수직 레일)
    const mast = new THREE.Group();
    mast.position.set(-1.0, 0, 0);
    g.add(mast);
    for (const zo of [-0.42, 0.42]) {
        const rail = box(0.09, 2.6, 0.09, dark);
        rail.position.set(0, 1.3, zo);
        mast.add(rail);
    }
    for (const yo of [0.3, 2.55]) {
        const cross = box(0.11, 0.07, 0.95, dark);
        cross.position.set(0, yo, 0);
        mast.add(cross);
    }

    // 포크 (수직 슬라이드)
    const forks = new THREE.Group();
    forks.position.set(-1.0, 0.25, 0);
    g.add(forks);
    const fb = box(0.08, 0.55, 0.9, 0x9E9E9E);
    fb.position.set(0.04, 0.27, 0);
    forks.add(fb);
    for (const zo of [-0.32, 0.32]) {
        const fork = box(0.95, 0.07, 0.11, 0x9E9E9E);
        fork.position.set(-0.46, 0.05, zo);
        forks.add(fork);
    }

    // 화물 (팔레트 + 박스 더미) — forks 자식, hasCargo로 visibility 제어
    const cargo = new THREE.Group();
    const pallet = box(0.85, 0.12, 0.75, 0x8D6E63);
    pallet.position.set(-0.42, 0.18, 0);
    cargo.add(pallet);
    for (const xo of [-0.6, -0.22]) {
        for (const zo of [-0.18, 0.18]) {
            const stack = box(0.34, 0.42, 0.32, 0xA1887F);
            stack.position.set(xo, 0.46, zo);
            cargo.add(stack);
        }
    }
    cargo.visible = false;
    forks.add(cargo);

    // 바퀴 4개 (앞 큰 휠 + 뒤 작은 휠)
    for (const [px, pz, r] of [[-0.6, 0.55, 0.32], [-0.6, -0.55, 0.32], [0.7, 0.55, 0.26], [0.7, -0.55, 0.26]]) {
        const wh = new THREE.Mesh(
            new THREE.CylinderGeometry(r, r, 0.22, 16),
            new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        wh.rotation.x = Math.PI / 2;
        wh.position.set(px, r, pz);
        wh.castShadow = true;
        g.add(wh);
        const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.23, 12),
            new THREE.MeshStandardMaterial({ color: 0xCFD8DC, metalness: 0.7 })
        );
        cap.rotation.x = Math.PI / 2;
        cap.position.set(px, r, pz);
        g.add(cap);
    }

    // 헤드라이트 (앞쪽 = -x)
    for (const zo of [-0.45, 0.45]) {
        const hl = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xFFEB3B })
        );
        hl.position.set(-0.9, 0.55, zo);
        g.add(hl);
    }
    // 후방 경광등
    const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12),
        new THREE.MeshBasicMaterial({ color: 0xFFA000 })
    );
    beacon.position.set(0.2, 2.65, 0);
    g.add(beacon);

    g.castShadow = true;
    return { group: g, mast, forks, cargo, beacon };
}

function spawnDroppedPallet(pos, line, elapsed) {
    const palletGroup = new THREE.Group();
    const pallet = box(0.85, 0.12, 0.75, 0x8D6E63);
    pallet.position.y = 0.06;
    palletGroup.add(pallet);
    const stackColor = line === 'ITR' ? 0xFF7043 : 0x42A5F5;
    for (let i = 0; i < 4; i++) {
        const xo = (i % 2) * 0.4 - 0.2;
        const zo = Math.floor(i / 2) * 0.36 - 0.18;
        const b = box(0.34, 0.42, 0.32, stackColor);
        b.position.set(xo, 0.33, zo);
        palletGroup.add(b);
    }
    palletGroup.position.set(pos.x, 0, pos.z);
    warehouseGroup.add(palletGroup);
    droppedPallets.push({ mesh: palletGroup, dropT: elapsed, line });
}

function lerp(a, b, t) { return a + (b - a) * t; }

function updateForklift(delta, elapsed) {
    if (!forkliftObj) return;

    const cycleT = elapsed % FORKLIFT_CYCLE_T;
    const cycleN = Math.floor(elapsed / FORKLIFT_CYCLE_T);
    const isITR  = cycleN % 2 === 0;
    const dropPos = isITR ? FORKLIFT_PATH.dropITR : FORKLIFT_PATH.dropOTR;

    const T1 = 3.0;             // home → truck
    const T2 = T1 + 1.6;        // pickup
    const T3 = T2 + 4.0;        // truck → drop
    const T4 = T3 + 1.6;        // dropoff
    const T5 = T4 + 3.8;        // drop → home

    let fx, fz, dirX, dirZ, forkY, hasCargo;

    if (cycleT < T1) {
        const f = cycleT / T1;
        fx = lerp(FORKLIFT_PATH.home.x, FORKLIFT_PATH.pickup.x, f);
        fz = lerp(FORKLIFT_PATH.home.z, FORKLIFT_PATH.pickup.z, f);
        dirX = FORKLIFT_PATH.pickup.x - FORKLIFT_PATH.home.x;
        dirZ = FORKLIFT_PATH.pickup.z - FORKLIFT_PATH.home.z;
        forkY = 0.25;
        hasCargo = false;
    } else if (cycleT < T2) {
        fx = FORKLIFT_PATH.pickup.x;
        fz = FORKLIFT_PATH.pickup.z;
        dirX = -1; dirZ = 0;
        const f = (cycleT - T1) / (T2 - T1);
        if (f < 0.3) { forkY = 0.2; hasCargo = false; }
        else if (f < 0.55) { forkY = 0.2; hasCargo = true; }
        else { forkY = 0.2 + (f - 0.55) / 0.45 * 1.25; hasCargo = true; }
    } else if (cycleT < T3) {
        const f = (cycleT - T2) / (T3 - T2);
        fx = lerp(FORKLIFT_PATH.pickup.x, dropPos.x, f);
        fz = lerp(FORKLIFT_PATH.pickup.z, dropPos.z, f);
        dirX = dropPos.x - FORKLIFT_PATH.pickup.x;
        dirZ = dropPos.z - FORKLIFT_PATH.pickup.z;
        forkY = 1.45;
        hasCargo = true;
    } else if (cycleT < T4) {
        fx = dropPos.x;
        fz = dropPos.z;
        dirX = dropPos.x - FORKLIFT_PATH.pickup.x;
        dirZ = dropPos.z - FORKLIFT_PATH.pickup.z;
        const f = (cycleT - T3) / (T4 - T3);
        if (f < 0.55) {
            forkY = 1.45 - f / 0.55 * 1.2;
            hasCargo = true;
        } else {
            forkY = 0.25;
            hasCargo = false;
            // 떨군 팔레트 스폰 (사이클당 1회)
            if (forkliftDropCycle < cycleN) {
                spawnDroppedPallet(dropPos, isITR ? 'ITR' : 'OTR', elapsed);
                forkliftDropCycle = cycleN;
            }
        }
    } else if (cycleT < T5) {
        const f = (cycleT - T4) / (T5 - T4);
        fx = lerp(dropPos.x, FORKLIFT_PATH.home.x, f);
        fz = lerp(dropPos.z, FORKLIFT_PATH.home.z, f);
        dirX = FORKLIFT_PATH.home.x - dropPos.x;
        dirZ = FORKLIFT_PATH.home.z - dropPos.z;
        forkY = 0.25;
        hasCargo = false;
    } else {
        fx = FORKLIFT_PATH.home.x;
        fz = FORKLIFT_PATH.home.z;
        dirX = -1; dirZ = 0;
        forkY = 0.25;
        hasCargo = false;
    }

    forkliftObj.group.position.set(fx, 0, fz);
    forkliftObj.forks.position.y = forkY;
    forkliftObj.cargo.visible = hasCargo;

    // 진행 방향으로 부드럽게 회전 (forks 기본 -x 방향)
    if (Math.abs(dirX) > 0.001 || Math.abs(dirZ) > 0.001) {
        const target = Math.atan2(dirZ, -dirX);
        let cur = forkliftObj.group.rotation.y;
        let diff = target - cur;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        forkliftObj.group.rotation.y = cur + diff * Math.min(1, delta * 5);
    }

    // 경광등 깜빡임
    const blink = (Math.sin(elapsed * 6) + 1) / 2;
    forkliftObj.beacon.material.color.setRGB(1, 0.55 + blink * 0.45, 0);

    // 떨군 팔레트 페이드 아웃
    for (let i = droppedPallets.length - 1; i >= 0; i--) {
        const dp = droppedPallets[i];
        const age = elapsed - dp.dropT;
        if (age > 9) {
            warehouseGroup.remove(dp.mesh);
            droppedPallets.splice(i, 1);
        }
    }
}

// ============================================
// 메인 빌더
// ============================================
export function createWarehouse(scene) {
    const g = new THREE.Group();
    g.name = 'Warehouse';
    warehouseGroup = g;

    buildShell(g);

    // 트럭
    truckObj = buildTruck();
    truckObj.position.set(TRUCK_PATH.start.x, 0, TRUCK_PATH.start.z);
    g.add(truckObj);

    // 검수대 (작업대)
    const inspDesk = box(1.0, 0.85, 0.7, 0x90A4AE);
    inspDesk.position.set(INSPECT_POS.x, 0.425, INSPECT_POS.z + 0.5);
    g.add(inspDesk);
    // 검수대 컴퓨터
    const inspPC = box(0.5, 0.35, 0.45, 0x212121);
    inspPC.position.set(INSPECT_POS.x - 0.2, 1.03, INSPECT_POS.z + 0.5);
    g.add(inspPC);

    // 검사관
    inspectorObj = buildInspector(g, INSPECT_POS.x, INSPECT_POS.z + 1.2);

    // ITR/OTR 자재 큐 옆 로봇팔
    // 라인 자재 투입(라인 시작점) 옆에 배치
    // ITR 라인 자재 투입 = 월드 (-25, 28) — 그 옆에 로봇팔
    itrArm = buildArm(g, ITR_QUEUE_POS.x - 1.2, ITR_QUEUE_POS.z, 0, 0xFF9800);
    otrArm = buildArm(g, OTR_QUEUE_POS.x + 1.2, OTR_QUEUE_POS.z, Math.PI, 0x2196F3);

    // 큐 영역 바닥 마킹
    function queueMark(x, z, color, label) {
        const mark = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 1.8),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
        );
        mark.rotation.x = -Math.PI / 2;
        mark.position.set(x, 0.06, z);
        g.add(mark);
        // 라벨 텍스트
        const c = document.createElement('canvas');
        c.width = 256; c.height = 128;
        const ctx = c.getContext('2d');
        ctx.fillStyle = `#${color.toString(16).padStart(6,'0')}`;
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 64px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, 128, 50);
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('자재 큐', 128, 100);
        const tex = new THREE.CanvasTexture(c);
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(1.4, 0.7),
            new THREE.MeshBasicMaterial({ map: tex })
        );
        sign.position.set(x, 2.0, z + 1.0);
        sign.rotation.y = Math.PI;
        g.add(sign);
    }
    queueMark(ITR_QUEUE_POS.x, ITR_QUEUE_POS.z, 0xE65100, 'ITR');
    queueMark(OTR_QUEUE_POS.x, OTR_QUEUE_POS.z, 0x1565C0, 'OTR');

    // 지게차
    forkliftObj = buildForklift();
    forkliftObj.group.position.set(FORKLIFT_PATH.home.x, 0, FORKLIFT_PATH.home.z);
    g.add(forkliftObj.group);

    scene.add(g);
    return g;
}

// ============================================
// 매 프레임 업데이트
// ============================================
/** STEP2: 창고 자체 트럭/지게차/자재흐름 중지(입하 물류를 검사반 앞 입하장으로 이관). 창고 건물·랙은 정적 유지. */
export function disableWarehouseFlow() {
    _flowOff = true;
    if (truckObj) truckObj.visible = false;
    if (forkliftObj && forkliftObj.group) forkliftObj.group.visible = false;
    for (const m of materials) { if (m.mesh && warehouseGroup) warehouseGroup.remove(m.mesh); }
    materials.length = 0;
    if (typeof droppedPallets !== 'undefined') { for (const d of droppedPallets) { if (d.mesh && warehouseGroup) warehouseGroup.remove(d.mesh); } droppedPallets.length = 0; }
}

export function updateWarehouse(delta, elapsed) {
    if (_flowOff) return;   // 입하 물류 이관됨 — 창고 애니메이션 중지(정적 씬)
    // ---- 트럭 사이클 ----
    const cycleT = elapsed % CYCLE.waitEnd;
    const cycleIdx = Math.floor(elapsed / CYCLE.waitEnd);

    let tx, tz;
    let doorAngle = 0;
    if (cycleT < CYCLE.inboundEnd) {
        const k = cycleT / CYCLE.inboundEnd;
        tx = TRUCK_PATH.start.x + (TRUCK_PATH.park.x - TRUCK_PATH.start.x) * k;
        tz = TRUCK_PATH.start.z;
    } else if (cycleT < CYCLE.unloadEnd) {
        tx = TRUCK_PATH.park.x;
        tz = TRUCK_PATH.park.z;
        // 트렁크 문 열림 (점진적)
        const u = (cycleT - CYCLE.inboundEnd) / 0.8;
        doorAngle = Math.min(1, u) * (Math.PI / 1.6);
    } else if (cycleT < CYCLE.exitEnd) {
        const k = (cycleT - CYCLE.unloadEnd) / (CYCLE.exitEnd - CYCLE.unloadEnd);
        tx = TRUCK_PATH.park.x + (TRUCK_PATH.exit.x - TRUCK_PATH.park.x) * k;
        tz = TRUCK_PATH.park.z;
        // 출차 직전 문 닫기
        const u = Math.max(0, 1 - k * 3);
        doorAngle = u * (Math.PI / 1.6);
    } else {
        tx = TRUCK_PATH.exit.x;
        tz = TRUCK_PATH.start.z;
    }
    if (truckObj) truckObj.position.set(tx, 0, tz);
    if (truckDoor) truckDoor.rotation.y = doorAngle;

    // ---- 자재 박스 스폰: 정차 중 1.7초 간격 ----
    if (cycleT >= CYCLE.inboundEnd + 0.8 && cycleT < CYCLE.unloadEnd - 0.5) {
        if (elapsed - lastSpawnT > 1.7) {
            spawnMaterial(elapsed);
            lastSpawnT = elapsed;
        }
    }

    // ---- 자재 박스 이동: 트럭 → 검수대까지만. 검수 후 즉시 소멸 (포터가 직접 운반) ----
    for (let i = materials.length - 1; i >= 0; i--) {
        const m = materials[i];
        const age = elapsed - m.spawnT;
        if (age >= FLOW.inspect) {
            // 검수 완료 — 박스 소멸
            warehouseGroup.remove(m.mesh);
            materials.splice(i, 1);
            continue;
        }
        let x, y, z;
        if (age < FLOW.onDock) {
            // 트럭 옆 하역장 → 검수대
            const k = age / FLOW.onDock;
            x = DOCK_POS.x + (INSPECT_POS.x - DOCK_POS.x) * k;
            y = 1.2 - k * 0.45;
            z = DOCK_POS.z + (INSPECT_POS.z + 0.5 - DOCK_POS.z) * k;
        } else {
            // 검수대 위 — 진동(검수 중 표시)
            x = INSPECT_POS.x;
            y = 0.88 + Math.sin((age - FLOW.onDock) * 8) * 0.02;
            z = INSPECT_POS.z + 0.5;
        }
        m.mesh.position.set(x, y, z);
    }

    // ---- 로봇팔: 아이들 모션 ----
    function animArm(arm, t) {
        if (!arm) return;
        const speed = 0.5;
        arm.upperPivot.rotation.y = Math.sin(t * speed) * 0.4;
        arm.elbow.rotation.z = Math.sin(t * speed * 1.3) * 0.2;
        arm.tcp.rotation.x = Math.sin(t * speed * 1.7) * 0.3;
        if (arm.led) {
            const blink = (Math.sin(t * 5) + 1) / 2;
            arm.led.material.color.setRGB(0, 0.5 + blink * 0.2, 0.2);
        }
    }
    animArm(itrArm, elapsed);
    animArm(otrArm, elapsed);

    // ---- 지게차 ----
    updateForklift(delta, elapsed);
}

// ---- 자재 박스 스폰 ----
function spawnMaterial(elapsed) {
    // ITR / OTR 라운드 로빈 (검수대까지만 흐름 — 큐 적층은 더 이상 사용 안 함)
    const line = (nextLineToggle++ % 2 === 0) ? 'ITR' : 'OTR';
    const color = line === 'ITR' ? 0xFF7043 : 0x42A5F5;
    const mesh = new THREE.Group();
    const body = box(0.5, 0.25, 0.5, color);
    body.position.y = 0.125;
    mesh.add(body);
    // 라벨
    const labelC = document.createElement('canvas');
    labelC.width = 128; labelC.height = 32;
    const ctx = labelC.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = line === 'ITR' ? '#BF360C' : '#0D47A1';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(line, 64, 17);
    const tex = new THREE.CanvasTexture(labelC);
    const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.36, 0.1),
        new THREE.MeshBasicMaterial({ map: tex })
    );
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.252;
    mesh.add(label);

    mesh.position.set(DOCK_POS.x, 1.2, DOCK_POS.z);
    warehouseGroup.add(mesh);
    materials.push({ mesh, spawnT: elapsed, line });
}
