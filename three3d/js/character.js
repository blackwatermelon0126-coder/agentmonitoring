import * as THREE from 'three';

const SKIN_COLORS = [0xFFCC99, 0xF5CBA7, 0xFFE0B2, 0xD2B48C, 0xC68642, 0x8D5524, 0xFFDFC4, 0xF0C8A0];
const HAIR_COLORS = [0x1B1B1B, 0x3E2723, 0x5D4037, 0x6D4C41, 0x795548, 0xD4A574, 0xFFD54F, 0xE65100, 0x880E4F, 0x4E342E];
// createDetailedPerson 이 인식하는 헤어스타일. 'long' 은 여성 전용(아래 분기), 나머지는 공통.
const HAIR_STYLES = ['short', 'ponytail', 'bun', 'long'];

function box(w, h, d, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
}

// 문자열 시드 → 32bit 해시 (djb2). 같은 시드는 항상 같은 값 → 외형 결정성 보장.
function hashSeed(s) {
    let h = 5381;
    const str = String(s == null ? '' : s);
    for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
    return h >>> 0;
}

/**
 * person.id(또는 임의 시드)로 캐릭터 외형 traits 를 결정적으로 생성한다.
 * 같은 id 는 항상 같은 외형(피부·머리색·헤어스타일·성별) → 새로고침·재접속에도 일관.
 * 셔츠색(shirtColor)만 외부에서 person.color 로 지정한다. 바지·신발은 오피스 톤 고정.
 *
 * @param {string} seed       - 결정성 시드 (보통 person.id)
 * @param {number} shirtColor - 셔츠 색상 (0xRRGGBB) — person.color 반영
 * @returns {object} createDetailedPerson 용 traits
 */
export function traitsFromSeed(seed, shirtColor) {
    const h = hashSeed(seed);
    const gender = (h & 1) ? 'female' : 'male';
    const skinColor = SKIN_COLORS[(h >>> 1) % SKIN_COLORS.length];
    const hairColor = HAIR_COLORS[(h >>> 5) % HAIR_COLORS.length];
    // 'long' 은 여성만 추가 메시가 그려지므로 남성에겐 제외(시각적 효과 동일 방지).
    const styles = gender === 'female' ? HAIR_STYLES : HAIR_STYLES.filter(s => s !== 'long');
    const hairStyle = styles[(h >>> 9) % styles.length];
    return {
        gender,
        skinColor,
        hairColor,
        shirtColor,
        pantsColor: 0x263238,
        shoeColor: 0x212121,
        hairStyle,
    };
}

/**
 * "i" 문자 형태의 미니멀 캐릭터 (ZEPHONI 전용).
 * 소문자 i 처럼 — 세로 획(원기둥 몸통) 위에 점(구체 머리)을 띄운 형태 + 바닥 받침.
 * createDetailedPerson 과 동일하게 { group } 을 반환하므로 아바타 파이프라인(pickMeshes·badge·label)에 그대로 얹힌다.
 *
 * @param {number} color - 대표 색상 (0xRRGGBB) — person.color 반영
 * @returns {{ group: THREE.Group }}
 */
export function createICharacter(color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });

    // 바닥 받침 (원반)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.09, 20), mat);
    base.position.y = 0.045;
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    // 세로 획 (몸통) — 얇은 원기둥
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.25, 18), mat);
    body.position.y = 0.72;
    body.castShadow = true;
    group.add(body);

    // 점(dot) = 머리 — 몸통 위 약간 띄워 'i' 느낌
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 22, 18), mat);
    head.position.y = 1.78;
    head.castShadow = true;
    group.add(head);

    return { group };
}

/**
 * "검은수박" 캐릭터 (특정 사용자 전용, 요청: 102450@CTR.CO.KR).
 * 짙은 녹색 수박 몸통 + 세로 줄무늬 + 눈·코·입 + 긴 팔다리(손발은 수박 속살 핑크).
 * createDetailedPerson 과 동일하게 { group } 을 반환한다.
 *
 * @returns {{ group: THREE.Group }}
 */
export function createWatermelonCharacter() {
    const group = new THREE.Group();
    const RIND   = 0x0a2e12;   // 겉껍질(짙은 녹색 — 검은수박)
    const STRIPE = 0xF4D03F;   // 줄무늬·팔다리(노랑)
    const FLESH  = 0xE0566A;   // 손·발·코(수박 속살 핑크)
    const rindMat   = new THREE.MeshStandardMaterial({ color: RIND,   roughness: 0.5 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: STRIPE, roughness: 0.5 });
    const fleshMat  = new THREE.MeshStandardMaterial({ color: FLESH,  roughness: 0.5 });
    const whiteMat  = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const blackMat  = new THREE.MeshBasicMaterial({ color: 0x111111 });

    // 일반 아바타(머리 top ≈ 1.8)와 비슷한 전체 크기 — 몸통은 작게, 팔다리는 가늘고 길게.
    const R = 0.42;
    const BODY_Y = 1.4;

    // 몸통 = 수박(구체)
    const body = new THREE.Mesh(new THREE.SphereGeometry(R, 26, 20), rindMat);
    body.position.y = BODY_Y;
    body.castShadow = true;
    group.add(body);

    // 세로 줄무늬(경선) — XY평면 토러스를 Y축 회전으로 배치
    for (let i = 0; i < 6; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 8, 44), stripeMat);
        ring.rotation.y = (i / 6) * Math.PI;
        body.add(ring);
    }

    // 눈(흰자+검은자) — 정면(+z)
    function eye(x) {
        const g = new THREE.Group();
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), whiteMat);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), blackMat);
        pupil.position.z = 0.05;
        g.add(white); g.add(pupil);
        g.position.set(x, 0.11, R - 0.015);
        return g;
    }
    body.add(eye(-0.15));
    body.add(eye(0.15));

    // 코 — 작은 원뿔(정면 돌출)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 12), fleshMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.0, R + 0.015);
    body.add(nose);

    // 입 — 반원 토러스(미소)
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 20, Math.PI), blackMat);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.14, R - 0.005);
    body.add(mouth);

    // 손 — 납작한 손바닥 + 손가락4 + 엄지 (가늘게, 손바닥·손가락이 보이도록)
    function makeHand() {
        const hand = new THREE.Group();
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.04), fleshMat);
        hand.add(palm);
        for (let i = 0; i < 4; i++) {
            const f = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.1, 0.03), fleshMat);
            f.position.set(-0.039 + i * 0.026, -0.115, 0);
            hand.add(f);
        }
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), fleshMat);
        thumb.position.set(0.08, -0.02, 0);
        thumb.rotation.z = 0.7;
        hand.add(thumb);
        hand.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return hand;
    }

    // 가는 긴 팔 (손목 → 손)
    function arm(side) {
        const g = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.78, 10), stripeMat);
        upper.position.y = -0.39;
        g.add(upper);
        const hand = makeHand();
        hand.position.y = -0.84;
        g.add(hand);
        g.position.set(side * (R - 0.02), 1.52, 0);
        g.rotation.z = side * 0.22;
        g.userData.walkLimbType = side < 0 ? 'armL' : 'armR';
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return g;
    }
    group.add(arm(-1));
    group.add(arm(1));

    // 가는 긴 다리 + 발
    function leg(x) {
        const g = new THREE.Group();
        const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.98, 10), stripeMat);
        shin.position.y = 0.49;
        g.add(shin);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), fleshMat);
        foot.position.y = 0.04;
        g.add(foot);
        g.position.set(x, 0, 0);
        g.userData.walkLimbType = x < 0 ? 'legL' : 'legR';
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return g;
    }
    group.add(leg(-0.15));
    group.add(leg(0.15));

    return { group };
}

/**
 * "부리부리몬" 돼지 캐릭터 (특정 사용자 전용 — 김수비).
 * 큰 둥근 머리 + 두꺼운 화난 눈썹 + 돼지 코(납작 원기둥) + 통통한 몸 + 보라색 바지.
 * createDetailedPerson 과 동일하게 { group } 을 반환한다.
 *
 * @returns {{ group: THREE.Group }}
 */
export function createBuriburimonCharacter() {
    const group = new THREE.Group();

    const SKIN  = 0xF5C3A0;  // 살구색 피부
    const PANTS = 0x7856C8;  // 보라색 바지
    const SNOUT = 0xEFAA88;  // 코(약간 진한 살구)
    const BROW  = 0x1A0E04;  // 눈썹(짙은 갈흑)

    const skinMat  = new THREE.MeshStandardMaterial({ color: SKIN,    roughness: 0.55 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS,   roughness: 0.5  });
    const snoutMat = new THREE.MeshStandardMaterial({ color: SNOUT,   roughness: 0.5  });
    const earMat   = new THREE.MeshStandardMaterial({ color: 0xEFAA88, roughness: 0.6 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfafafa });
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const browMat  = new THREE.MeshBasicMaterial({ color: BROW });
    const holeMat  = new THREE.MeshBasicMaterial({ color: 0x3A1A08 });

    // 전체 높이 ≈ 1.8 (일반 아바타와 동일 기준)
    const HEAD_R = 0.36;
    const BODY_R = 0.28;
    const HEAD_Y = 1.44;
    const BODY_Y = 0.82;

    // ── 몸통 (통통한 타원구, 살구색) ──
    const body = new THREE.Mesh(new THREE.SphereGeometry(BODY_R, 22, 16), skinMat);
    body.scale.y = 1.18;
    body.position.y = BODY_Y;
    body.castShadow = true;
    group.add(body);

    // ── 바지 허리띠 (보라색 원기둥 링) ──
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R + 0.02, BODY_R + 0.02, 0.08, 18), pantsMat);
    waist.position.y = BODY_Y - 0.14;
    waist.castShadow = true;
    group.add(waist);

    // ── 머리 (큰 구) ──
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 26, 20), skinMat);
    head.position.y = HEAD_Y;
    head.castShadow = true;
    group.add(head);

    // ── 귀 (납작한 타원구, 머리 위 양쪽) ──
    [-1, 1].forEach(side => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), earMat);
        e.scale.set(0.75, 0.85, 0.5);
        e.position.set(side * HEAD_R * 0.8, HEAD_Y + HEAD_R * 0.55, HEAD_R * 0.25);
        e.castShadow = true;
        group.add(e);
    });

    // ── 눈썹 (두껍고 화난 각도 — 안쪽이 내려가는 V형) ──
    // rotation.z = side * 0.5: 안쪽 끝이 아래로 → 화난 표정
    const browGeo = new THREE.BoxGeometry(0.14, 0.044, 0.03);
    [-1, 1].forEach(side => {
        const brow = new THREE.Mesh(browGeo, browMat);
        brow.position.set(side * 0.115, HEAD_Y + 0.145, HEAD_R * 0.92);
        brow.rotation.z = side * 0.5;
        group.add(brow);
    });

    // ── 눈 (큰 흰자 + 검은 동공) ──
    [-1, 1].forEach(side => {
        const g = new THREE.Group();
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), whiteMat);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), blackMat);
        pupil.position.z = 0.058;
        g.add(white); g.add(pupil);
        g.position.set(side * 0.135, HEAD_Y + 0.05, HEAD_R * 0.92);
        group.add(g);
    });

    // ── 돼지 코 (납작한 원기둥, 앞으로 돌출) ──
    const snoutMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 18), snoutMat);
    snoutMesh.rotation.x = Math.PI / 2;
    snoutMesh.position.set(0, HEAD_Y - 0.1, HEAD_R * 0.88);
    snoutMesh.castShadow = true;
    group.add(snoutMesh);
    // 콧구멍 (어두운 원형)
    [0.048, -0.048].forEach(x => {
        const n = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), holeMat);
        n.position.set(x, HEAD_Y - 0.1, HEAD_R * 0.88 + 0.022);
        group.add(n);
    });

    // ── 팔 (짧고 통통, 어깨 구로 몸통과 자연스럽게 이음) ──
    [-1, 1].forEach(side => {
        // 어깨 구: 몸통 표면에 겹쳐서 팔 원기둥 시작 단절을 메꿈
        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skinMat);
        shoulder.position.set(side * (BODY_R + 0.02), BODY_Y + 0.08, 0);
        shoulder.castShadow = true;
        group.add(shoulder);

        const g = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.32, 12), skinMat);
        upper.position.y = -0.16;
        g.add(upper);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), skinMat);
        hand.position.y = -0.36;
        g.add(hand);
        // 팔 그룹 원점을 어깨 구와 동일 위치에 놓아 구가 이음새를 덮음
        g.position.set(side * (BODY_R + 0.02), BODY_Y + 0.08, 0);
        g.rotation.z = side * 0.3;
        g.userData.walkLimbType = side < 0 ? 'armL' : 'armR';
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        group.add(g);
    });

    // ── 다리 (짧고 통통, 보라색 바지) ──
    [-0.13, 0.13].forEach(x => {
        const g = new THREE.Group();
        const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.42, 12), pantsMat);
        thigh.position.y = 0.21;
        g.add(thigh);
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), skinMat);
        foot.scale.z = 1.3;
        foot.position.y = 0.02;
        g.add(foot);
        g.position.set(x, BODY_Y - BODY_R * 1.18, 0);
        g.userData.walkLimbType = x < 0 ? 'legL' : 'legR';
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        group.add(g);
    });

    return { group };
}

export function createDetailedPerson(traits) {
    const { gender, skinColor, hairColor, shirtColor, pantsColor, shoeColor, hairStyle } = traits;
    const group = new THREE.Group();

    // 골반 (Root)
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.9;
    group.add(pelvis);

    // 몸통
    const isFemale = gender === 'female';
    const torsoW = isFemale ? 0.26 : 0.32;
    const torso = box(torsoW, 0.45, 0.18, shirtColor);
    torso.position.y = 0.225;
    pelvis.add(torso);

    // 목과 머리
    const neck = new THREE.Group();
    neck.position.y = 0.225;
    torso.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.15;
    neck.add(headGroup);

    const head = box(0.24, 0.26, 0.24, skinColor);
    head.position.y = 0.13;
    headGroup.add(head);

    // 머리카락
    const hair = new THREE.Group();
    headGroup.add(hair);
    
    // 기본 머리 덮개
    const hairBase = box(0.26, 0.1, 0.26, hairColor);
    hairBase.position.y = 0.28;
    hair.add(hairBase);
    const hairBack = box(0.26, 0.15, 0.05, hairColor);
    hairBack.position.set(0, 0.15, -0.12);
    hair.add(hairBack);

    // 스타일에 따른 추가 머리
    if (hairStyle === 'long' && isFemale) {
        const hairLong = box(0.28, 0.3, 0.08, hairColor);
        hairLong.position.set(0, 0.0, -0.12);
        hair.add(hairLong);
    } else if (hairStyle === 'ponytail') {
        const tail = box(0.08, 0.2, 0.08, hairColor);
        tail.position.set(0, 0.2, -0.15);
        tail.rotation.x = 0.4;
        hair.add(tail);
    } else if (hairStyle === 'bun') {
        const bun = box(0.12, 0.12, 0.12, hairColor);
        bun.position.set(0, 0.32, -0.05);
        hair.add(bun);
    }

    // 눈썹
    const eyebrowL = box(0.06, 0.015, 0.01, hairColor);
    eyebrowL.position.set(0.05, 0.18, 0.125);
    headGroup.add(eyebrowL);
    const eyebrowR = box(0.06, 0.015, 0.01, hairColor);
    eyebrowR.position.set(-0.05, 0.18, 0.125);
    headGroup.add(eyebrowR);

    // 눈
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), eyeMat);
    eyeL.position.set(0.05, 0.14, 0.125);
    headGroup.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), eyeMat);
    eyeR.position.set(-0.05, 0.14, 0.125);
    headGroup.add(eyeR);

    // 입
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0x883333 }));
    mouth.position.set(0, 0.06, 0.125);
    headGroup.add(mouth);

    // 팔 생성 함수 (어깨 -> 상박 -> 팔꿈치 -> 하박 -> 손목 -> 손 -> 손가락)
    function createArm(isLeft) {
        const sign = isLeft ? 1 : -1;
        const shoulder = new THREE.Group();
        shoulder.position.set(sign * (torsoW / 2 + 0.05), 0.18, 0);

        const upperArm = box(0.08, 0.22, 0.08, shirtColor);
        upperArm.position.y = -0.11;
        shoulder.add(upperArm);

        const elbow = new THREE.Group();
        elbow.position.y = -0.22;
        shoulder.add(elbow);

        const lowerArm = box(0.07, 0.2, 0.07, skinColor);
        lowerArm.position.y = -0.1;
        elbow.add(lowerArm);

        const wrist = new THREE.Group();
        wrist.position.y = -0.2;
        elbow.add(wrist);

        const hand = box(0.06, 0.08, 0.04, skinColor);
        hand.position.y = -0.04;
        wrist.add(hand);

        // 손가락 (상세화)
        const fingers = [];
        for (let i = 0; i < 4; i++) {
            const f = box(0.012, 0.04, 0.012, skinColor);
            f.position.set(sign * (-0.02 + i * 0.013), -0.1, 0.01);
            wrist.add(f);
            fingers.push(f);
        }
        const thumb = box(0.012, 0.03, 0.012, skinColor);
        thumb.position.set(sign * 0.035, -0.06, 0.01);
        wrist.add(thumb);
        fingers.push(thumb);

        return { shoulder, elbow, wrist, fingers };
    }

    const armL = createArm(true);
    torso.add(armL.shoulder);
    const armR = createArm(false);
    torso.add(armR.shoulder);

    // 다리 생성 함수 (고관절 -> 허벅지 -> 무릎 -> 종아리 -> 발목 -> 발)
    function createLeg(isLeft) {
        const sign = isLeft ? 1 : -1;
        const hip = new THREE.Group();
        hip.position.set(sign * 0.08, -0.05, 0);

        const thigh = box(0.12, 0.26, 0.12, pantsColor);
        thigh.position.y = -0.13;
        hip.add(thigh);

        const knee = new THREE.Group();
        knee.position.y = -0.26;
        hip.add(knee);

        const calf = box(0.11, 0.24, 0.11, pantsColor);
        calf.position.y = -0.12;
        knee.add(calf);

        const ankle = new THREE.Group();
        ankle.position.y = -0.24;
        knee.add(ankle);

        const foot = box(0.13, 0.08, 0.18, shoeColor);
        foot.position.set(0, -0.04, 0.03);
        ankle.add(foot);

        return { hip, knee, ankle };
    }

    const legL = createLeg(true);
    pelvis.add(legL.hip);
    const legR = createLeg(false);
    pelvis.add(legR.hip);

    const person = { 
        group, pelvis, torso, neck, headGroup, eyebrowL, eyebrowR, eyeL, eyeR, mouth,
        armL, armR, legL, legR, traits 
    };

    return person;
}

// 걷기, 앉기, 타이핑, 수영 애니메이션 통합 컨트롤러
export function updatePersonAnimation(person, phase, stamina, time, delta, isWorking) {
    const { pelvis, torso, neck, headGroup, armL, armR, legL, legR, eyebrowL, eyebrowR, eyeL, eyeR } = person;
    
    // 초기화
    torso.rotation.set(0, 0, 0);
    neck.rotation.set(0, 0, 0);
    headGroup.rotation.set(0, 0, 0);
    armL.shoulder.rotation.set(0, 0, 0); armL.elbow.rotation.set(0, 0, 0); armL.wrist.rotation.set(0, 0, 0);
    armR.shoulder.rotation.set(0, 0, 0); armR.elbow.rotation.set(0, 0, 0); armR.wrist.rotation.set(0, 0, 0);
    legL.hip.rotation.set(0, 0, 0); legL.knee.rotation.set(0, 0, 0);
    legR.hip.rotation.set(0, 0, 0); legR.knee.rotation.set(0, 0, 0);
    
    // 깜빡임
    const blink = Math.sin(time * 5) > 0.95 ? 0.1 : 1;
    eyeL.scale.y = blink; eyeR.scale.y = blink;

    // 피로도에 따른 눈썹/눈 변화
    if (stamina < 30) {
        eyebrowL.rotation.z = -0.15; eyebrowR.rotation.z = 0.15; // 슬픈/지친 눈썹
        if (blink === 1) { eyeL.scale.y = 0.5; eyeR.scale.y = 0.5; } // 반쯤 감은 눈
    } else if (isWorking) {
        eyebrowL.rotation.z = 0.1; eyebrowR.rotation.z = -0.1; // 집중한 눈썹
    } else {
        eyebrowL.rotation.z = 0; eyebrowR.rotation.z = 0;
    }

    if (phase === 'walking-in' || phase === 'leisure-walking') {
        const speed = stamina < 30 ? 4 : 8; // 지치면 느리게
        const stride = stamina < 30 ? 0.3 : 0.5;
        
        pelvis.position.y = 0.9 + Math.abs(Math.sin(time * speed)) * 0.05;
        torso.rotation.y = Math.sin(time * speed) * 0.1;
        torso.rotation.x = stamina < 30 ? 0.15 : 0; // 지치면 굽은 허리

        // 걷기 (IK 근사)
        legL.hip.rotation.x = Math.sin(time * speed) * stride;
        legL.knee.rotation.x = Math.max(0, -Math.sin(time * speed) * stride * 1.5);
        legR.hip.rotation.x = Math.sin(time * speed + Math.PI) * stride;
        legR.knee.rotation.x = Math.max(0, -Math.sin(time * speed + Math.PI) * stride * 1.5);

        armL.shoulder.rotation.x = Math.sin(time * speed + Math.PI) * stride;
        armL.elbow.rotation.x = -0.1;
        armR.shoulder.rotation.x = Math.sin(time * speed) * stride;
        armR.elbow.rotation.x = -0.1;

        headGroup.rotation.y = -Math.sin(time * speed) * 0.05;
        if (stamina < 30) headGroup.rotation.x = 0.2; // 고개 숙임

    } else if (phase === 'sitting') {
        pelvis.position.y = 0.55;
        legL.hip.rotation.x = -Math.PI / 2 + 0.1;
        legL.knee.rotation.x = Math.PI / 2 - 0.1;
        legR.hip.rotation.x = -Math.PI / 2 + 0.1;
        legR.knee.rotation.x = Math.PI / 2 - 0.1;

        if (isWorking) {
            torso.rotation.x = 0.1; // 화면 쪽으로 기울임
            headGroup.rotation.x = -0.05;
            
            // 키보드 타이핑 자세
            armL.shoulder.rotation.set(0.3, 0, 0.1);
            armL.shoulder.rotation.x = 0.4;
            armL.elbow.rotation.x = -1.2; // 팔꿈치 굽힘
            armL.wrist.rotation.x = -0.2;

            armR.shoulder.rotation.set(0.3, 0, -0.1);
            armR.shoulder.rotation.x = 0.4;
            armR.elbow.rotation.x = -1.2;
            armR.wrist.rotation.x = -0.2;

            // 타이핑 모션 (손가락과 하박)
            const typeSpeed = stamina < 30 ? 15 : 30;
            armL.elbow.rotation.x += Math.sin(time * typeSpeed) * 0.05;
            armR.elbow.rotation.x += Math.cos(time * typeSpeed * 1.1) * 0.05;
            
            // 손가락 타건
            armL.fingers.forEach((f, i) => f.rotation.x = Math.sin(time * typeSpeed + i) * 0.2);
            armR.fingers.forEach((f, i) => f.rotation.x = Math.cos(time * typeSpeed * 1.2 + i) * 0.2);

        } else {
            // 쉬고 있음 (앉아서)
            torso.rotation.x = -0.1; // 등받이에 기댐
            headGroup.rotation.y = Math.sin(time) * 0.1;
            
            armL.shoulder.rotation.set(0.1, 0, 0.2);
            armL.elbow.rotation.x = -0.2;
            armR.shoulder.rotation.set(0.1, 0, -0.2);
            armR.elbow.rotation.x = -0.2;
        }

    } else if (phase === 'swimming') {
        pelvis.position.y = 0.25;
        torso.rotation.x = Math.PI / 2 - 0.2; // 수면과 수평
        headGroup.rotation.x = -Math.PI / 2 + 0.4; // 고개 들기

        // 자유형 모션
        const swimSpeed = 4;
        armL.shoulder.rotation.x = Math.sin(time * swimSpeed) * 1.5;
        armL.shoulder.rotation.z = 0.2;
        armL.elbow.rotation.x = -0.2;

        armR.shoulder.rotation.x = Math.sin(time * swimSpeed + Math.PI) * 1.5;
        armR.shoulder.rotation.z = -0.2;
        armR.elbow.rotation.x = -0.2;

        legL.hip.rotation.x = Math.sin(time * swimSpeed * 2) * 0.3;
        legR.hip.rotation.x = Math.sin(time * swimSpeed * 2 + Math.PI) * 0.3;

    } else if (phase === 'leisure') {
        pelvis.position.y = 0.9;
        torso.rotation.y = Math.sin(time * 0.5) * 0.2;
        headGroup.rotation.y = Math.sin(time * 0.7) * 0.3;
        
        armL.shoulder.rotation.set(0.1, 0, 0.1);
        armR.shoulder.rotation.set(0.1, 0, -0.1);
        
        // 가끔 스트레칭
        if (Math.sin(time * 0.2) > 0.8) {
            armL.shoulder.rotation.x = -2.5;
            armR.shoulder.rotation.x = -2.5;
            headGroup.rotation.x = 0.2;
            torso.rotation.x = -0.1;
        }
    }
}
