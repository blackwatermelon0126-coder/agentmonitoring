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
const WAX_MAT = new THREE.MeshStandardMaterial({ color: 0xF7EAD0, roughness: 0.5, metalness: 0.0, emissive: 0xFFF3D8, emissiveIntensity: 0.15 });

function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...opts });
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

    // ---- 왁뿌 코스: 중심 나선(반경 3.2, 45°/스텝)으로 상승하는 왁스 발판 12개 + 골 ----
    // 점프 물리(scene.js JUMP_SPEED 8·GRAVITY 22 → 최고 상승 1.45, +1.0 상승 착지 수평거리 ≈2.8)에 맞춰
    // 이웃 발판 중심거리 2.45·상승 1.0으로 배치. 1번 발판(top 0.6)은 STEP_UP(0.6) 이내 → 걸어 올라 시작.
    _waxShells.length = 0;
    const RINGC = { x: 0, z: 8 }, RINGR = 3.2;
    const specs = [];
    for (let i = 0; i < 12; i++) {
        const a = Math.PI + (Math.PI / 4) * i;   // 스폰 쪽(남)에서 시작해 나선 상승(1.5바퀴)
        specs.push({ x: RINGC.x + Math.sin(a) * RINGR, z: RINGC.z + Math.cos(a) * RINGR, top: 0.6 + i, w: 2, d: 2 });
    }
    specs.push({ x: -0.6, z: 8.6, top: 12.2, w: 3, d: 3, goal: true });   // 골(마지막에서 +0.6 상승·거리 ≈2.3)

    specs.forEach((s, i) => {
        // 속 발판 — 왁스가 깨지면 드러나는 파스텔 컬러(단계별 색상환).
        // emissive 동색: 밤·비 등 어두운 조명에서도 "깨짐 → 색 드러남" 대비가 살아있게.
        const innerHex = new THREE.Color().setHSL((i * 0.083) % 1, 0.6, 0.55).getHex();
        const p = new THREE.Mesh(
            new THREE.BoxGeometry(s.w, 0.4, s.d),
            mat(innerHex, { roughness: 0.55, emissive: innerHex, emissiveIntensity: 0.3 })
        );
        p.position.set(s.x, s.top - 0.2, s.z);
        p.castShadow = true; p.receiveShadow = true;
        p.userData.waxIdx = i;
        if (s.goal) p.userData.jmGoal = true;
        g.add(p); targets.push(p);

        // 왁스 셸 — 발판을 얇게 감싸는 크러스트(면별 보로노이 균열 조각, 두께 0.02).
        // targets 미포함(비주얼 전용) → 물리 불변. 착지 시 금이 간 뒤 조각이 하나씩 떨어져 나간다.
        const shellG = new THREE.Group();
        shellG.position.copy(p.position);
        g.add(shellG);
        _waxShells[i] = {
            pieces: _buildWaxPieces(shellG, s.w, 0.4, s.d),
            queue: [], timer: 0, broken: false,
            cx: s.x, top: s.top, cz: s.z, w: s.w, d: s.d, group: g,
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
function _voronoiCells(fw, fh, cell = 0.7) {
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
            const m = new THREE.Mesh(geo, WAX_MAT.clone());
            m.position.set(px, py, pz);
            m.castShadow = true;
            parent.add(m);
            pieces.push({
                mesh: m, mat: m.material,
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
    if (!wx || wx.broken) return false;
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

/** 조각 하나를 셸에서 떼어내 낙하 시작(바깥쪽으로 살짝 밀리며 톡 소리). */
function _detachPiece(pc) {
    if (pc.state !== 0) return;
    pc.state = 1;
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
        for (const pc of w.pieces) {
            pc.state = 0;
            pc.mesh.visible = true;
            pc.mesh.position.set(pc.hx, pc.hy, pc.hz);
            pc.mesh.rotation.set(0, 0, 0);
            pc.mat.opacity = 1; pc.mat.transparent = false;
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
