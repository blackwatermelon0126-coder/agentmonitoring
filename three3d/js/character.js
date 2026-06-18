import * as THREE from 'three';

const SKIN_COLORS = [0xFFCC99, 0xF5CBA7, 0xFFE0B2, 0xD2B48C, 0xC68642, 0x8D5524, 0xFFDFC4, 0xF0C8A0];
const HAIR_COLORS = [0x1B1B1B, 0x3E2723, 0x5D4037, 0x6D4C41, 0x795548, 0xD4A574, 0xFFD54F, 0xE65100, 0x880E4F, 0x4E342E];

function box(w, h, d, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
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
