// ============================================
// Agent Monitor - 3D Living Office
// 카페테리아 + 야외마당 + 다양한 캐릭터
// ============================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFactory, updateFactory } from './factory.js';
import { createWarehouse, updateWarehouse } from './warehouse.js';
import { createDetailedPerson, createDetailedPerson as _createDetailedPersonForStairs, traitsFromSeed } from './character.js';
import { buildTeamsDeeplink } from './deeplink.js';
import { initLunchGame, triggerLunchGame } from './lunchgame.js';
import { initChatPanel, openChat, handleTeamsNotification } from './chat-panel.js';


// ---- 캐릭터 특성 풀 ----
const SKIN_COLORS = [0xFFCC99, 0xF5CBA7, 0xFFE0B2, 0xD2B48C, 0xC68642, 0x8D5524, 0xFFDFC4, 0xF0C8A0];
const HAIR_COLORS = [0x1B1B1B, 0x3E2723, 0x5D4037, 0x6D4C41, 0x795548, 0xD4A574, 0xFFD54F, 0xE65100, 0x880E4F, 0x4E342E];
const SHIRT_COLORS = [0x4CAF50, 0xFF9800, 0x2196F3, 0x9C27B0, 0xF44336, 0x00BCD4, 0x8BC34A, 0xFF5722, 0x3F51B5, 0xE91E63, 0x009688, 0x607D8B, 0xCDDC39, 0x795548];
const PANTS_COLORS = [0x37474F, 0x263238, 0x1A237E, 0x212121, 0x3E2723, 0x455A64];
const SHOE_COLORS = [0x5D4037, 0x3E2723, 0x212121, 0xF44336, 0x1565C0, 0xFFFFFF];
const HAIR_STYLES = ['short', 'buzz', 'ponytail', 'bun', 'long', 'curly', 'mohawk', 'parted'];
const ACCESSORIES = ['none', 'glasses', 'roundGlasses', 'sunglasses', 'headphones', 'bowtie'];
const GENDERS = ['male', 'female'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(a, b) { return a + Math.random() * (b - a); }

// ---- 씬 초기화 ----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7EC8E3);
scene.fog = new THREE.FogExp2(0x7EC8E3, 0.012); // 안개를 옅게 하여 선명도 증가

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
camera.position.set(-20, 30, 45); // 대지 전체 + 공장 + 물류창고 한 화면 조망

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 고해상도 픽셀 매핑
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap; // 더 부드럽고 사실적인 VSM 그림자
renderer.toneMapping = THREE.ACESFilmicToneMapping; // 게임처럼 풍부한 색감
renderer.toneMappingExposure = 1.6; // 밝기와 대비를 조금 더 강하게
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;             // 더 즉각적인 반응
controls.maxPolarAngle = Math.PI / 2.05;   // 땅 아래로 안 내려가게
controls.minDistance = 2;
controls.maxDistance = 80;                  // 더 멀리 zoom-out 가능
controls.target.set(0, 1, 0);
controls.rotateSpeed = 1.1;                 // 회전 빠르게
controls.panSpeed = 1.5;                    // 이동(우클릭/Shift+좌클릭) 빠르게
controls.zoomSpeed = 1.4;                   // 휠 줌 빠르게
controls.keyPanSpeed = 30;                  // 화살표키 패닝 속도
controls.listenToKeyEvents(window);         // 화살표키 활성화
controls.screenSpacePanning = true;         // 카메라 평면 기준 패닝(더 직관적)

// ---- 프리셋 뷰 (1~6 단축키로 전환) ----
// 시설은 envGroup 안에 있고 z = -28 만큼 뒤로 이동됨
// 공장은 (-30, *, 25) 중심, 정면이 -x(서쪽)
const VIEWS = {
    '1': { name: '전체',     pos: [-20, 30, 45],  target: [-20, 1, 0] },
    '2': { name: '오피스',   pos: [0, 6, 0],      target: [0, 1, -18] },
    '3': { name: '공장 위',  pos: [-22, 26, 18],  target: [-22, 0, 18] },
    '4': { name: '공장 정면', pos: [-50, 5, 18],  target: [-22, 2, 18] },
    '5': { name: '2층 사무실', pos: [0, 5, -8],   target: [-10, 2.5, -18] },
    '6': { name: '수영장',   pos: [20, 12, 0],    target: [12, 0, -13] },
    '7': { name: '물류창고',  pos: [-30, 14, 38], target: [-42, 1, 22] },
};
function tweenView(view, ms = 600) {
    const sp = camera.position.clone();
    const st = controls.target.clone();
    const ep = new THREE.Vector3(...view.pos);
    const et = new THREE.Vector3(...view.target);
    const t0 = performance.now();
    function step() {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        camera.position.lerpVectors(sp, ep, e);
        controls.target.lerpVectors(st, et, e);
        controls.update();
        if (k < 1) requestAnimationFrame(step);
    }
    step();
}

// ---- 조명 (더 극적인 게임 조명) ----
const ambientLight = new THREE.AmbientLight(0xfff0e6, 0.8); // 따뜻한 기본 톤업
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xfff8e0, 2.5); // 태양광 강도 증가
sun.position.set(15, 25, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); // 그림자 해상도 2배 증가 (고품질)
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0005; // 그림자 깨짐(아티팩트) 방지
scene.add(sun);

const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3d6e32, 1.2); // 하늘과 땅의 대비광 증가
scene.add(hemiLight);

// 사무실 내부 조명 (천장 형광등 느낌 -> 조금 더 따뜻한 LED 느낌)
const interiorLight = new THREE.PointLight(0xfff0d0, 8.0, 25, 1.0);
interiorLight.position.set(-2, 3.2, 0);
interiorLight.castShadow = true;
scene.add(interiorLight);
const interiorLight2 = new THREE.PointLight(0xfff0d0, 8.0, 25, 1.0);
interiorLight2.position.set(2, 3.2, 0);
interiorLight2.castShadow = true;
scene.add(interiorLight2);

// ============================================
// 시간/날씨 시스템
// ============================================
const DAY_DURATION = 180; // 초 (한 사이클)
let weatherChangedAt = 0;
let weatherDuration = 25000;
let currentWeather = 'clear';

const SKY_PALETTE = [
    { t: 0.0,  c: 0x14143A }, // 자정
    { t: 0.18, c: 0x352F5A }, // 새벽
    { t: 0.24, c: 0xFFA078 }, // 일출
    { t: 0.32, c: 0xA9D6E8 }, // 오전
    { t: 0.5,  c: 0x6BB8DA }, // 정오
    { t: 0.62, c: 0x9CD0E6 }, // 오후
    { t: 0.74, c: 0xFFB870 }, // 황혼
    { t: 0.8,  c: 0xFF7050 }, // 일몰
    { t: 0.86, c: 0x6A4090 }, // 자색
    { t: 0.94, c: 0x282859 }, // 늦은 밤
    { t: 1.0,  c: 0x14143A }, // 자정
];

function timeLabel(phase) {
    if (phase < 0.18) return '🌙 새벽';
    if (phase < 0.28) return '🌅 일출';
    if (phase < 0.45) return '☀️ 오전';
    if (phase < 0.6)  return '🌤 정오';
    if (phase < 0.72) return '🌇 오후';
    if (phase < 0.83) return '🌆 일몰';
    return '🌃 저녁';
}

function weatherLabel(w) {
    if (w === 'rain') return '🌧 비';
    if (w === 'cloudy') return '☁️ 흐림';
    return '☀️ 맑음';
}

function lerpSky(t) {
    for (let i = 0; i < SKY_PALETTE.length - 1; i++) {
        if (t >= SKY_PALETTE[i].t && t < SKY_PALETTE[i + 1].t) {
            const f = (t - SKY_PALETTE[i].t) / (SKY_PALETTE[i + 1].t - SKY_PALETTE[i].t);
            return new THREE.Color(SKY_PALETTE[i].c).lerp(new THREE.Color(SKY_PALETTE[i + 1].c), f);
        }
    }
    return new THREE.Color(SKY_PALETTE[0].c);
}

// ---- 해 / 달 / 별 ----
const CELESTIAL_RADIUS = 38;

// 해 본체
const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, fog: false })
);
sunDisc.renderOrder = -1;
scene.add(sunDisc);

// 해 광휘 (외곽 글로우)
const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
);
sunGlow.renderOrder = -2;
scene.add(sunGlow);

// 달 본체
const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 32),
    new THREE.MeshBasicMaterial({ color: 0xfffae6, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, fog: false })
);
moonDisc.renderOrder = -1;
scene.add(moonDisc);

// 달 표면 크레이터 (작은 점 3개)
const moonCraters = [];
for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(
        new THREE.CircleGeometry(0.18 + Math.random() * 0.15, 12),
        new THREE.MeshBasicMaterial({ color: 0xd8d2bb, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false })
    );
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.0;
    c.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.01);
    moonDisc.add(c);
    moonCraters.push(c);
}

// 달 광휘
const moonGlow = new THREE.Mesh(
    new THREE.CircleGeometry(3.0, 32),
    new THREE.MeshBasicMaterial({ color: 0xccddff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
);
moonGlow.renderOrder = -2;
scene.add(moonGlow);

// 별 (반구형 분포)
const STAR_COUNT = 600;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(STAR_COUNT * 3);
const starSizes = new Float32Array(STAR_COUNT);
const starTwinkle = new Float32Array(STAR_COUNT); // 반짝임 위상
for (let i = 0; i < STAR_COUNT; i++) {
    // 상반구 (지평선 위) 분포
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 0.95); // 0 (천정) ~ ~π/2 (지평선)
    const r = 55;
    starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi) + 2;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starSizes[i] = 0.05 + Math.random() * 0.18;
    starTwinkle[i] = Math.random() * Math.PI * 2;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.18,
    transparent: true, opacity: 0,
    sizeAttenuation: false, depthWrite: false, fog: false
});
const stars = new THREE.Points(starGeo, starMat);
stars.renderOrder = -3;
scene.add(stars);

// ---- 구름 ----
const clouds = [];
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
for (let i = 0; i < 28; i++) {
    const cloud = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffCount; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.6 + Math.random() * 0.8, 8, 6), cloudMat);
        puff.position.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.0);
        cloud.add(puff);
    }
    cloud.position.set((Math.random() - 0.5) * 70, 9 + Math.random() * 6, (Math.random() - 0.5) * 50);
    cloud.userData = { speed: 0.2 + Math.random() * 0.5 };
    scene.add(cloud);
    clouds.push(cloud);
}

// ---- 비 파티클 ----
const RAIN_COUNT = 2500;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 3);
const rainVel = new Float32Array(RAIN_COUNT);
for (let i = 0; i < RAIN_COUNT; i++) {
    rainPos[i * 3]     = (Math.random() - 0.5) * 60;
    rainPos[i * 3 + 1] = Math.random() * 25;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    rainVel[i] = 8 + Math.random() * 6;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.PointsMaterial({ color: 0xaaccee, size: 0.12, transparent: true, opacity: 0.55, sizeAttenuation: true });
const rain = new THREE.Points(rainGeo, rainMat);
rain.visible = false;
scene.add(rain);

function applyWeather(w) {
    currentWeather = w;
    rain.visible = (w === 'rain');
    if (w === 'clear') {
        cloudMat.color.setHex(0xffffff); cloudMat.opacity = 0.85;
        clouds.forEach((c, i) => c.visible = i < 6);
    } else if (w === 'cloudy') {
        cloudMat.color.setHex(0xdadada); cloudMat.opacity = 0.95;
        clouds.forEach(c => c.visible = true);
    } else { // rain
        cloudMat.color.setHex(0x6a6a76); cloudMat.opacity = 0.95;
        clouds.forEach(c => c.visible = true);
    }
}

function pickWeather() {
    const r = Math.random();
    if (r < 0.55) return 'clear';
    if (r < 0.82) return 'cloudy';
    return 'rain';
}

applyWeather('clear');
weatherChangedAt = Date.now();

// ---- 지형 ----
// 넓은 잔디 (색상을 더 화사한 툰 스타일 잔디로 변경)
const grassMat = new THREE.MeshStandardMaterial({ 
    color: 0x7CB342, 
    roughness: 0.8, 
    metalness: 0.1 
});
const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), grassMat);
grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass);

// ===== ENV GROUP =====
// 공장을 제외한 모든 환경/시설을 한 그룹에 묶어 마지막에 z 음수로 일괄 이동
// (시설들을 잔디 안쪽 깊숙이 배치하여 전체가 한눈에 보이게 함)
const envGroup = new THREE.Group();
scene.add(envGroup);
const _origSceneAdd = scene.add.bind(scene);
scene.add = function(obj) { envGroup.add(obj); return scene; };

// 길 (메인 건물 → 입구)
function createPath(x, z, w, d, color = 0xB0BEC5) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0 }));
    p.rotation.x = -Math.PI / 2; p.position.set(x, 0.015, z); p.receiveShadow = true; scene.add(p);
}
createPath(0, 8, 3, 6, 0x90A4AE); // 정문 길
createPath(-8, 2, 2, 10, 0x90A4AE); // 카페 가는 길
createPath(8, 0, 12, 2, 0x90A4AE); // 마당 가는 길

// ============================================
// CTR 창원 1공장 — envGroup 밖에서 별도 위치
// ============================================
scene.add = _origSceneAdd; // 패치 해제 (공장/창고는 그룹 밖)
// 공장 서쪽 입구(-x 방향) 진출입로 + 창고와 공장 사이 연결로
createPath(-22, 25, 14, 3, 0x90A4AE);
createPath(-32, 22, 10, 3, 0x90A4AE); // 창고 ↔ 공장 진입로
createFactory(scene);
createWarehouse(scene);
scene.add = function(obj) { envGroup.add(obj); return scene; }; // 다시 envGroup으로

// ============================================
// 건물: 메인 오피스
// ============================================
function box(w, h, d, color) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 }));
}

// 사무실 바닥 (조명 반사가 잘 되게 변경)
const offFloor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: 0xCFD8DC, roughness: 0.3, metalness: 0.1 }));
offFloor.rotation.x = -Math.PI / 2; offFloor.position.set(0, 0.02, 0); offFloor.receiveShadow = true; scene.add(offFloor);

// 벽 (색감을 더 밝게)
function wall(w, h, x, y, z, ry = 0, c = 0xECEFF1) {
    const m = box(w, h, 0.15, c); m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
}
wall(12, 3.5, 0, 1.75, -4);       // 뒷벽
wall(8, 3.5, -6, 1.75, 0, Math.PI / 2); // 좌벽
wall(8, 3.5, 6, 1.75, 0, Math.PI / 2);  // 우벽

// ----- 전면 통유리 (커튼월) -----
const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xE3F2FD, transparent: true, opacity: 0.25,
    transmission: 0.95, roughness: 0.0, metalness: 0.1,
    ior: 1.5, thickness: 0.2, // 굴절률과 두께로 사실적인 유리 효과
    side: THREE.DoubleSide
});
// 유리 패널 (3분할)
for (const gx of [-4, 0, 4]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.85, 3.3, 0.05), glassMat);
    panel.position.set(gx, 1.65, 4);
    scene.add(panel);
}
// 알루미늄 프레임 (기둥 + 상하 보)
const frameMat = new THREE.MeshStandardMaterial({ color: 0xCFCFD3, metalness: 0.6, roughness: 0.3 });
function frameCol(x, y = 1.75, h = 3.5) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), frameMat);
    c.position.set(x, y, 4); c.castShadow = true; scene.add(c);
}
[-6, -2, 2, 6].forEach(x => frameCol(x));
const topBeam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.18, 0.18), frameMat);
topBeam.position.set(0, 3.42, 4); scene.add(topBeam);
const botBeam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.12, 0.18), frameMat);
botBeam.position.set(0, 0.06, 4); scene.add(botBeam);
const midBeam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.08, 0.18), frameMat);
midBeam.position.set(0, 1.6, 4); scene.add(midBeam);

// 지붕
const roof = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 8.5), new THREE.MeshStandardMaterial({ color: 0x3a3a5a, side: THREE.DoubleSide }));
roof.rotation.x = Math.PI / 2; roof.position.y = 3.5; scene.add(roof);

// 창문
for (const wx of [-3, 0, 3]) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x9ECFFF, transparent: true, opacity: 0.3, emissive: 0x223344, emissiveIntensity: 0.2 }));
    glass.position.set(wx, 2.3, -3.9); scene.add(glass);
}

// ============================================
// 하트 풍선 (지붕 4 모서리)
// ============================================
function createHeartBalloon(x, y, z, color = 0xff3366) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15, emissive: color, emissiveIntensity: 0.08 });
    // 두 lobe (상단)
    const lobe1 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 18), mat);
    lobe1.position.set(-0.18, 0.12, 0);
    lobe1.castShadow = true; g.add(lobe1);
    const lobe2 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 18), mat);
    lobe2.position.set(0.18, 0.12, 0);
    lobe2.castShadow = true; g.add(lobe2);
    // 하단 끝(역원뿔)
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.65, 18), mat);
    tip.position.set(0, -0.34, 0); tip.rotation.x = Math.PI; g.add(tip);
    // 하이라이트 (반사광)
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    hl.position.set(-0.22, 0.28, 0.25); g.add(hl);
    // 끈 (지붕까지)
    const stringLen = y - 3.55; // 지붕 표면이 y=3.5
    const str = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, stringLen, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    str.position.set(0, -0.7 - stringLen / 2, 0); g.add(str);
    g.position.set(x, y, z);
    return g;
}

const balloonCorners = [
    [-5.5, 5.4, -3.5, 0xff3366],
    [ 5.5, 5.4, -3.5, 0xff66aa],
    [-5.5, 5.4,  3.5, 0xff66aa],
    [ 5.5, 5.4,  3.5, 0xff3366],
];
const balloons = balloonCorners.map(([x, y, z, c]) => {
    const b = createHeartBalloon(x, y, z, c);
    b.userData = { baseY: y, phase: Math.random() * Math.PI * 2 };
    scene.add(b); return b;
});

// 간판 - FLLABS
const signCanvas = document.createElement('canvas');
signCanvas.width = 512; signCanvas.height = 96;
const sctx = signCanvas.getContext('2d');
sctx.fillStyle = '#0d1421'; sctx.fillRect(0, 0, 512, 96);
sctx.fillStyle = '#00E5FF'; sctx.font = 'bold 56px sans-serif'; sctx.fillText('FLLABS', 145, 64);
sctx.fillStyle = '#ffffff'; sctx.font = '14px monospace'; sctx.fillText('AGENT  OFFICE', 195, 84);
const signTex = new THREE.CanvasTexture(signCanvas);
const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: signTex }));
sign.position.set(0, 3.85, 4.05); scene.add(sign);

// ============================================
// 2층 사무실 빌딩 (구 카페테리아 자리) + 우측 계단
// ============================================
const OFFICE2 = { x: -10, z: 0, w: 8, d: 6, floorH: 2.4 };
const totalH = OFFICE2.floorH * 2;

// 1층 바닥
const o2Floor = new THREE.Mesh(
    new THREE.PlaneGeometry(OFFICE2.w, OFFICE2.d),
    new THREE.MeshStandardMaterial({ color: 0xCFD8DC, roughness: 0.5, metalness: 0.1 })
);
o2Floor.rotation.x = -Math.PI / 2;
o2Floor.position.set(OFFICE2.x, 0.02, OFFICE2.z);
o2Floor.receiveShadow = true;
scene.add(o2Floor);

// 2층 슬래브 (1F 천장 + 2F 바닥)
const o2Slab = new THREE.Mesh(
    new THREE.BoxGeometry(OFFICE2.w, 0.18, OFFICE2.d),
    new THREE.MeshStandardMaterial({ color: 0xB0BEC5, roughness: 0.55 })
);
o2Slab.position.set(OFFICE2.x, OFFICE2.floorH, OFFICE2.z);
o2Slab.castShadow = true; o2Slab.receiveShadow = true;
scene.add(o2Slab);

// 외벽 (3면 통유리, 우측은 계단 노출용 오픈)
const o2GlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xE3F2FD, transparent: true, opacity: 0.2,
    transmission: 0.9, roughness: 0.04, metalness: 0.0,
    ior: 1.5, thickness: 0.1, side: THREE.DoubleSide
});
const o2FrameMat = new THREE.MeshStandardMaterial({ color: 0xCFCFD3, metalness: 0.7, roughness: 0.3 });

// 뒷면
const o2Back = new THREE.Mesh(new THREE.BoxGeometry(OFFICE2.w, totalH, 0.08), o2GlassMat);
o2Back.position.set(OFFICE2.x, totalH / 2, OFFICE2.z - OFFICE2.d / 2); scene.add(o2Back);
// 좌측
const o2Left = new THREE.Mesh(new THREE.BoxGeometry(0.08, totalH, OFFICE2.d), o2GlassMat);
o2Left.position.set(OFFICE2.x - OFFICE2.w / 2, totalH / 2, OFFICE2.z); scene.add(o2Left);
// 정면
const o2Front = new THREE.Mesh(new THREE.BoxGeometry(OFFICE2.w, totalH, 0.08), o2GlassMat);
o2Front.position.set(OFFICE2.x, totalH / 2, OFFICE2.z + OFFICE2.d / 2); scene.add(o2Front);
// 우측은 계단과 진입을 위해 외벽 없음

// 알루미늄 프레임 (코너 기둥)
for (const xo of [-OFFICE2.w / 2, OFFICE2.w / 2]) {
    for (const zo of [-OFFICE2.d / 2, OFFICE2.d / 2]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.14, totalH, 0.14), o2FrameMat);
        col.position.set(OFFICE2.x + xo, totalH / 2, OFFICE2.z + zo);
        col.castShadow = true;
        scene.add(col);
    }
}
// 상/중/하 가로 보 (정면 + 후면)
for (const zo of [-OFFICE2.d / 2, OFFICE2.d / 2]) {
    for (const yo of [0.06, OFFICE2.floorH, totalH - 0.06]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(OFFICE2.w, 0.12, 0.12), o2FrameMat);
        beam.position.set(OFFICE2.x, yo, OFFICE2.z + zo);
        scene.add(beam);
    }
}

// 지붕
const o2Roof = new THREE.Mesh(
    new THREE.BoxGeometry(OFFICE2.w + 0.4, 0.15, OFFICE2.d + 0.4),
    new THREE.MeshStandardMaterial({ color: 0x37474F, metalness: 0.4, roughness: 0.5 })
);
o2Roof.position.set(OFFICE2.x, totalH + 0.08, OFFICE2.z);
o2Roof.castShadow = true; o2Roof.receiveShadow = true;
scene.add(o2Roof);

// 정면 간판 "FLLABS 2F OFFICE"
const o2SignC = document.createElement('canvas');
o2SignC.width = 512; o2SignC.height = 128;
{
    const c = o2SignC.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#0D47A1'); g.addColorStop(1, '#1565C0');
    c.fillStyle = g; c.fillRect(0, 0, 512, 128);
    c.strokeStyle = '#FFEB3B'; c.lineWidth = 4; c.strokeRect(4, 4, 504, 120);
    c.fillStyle = '#FFFFFF'; c.font = 'bold 48px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('FLLABS 2F OFFICE', 256, 64);
}
const o2Sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 0.9),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(o2SignC) })
);
o2Sign.position.set(OFFICE2.x, totalH + 0.55, OFFICE2.z + OFFICE2.d / 2 + 0.08);
scene.add(o2Sign);

// 우측 계단 (외부 노출)
const STAIRS = {
    x: OFFICE2.x + OFFICE2.w / 2 + 0.6,
    zStart: OFFICE2.z + OFFICE2.d / 2 - 0.4,
    count: 7,
    width: 1.3
};
STAIRS.rise = OFFICE2.floorH / STAIRS.count;
STAIRS.run = 0.36;
const stairsMat = new THREE.MeshStandardMaterial({ color: 0x90A4AE, metalness: 0.5, roughness: 0.4 });
for (let i = 0; i < STAIRS.count; i++) {
    const step = new THREE.Mesh(
        new THREE.BoxGeometry(STAIRS.width, STAIRS.rise * 0.95, STAIRS.run),
        stairsMat
    );
    const sy = (i + 0.5) * STAIRS.rise;
    const sz = STAIRS.zStart - i * STAIRS.run;
    step.position.set(STAIRS.x, sy, sz);
    step.castShadow = true; step.receiveShadow = true;
    scene.add(step);
}
// 계단 끝 → 2층 진입 플랫폼
const stairsTopZ = STAIRS.zStart - (STAIRS.count - 1) * STAIRS.run;
const platform = new THREE.Mesh(
    new THREE.BoxGeometry(STAIRS.width + 0.4, 0.12, 1.4),
    stairsMat
);
platform.position.set(STAIRS.x, OFFICE2.floorH, stairsTopZ - 0.7);
platform.castShadow = true; platform.receiveShadow = true;
scene.add(platform);
// 핸드레일 (사선 — 양쪽)
const railMat = new THREE.MeshStandardMaterial({ color: 0xFFEB3B, metalness: 0.5 });
const stairLen = Math.sqrt((STAIRS.count * STAIRS.run) ** 2 + (STAIRS.count * STAIRS.rise) ** 2);
const stairAngle = Math.atan2(STAIRS.count * STAIRS.rise, STAIRS.count * STAIRS.run);
for (const xo of [-STAIRS.width / 2, STAIRS.width / 2]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, stairLen, 8), railMat);
    rail.position.set(
        STAIRS.x + xo,
        STAIRS.count * STAIRS.rise / 2 + 0.85,
        STAIRS.zStart - (STAIRS.count - 1) * STAIRS.run / 2
    );
    // Z축 회전 후 X축으로 기울이기: 짧은 방식 — 직접 quaternion
    rail.rotation.set(stairAngle, 0, Math.PI / 2);
    rail.castShadow = true;
    scene.add(rail);
}

// 책상 (1층 + 2층) — 책상 + 모니터
function o2Desk(localX, floor, screenColor) {
    const yBase = floor === 1 ? 0 : OFFICE2.floorH + 0.18;
    const desk = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.05, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xA0784C, roughness: 0.6 })
    );
    desk.position.set(OFFICE2.x + localX, yBase + 0.75, OFFICE2.z);
    desk.castShadow = true;
    scene.add(desk);
    for (const xo of [-0.6, 0.6]) {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.75, 0.7),
            new THREE.MeshStandardMaterial({ color: 0x666666 })
        );
        leg.position.set(OFFICE2.x + localX + xo, yBase + 0.375, OFFICE2.z);
        scene.add(leg);
    }
    const mon = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.4, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x212121 })
    );
    mon.position.set(OFFICE2.x + localX, yBase + 1.1, OFFICE2.z - 0.2);
    scene.add(mon);
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.35),
        new THREE.MeshBasicMaterial({ color: screenColor })
    );
    screen.position.set(OFFICE2.x + localX, yBase + 1.1, OFFICE2.z - 0.17);
    scene.add(screen);

    // 노트북 (책상 위, 작업자 쪽) — 베이스 + 화면 + 화면 글로우
    const lapBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.03, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 })
    );
    lapBase.position.set(OFFICE2.x + localX, yBase + 0.79, OFFICE2.z + 0.18);
    scene.add(lapBase);
    const lapScreen = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.22, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x202124, metalness: 0.5 })
    );
    lapScreen.position.set(OFFICE2.x + localX, yBase + 0.90, OFFICE2.z + 0.07);
    lapScreen.rotation.x = -0.35;
    scene.add(lapScreen);
    const lapGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.30, 0.18),
        new THREE.MeshBasicMaterial({ color: screenColor })
    );
    lapGlow.position.set(OFFICE2.x + localX, yBase + 0.90, OFFICE2.z + 0.082);
    lapGlow.rotation.x = -0.35;
    scene.add(lapGlow);
}
// 역할 에이전트 근무지 = FLLABS 1층 책상 5개(노트북, 역할색). 2층은 장식 책상 2개 유지.
const FLLABS_DESK_LOCALX = [-3, -1.5, 0, 1.5, 3];
const FLLABS_DESK_COLORS = [0x4A90D9, 0xE67E22, 0x27AE60, 0x8E44AD, 0xE74C3C];
FLLABS_DESK_LOCALX.forEach((lx, i) => o2Desk(lx, 1, FLLABS_DESK_COLORS[i]));
o2Desk(-2, 2, 0xFF9800);
o2Desk(1, 2, 0xE91E63);

// 계단 오르내리는 에이전트 — 무한 루프 애니메이션
const stairAgentObj = _createDetailedPersonForStairs({
    gender: 'male', skinColor: 0xFFDFC4,
    hairColor: 0x3E2723, shirtColor: 0x1565C0,
    pantsColor: 0x263238, shoeColor: 0x212121, hairStyle: 'short'
});
stairAgentObj.group.scale.set(0.9, 0.9, 0.9);
scene.add(stairAgentObj.group);

const stairAgent = stairAgentObj;
const STAIR_PATH = {
    floor1Start: { x: STAIRS.x, z: STAIRS.zStart + 0.6, y: 0 },
    floor1Stair: { x: STAIRS.x, z: STAIRS.zStart, y: 0 },
    floor2Stair: { x: STAIRS.x, z: stairsTopZ, y: OFFICE2.floorH },
    floor2Walk:  { x: STAIRS.x - 2.5, z: stairsTopZ, y: OFFICE2.floorH + 0.18 },
};

// cafeSpots는 LEISURE_SPOTS에서 참조되므로 유지 — 빌딩 주변 위치
const cafeSpots = [];
cafeSpots.push({ x: OFFICE2.x - 2, z: OFFICE2.z + 1.5 });
cafeSpots.push({ x: OFFICE2.x, z: OFFICE2.z + 1.5 });
cafeSpots.push({ x: OFFICE2.x + 1.5, z: OFFICE2.z + 1.5 });
cafeSpots.push({ x: OFFICE2.x - 2, z: OFFICE2.z - 1.5 });

// ============================================
// 야외 마당 (가든)
// ============================================
// 잔디 영역 (밝은 잔디)
const garden = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ color: 0x6bbd5a, roughness: 0.95 }));
garden.rotation.x = -Math.PI / 2; garden.position.set(12, 0.015, -1); garden.receiveShadow = true; scene.add(garden);

// 나무들
function createTree(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, 1.2 * scale, 6),
        new THREE.MeshStandardMaterial({ color: 0x795548, flatShading: true }));
    trunk.position.y = 0.6 * scale; trunk.castShadow = true; g.add(trunk);
    // 나뭇잎 (3단 구)
    for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry((0.5 - i * 0.1) * scale, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0x2E7D32 + i * 0x112200, flatShading: true }));
        leaf.position.set(rand(-0.1, 0.1), (1.2 + i * 0.4) * scale, rand(-0.1, 0.1));
        leaf.castShadow = true; g.add(leaf);
    }
    g.position.set(x, 0, z); scene.add(g);
}

createTree(8, -4, 1.2);
createTree(14, -4, 0.9);
createTree(16, 1, 1.1);
createTree(10, 3, 0.8);
createTree(15, -1, 1.0);
// 사무실 주변 나무
createTree(-5, 7, 0.7);
createTree(5, 7, 0.7);
createTree(-14, 4, 1.0);

// 야외 벤치
function createBench(x, z, ry = 0) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0x8D6E63 }));
    seat.position.y = 0.4; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.06), new THREE.MeshStandardMaterial({ color: 0x8D6E63 }));
    back.position.set(0, 0.6, -0.17); g.add(back);
    for (const lx of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.4 }));
        leg.position.set(lx, 0.2, 0); g.add(leg);
    }
    g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    return { x, z: z + 0.5, ry };
}

const gardenSpots = [];
gardenSpots.push(createBench(10, -2));
gardenSpots.push(createBench(13, 0, -0.5));
gardenSpots.push(createBench(11, 2, 0.3));
gardenSpots.push(createBench(14, 2, -0.3));

// 야외 테이블 (파라솔)
function createOutdoorTable(x, z) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xBCAAA4 }));
    top.position.y = 0.7; g.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 }));
    leg.position.y = 0.35; g.add(leg);
    // 파라솔
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.3, 8), new THREE.MeshStandardMaterial({ color: pick([0xF44336, 0x2196F3, 0xFFEB3B, 0x4CAF50]) }));
    umbrella.position.y = 1.6; g.add(umbrella);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 }));
    pole.position.y = 1.2; g.add(pole);
    g.position.set(x, 0, z); scene.add(g);
    return { x, z: z + 0.5 };
}

gardenSpots.push(createOutdoorTable(9, -1));
gardenSpots.push(createOutdoorTable(12, -3));

// 꽃밭 (수영장 영역 피해서 배치)
for (let i = 0; i < 20; i++) {
    const fx = rand(8, 16), fz = rand(-4, -2);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshStandardMaterial({ color: pick([0xFF4081, 0xFFEB3B, 0xE040FB, 0xFF6E40, 0x69F0AE]), flatShading: true }));
    flower.position.set(fx, 0.15, fz);
    scene.add(flower);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.15, 3), new THREE.MeshStandardMaterial({ color: 0x388E3C }));
    stem.position.set(fx, 0.075, fz); scene.add(stem);
}

// ============================================
// 수영장 (직원 휴식 공간)
// ============================================
const POOL = { x: 12, z: 4.5, w: 6, d: 4 };

// 수영장 데크 (풀 둘레 4면 프레임)
const deckMat = new THREE.MeshStandardMaterial({ color: 0xE0DACB, roughness: 0.85 });
const deckBorder = 0.9;
function deckStrip(w, d, x, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), deckMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.025, z); m.receiveShadow = true; scene.add(m);
}
// 위
deckStrip(POOL.w + deckBorder * 2, deckBorder, POOL.x, POOL.z - POOL.d / 2 - deckBorder / 2);
// 아래
deckStrip(POOL.w + deckBorder * 2, deckBorder, POOL.x, POOL.z + POOL.d / 2 + deckBorder / 2);
// 좌
deckStrip(deckBorder, POOL.d, POOL.x - POOL.w / 2 - deckBorder / 2, POOL.z);
// 우
deckStrip(deckBorder, POOL.d, POOL.x + POOL.w / 2 + deckBorder / 2, POOL.z);

// 수영장 안쪽 바닥 (잔디 가려주는 진한 청록)
const poolFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(POOL.w, POOL.d),
    new THREE.MeshStandardMaterial({ color: 0x0277BD, roughness: 0.7 })
);
poolFloor.rotation.x = -Math.PI / 2;
poolFloor.position.set(POOL.x, 0.03, POOL.z); scene.add(poolFloor);

// 수면 (약간 위)
const water = new THREE.Mesh(
    new THREE.PlaneGeometry(POOL.w, POOL.d, 32, 24), // 물결 해상도 증가
    new THREE.MeshPhysicalMaterial({
        color: 0x00E5FF, transparent: true, opacity: 0.85,
        roughness: 0.05, metalness: 0.1,
        transmission: 0.8, ior: 1.33,
        clearcoat: 1.0, clearcoatRoughness: 0.1, // 코팅 효과로 반사광 추가
        side: THREE.DoubleSide
    })
);
water.rotation.x = -Math.PI / 2;
water.position.set(POOL.x, 0.08, POOL.z);
scene.add(water);

// 수면 애니메이션용 참조
const waterPositions = water.geometry.attributes.position;
const waterBasePos = waterPositions.array.slice();

// 풀 가장자리 (테두리 4면)
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xF5F5F0, roughness: 0.6 });
function poolEdge(w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMat);
    m.position.set(x, y, z); m.castShadow = true; scene.add(m);
}
poolEdge(POOL.w + 0.4, 0.08, 0.2, POOL.x, 0.04, POOL.z - POOL.d / 2 - 0.1); // 위쪽
poolEdge(POOL.w + 0.4, 0.08, 0.2, POOL.x, 0.04, POOL.z + POOL.d / 2 + 0.1); // 아래쪽
poolEdge(0.2, 0.08, POOL.d + 0.4, POOL.x - POOL.w / 2 - 0.1, 0.04, POOL.z); // 좌
poolEdge(0.2, 0.08, POOL.d + 0.4, POOL.x + POOL.w / 2 + 0.1, 0.04, POOL.z); // 우

// 선베드 (선탠 의자) 2개
function createSunbed(x, z, ry = 0) {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.4 }));
    bed.position.y = 0.25; bed.castShadow = true; g.add(bed);
    // 다리 4개
    for (const [lx, lz] of [[-0.7, -0.2], [-0.7, 0.2], [0.7, -0.2], [0.7, 0.2]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 }));
        leg.position.set(lx, 0.11, lz); g.add(leg);
    }
    // 등받이 (살짝 기울임)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0xFFFFFF }));
    back.position.set(-0.55, 0.4, 0); back.rotation.z = -0.45; g.add(back);
    // 비치 타올
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.45), new THREE.MeshStandardMaterial({ color: pick([0xE91E63, 0xFFEB3B, 0x00BCD4, 0xFF5722]) }));
    towel.position.set(0.1, 0.3, 0); g.add(towel);
    g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
}
createSunbed(POOL.x - 1, POOL.z + POOL.d / 2 + 0.9);
createSunbed(POOL.x + 1, POOL.z + POOL.d / 2 + 0.9);
createSunbed(POOL.x - 1, POOL.z - POOL.d / 2 - 0.9, Math.PI);
createSunbed(POOL.x + 1, POOL.z - POOL.d / 2 - 0.9, Math.PI);

// 파라솔
function createPoolUmbrella(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0xCCCCCC, metalness: 0.5 }));
    pole.position.y = 1.1; g.add(pole);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xFF7043, side: THREE.DoubleSide }));
    cap.position.y = 2.15; cap.castShadow = true; g.add(cap);
    g.position.set(x, 0, z); scene.add(g);
}
createPoolUmbrella(POOL.x - 2, POOL.z + POOL.d / 2 + 0.9);
createPoolUmbrella(POOL.x + 2, POOL.z - POOL.d / 2 - 0.9);

// ============================================
// 매점: 이서의 꿈나라 사탕 과자집
// ============================================
const SHOP = { x: 18, z: 4.5, w: 4.5, d: 3.2 };

// 매점 바닥
const shopFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(SHOP.w, SHOP.d),
    new THREE.MeshStandardMaterial({ color: 0xFFE4E1, roughness: 0.7 })
);
shopFloor.rotation.x = -Math.PI / 2;
shopFloor.position.set(SHOP.x, 0.02, SHOP.z); shopFloor.receiveShadow = true; scene.add(shopFloor);

// 매점 통유리 4면 + 알루미늄 프레임
const shopGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFFAFC, transparent: true, opacity: 0.18,
    transmission: 0.9, roughness: 0.05, metalness: 0.0,
    side: THREE.DoubleSide, thickness: 0.04
});
const shopFrameMat = new THREE.MeshStandardMaterial({ color: 0xFF9AB6, metalness: 0.3, roughness: 0.4 });

// 4벽 유리 패널
function shopWall(w, h, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), shopGlassMat);
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
}
shopWall(SHOP.w - 0.15, 2.4, SHOP.x, 1.2, SHOP.z - SHOP.d / 2);              // 뒷
shopWall(SHOP.d - 0.15, 2.4, SHOP.x - SHOP.w / 2, 1.2, SHOP.z, Math.PI / 2); // 좌
shopWall(SHOP.d - 0.15, 2.4, SHOP.x + SHOP.w / 2, 1.2, SHOP.z, Math.PI / 2); // 우
// 앞면 - 입구 양옆 두 패널
shopWall(1.4, 2.4, SHOP.x - 1.4, 1.2, SHOP.z + SHOP.d / 2);
shopWall(1.4, 2.4, SHOP.x + 1.4, 1.2, SHOP.z + SHOP.d / 2);
// 입구 위쪽
shopWall(1.4, 0.8, SHOP.x, 2.0, SHOP.z + SHOP.d / 2);

// 모서리 기둥
function shopCol(x, z) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), shopFrameMat);
    c.position.set(x, 1.25, z); scene.add(c);
}
shopCol(SHOP.x - SHOP.w / 2, SHOP.z - SHOP.d / 2);
shopCol(SHOP.x + SHOP.w / 2, SHOP.z - SHOP.d / 2);
shopCol(SHOP.x - SHOP.w / 2, SHOP.z + SHOP.d / 2);
shopCol(SHOP.x + SHOP.w / 2, SHOP.z + SHOP.d / 2);

// 매점 지붕 (분홍 차양)
const shopRoof = new THREE.Mesh(
    new THREE.BoxGeometry(SHOP.w + 0.3, 0.18, SHOP.d + 0.3),
    new THREE.MeshStandardMaterial({ color: 0xFF7A9C, roughness: 0.6 })
);
shopRoof.position.set(SHOP.x, 2.55, SHOP.z); shopRoof.castShadow = true; scene.add(shopRoof);

// 매점 간판 (캔버스)
const shopSignCanvas = document.createElement('canvas');
shopSignCanvas.width = 768; shopSignCanvas.height = 144;
const sscx = shopSignCanvas.getContext('2d');
const grad = sscx.createLinearGradient(0, 0, 0, 144);
grad.addColorStop(0, '#FFB7D5'); grad.addColorStop(1, '#FF7A9C');
sscx.fillStyle = grad; sscx.fillRect(0, 0, 768, 144);
sscx.fillStyle = '#FFFFFF'; sscx.strokeStyle = '#3a1a2a'; sscx.lineWidth = 4;
sscx.font = 'bold 60px sans-serif'; sscx.textAlign = 'center';
sscx.strokeText('이서의 꿈나라', 384, 70);
sscx.fillText('이서의 꿈나라', 384, 70);
sscx.font = 'bold 48px sans-serif';
sscx.strokeText('사탕 과자집 🍭', 384, 124);
sscx.fillText('사탕 과자집 🍭', 384, 124);
const shopSignTex = new THREE.CanvasTexture(shopSignCanvas);
const shopSign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.0, 0.75),
    new THREE.MeshBasicMaterial({ map: shopSignTex, transparent: true })
);
shopSign.position.set(SHOP.x, 2.95, SHOP.z + SHOP.d / 2 + 0.05);
scene.add(shopSign);

// 매점 내부 진열대 (양옆 + 뒤)
const shelfWoodMat = new THREE.MeshStandardMaterial({ color: 0xC68B5C, roughness: 0.7 });
function shelf(w, h, d, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shelfWoodMat);
    m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; scene.add(m);
    return m;
}
// 뒷 진열대 (3단)
for (let i = 0; i < 3; i++) {
    shelf(SHOP.w - 0.4, 0.04, 0.4, SHOP.x, 0.5 + i * 0.55, SHOP.z - SHOP.d / 2 + 0.25);
}
// 좌 진열대 (2단)
for (let i = 0; i < 2; i++) {
    shelf(0.4, 0.04, SHOP.d - 0.6, SHOP.x - SHOP.w / 2 + 0.25, 0.5 + i * 0.55, SHOP.z);
}
// 우 진열대 (2단)
for (let i = 0; i < 2; i++) {
    shelf(0.4, 0.04, SHOP.d - 0.6, SHOP.x + SHOP.w / 2 - 0.25, 0.5 + i * 0.55, SHOP.z);
}

// 카운터
const counterShop = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.85, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xFFC1D6 })
);
counterShop.position.set(SHOP.x + 1, 0.425, SHOP.z + 0.6); counterShop.castShadow = true; scene.add(counterShop);

// 진열대 위 상품들 (사탕/과자/음료수)
function placeProducts() {
    const candyColors = [0xFF4081, 0xFFEB3B, 0x00BCD4, 0xE040FB, 0xFF6E40, 0x69F0AE, 0xFFFFFF, 0xAB47BC];
    const drinkColors = [0xF44336, 0x2196F3, 0x4CAF50, 0xFF9800, 0xE91E63];

    // 뒷 진열대 - 음료수 캔/병
    for (let i = 0; i < 3; i++) {
        const shelfY = 0.55 + i * 0.55;
        for (let j = 0; j < 9; j++) {
            const isBottle = Math.random() < 0.4;
            const drink = new THREE.Mesh(
                isBottle
                    ? new THREE.CylinderGeometry(0.05, 0.06, 0.28, 8)
                    : new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8),
                new THREE.MeshStandardMaterial({ color: pick(drinkColors), roughness: 0.4, metalness: 0.3 })
            );
            drink.position.set(SHOP.x - SHOP.w / 2 + 0.4 + j * 0.42, shelfY + (isBottle ? 0.16 : 0.11), SHOP.z - SHOP.d / 2 + 0.25);
            scene.add(drink);
        }
    }
    // 좌 진열대 - 사탕 (구체들)
    for (let i = 0; i < 2; i++) {
        const shelfY = 0.55 + i * 0.55;
        for (let j = 0; j < 6; j++) {
            const candy = new THREE.Mesh(
                new THREE.SphereGeometry(0.06, 8, 8),
                new THREE.MeshStandardMaterial({ color: pick(candyColors), roughness: 0.3, metalness: 0.1 })
            );
            candy.position.set(SHOP.x - SHOP.w / 2 + 0.25, shelfY + 0.09, SHOP.z - SHOP.d / 2 + 0.4 + j * 0.4);
            scene.add(candy);
            // 사탕 막대
            if (j % 2 === 0) {
                const stick = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.008, 0.008, 0.15, 4),
                    new THREE.MeshBasicMaterial({ color: 0xffffff })
                );
                stick.position.set(SHOP.x - SHOP.w / 2 + 0.25, shelfY + 0.0, SHOP.z - SHOP.d / 2 + 0.4 + j * 0.4);
                scene.add(stick);
            }
        }
    }
    // 우 진열대 - 과자 박스
    for (let i = 0; i < 2; i++) {
        const shelfY = 0.55 + i * 0.55;
        for (let j = 0; j < 5; j++) {
            const w = 0.18 + Math.random() * 0.1;
            const h = 0.16 + Math.random() * 0.08;
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, 0.18),
                new THREE.MeshStandardMaterial({ color: pick([0xFFC107, 0xFF5722, 0x8BC34A, 0xE91E63, 0x9C27B0]), roughness: 0.6 })
            );
            box.position.set(SHOP.x + SHOP.w / 2 - 0.25, shelfY + h / 2, SHOP.z - SHOP.d / 2 + 0.4 + j * 0.45);
            scene.add(box);
        }
    }
    // 카운터 위 사탕병 큰거
    const jarMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, transmission: 0.8, roughness: 0.05 });
    for (let i = 0; i < 3; i++) {
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 12), jarMat);
        jar.position.set(SHOP.x + 0.4 + i * 0.45, 1.0, SHOP.z + 0.6);
        scene.add(jar);
        // 사탕 채우기
        const candy = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.28, 12),
            new THREE.MeshStandardMaterial({ color: pick(candyColors) })
        );
        candy.position.copy(jar.position); scene.add(candy);
    }
}
placeProducts();

// 매점 내부 따뜻한 조명
const shopLight = new THREE.PointLight(0xFFE0AA, 3.0, 10, 1.0);
shopLight.position.set(SHOP.x, 2.4, SHOP.z); scene.add(shopLight);

// 풀 사다리
const ladderMat = new THREE.MeshStandardMaterial({ color: 0xCFCFCF, metalness: 0.7, roughness: 0.3 });
const ladderRail = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 12, Math.PI), ladderMat);
ladderRail.position.set(POOL.x - POOL.w / 2 + 0.2, 0.1, POOL.z);
ladderRail.rotation.set(0, 0, Math.PI / 2); scene.add(ladderRail);

// 튜브 (도넛) - 수면 위
const tubeMat = new THREE.MeshStandardMaterial({ color: 0xFFEB3B, roughness: 0.4 });
const tube = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.12, 12, 24), tubeMat);
tube.position.set(POOL.x + 1.2, 0.14, POOL.z + 0.5);
tube.rotation.x = Math.PI / 2; scene.add(tube);
// 두 번째 튜브
const tube2 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 12, 24), new THREE.MeshStandardMaterial({ color: 0xE91E63, roughness: 0.4 }));
tube2.position.set(POOL.x - 1.5, 0.14, POOL.z - 0.7);
tube2.rotation.x = Math.PI / 2; scene.add(tube2);

// ============================================
// 사무실 내부 책상 배치
// ============================================
const deskScreens = [];
const allSpots = []; // { x, z, type, index, occupied }

function createDesk(x, z, idx) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.7), new THREE.MeshStandardMaterial({ color: 0xA0784C }));
    top.position.y = 0.75; top.castShadow = true; g.add(top);
    for (const [lx, lz] of [[-0.6, -0.25], [-0.6, 0.25], [0.6, -0.25], [0.6, 0.25]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), new THREE.MeshStandardMaterial({ color: 0x7A5C3C }));
        leg.position.set(lx, 0.375, lz); g.add(leg);
    }
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.03), new THREE.MeshStandardMaterial({ color: 0x1a1a2e }));
    mon.position.set(0, 1.05, -0.18); g.add(mon);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.28), new THREE.MeshBasicMaterial({ color: 0x0a0a1a }));
    screen.position.set(0, 1.05, -0.16); g.add(screen);
    // 키보드
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: 0x555566 }));
    kb.position.set(0, 0.79, 0.15); g.add(kb);
    g.position.set(x, 0, z); scene.add(g);
    deskScreens[idx] = screen;

    // 의자 (책상 작업자 측 z+0.55)
    const chair = new THREE.Group();
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2C2C34, roughness: 0.6 });
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16), chairMat);
    seat.position.y = 0.45; seat.castShadow = true; chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.05), chairMat);
    back.position.set(0, 0.78, 0.18); chair.add(back);
    const cleg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 }));
    cleg.position.y = 0.21; chair.add(cleg);
    // 5발 베이스
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 }));
        arm.position.set(Math.cos(a) * 0.1, 0.04, Math.sin(a) * 0.1);
        arm.rotation.y = a; chair.add(arm);
    }
    chair.position.set(x, 0, z + 0.6); scene.add(chair);

    return screen;
}

// 기존 AGENT OFFICE 책상 — 배경 소품(점유 안 함). 역할 에이전트는 FLLABS 사무실에서 근무.
let spotIdx = 0;
const agentDeskLayout = [-6, -4, -2, 0, 2, 4, 6];
for (const x of agentDeskLayout) {
    createDesk(x, -1.5, spotIdx);
    spotIdx++;
}

// 역할 에이전트 근무지 = FLLABS 2F OFFICE 빌딩 1층 책상 5개(노트북). 전원 이곳으로 출근.
// 위치는 위 FLLABS_DESK_LOCALX o2Desk(...,1) 책상과 일치. 지상층(y=0)이라 이동 단순.
for (const lx of FLLABS_DESK_LOCALX) {
    allSpots.push({ x: OFFICE2.x + lx, z: OFFICE2.z + 0.6, y: 0, type: 'desk', screenIdx: null, occupied: false });
}

// 서버랙
const rack = new THREE.Group();
{
    const rackBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1a30 }));
    rackBox.position.set(0, 1.1, 0);
    rack.add(rackBox);
}
for (let i = 0; i < 5; i++) {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    led.position.set(-0.25, 0.3 + i * 0.38, -0.27); rack.add(led);
}
rack.position.set(5, 0, -3); scene.add(rack);

// ============================================
// 동물: 고양이, 강아지
// ============================================
function createCat(x, y, z, color = 0xE0C080) {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const pink = new THREE.MeshBasicMaterial({ color: 0xFF99AA });

    // 몸통 (가로로 긴 캡슐, 누워있는 자세)
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.44, 6, 10), fur);
    body.rotation.z = Math.PI / 2; body.position.y = 0.11;
    body.castShadow = true; g.add(body);

    // 머리
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), fur);
    head.position.set(0.32, 0.13, 0); g.add(head);

    // 귀 2개
    for (const xo of [-0.04, 0.04]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), fur);
        ear.position.set(0.34 + xo * 0.5, 0.23, xo); g.add(ear);
    }
    // 눈 (감김 - 자는 자세) - 작은 라인
    for (const zo of [-0.05, 0.05]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.003), dark);
        eye.position.set(0.43, 0.16, zo); g.add(eye);
    }
    // 코
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), pink);
    nose.position.set(0.448, 0.13, 0); g.add(nose);

    // 꼬리 (살짝 말려 위로)
    for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.04 - i * 0.005, 6, 6), fur);
        const t = i / 4;
        seg.position.set(-0.32 - t * 0.18, 0.12 + Math.sin(t * Math.PI * 0.8) * 0.18, 0);
        g.add(seg);
    }

    // 발 (몸 아래로 살짝)
    for (const [px, pz] of [[0.2, -0.08], [0.2, 0.08], [-0.18, -0.08], [-0.18, 0.08]]) {
        const paw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), fur);
        paw.position.set(px, 0.04, pz); g.add(paw);
    }

    g.position.set(x, y, z); scene.add(g);
    return g;
}

function createDog(x, y, z) {
    const g = new THREE.Group();
    const body_color = 0xC9A578;
    const fur = new THREE.MeshStandardMaterial({ color: body_color, roughness: 0.85, flatShading: true });
    const ear_mat = new THREE.MeshStandardMaterial({ color: 0x8B6F47, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });

    // 몸통
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.45, 6, 10), fur);
    body.rotation.z = Math.PI / 2; body.position.y = 0.3;
    body.castShadow = true; g.add(body);

    // 머리
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), fur);
    head.position.set(0.32, 0.42, 0); g.add(head);
    // 주둥이
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), fur);
    muzzle.position.set(0.45, 0.38, 0); g.add(muzzle);
    // 코
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), dark);
    nose.position.set(0.52, 0.4, 0); g.add(nose);
    // 눈
    for (const zo of [-0.06, 0.06]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), dark);
        eye.position.set(0.41, 0.46, zo); g.add(eye);
    }
    // 늘어진 귀 2개
    for (const zo of [-0.12, 0.12]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.08), ear_mat);
        ear.position.set(0.28, 0.36, zo); g.add(ear);
    }

    // 다리 4개
    const legs = [];
    for (const [px, pz] of [[0.18, -0.09], [0.18, 0.09], [-0.18, -0.09], [-0.18, 0.09]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 6), fur);
        leg.position.set(px, 0.14, pz); g.add(leg);
        legs.push(leg);
    }

    // 꼬리 (위로)
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.22, 6), fur);
    tail.position.set(-0.32, 0.42, 0); tail.rotation.z = -0.7; g.add(tail);

    g.position.set(x, y, z); scene.add(g);
    return { group: g, head, tail, legs };
}

// 빨랫줄 (고양이 침대)
function createClothesline(x1, z1, x2, z2, height = 1.4) {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8D6E63, roughness: 0.7 });
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, height, 6), postMat);
    post1.position.set(x1, height / 2, z1); post1.castShadow = true; scene.add(post1);
    const post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, height, 6), postMat);
    post2.position.set(x2, height / 2, z2); post2.castShadow = true; scene.add(post2);

    // 가로 보 (난간)
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.08), postMat);
    beam.position.set((x1 + x2) / 2, height, (z1 + z2) / 2);
    beam.rotation.y = Math.atan2(dz, dx);
    beam.castShadow = true; scene.add(beam);

    return { x: (x1 + x2) / 2, y: height, z: (z1 + z2) / 2, ry: Math.atan2(dz, dx) };
}

// 사무실과 정원 사이에 빨랫줄 + 누워있는 고양이
const cline = createClothesline(7, -2, 9, 0);
const sleepingCat = createCat(cline.x, cline.y + 0.05, cline.z);
sleepingCat.rotation.y = cline.ry;

// 강아지 + 공 (수영장 앞)
const dog = createDog(10, 0, 1.5);
const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xFF5252, roughness: 0.5 })
);
// 줄무늬 흉내 (작은 흰 띠)
const ballStripe = new THREE.Mesh(
    new THREE.SphereGeometry(0.123, 14, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
);
ball.add(ballStripe);
ball.position.set(11.5, 0.12, 1.5);
ball.castShadow = true;
scene.add(ball);


function randomTraits() {
    return { gender: pick(GENDERS), skinColor: pick(SKIN_COLORS), hairColor: pick(HAIR_COLORS), hairStyle: pick(HAIR_STYLES), shirtColor: pick(SHIRT_COLORS), pantsColor: pick(PANTS_COLORS), shoeColor: pick(SHOE_COLORS), accessory: Math.random() < 0.4 ? pick(ACCESSORIES.filter(a => a !== 'none')) : 'none' };
}

// ============================================
// 5명 고정 에이전트 (역할별 1:1)
// ============================================
const ENTRANCE_POS = { x: 0, z: 10 };
const SIT_OFFSET_Y = -0.45; // 의자에 앉을 때 그룹 y 보정

// P1-A: AGENT_DEFS — /api/roles SSoT 기반 동적 초기화 (아래 initFromRolesApi 참조)
// 렌더 루프는 빈 배열 상태에서도 안전하게 동작; fetch 완료 후 createFixedAgents() 재호출로 채움
let AGENT_DEFS = [];

const fixedAgents = {}; // role -> { def, person, desk, phase, walkTime, sit, label, stamina, exp }

// --- 게임 요소: Floating Text Manager ---
const floatingTexts = [];
function addFloatingText(text, position, color = '#FFD700', fontSize = 40) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, 128, 64);
    
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    
    // 약간 위로 오프셋 랜덤 부여
    sprite.position.copy(position);
    sprite.position.y += 2.0;
    sprite.position.x += (Math.random() - 0.5) * 0.5;
    
    sprite.scale.set(1.5, 0.75, 1);
    scene.add(sprite);
    
    floatingTexts.push({ sprite, age: 0, life: 1.5, velocityY: 1.2 });
}

function updateFloatingTexts(delta) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.age += delta;
        ft.sprite.position.y += ft.velocityY * delta;
        ft.sprite.material.opacity = 1.0 - Math.pow(ft.age / ft.life, 2); // 점점 투명해짐
        
        if (ft.age >= ft.life) {
            scene.remove(ft.sprite);
            ft.sprite.material.dispose();
            ft.sprite.material.map.dispose();
            floatingTexts.splice(i, 1);
        }
    }
}

// 라벨 + 스태미나 바 생성기
function makeNameLabel(text, color, stamina = 100) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128; // 게이지를 위해 높이 증가
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,256,128);
    
    // 이름 배경
    ctx.fillStyle = '#000000aa'; 
    ctx.beginPath(); ctx.roundRect(32, 10, 192, 40, 8); ctx.fill();
    
    // 이름
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 38);
    
    // 스태미나 바 배경 (회색)
    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.roundRect(40, 56, 176, 12, 6); ctx.fill();
    
    // 스태미나 바 내용 (색상)
    const stRatio = Math.max(0, Math.min(100, stamina)) / 100;
    ctx.fillStyle = stRatio > 0.5 ? '#4CAF50' : stRatio > 0.2 ? '#FFC107' : '#F44336';
    if (stRatio > 0) {
        ctx.beginPath(); ctx.roundRect(40, 56, 176 * stRatio, 12, 6); ctx.fill();
    }
    
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(1.2, 0.6, 1); // 스케일 조정
    return { sprite, ctx, tex, cv };
}

function updateAgentLabel(agentDef, labelObj, stamina) {
    const ctx = labelObj.ctx;
    ctx.clearRect(0,0,256,128);
    
    // 이름 배경
    ctx.fillStyle = '#000000aa'; 
    ctx.beginPath(); ctx.roundRect(32, 10, 192, 40, 8); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(agentDef.name, 128, 38);
    
    // 게이지 그리기
    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.roundRect(40, 56, 176, 12, 6); ctx.fill();
    
    const stRatio = Math.max(0, Math.min(100, stamina)) / 100;
    ctx.fillStyle = stRatio > 0.5 ? '#4CAF50' : stRatio > 0.2 ? '#FFC107' : '#F44336';
    if (stRatio > 0) {
        ctx.beginPath(); ctx.roundRect(40, 56, 176 * stRatio, 12, 6); ctx.fill();
    }
    labelObj.tex.needsUpdate = true;
}


function createPerson(traits) {
    const { skinColor, hairColor, shirtColor, pantsColor, shoeColor } = traits;
    const group = new THREE.Group(); 
    
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.9;
    group.add(pelvis);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.2), new THREE.MeshStandardMaterial({color: shirtColor}));
    torso.position.y = 0.225; 
    pelvis.add(torso);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.35;
    torso.add(headGroup);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({color: skinColor}));
    head.position.y = 0.125;
    headGroup.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.27), new THREE.MeshStandardMaterial({color: hairColor}));
    hair.position.y = 0.29;
    headGroup.add(hair);

    const eyeMat = new THREE.MeshBasicMaterial({color: 0x000000});
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), eyeMat);
    eyeL.position.set(0.06, 0.15, 0.13);
    headGroup.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), eyeMat);
    eyeR.position.set(-0.06, 0.15, 0.13);
    headGroup.add(eyeR);

    const armL = new THREE.Group();
    armL.position.set(0.2, 0.15, 0); 
    torso.add(armL);
    const armMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), new THREE.MeshStandardMaterial({color: skinColor}));
    armMeshL.position.y = -0.15;
    armL.add(armMeshL);
    const sleeveL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.11), new THREE.MeshStandardMaterial({color: shirtColor}));
    sleeveL.position.y = -0.05;
    armL.add(sleeveL);

    const armR = new THREE.Group();
    armR.position.set(-0.2, 0.15, 0);
    torso.add(armR);
    const armMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), new THREE.MeshStandardMaterial({color: skinColor}));
    armMeshR.position.y = -0.15;
    armR.add(armMeshR);
    const sleeveR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.11), new THREE.MeshStandardMaterial({color: shirtColor}));
    sleeveR.position.y = -0.05;
    armR.add(sleeveR);

    const legL = new THREE.Group();
    legL.position.set(0.09, 0, 0);
    pelvis.add(legL);
    const legMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), new THREE.MeshStandardMaterial({color: pantsColor}));
    legMeshL.position.y = -0.225;
    legL.add(legMeshL);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.18), new THREE.MeshStandardMaterial({color: shoeColor}));
    shoeL.position.set(0, -0.4, 0.02);
    legL.add(shoeL);

    const legR = new THREE.Group();
    legR.position.set(-0.09, 0, 0);
    pelvis.add(legR);
    const legMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), new THREE.MeshStandardMaterial({color: pantsColor}));
    legMeshR.position.y = -0.225;
    legR.add(legMeshR);
    const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.18), new THREE.MeshStandardMaterial({color: shoeColor}));
    shoeR.position.set(0, -0.4, 0.02);
    legR.add(shoeR);

    group.traverse(c => { if(c.isMesh) { c.castShadow = true; c.receiveShadow = true; }});

    return { group, pelvis, torso, headGroup, armL, armR, legL, legR };
}

function createFixedAgents() {
    // AGENT_DEFS가 아직 빈 배열이면 /api/roles 응답 대기 중 — 건너뜀
    if (AGENT_DEFS.length === 0) return;
    AGENT_DEFS.forEach(def => {
        const traits = randomTraits();
        traits.shirtColor = def.color;
        const person = createPerson(traits);

        // 모든 에이전트(leader 포함)는 입구에서 대기하다, 활동 발생 시
        // 빈 컴퓨터 책상을 찾아 출근(claimDesk → walk-in → 착석)한다.
        person.group.position.set(ENTRANCE_POS.x + rand(-0.6, 0.6), 0, ENTRANCE_POS.z);
        person.group.visible = false;
        scene.add(person.group);

        const labelObj = makeNameLabel(def.name, def.color, 100);
        labelObj.sprite.position.set(0, 2.3, 0);
        person.group.add(labelObj.sprite);

        fixedAgents[def.role] = {
            def, person, desk: null,
            phase: 'away',
            walkTime: 0, swimT: Math.random() * 10,
            isWorking: false, labelObj: labelObj,
            stamina: 100, exp: 0
        };
    });
}
// 첫 호출: AGENT_DEFS 빈 상태 → 건너뜀. initFromRolesApi() 완료 후 재호출됨.
createFixedAgents();

// ===== envGroup 마무리: 패치 복원 + 시설 전체를 뒤쪽으로 이동 =====
scene.add = _origSceneAdd;
const ENV_BACK_OFFSET = -18;
envGroup.position.z = ENV_BACK_OFFSET;

// allSpots는 envGroup 로컬 좌표로 추가됐으므로, 에이전트(월드 좌표)가 올바른 위치로
// 걸어가려면 ENV_BACK_OFFSET를 더해 월드 좌표로 변환해야 한다.
allSpots.forEach(s => { s.z += ENV_BACK_OFFSET; });

// 계단 오르내리는 에이전트 애니메이션
function updateStairAgent(elapsed) {
    if (!stairAgent) return;
    const PERIOD = 12;
    const t = (elapsed % PERIOD) / PERIOD;
    let x, y, z, rotY;
    if (t < 0.08) {
        // 1층 대기 (계단 앞)
        ({ x, y, z } = STAIR_PATH.floor1Start);
        rotY = Math.PI;
    } else if (t < 0.42) {
        // 계단 오르기 (1F→2F)
        const k = (t - 0.08) / 0.34;
        const s = STAIR_PATH.floor1Stair, e = STAIR_PATH.floor2Stair;
        x = s.x + (e.x - s.x) * k;
        y = s.y + (e.y - s.y) * k;
        z = s.z + (e.z - s.z) * k;
        rotY = Math.PI;
    } else if (t < 0.5) {
        // 2층 진입 직후
        ({ x, y, z } = STAIR_PATH.floor2Stair);
        y += 0.18;
        rotY = Math.PI;
    } else if (t < 0.58) {
        // 2층에서 안쪽으로 잠시 걸어가기
        const k = (t - 0.5) / 0.08;
        const s = STAIR_PATH.floor2Stair, e = STAIR_PATH.floor2Walk;
        x = s.x + (e.x - s.x) * k;
        y = e.y;
        z = e.z;
        rotY = -Math.PI / 2;
    } else if (t < 0.66) {
        // 2층 작업 중
        ({ x, y, z } = STAIR_PATH.floor2Walk);
        rotY = -Math.PI / 2;
    } else if (t < 0.74) {
        // 2층에서 계단 위로 복귀
        const k = (t - 0.66) / 0.08;
        const s = STAIR_PATH.floor2Walk, e = { ...STAIR_PATH.floor2Stair, y: STAIR_PATH.floor2Stair.y + 0.18 };
        x = s.x + (e.x - s.x) * k;
        y = e.y;
        z = e.z;
        rotY = Math.PI / 2;
    } else if (t < 0.95) {
        // 계단 내려가기 (2F→1F)
        const k = (t - 0.74) / 0.21;
        const s = STAIR_PATH.floor2Stair, e = STAIR_PATH.floor1Stair;
        x = s.x + (e.x - s.x) * k;
        y = s.y + (e.y - s.y) * k;
        z = s.z + (e.z - s.z) * k;
        rotY = 0;
    } else {
        // 1층 대기
        ({ x, y, z } = STAIR_PATH.floor1Start);
        rotY = 0;
    }
    stairAgent.group.position.set(x, y, z);
    stairAgent.group.rotation.y = rotY;
    // 다리/팔 흔들기 (이동 중일 때) — legL/armL은 {hip,knee,ankle} 객체
    const moving = !(t < 0.08 || (t >= 0.42 && t < 0.5) || (t >= 0.58 && t < 0.66) || t >= 0.95);
    if (moving) {
        const sw = Math.sin(elapsed * 8) * 0.5;
        stairAgent.legL.hip.rotation.x = sw;
        stairAgent.legR.hip.rotation.x = -sw;
        stairAgent.armL.shoulder.rotation.x = -sw * 0.6;
        stairAgent.armR.shoulder.rotation.x = sw * 0.6;
    } else {
        stairAgent.legL.hip.rotation.x = 0;
        stairAgent.legR.hip.rotation.x = 0;
        stairAgent.armL.shoulder.rotation.x = 0;
        stairAgent.armR.shoulder.rotation.x = 0;
    }
}

function resetPose(c) {
    c.torso.rotation.y = 0;
    c.headGroup.rotation.y = 0;
    c.headGroup.rotation.x = 0;
    c.armL.rotation.x = 0; c.armL.rotation.z = 0;
    c.armR.rotation.x = 0; c.armR.rotation.z = 0;
    c.legL.rotation.x = 0;
    c.legR.rotation.x = 0;
    c.pelvis.position.y = 0.9;
    c.group.rotation.x = 0;
}

function setSitting(person, sit) {

    person.group.position.y = sit ? SIT_OFFSET_Y : 0;
    // 앉을 때는 다리/신발이 의자 아래로 들어감 (책상이 가려줌)
}

// 휴식 장소 후보
const LEISURE_SPOTS = [
    { type: 'shop',  x: SHOP.x - 0.7, z: SHOP.z + 0.4, label: '🍭 과자집' },
    { type: 'shop',  x: SHOP.x + 0.4, z: SHOP.z + 0.6, label: '🍭 과자집' },
    { type: 'cafe',  x: -10.5, z: -1, label: '☕ 카페' },
    { type: 'cafe',  x: -10.5, z: 1.2, label: '☕ 카페' },
    { type: 'pool',  x: POOL.x - POOL.w / 2 - 1.2, z: POOL.z + 1, label: '🏊 풀사이드' },
    { type: 'pool',  x: POOL.x + POOL.w / 2 + 1.2, z: POOL.z - 1, label: '🏊 풀사이드' },
    { type: 'park',  x: 12, z: -3, label: '🌳 공원' },
    { type: 'park',  x: 15, z: 1, label: '🌳 공원' },
    { type: 'park',  x: 9, z: -4, label: '🌳 공원' },
];
// envGroup-로컬 좌표로 정의됐으므로 월드 좌표로 변환 (allSpots 동일 이유)
LEISURE_SPOTS.forEach(s => { s.z += ENV_BACK_OFFSET; });

function pickLeisureSpot() { return pick(LEISURE_SPOTS); }

// 빈 컴퓨터 책상을 동적으로 배정한다.
// 이미 자리가 있으면 유지하고, 없으면 현재 위치에서 가장 가까운 비어 있는 책상을 점유한다.
// (에이전트는 한 번 자리를 잡으면 휴식 중에도 그 자리를 유지 — 다른 에이전트와 겹치지 않음)
function claimDesk(a) {
    if (a.desk) return a.desk;
    const px = a.person.group.position.x;
    const pz = a.person.group.position.z;
    let best = null, bestD = Infinity;
    for (const s of allSpots) {
        if (s.occupied) continue;
        const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
        if (d < bestD) { bestD = d; best = s; }
    }
    if (best) { best.occupied = true; a.desk = best; }
    return a.desk;
}

function startWorking(role) {
    const a = fixedAgents[role];
    if (!a) return;
    a.isWorking = true;
    a.idleStartedAt = 0;
    a.lastActiveAt = Date.now();

    // 느낌표(퀘스트 알림) 플로팅 텍스트 발동
    addFloatingText('❗', a.person.group.position, '#FF0000', 60);

    // 빈 컴퓨터 책상 배정 (없으면 가장 가까운 빈자리)
    claimDesk(a);

    if (a.phase === 'away') {
        a.person.group.visible = true;
        a.person.group.position.set(ENTRANCE_POS.x + rand(-0.6, 0.6), 0, ENTRANCE_POS.z);
        a.phase = 'walking-in';
        a.walkTime = 0;
    } else if (a.phase === 'leisure' || a.phase === 'leisure-walking') {
        if (a.person.group.position.y < 0) setSitting(a.person, false);
        a.phase = 'walking-in';
        a.target = null;
        a.walkTime = 0;
    }
    if (a.desk?.screenIdx != null && deskScreens[a.desk.screenIdx]) {
        deskScreens[a.desk.screenIdx].material.color.setHex(0x004400);
    }
}

function stopWorking(role) {
    const a = fixedAgents[role];
    if (!a) return;
    a.isWorking = false;
    a.idleStartedAt = Date.now();
    
    // 작업 완료 후 EXP 획득 텍스트
    const expGain = Math.floor(Math.random() * 20) + 10;
    a.exp += expGain;
    addFloatingText(`+${expGain} EXP`, a.person.group.position, '#00FFFF', 40);

    if (a.phase === 'sitting' && a.desk?.screenIdx != null && deskScreens[a.desk.screenIdx]) {
        deskScreens[a.desk.screenIdx].material.color.setHex(0x002a14);
    }
}

function goLeisure(role) {
    const a = fixedAgents[role];
    if (!a) return;
    a.phase = 'leisure-walking';
    a.target = pickLeisureSpot();
    a.walkTime = 0;
    a.leisureStartedAt = 0;
    if (a.person.group.position.y < 0) setSitting(a.person, false);
    if (a.desk?.screenIdx != null && deskScreens[a.desk.screenIdx]) {
        deskScreens[a.desk.screenIdx].material.color.setHex(0x0a0a1a);
    }
}

function returnToDesk(role) {
    const a = fixedAgents[role];
    if (!a) return;
    claimDesk(a); // 자리가 없으면 빈 책상 배정
    if (a.person.group.position.y < 0) setSitting(a.person, false);
    a.phase = 'walking-in';
    a.target = null;
    a.walkTime = 0;
}

// ============================================
// 에이전트 상태
// ============================================
const agentStates = {};

function buildMetaText(state) {
    const p = state.params || {};
    const parts = [];
    if (p.file) parts.push(p.file);
    if (p.command) parts.push(`$ ${p.command}`);
    else if (p.description) parts.push(p.description);
    if (p.pattern) parts.push(`/${p.pattern}/`);
    if (p.url) parts.push(p.url);
    if (p.query) parts.push(`"${p.query}"`);
    if (p.subagent) parts.push(`[${p.subagent}]`);
    if (p.prompt) parts.push(p.prompt);
    return parts.join(' · ');
}

function updateAgentState(role, state) {
    const prev = agentStates[role]?.status;
    agentStates[role] = state;

    const dot = document.getElementById(`dot-${role}`);
    const txt = document.getElementById(`txt-${role}`);
    const meta = document.getElementById(`meta-${role}`);
    if (dot && txt) {
        dot.className = `dot ${state.status === 'working' ? 'working' : 'idle'}`;
        txt.textContent = state.detail || state.status;
    }
    if (meta) {
        meta.textContent = state.status === 'working' ? buildMetaText(state) : '';
    }

    if (state.status === 'working') {
        startWorking(role);
    } else if (state.status === 'idle' && prev === 'working') {
        stopWorking(role);
    }
}

// ---- 역할 라벨·색상 매핑 (상태 패널용) ----
// P1-A: ROLE_LABEL·ROLE_COLOR — /api/roles SSoT 기반 동적 초기화 (아래 initFromRolesApi 참조)
// activity feed 제거됨 — 매핑은 상태 패널/아바타 색상 정합용으로 유지.
let ROLE_LABEL = {};
let ROLE_COLOR = {};

// ============================================
// 메인 루프
// ============================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    controls.update();

    updateFloatingTexts(delta);
    updateFactory(delta, elapsed);
    updateWarehouse(delta, elapsed);
    updateStairAgent(elapsed);
    

    // ---- 시간 / 날씨 ----
    const DAY_START_OFFSET = 0.38; // 오전(밝은 하늘)에서 시작
    const dayPhase = (window.__forceDayPhase != null)
        ? window.__forceDayPhase
        : ((DAY_START_OFFSET + elapsed / DAY_DURATION) % 1);
    const sunAngle = (dayPhase - 0.25) * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle);
    sun.position.set(Math.cos(sunAngle) * 18, sunHeight * 18 + 1, 8);

    // 해 디스크 (고도 + 동에서 서로 이동)
    const sunX = Math.cos(sunAngle) * CELESTIAL_RADIUS;
    const sunY = Math.sin(sunAngle) * CELESTIAL_RADIUS;
    sunDisc.position.set(sunX, sunY, -10);
    sunGlow.position.copy(sunDisc.position);
    sunDisc.lookAt(camera.position);
    sunGlow.lookAt(camera.position);

    // 달은 해의 정반대
    const moonAngle = sunAngle + Math.PI;
    const moonHeight = Math.sin(moonAngle); // = -sunHeight
    const moonX = Math.cos(moonAngle) * CELESTIAL_RADIUS;
    const moonY = Math.sin(moonAngle) * CELESTIAL_RADIUS;
    moonDisc.position.set(moonX, moonY, -10);
    moonGlow.position.copy(moonDisc.position);
    moonDisc.lookAt(camera.position);
    moonGlow.lookAt(camera.position);

    // 일출/일몰 시 해 색 따뜻하게
    const horizonProx = Math.max(0, 1 - Math.abs(sunHeight) * 2.5); // 지평선 근처
    sunDisc.material.color.setRGB(1.0, 0.92 - horizonProx * 0.35, 0.62 - horizonProx * 0.5);
    sunGlow.material.color.setRGB(1.0, 0.85 - horizonProx * 0.4, 0.45 - horizonProx * 0.4);

    // 별 — 어두울수록 밝게, 날씨로 약화
    const darkness = Math.max(0, -sunHeight); // 0 낮 → 1 깊은 밤
    const skyClarity = currentWeather === 'rain' ? 0.15 : currentWeather === 'cloudy' ? 0.45 : 1.0;
    starMat.opacity = darkness * 0.95 * skyClarity;
    stars.visible = darkness > 0.05 && skyClarity > 0.1;
    // 반짝임 (전체 사이즈 살짝 변동)
    starMat.size = 0.16 + Math.sin(elapsed * 2) * 0.02;

    const weatherFactor = currentWeather === 'rain' ? 0.3
                        : currentWeather === 'cloudy' ? 0.55
                        : 1.0;
    sun.intensity = Math.max(0, sunHeight) * 1.2 * weatherFactor;

    // 해/달 디스크 가시성 (지평선 위 + 날씨 영향)
    const sunVisible = sunHeight > -0.1;
    const moonVisible = moonHeight > -0.1;
    sunDisc.visible = sunVisible;
    sunGlow.visible = sunVisible;
    sunDisc.material.opacity = sunVisible ? 0.95 * skyClarity : 0;
    sunGlow.material.opacity = sunVisible ? 0.35 * skyClarity : 0;
    moonDisc.visible = moonVisible;
    moonGlow.visible = moonVisible;
    moonDisc.material.opacity = moonVisible ? 0.92 * skyClarity : 0;
    moonGlow.material.opacity = moonVisible ? 0.22 * skyClarity : 0;
    sun.color.setHex(dayPhase < 0.3 || dayPhase > 0.7 ? 0xffb070 : 0xfff5e0);

    const dayBrightness = Math.max(0.18, 0.5 + sunHeight * 0.5) * weatherFactor;
    ambientLight.intensity = dayBrightness;
    hemiLight.intensity = dayBrightness * 0.6;

    const skyColor = lerpSky(dayPhase);
    if (currentWeather === 'rain') skyColor.multiplyScalar(0.5);
    else if (currentWeather === 'cloudy') skyColor.multiplyScalar(0.78);
    scene.background = skyColor;
    if (scene.fog) {
        scene.fog.color.copy(skyColor);
        scene.fog.density = currentWeather === 'rain' ? 0.04
                          : currentWeather === 'cloudy' ? 0.025
                          : 0.018;
    }

    // 구름 흐름
    clouds.forEach(c => {
        c.position.x += c.userData.speed * delta;
        if (c.position.x > 38) c.position.x = -38;
    });

    // 비 떨어짐
    if (rain.visible) {
        const positions = rainGeo.attributes.position.array;
        for (let i = 0; i < RAIN_COUNT; i++) {
            positions[i * 3 + 1] -= rainVel[i] * delta;
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3 + 1] = 25;
                positions[i * 3]     = (Math.random() - 0.5) * 60;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
            }
        }
        rainGeo.attributes.position.needsUpdate = true;
    }

    // 날씨 전환
    const nowW = Date.now();
    if (nowW - weatherChangedAt > weatherDuration) {
        applyWeather(pickWeather());
        weatherChangedAt = nowW;
        weatherDuration = 25000 + Math.random() * 35000;
    }

    // HUD 업데이트
    const tEl = document.getElementById('time-of-day');
    const wEl = document.getElementById('weather');
    if (tEl) tEl.textContent = timeLabel(dayPhase);
    if (wEl) wEl.textContent = weatherLabel(currentWeather);

    // 수면 잔물결
    if (waterPositions && waterBasePos) {
        for (let i = 0; i < waterPositions.count; i++) {
            const ix = i * 3;
            const x = waterBasePos[ix];
            const y = waterBasePos[ix + 1];
            waterPositions.array[ix + 2] = waterBasePos[ix + 2] + Math.sin(elapsed * 1.5 + x * 1.8 + y * 1.5) * 0.04;
        }
        waterPositions.needsUpdate = true;
    }
    // 고양이 호흡 (몸 약간 부풀)
    if (typeof sleepingCat !== 'undefined') {
        sleepingCat.scale.y = 1 + Math.sin(elapsed * 1.4) * 0.04;
    }

    // 강아지 + 공 (앞뒤로 공 따라가기)
    if (typeof dog !== 'undefined' && typeof ball !== 'undefined') {
        const ballX = 11.5 + Math.sin(elapsed * 1.3) * 1.6;
        const ballBounce = Math.abs(Math.sin(elapsed * 4)) * 0.35;
        ball.position.set(ballX, 0.12 + ballBounce, 1.5);
        ball.rotation.x += delta * 8;
        // 강아지가 공을 쫓아감 (살짝 뒤처짐)
        const dogTarget = ballX - 0.7;
        dog.group.position.x += (dogTarget - dog.group.position.x) * delta * 3;
        const ddx = ballX - dog.group.position.x;
        if (Math.abs(ddx) > 0.05) dog.group.rotation.y = ddx > 0 ? 0 : Math.PI;
        // 다리 달리기
        dog.legs.forEach((leg, i) => {
            leg.rotation.x = Math.sin(elapsed * 10 + i * Math.PI / 2) * 0.5;
        });
        // 꼬리 흔들기
        dog.tail.rotation.y = Math.sin(elapsed * 8) * 0.6;
        // 살짝 점프
        dog.group.position.y = Math.abs(Math.sin(elapsed * 5)) * 0.05;
    }

    // 풍선 흔들림
    balloons.forEach(b => {
        const ph = b.userData.phase;
        b.position.y = b.userData.baseY + Math.sin(elapsed * 1.4 + ph) * 0.12;
        b.rotation.z = Math.sin(elapsed * 0.9 + ph) * 0.08;
        b.rotation.x = Math.cos(elapsed * 0.7 + ph) * 0.05;
    });

    // 튜브 살랑거림
    if (typeof tube !== 'undefined') {
        tube.position.y = 0.14 + Math.sin(elapsed * 1.2) * 0.02;
        tube.rotation.z = Math.sin(elapsed * 0.6) * 0.1;
    }
    if (typeof tube2 !== 'undefined') {
        tube2.position.y = 0.14 + Math.sin(elapsed * 1.5 + 1) * 0.02;
        tube2.rotation.z = Math.cos(elapsed * 0.5) * 0.1;
    }

    let presentCount = 0;
    let workingCount = 0;

    const nowMs = Date.now();
    Object.values(fixedAgents).forEach(a => {
        a.walkTime += delta;
        const c = a.person;
        let desk = a.desk;

        // idle이 일정 시간 지속되면 휴식 장소로 이동
        if (a.phase === 'sitting' && !a.isWorking && a.idleStartedAt) {
            const idleMs = nowMs - a.idleStartedAt;
            const idleThreshold = a.idleThreshold || (4000 + Math.random() * 4000);
            a.idleThreshold = idleThreshold;
            if (idleMs > idleThreshold) {
                a.idleThreshold = 0;
                goLeisure(a.def.role);
            }
        }

        if (a.phase === 'swimming') {
            a.swimT += delta;
            // 수영 중 스태미나 회복
            a.stamina = Math.min(100, a.stamina + delta * 2.5);
            updateAgentLabel(a.def, a.labelObj, a.stamina);

            const t = a.swimT;
            // 풀 안에서 8자 궤적
            const px = POOL.x + Math.sin(t * 0.7) * (POOL.w / 2 - 0.7);
            const pz = POOL.z + Math.sin(t * 0.35) * (POOL.d / 2 - 0.7);
            c.group.position.x = px;
            c.group.position.z = pz;
            c.group.position.y = -0.1 + Math.sin(t * 4) * 0.04; // 살짝 까딱
            // 진행 방향
            const dx = Math.cos(t * 0.7) * (POOL.w / 2 - 0.7) * 0.7;
            const dz = Math.cos(t * 0.35) * (POOL.d / 2 - 0.7) * 0.35;
            c.group.rotation.y = Math.atan2(dx, dz);

            c.pelvis.position.y = 0.2;
            c.group.rotation.x = -Math.PI / 3;
            c.armL.rotation.x = Math.sin(t * 6) * 1.4 - 0.2;
            c.armR.rotation.x = Math.sin(t * 6 + Math.PI) * 1.4 - 0.2;
            c.legL.rotation.x = Math.sin(t * 6) * 0.3;
            c.legR.rotation.x = Math.sin(t * 6 + Math.PI) * 0.3;

            presentCount++;
            workingCount++; // 사장님은 늘 활동 중
            return;
        }
        if (a.phase === 'walking-in' || a.phase === 'leisure-walking') {
            if (a.phase === 'walking-in' && !desk) desk = claimDesk(a);
            if (a.phase === 'walking-in' && !desk) return; // 빈 책상 없음 — 이 프레임 대기
            const tgtX = a.phase === 'walking-in' ? desk.x : a.target.x;
            const tgtZ = a.phase === 'walking-in' ? desk.z : a.target.z;
            const dx = tgtX - c.group.position.x;
            const dz = tgtZ - c.group.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            // 피로도에 따른 속도 저하
            const speedMod = a.stamina < 30 ? 0.6 : 1.0; 
            
            if (dist > 0.18) {
                const step = 2.2 * delta * speedMod;
                c.group.position.x += (dx / dist) * step;
                c.group.position.z += (dz / dist) * step;
                c.group.rotation.y = Math.atan2(dx, dz);

                resetPose(c);
                const speedMod2 = a.stamina < 30 ? 0.6 : 1.2;
                const time2 = a.walkTime * 12 * speedMod2;
                const stride2 = a.stamina < 30 ? 0.3 : 0.6;
                c.legL.rotation.x = Math.sin(time2) * stride2;
                c.legR.rotation.x = Math.sin(time2 + Math.PI) * stride2;
                c.armL.rotation.x = Math.sin(time2 + Math.PI) * stride2;
                c.armR.rotation.x = Math.sin(time2) * stride2;
                c.torso.rotation.y = Math.sin(time2) * 0.15;
                c.headGroup.rotation.y = -Math.sin(time2) * 0.15;
                c.pelvis.position.y = 0.9 + Math.abs(Math.sin(time2)) * 0.08;
            } else {
                resetPose(c);
                if (a.phase === 'walking-in') {
                    a.phase = 'sitting';                    a.idleStartedAt = a.isWorking ? 0 : Date.now();
                    a.idleThreshold = 0;
                    c.group.position.set(desk.x, 0, desk.z);
                    c.group.rotation.y = Math.PI;
                    
                    setSitting(c, true);
                } else {
                    // 휴식 장소 도착
                    a.phase = 'leisure';
                    a.leisureType = a.target.type;
                    a.leisureStartedAt = nowMs;
                    a.leisureDuration = 8000 + Math.random() * 10000;
                    c.group.position.set(a.target.x, 0, a.target.z);
                    
                    if (a.leisureType === 'cafe') {
                        c.group.rotation.y = 0;
                        setSitting(c, true);
                    } else if (a.leisureType === 'shop') {
                        c.group.rotation.y = Math.PI; // 진열대 보기
                    }
                }
            }
        } else if (a.phase === 'leisure') {
            const t = a.walkTime;
            // 휴식 중 스태미나 회복
            let recoveryRate = 1.0;
            if (a.leisureType === 'shop') recoveryRate = 4.0; // 과자집에서 빨리 회복
            else if (a.leisureType === 'cafe') recoveryRate = 3.0;
            else if (a.leisureType === 'pool') recoveryRate = 5.0; // 수영장 옆
            else recoveryRate = 1.5; // 공원
            
            a.stamina = Math.min(100, a.stamina + delta * recoveryRate);
            updateAgentLabel(a.def, a.labelObj, a.stamina);
            
            switch (a.leisureType) {
                case 'shop':
                    // 매대 둘러보기
                    c.group.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.5;
                    break;
                case 'cafe':
                    break;
                case 'pool':
                    // 풀사이드 한가하게
                    c.group.rotation.y = Math.sin(t * 0.5) * 0.2;
                    break;
                case 'park':
                    // 공원 산책 - 작은 원형 경로
                    resetPose(c);
                    const timeP = t * 6;
                    c.legL.rotation.x = Math.sin(timeP) * 0.4;
                    c.legR.rotation.x = Math.sin(timeP + Math.PI) * 0.4;
                    c.armL.rotation.x = Math.sin(timeP + Math.PI) * 0.4;
                    c.armR.rotation.x = Math.sin(timeP) * 0.4;
                    c.pelvis.position.y = 0.9 + Math.abs(Math.sin(timeP)) * 0.05;
                    c.group.position.x = a.target.x + Math.cos(t * 0.4) * 0.6;
                    c.group.position.z = a.target.z + Math.sin(t * 0.4) * 0.6;
                    c.group.rotation.y = t * 0.4 + Math.PI / 2;
                    break;
            }
            // 휴식 시간 경과 → 다른 곳 OR 자리로
            if (nowMs - a.leisureStartedAt > a.leisureDuration) {
                if (a.isWorking) returnToDesk(a.def.role);
                else if (Math.random() < 0.45) goLeisure(a.def.role);
                else returnToDesk(a.def.role);
            }
        } else if (a.phase === 'sitting') {
            if (a.isWorking) {
                // 작업 중 스태미나 소모
                a.stamina = Math.max(0, a.stamina - delta * 1.5);
                updateAgentLabel(a.def, a.labelObj, a.stamina);
                
                // 피곤하면 타이핑 속도 감소 (Walk 애니메이션 속도로 표현)
                const workSpeed = a.stamina < 30 ? 0.8 : 2.5;
                resetPose(c);
                c.legL.rotation.x = -Math.PI / 2;
                c.legR.rotation.x = -Math.PI / 2;
                c.pelvis.position.y = 0.55; 
                c.armL.rotation.x = -0.4 + Math.sin(a.walkTime * workSpeed * 4) * 0.15;
                c.armR.rotation.x = -0.4 + Math.sin(a.walkTime * workSpeed * 4 + 1) * 0.15;
                c.headGroup.rotation.x = Math.sin(a.walkTime * 2.5) * 0.04;
                
                if (a.desk?.screenIdx != null && deskScreens[a.desk.screenIdx]) {
                    const b = 0.18 + Math.sin(a.walkTime * 5) * 0.08;
                    deskScreens[a.desk.screenIdx].material.color.setRGB(0, b, 0.05);
                }
                
                // 스태미나가 다 떨어지면 강제 휴식 유도 (또는 매우 느린 애니메이션)
                if (a.stamina === 0 && Math.random() < 0.01) { // 1% 확률로 지쳐서 쉬러 감 (자율행동)
                   goLeisure(a.def.role);
                }
                
                workingCount++;
            } else {
                // idle: 살짝 흔들리기만
                a.stamina = Math.min(100, a.stamina + delta * 0.5);
                updateAgentLabel(a.def, a.labelObj, a.stamina);
                resetPose(c);
                c.legL.rotation.x = -Math.PI / 2;
                c.legR.rotation.x = -Math.PI / 2;
                c.pelvis.position.y = 0.55;
                c.armL.rotation.x = -0.2;
                c.armR.rotation.x = -0.2;
                c.headGroup.rotation.y = Math.sin(a.walkTime * 0.6) * 0.08;
                
                
            }
        }

        if (a.phase === 'sitting' || a.phase === 'walking-in' || a.phase === 'leisure' || a.phase === 'leisure-walking') presentCount++;
    });

    document.getElementById('people-count').textContent = `${workingCount}/${presentCount}`;
    updatePersonLabels(); // P5-D: 사람 레이블 위치 갱신
    renderer.render(scene, camera);
}

// ---- 사람 아바타 관리 (P5-D) ----
// id → { group, sphere, badge, labelEl, bubbleEl, unreadCount }
// ⚠ TDZ 방지: animate()가 updatePersonLabels()에서 이 Map을 참조하므로, animate() 호출보다 앞에서 선언해야 한다.
const personAvatarMap = new Map();

// P5-D: 현재 드래그 중인 아바타({group,...} 객체). 드래그 중에는 syncPersonAvatars의
// 위치 덮어쓰기를 막아 사용자가 끄는 손맛을 유지한다.
let draggingAvatar = null;

animate();

// ---- /api/roles SSoT 초기화 ----
// P1-A: AGENT_DEFS·ROLE_LABEL·ROLE_COLOR를 서버 SSoT(/api/roles)에서 동적으로 채운다.
// CSS 색상(#rrggbb) → Three.js 정수(0xrrggbb) 변환 헬퍼
function cssColorToHex(css) {
    return parseInt(css.replace('#', '0x'), 16);
}

async function initFromRolesApi() {
    try {
        const res = await fetch(`http://${location.hostname}:3300/api/roles`);
        if (!res.ok) throw new Error(`/api/roles HTTP ${res.status}`);
        const { roles } = await res.json();

        // AGENT_DEFS: 역할 순서 그대로 deskIdx 부여
        AGENT_DEFS = roles.map((r, idx) => ({
            role:    r.id || r.name,
            deskIdx: idx,
            color:   cssColorToHex(r.color),
            name:    r.label,
        }));

        // ROLE_LABEL·ROLE_COLOR: 피드·상태 패널용 매핑
        ROLE_LABEL = {};
        ROLE_COLOR = {};
        roles.forEach(r => {
            const key = r.id || r.name;
            // label을 대문자 약어로 축약 (DEVELOPER→DEV, DEVOPS→OPS, LEADER→LEAD, 그 외→그대로)
            const abbr = ({ developer: 'DEV', devops: 'OPS', leader: 'LEAD' })[key] || r.label.toUpperCase();
            ROLE_LABEL[key] = abbr;
            ROLE_COLOR[key] = r.color;
        });

        // 에이전트 캐릭터 생성 (fetch 완료 후 첫 실제 호출)
        createFixedAgents();
    } catch (err) {
        // 서버 미기동 시 폴백: 하드코딩 5역할로 안전하게 동작
        console.warn('[scene] /api/roles fetch 실패 — 폴백 사용:', err.message);
        AGENT_DEFS = [
            { role: 'developer', deskIdx: 0, color: 0x4A90D9, name: 'Developer' },
            { role: 'devops',    deskIdx: 1, color: 0xE67E22, name: 'DevOps' },
            { role: 'qa',        deskIdx: 2, color: 0x27AE60, name: 'QA' },
            { role: 'pm',        deskIdx: 3, color: 0x8E44AD, name: 'PM' },
            { role: 'leader',    deskIdx: 4, color: 0xE74C3C, name: 'Leader' },
        ];
        ROLE_LABEL = { developer: 'DEV', devops: 'OPS', qa: 'QA', pm: 'PM', leader: 'LEAD' };
        ROLE_COLOR = { developer: '#4A90D9', devops: '#E67E22', qa: '#27AE60', pm: '#8E44AD', leader: '#E74C3C' };
        createFixedAgents();
    }
}

initFromRolesApi();

// (personAvatarMap·draggingAvatar 선언은 animate() 호출 앞으로 이동됨 — TDZ 방지)

/**
 * CSS2D 스타일 HTML 오버레이 레이블을 3D 위치에 붙인다.
 * Three.js CSS2DRenderer 없이 간단한 div overlay 방식 사용.
 */
function makePersonLabel(name, color) {
    const el = document.createElement('div');
    el.style.cssText = `
        position: absolute; pointer-events: none;
        background: ${color}cc; color: #fff; border-radius: 6px;
        padding: 2px 6px; font-size: 11px; font-family: monospace;
        white-space: nowrap; transform: translateX(-50%);
        border: 1px solid #fff8;
    `;
    el.textContent = name;
    document.body.appendChild(el);
    return el;
}

/**
 * 말풍선 DOM 생성.
 * P5-E-B: clickable=true이면 클릭 가능 스타일(pointer-events:auto·cursor:pointer·hover 강조).
 *         clickable=false(딥링크 식별자 부재)이면 기존처럼 클릭 비활성(cursor:default).
 * P5-E-C: clickable=true이면 hover 시 "💬 Teams로 열기" 힌트를 노출하여 클릭 가능함을 직관적으로 표현.
 *         (딥링크 불가 말풍선에는 힌트·강조 없음 — graceful 보존.)
 */
function makeBubbleEl(text, clickable = false) {
    // 편지봉투 bob 애니메이션 키프레임 1회 주입
    if (!document.getElementById('env-bob-style')) {
        const st = document.createElement('style');
        st.id = 'env-bob-style';
        st.textContent = '@keyframes envBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}';
        document.head.appendChild(st);
    }

    const el = document.createElement('div');
    el.style.cssText = `
        position: absolute; pointer-events: ${clickable ? 'auto' : 'none'};
        cursor: ${clickable ? 'pointer' : 'default'};
        transform: translateX(-50%);
        display: flex; flex-direction: column; align-items: center;
        font-family: sans-serif; user-select: none;
        transition: transform 0.12s;
    `;

    // 큰 편지봉투 아이콘 — 메시지 수신 표시(눈에 잘 띄게 크게 + bob)
    const icon = document.createElement('div');
    icon.textContent = '✉️';
    icon.style.cssText = `
        font-size: 46px; line-height: 1;
        filter: drop-shadow(0 3px 5px rgba(0,0,0,0.55));
        animation: envBob 1.1s ease-in-out infinite;
    `;
    el.appendChild(icon);

    // 발신자 + 미리보기 캡션
    const cap = document.createElement('div');
    cap.textContent = text;
    cap.style.cssText = `
        margin-top: 3px; max-width: 240px; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; font-size: 11px; font-family: monospace;
        background: #ffffffee; color: #222; border-radius: 6px; padding: 2px 7px;
        border: 1px solid #aaa;
    `;
    el.appendChild(cap);

    if (clickable) {
        // 클릭 힌트 — 평소 숨김, hover 시 노출.
        const hintEl = document.createElement('div');
        hintEl.textContent = '✉ 클릭 → Teams 열기';
        hintEl.style.cssText = `
            display: none; margin-top: 3px; color: #fff; background: #4A90E2;
            font-weight: bold; font-size: 10px; border-radius: 5px; padding: 2px 6px;
            white-space: nowrap;
        `;
        el.appendChild(hintEl);

        // hover 시 확대 + 클릭 힌트 노출
        el.onmouseover = () => {
            el.style.transform = 'translateX(-50%) scale(1.18)';
            hintEl.style.display = 'block';
        };
        el.onmouseout = () => {
            el.style.transform = 'translateX(-50%) scale(1.0)';
            hintEl.style.display = 'none';
        };
    }
    document.body.appendChild(el);
    return el;
}

/**
 * 3D 월드 좌표 → 화면 픽셀 좌표 변환
 */
function worldToScreen(worldPos) {
    const v = worldPos.clone().project(camera);
    return {
        x: (v.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
        y: (-(v.y * 0.5) + 0.5) * renderer.domElement.clientHeight,
    };
}

// ============================================================
// 🏝️ 야외 휴양지 회의실 3곳 (보라카이 · 괌 · 오키나와)
//  - 추가(additive) 전용: 기존 코드 수정 없음.
//  - 이 위치에서 scene.add 는 _origSceneAdd (씬 루트 = 월드 좌표).
//  - 사람 아바타가 모인 앞 공간(x≈-2~0, z≈-2~1) 주변에 좌/중/우로 분산 배치.
// ============================================================
{
    // ---- 공통 헬퍼들 ----

    // 텍스트 표지판: CanvasTexture + PlaneGeometry (기존 o2Sign 패턴과 동일)
    function makeResortSign(text, bg1, bg2, accent) {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 128;
        const c = cv.getContext('2d');
        const g = c.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, bg1); g.addColorStop(1, bg2);
        c.fillStyle = g; c.fillRect(0, 0, 512, 128);
        c.strokeStyle = accent; c.lineWidth = 6; c.strokeRect(5, 5, 502, 118);
        c.fillStyle = '#FFFFFF'; c.font = 'bold 56px sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, 256, 64);
        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(3.2, 0.8),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })
        );
        return sign;
    }

    // 표지판 기둥 + 사인 한 세트
    function makeSignPost(text, bg1, bg2, accent, x, z) {
        const grp = new THREE.Group();
        const postMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41, roughness: 0.8 });
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 8), postMat);
        post.position.y = 1.2; post.castShadow = true;
        grp.add(post);
        const sign = makeResortSign(text, bg1, bg2, accent);
        sign.position.y = 2.5;
        grp.add(sign);
        grp.position.set(x, 0, z);
        return grp;
    }

    // 야자수: 기둥(Cylinder) + 잎(여러 평평한 Cone를 각도 배치)
    function makePalm(x, z, scale = 1) {
        const grp = new THREE.Group();
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8D6E47, roughness: 0.9 });
        const trunkH = 3.2 * scale;
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12 * scale, 0.22 * scale, trunkH, 8),
            trunkMat
        );
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        grp.add(trunk);
        // 잎: 길쭉한 Cone를 비스듬히 8방향
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.7, side: THREE.DoubleSide });
        const leaves = 8;
        for (let i = 0; i < leaves; i++) {
            const leaf = new THREE.Mesh(
                new THREE.ConeGeometry(0.28 * scale, 2.2 * scale, 4),
                leafMat
            );
            const ang = (i / leaves) * Math.PI * 2;
            leaf.position.set(
                Math.cos(ang) * 1.0 * scale,
                trunkH - 0.1 * scale,
                Math.sin(ang) * 1.0 * scale
            );
            leaf.rotation.z = Math.cos(ang) * -0.9;
            leaf.rotation.x = Math.sin(ang) * 0.9;
            leaf.castShadow = true;
            grp.add(leaf);
        }
        // 코코넛 몇 개
        const coconutMat = new THREE.MeshStandardMaterial({ color: 0x4E342E, roughness: 0.6 });
        for (let i = 0; i < 3; i++) {
            const co = new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 8, 8), coconutMat);
            const ang = (i / 3) * Math.PI * 2;
            co.position.set(Math.cos(ang) * 0.25 * scale, trunkH - 0.3 * scale, Math.sin(ang) * 0.25 * scale);
            grp.add(co);
        }
        grp.position.set(x, 0, z);
        return grp;
    }

    // 회의 테이블 (원형/사각) + 좌석 N개
    function makeMeetingTable(x, z, opts = {}) {
        const grp = new THREE.Group();
        const round = opts.round || false;
        const radius = opts.radius || 1.0;
        const tableH = opts.tableH || 0.75;
        const topColor = opts.topColor || 0xD7CCC8;
        const seatColor = opts.seatColor || 0xFFFFFF;
        const seats = opts.seats || 4;
        const lowSeat = opts.lowSeat || false; // 방석(낮은 좌석)

        const topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.5 });
        const legMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.8 });
        // 상판
        const top = round
            ? new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.1, 24), topMat)
            : new THREE.Mesh(new THREE.BoxGeometry(radius * 2, 0.1, radius * 1.4), topMat);
        top.position.y = tableH; top.castShadow = true; top.receiveShadow = true;
        grp.add(top);
        // 다리(중앙 기둥)
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, tableH, 10), legMat);
        leg.position.y = tableH / 2; leg.castShadow = true;
        grp.add(leg);
        // 좌석
        const seatMat = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.7 });
        const seatR = radius + 0.8;
        const seatH = lowSeat ? 0.12 : 0.45;
        for (let i = 0; i < seats; i++) {
            const ang = (i / seats) * Math.PI * 2;
            const sx = Math.cos(ang) * seatR;
            const sz = Math.sin(ang) * seatR;
            if (lowSeat) {
                // 방석: 납작한 박스
                const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.6, seatH, 0.6), seatMat);
                cushion.position.set(sx, seatH / 2, sz);
                cushion.castShadow = true;
                grp.add(cushion);
            } else {
                // 의자: 좌판 + 등받이
                const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12), seatMat);
                seat.position.set(sx, seatH, sz); seat.castShadow = true;
                grp.add(seat);
                const sleg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, seatH, 8), legMat);
                sleg.position.set(sx, seatH / 2, sz);
                grp.add(sleg);
                const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.08), seatMat);
                back.position.set(sx - Math.cos(ang) * 0.28, seatH + 0.27, sz - Math.sin(ang) * 0.28);
                back.rotation.y = -ang;
                grp.add(back);
            }
        }
        grp.position.set(x, 0, z);
        return grp;
    }

    // 비치 파라솔: 기둥 + 원뿔 캐노피
    function makeParasol(x, z, color = 0xFF7043) {
        const grp = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8),
            new THREE.MeshStandardMaterial({ color: 0xECEFF1, roughness: 0.4 })
        );
        pole.position.y = 1.3; pole.castShadow = true;
        grp.add(pole);
        const canopy = new THREE.Mesh(
            new THREE.ConeGeometry(1.5, 0.8, 16),
            new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide })
        );
        canopy.position.y = 2.7; canopy.castShadow = true;
        grp.add(canopy);
        grp.position.set(x, 0, z);
        return grp;
    }

    // 선베드(비치 라운저)
    function makeSunbed(x, z, rotY = 0) {
        const grp = new THREE.Group();
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xFFF8E1, roughness: 0.6 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.8), frameMat);
        base.position.y = 0.3; base.castShadow = true;
        grp.add(base);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.6), frameMat);
        head.position.set(0, 0.5, -0.7); head.rotation.x = -0.5;
        grp.add(head);
        for (const dx of [-0.3, 0.3]) for (const dz of [-0.8, 0.8]) {
            const l = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), frameMat);
            l.position.set(dx, 0.15, dz);
            grp.add(l);
        }
        grp.position.set(x, 0, z);
        grp.rotation.y = rotY;
        return grp;
    }

    // 띠풀 지붕 카바나/티키: 기둥 4개 + 원뿔(띠풀) 지붕
    function makeCabana(x, z, opts = {}) {
        const grp = new THREE.Group();
        const w = opts.w || 4.5;
        const h = opts.h || 2.6;
        const postMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41, roughness: 0.9 });
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, h, 8), postMat);
            post.position.set(dx * w / 2, h / 2, dz * w / 2);
            post.castShadow = true;
            grp.add(post);
        }
        // 띠풀 지붕: 큰 원뿔(낮고 넓게)
        const thatchMat = new THREE.MeshStandardMaterial({ color: 0xC9A24B, roughness: 0.95 });
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 1.6, 4), thatchMat);
        roof.position.y = h + 0.7; roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        grp.add(roof);
        grp.position.set(x, 0, z);
        return grp;
    }

    // 티키 횃불
    function makeTorch(x, z) {
        const grp = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6),
            new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.9 })
        );
        pole.position.y = 0.9; pole.castShadow = true;
        grp.add(pole);
        const flame = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0xFF7043, emissive: 0xE65100, emissiveIntensity: 0.8 })
        );
        flame.position.y = 2.0;
        grp.add(flame);
        grp.position.set(x, 0, z);
        return grp;
    }

    // 해먹: 두 기둥 + 곡선 천(평평한 박스로 단순화)
    function makeHammock(x, z) {
        const grp = new THREE.Group();
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x6D4C41, roughness: 0.9 });
        for (const dz of [-1, 1]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), poleMat);
            p.position.set(0, 0.8, dz * 1.4); p.castShadow = true;
            grp.add(p);
        }
        const cloth = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.1, 2.4),
            new THREE.MeshStandardMaterial({ color: 0xFFCC80, roughness: 0.7 })
        );
        cloth.position.y = 0.7; cloth.castShadow = true;
        grp.add(cloth);
        grp.position.set(x, 0, z);
        return grp;
    }

    // 시사(사자견) 석상: 박스/구 조합
    function makeShisa(x, z, rotY = 0) {
        const grp = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0xBCAAA4, roughness: 0.95 });
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), stoneMat);
        ped.position.y = 0.2; ped.castShadow = true; grp.add(ped);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.5), stoneMat);
        body.position.y = 0.65; body.castShadow = true; grp.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 10), stoneMat);
        head.position.set(0, 1.05, 0.05); head.castShadow = true; grp.add(head);
        // 귀
        for (const dx of [-0.18, 0.18]) {
            const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), stoneMat);
            ear.position.set(dx, 1.25, 0.05); grp.add(ear);
        }
        grp.position.set(x, 0, z); grp.rotation.y = rotY;
        return grp;
    }

    // 석등(돌 등롱): 박스 단 쌓기
    function makeStoneLantern(x, z) {
        const grp = new THREE.Group();
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9E9E9E, roughness: 0.95 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.3, 8), stoneMat);
        base.position.y = 0.15; base.castShadow = true; grp.add(base);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), stoneMat);
        shaft.position.y = 0.65; grp.add(shaft);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), stoneMat);
        box.position.y = 1.2; box.castShadow = true; grp.add(box);
        // 등불(발광)
        const light = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.25, 0.25),
            new THREE.MeshStandardMaterial({ color: 0xFFE082, emissive: 0xFFB300, emissiveIntensity: 0.7 })
        );
        light.position.y = 1.2; grp.add(light);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 4), stoneMat);
        cap.position.y = 1.55; cap.rotation.y = Math.PI / 4; cap.castShadow = true; grp.add(cap);
        grp.position.set(x, 0, z);
        return grp;
    }

    // 류큐 정자(붉은 기와 지붕 파빌리온): 기둥 4 + 피라미드 기와 지붕
    function makePavilion(x, z, opts = {}) {
        const grp = new THREE.Group();
        const w = opts.w || 5.5;
        const h = opts.h || 2.8;
        const postMat = new THREE.MeshStandardMaterial({ color: 0x8D2F1E, roughness: 0.8 });
        // 바닥 단(낮은 마루)
        const floorMat = new THREE.MeshStandardMaterial({ color: 0xA1887F, roughness: 0.85 });
        const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, w), floorMat);
        floor.position.y = 0.1; floor.receiveShadow = true; grp.add(floor);
        for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, h, 10), postMat);
            post.position.set(dx * (w / 2 - 0.4), h / 2 + 0.2, dz * (w / 2 - 0.4));
            post.castShadow = true; grp.add(post);
        }
        // 붉은 기와 지붕: 피라미드 + 처마
        const tileMat = new THREE.MeshStandardMaterial({ color: 0xB23A2E, roughness: 0.6 });
        const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.12, w + 0.6), tileMat);
        eave.position.y = h + 0.25; eave.castShadow = true; grp.add(eave);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 1.8, 4), tileMat);
        roof.position.y = h + 1.1; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
        grp.add(roof);
        grp.position.set(x, 0, z);
        return grp;
    }

    // 바닥 패드(테마색 원형/사각)
    function makeFloorPad(x, z, w, d, color, round = false) {
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
        const pad = round
            ? new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.08, 32), mat)
            : new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
        pad.position.set(x, 0.04, z);
        pad.receiveShadow = true;
        return pad;
    }

    // ============================================================
    // 1) BORACAY — 필리핀 화이트샌드 비치 (중심 x=-15, z=5)
    // ============================================================
    function buildBoracay(cx, cz) {
        // 하얀 모래 바닥
        scene.add(makeFloorPad(cx, cz, 11, 11, 0xF5EFD6));
        // 청록색 물 띠(패드 한쪽 가장자리)
        const water = makeFloorPad(cx, cz + 5.2, 11, 2.4, 0x26C6DA);
        scene.add(water);
        // 야자수 몇 그루
        scene.add(makePalm(cx - 4.2, cz - 3.5, 1.1));
        scene.add(makePalm(cx + 4.0, cz - 2.5, 0.95));
        scene.add(makePalm(cx - 3.5, cz + 2.0, 1.0));
        // 비치 파라솔 + 선베드
        scene.add(makeParasol(cx + 3.5, cz + 2.5, 0xFF7043));
        scene.add(makeSunbed(cx + 3.0, cz + 2.5, 0.2));
        scene.add(makeSunbed(cx + 4.0, cz + 2.5, -0.2));
        // 회의 테이블 + 비치 의자(흰색)
        scene.add(makeMeetingTable(cx, cz, {
            round: true, radius: 1.0, topColor: 0xECEFF1, seatColor: 0xFFFFFF, seats: 5
        }));
        // 표지판
        scene.add(makeSignPost('BORACAY', '#00ACC1', '#26C6DA', '#FFF59D', cx - 4.5, cz + 4.5));
    }

    // ============================================================
    // 2) GUAM — 태평양 트로피컬 라운지 (중심 x=1, z=10)
    // ============================================================
    function buildGuam(cx, cz) {
        // 모래/잔디 혼합 바닥(따뜻한 베이지)
        scene.add(makeFloorPad(cx, cz, 11, 11, 0xE6D9A8, true));
        // 티키 카바나(띠풀 지붕)
        scene.add(makeCabana(cx, cz, { w: 5.0, h: 2.7 }));
        // 카바나 아래 원형 회의 테이블 + 의자
        scene.add(makeMeetingTable(cx, cz, {
            round: true, radius: 1.0, topColor: 0xD7A86E, seatColor: 0x8D6E63, seats: 6
        }));
        // 야자수
        scene.add(makePalm(cx - 4.5, cz - 3.5, 1.05));
        scene.add(makePalm(cx + 4.5, cz + 3.5, 1.0));
        // 해먹
        scene.add(makeHammock(cx + 4.2, cz - 2.5));
        // 티키 횃불 (입구 양옆)
        scene.add(makeTorch(cx - 3.2, cz + 3.2));
        scene.add(makeTorch(cx + 3.2, cz + 3.2));
        // 표지판
        scene.add(makeSignPost('GUAM', '#00897B', '#26A69A', '#FFE082', cx + 4.5, cz - 4.0));
    }

    // ============================================================
    // 3) OKINAWA — 류큐/일본 트로피컬 (중심 x=16, z=5)
    // ============================================================
    function buildOkinawa(cx, cz) {
        // 차분한 바닥(자갈/돌마당 톤)
        scene.add(makeFloorPad(cx, cz, 11, 11, 0xD7CFC2));
        // 류큐 정자(붉은 기와)
        scene.add(makePavilion(cx, cz, { w: 5.5, h: 2.8 }));
        // 정자 아래 낮은 테이블 + 방석
        scene.add(makeMeetingTable(cx, cz, {
            round: false, radius: 0.9, tableH: 0.35, topColor: 0x5D4037,
            seatColor: 0xC62828, seats: 4, lowSeat: true
        }));
        // 시사(사자견) 석상 2개 — 정자 앞 양옆, 서로 마주보게
        scene.add(makeShisa(cx - 3.2, cz + 3.6, Math.PI * 0.15));
        scene.add(makeShisa(cx + 3.2, cz + 3.6, -Math.PI * 0.15));
        // 석등 2개
        scene.add(makeStoneLantern(cx - 4.2, cz - 3.0));
        scene.add(makeStoneLantern(cx + 4.2, cz - 3.0));
        // 열대 식물(야자수)
        scene.add(makePalm(cx - 4.5, cz + 1.0, 0.9));
        scene.add(makePalm(cx + 4.5, cz + 1.0, 0.9));
        // 표지판
        scene.add(makeSignPost('OKINAWA', '#C62828', '#E53935', '#FFF59D', cx - 4.5, cz + 4.5));
    }

    // ---- 3개 리조트 배치 (앞 공간 좌/중/우) ----
    buildBoracay(16, 18);   // 공장(좌측)과 겹쳐 → 오키나와 앞(우측 전방)으로 이동
    buildGuam(1, 10);
    buildOkinawa(16, 5);
}

// P6: 리조트 회의 테이블 좌석 — makeMeetingTable seatR = radius + 0.8 공식과 일치.
// Boracay(cx=16,cz=18,seats=5,seatR=1.8), Guam(cx=1,cz=10,seats=6,seatR=1.8), Okinawa(cx=16,cz=5,seats=4,seatR=1.7)
function _resortSeats(cx, cz, count, seatR) {
    const arr = [];
    for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        arr.push({ x: cx + Math.cos(ang) * seatR, z: cz + Math.sin(ang) * seatR, occupied: false });
    }
    return arr;
}
const meetingSeats = [
    ..._resortSeats(16, 18, 5, 1.8), // Boracay
    ..._resortSeats(1,  10, 6, 1.8), // Guam
    ..._resortSeats(16,  5, 4, 1.7), // Okinawa
];

// P5-D: 2D 캔버스 좌표(px) ↔ 3D 씬 좌표 변환 규약 (단일 진실).
// 2D 캔버스는 800×600, 중앙(400,300) 기준. 2D x → 3D x, 2D y → 3D z (바닥 평면).
// createPersonAvatar(읽기)와 3D 드래그 영속화(쓰기)가 동일한 규약을 공유해 왕복 일관성을 보장한다.
const PERSON_SCALE_3D = 0.02; // 픽셀 → 3D 단위 스케일
const PERSON_ORIGIN_X = 400;  // 2D 캔버스 중앙 x
const PERSON_ORIGIN_Y = 300;  // 2D 캔버스 중앙 y
const PERSON_GROUND_Y = 0;    // 상세 캐릭터는 발이 그룹 원점(y=0)에 위치 → 바닥 높이 0

/** 서버 position {x,y}(2D px) → 3D 씬 좌표 {x,z} */
function personPosToScene(pos) {
    return {
        x: (pos.x - PERSON_ORIGIN_X) * PERSON_SCALE_3D,
        z: (pos.y - PERSON_ORIGIN_Y) * PERSON_SCALE_3D,
    };
}

/** 3D 씬 좌표(sceneX, sceneZ) → 서버 position {x,y}(2D px). personPosToScene의 역변환 */
function scenePosToPerson(sceneX, sceneZ) {
    return {
        x: Math.round(sceneX / PERSON_SCALE_3D + PERSON_ORIGIN_X),
        y: Math.round(sceneZ / PERSON_SCALE_3D + PERSON_ORIGIN_Y),
    };
}

/**
 * 사람 아바타 1개 생성 (상세 캐릭터 모델 + 이름 레이블)
 *
 * 기존 에이전트(developer/devops 등)와 동일한 character.js 의 createDetailedPerson 으로
 * 상세 캐릭터를 만든다. person.color 는 셔츠 색에 반영한다.
 * person.position {x, y} 가 있으면 3D 씬 위치에 반영(2D y → 3D z), 없으면 격자 기본 배치.
 */
function createPersonAvatar(person) {
    const color = parseInt((person.color || '#4A90E2').replace('#', ''), 16);

    // 상세 캐릭터 모델 — person.id 해시로 외형(피부·머리색·헤어스타일·성별)을 결정적 다양화.
    // 같은 id 는 항상 같은 외형 → 새로고침·재접속에도 일관. 셔츠색만 person.color 반영(바지·신발 고정).
    const personObj = createDetailedPerson(traitsFromSeed(person.id, color));
    const group = personObj.group;
    group.scale.set(0.9, 0.9, 0.9);   // 계단 에이전트와 동일 스케일

    // 드래그 레이캐스트 식별용: 그룹의 모든 메쉬에 personId 부착 + 픽 대상 수집
    const pickMeshes = [];
    group.traverse(obj => {
        if (obj.isMesh) {
            obj.userData.personId = person.id;
            obj.castShadow = true;
            pickMeshes.push(obj);
        }
    });

    // 배지 (읽지 않은 수) — 머리 위
    const badgeGeo = new THREE.SphereGeometry(0.13, 8, 8);
    const badgeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const badge = new THREE.Mesh(badgeGeo, badgeMat);
    badge.position.set(0.28, 2.0, 0);
    badge.visible = false;
    group.add(badge);

    // person.position이 있으면 3D 씬 위치 반영, 없으면 격자 기본 배치
    if (person.position && (person.position.x !== undefined) && (person.position.y !== undefined)) {
        // 2D 캔버스 좌표(px) → 3D 씬 좌표 변환: 2D y → 3D z (공유 규약)
        const s = personPosToScene(person.position);
        group.position.set(s.x, PERSON_GROUND_Y, s.z);
    } else {
        // 기본 격자 배치 — 오피스 앞 공간 (x=-5~5, z=6~10)
        const idx = personAvatarMap.size;
        const targetX = -4 + (idx % 5) * 2;
        const targetZ = 7 + Math.floor(idx / 5) * 2;
        group.position.set(targetX, PERSON_GROUND_Y, targetZ);
    }

    _origSceneAdd(group);

    // HTML 레이블
    const labelEl = makePersonLabel(person.name, person.color || '#4A90E2');

    personAvatarMap.set(person.id, { group, personObj, pickMeshes, badge, labelEl, bubbleEl: null, unreadCount: 0,
        meetingEl: null, preMeetingPos: null, meetingSeatIdx: -1, meetingJoinUrl: null,
        displayName: person.name, shirtColorHex: person.color || '#4A90E2' });
}

/**
 * 사람 아바타 목록 동기화 (추가/삭제/위치 갱신)
 * P5-D: 기존 아바타도 person.position 변경 시 3D 위치를 갱신한다
 * (2D 드래그 → 서버 PUT → people-update 브로드캐스트가 3D에 반영되도록).
 */
function syncPersonAvatars(people) {
    const newIds = new Set(people.map(p => p.id));

    // 삭제
    for (const [id, av] of personAvatarMap) {
        if (!newIds.has(id)) {
            scene.remove(av.group);
            av.labelEl.remove();
            if (av.bubbleEl) av.bubbleEl.remove();
            if (av.meetingEl) { av.meetingEl.remove(); }
            if (av.meetingSeatIdx >= 0 && meetingSeats[av.meetingSeatIdx]) {
                meetingSeats[av.meetingSeatIdx].occupied = false;
            }
            personAvatarMap.delete(id);
        }
    }

    // 추가/위치 갱신
    for (const person of people) {
        const av = personAvatarMap.get(person.id);
        if (!av) {
            createPersonAvatar(person);
        } else if (person.position && (person.position.x !== undefined) && (person.position.y !== undefined)) {
            // 드래그 중인 아바타가 아니면(또는 다른 클라이언트의 갱신이면) 위치 반영
            if (av !== draggingAvatar) {
                const s = personPosToScene(person.position);
                av.group.position.set(s.x, PERSON_GROUND_Y, s.z);
            }
        }
    }
}

// P5-E-C: 말풍선 표시 정책 상수.
// 기본 표시 시간 6초(설계서 §10 — 클릭 기회 확보를 위해 2초→6초 연장).
// hover로 일시정지된 타이머는 마우스 이탈 후 짧은 grace(1.5초) 뒤 재개한다.
const BUBBLE_TTL_MS = 10000;
const BUBBLE_GRACE_MS = 1500;

/**
 * Teams 알림: 아바타 위 말풍선 표시 (P5-E-C: 6초 + hover 시 타이머 일시정지)
 */
function showTeamsNotification3D(data) {
    const av = personAvatarMap.get(data.personId);
    if (!av) return;

    const msg = data.message || {};
    const preview = `${msg.senderName}: ${(msg.text || '').slice(0, 30)}`;

    // P5-E-B: 페이로드 딥링크 메타를 아바타에 저장(P5-E-A 계약: chatId·senderEmail·messageId·tenantId).
    const meta = {
        chatId:      msg.chatId,
        senderEmail: msg.senderEmail,
        messageId:   msg.messageId,   // 향후 딥링크 B 승격용 (이번엔 미사용)
        tenantId:    msg.tenantId,
    };
    av.deeplinkMeta = meta;
    const url = buildTeamsDeeplink(meta);   // 식별자 모두 없으면 null → 클릭 비활성

    // 기존 말풍선 제거
    if (av.bubbleEl) { av.bubbleEl.remove(); av.bubbleEl = null; }

    // CHAT-01(D-2): 말풍선 클릭 → 인앱 채팅 열기. chatId 있으면 인앱, 없으면 외부 Teams 딥링크로 폴백.
    const canChat = !!meta.chatId;
    const bel = makeBubbleEl(preview, canChat || !!url);
    av.bubbleEl = bel;

    if (canChat || url) {
        bel.addEventListener('click', (event) => {
            // 카메라 컨트롤(OrbitControls) 전파 차단
            event.stopPropagation();
            if (av.deeplinkMeta && av.deeplinkMeta.chatId) {
                // 인앱 채팅 오버레이 오픈
                openChat(av.deeplinkMeta.chatId, av.displayName || msg.senderName || '채팅');
            } else {
                // 폴백: 클릭 시점 최신 메타로 딥링크 재계산 → 새 탭 Teams 오픈
                const target = buildTeamsDeeplink(av.deeplinkMeta);
                if (target) window.open(target, '_blank', 'noopener');
            }
        });
    }

    // 배지 표시
    av.unreadCount = (av.unreadCount || 0) + 1;
    av.badge.visible = true;

    // P5-E-C: 자동 제거 타이머를 헬퍼로 추출 — 초기 시작·hover 이탈 후 재개에서 재사용.
    const scheduleRemoval = (delay) => {
        clearTimeout(av.bubbleTimeout);
        av.bubbleTimeout = setTimeout(() => {
            if (av.bubbleEl) { av.bubbleEl.remove(); av.bubbleEl = null; }
        }, delay);
    };

    // P5-E-C: hover 중에는 자동 제거 타이머를 일시정지하고, 이탈 시 짧은 grace 후 재개.
    // (B의 시각 강조 onmouseover/onmouseout는 보존하면서 별도 리스너로 타이머만 제어.)
    bel.addEventListener('mouseenter', () => {
        clearTimeout(av.bubbleTimeout);
    });
    bel.addEventListener('mouseleave', () => {
        scheduleRemoval(BUBBLE_GRACE_MS);
    });

    // 6초 후 말풍선 제거 (hover 중이면 일시정지됨)
    scheduleRemoval(BUBBLE_TTL_MS);
}

// P6: 화상회의 중 아바타 위에 표시할 📹 인디케이터 DOM 생성
function makeMeetingIndicatorEl(joinUrl) {
    const el = document.createElement('div');
    el.style.cssText = `
        position: absolute; transform: translateX(-50%);
        display: flex; flex-direction: column; align-items: center;
        font-family: sans-serif; user-select: none;
        ${joinUrl ? 'pointer-events: auto; cursor: pointer;' : 'pointer-events: none; cursor: default;'}
    `;
    const icon = document.createElement('div');
    icon.textContent = '📹';
    icon.style.cssText = `font-size: 32px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55));`;
    el.appendChild(icon);
    if (joinUrl) {
        const hint = document.createElement('div');
        hint.textContent = '클릭 → 회의 참여';
        hint.style.cssText = `
            margin-top: 2px; font-size: 10px; font-family: monospace;
            background: #00897B; color: #fff; border-radius: 4px; padding: 1px 5px;
            white-space: nowrap;
        `;
        el.appendChild(hint);
    }
    document.body.appendChild(el);
    return el;
}

/**
 * P6: Teams 화상회의 상태 수신 → 아바타를 리조트 회의 테이블로 이동/복귀
 *
 * inMeeting=true  → meetingSeats에서 빈 자리 할당, 아바타 텔레포트, 📹 인디케이터 표시
 * inMeeting=false → 원래 위치 복귀, 좌석 해제, 인디케이터 제거
 */
function handleMeetingStatus(data) {
    const av = personAvatarMap.get(data.personId);
    if (!av) return;

    if (data.inMeeting) {
        const seat = meetingSeats.find(s => !s.occupied);
        if (!seat) return; // 전체 좌석 만석

        av.preMeetingPos = av.group.position.clone();
        av.meetingSeatIdx = meetingSeats.indexOf(seat);
        seat.occupied = true;

        av.group.position.set(seat.x, PERSON_GROUND_Y, seat.z);

        if (av.meetingEl) av.meetingEl.remove();
        const el = makeMeetingIndicatorEl(data.joinUrl || null);
        if (data.joinUrl) {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open(data.joinUrl, '_blank', 'noopener');
            });
        }
        av.meetingEl = el;
        av.meetingJoinUrl = data.joinUrl || null;
    } else {
        if (av.preMeetingPos) {
            av.group.position.copy(av.preMeetingPos);
            av.preMeetingPos = null;
        }
        if (av.meetingSeatIdx >= 0 && meetingSeats[av.meetingSeatIdx]) {
            meetingSeats[av.meetingSeatIdx].occupied = false;
            av.meetingSeatIdx = -1;
        }
        if (av.meetingEl) { av.meetingEl.remove(); av.meetingEl = null; }
        av.meetingJoinUrl = null;
    }
}

// 애니메이션 루프에서 레이블 위치 갱신 (animate 함수 내에서 호출됨)
function updatePersonLabels() {
    for (const [, av] of personAvatarMap) {
        // 상세 캐릭터(스케일 0.9, 키 약 1.6)의 머리 위로 레이블·말풍선 배치
        const above = av.group.position.clone();
        above.y += 1.9;
        const s = worldToScreen(above);
        av.labelEl.style.left = `${s.x}px`;
        av.labelEl.style.top  = `${s.y}px`;

        if (av.bubbleEl) {
            const bubblePos = av.group.position.clone();
            bubblePos.y += 2.3;
            const bs = worldToScreen(bubblePos);
            av.bubbleEl.style.left = `${bs.x}px`;
            av.bubbleEl.style.top  = `${bs.y}px`;
        }

        // P6: 📹 인디케이터를 말풍선보다 위에 배치
        if (av.meetingEl) {
            const mPos = av.group.position.clone();
            mPos.y += 2.9;
            const ms = worldToScreen(mPos);
            av.meetingEl.style.left = `${ms.x}px`;
            av.meetingEl.style.top  = `${ms.y}px`;
        }
    }
}

// ---- "+ 사람 추가" HTML 버튼 ----
(function createAddPersonButton3D() {
    const btn = document.createElement('button');
    btn.textContent = '+ 사람 추가';
    btn.style.cssText = `
        position: fixed; bottom: 16px; right: 16px; z-index: 100;
        background: #2ecc71; color: #fff; border: none; border-radius: 8px;
        padding: 8px 16px; font-size: 13px; font-family: monospace;
        cursor: pointer; font-weight: bold;
    `;
    btn.onmouseover = () => { btn.style.background = '#27ae60'; };
    btn.onmouseout  = () => { btn.style.background = '#2ecc71'; };
    btn.onclick = async () => {
        const name  = prompt('이름을 입력하세요:');
        if (!name) return;
        const email = prompt('Teams 이메일을 입력하세요:');
        if (!email) return;
        const color = prompt('색상 (예: #4A90E2):', '#4A90E2') || '#4A90E2';
        try {
            const res = await fetch('http://localhost:3300/api/people', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, color, position: { x: 400, y: 350 } }),
            });
            if (!res.ok) alert('추가 실패');
        } catch (e) {
            alert('서버 오류: ' + e.message);
        }
    };
    document.body.appendChild(btn);
})();

// ---- "조직에서 추가 (FORMATIONLABS)" 패널 (조직 사용자 → 아바타) ----
// 기존 패널 스타일과 일관: 반투명 검정 배경·monospace·흰 글씨.
// 위치: 좌상단(#info·people-panel·status-panel 과 겹치지 않는 빈 영역).
(function createOrgUserPicker3D() {
    const API_BASE = `http://${location.hostname}:3300`;
    // 사용자 추가 시 순환 지정할 색상 팔레트 (10색 — 6명째부터 셔츠색 중복 완화)
    const COLOR_PALETTE = [
        '#4A90E2', '#E67E22', '#27AE60', '#8E44AD', '#E74C3C',
        '#16A085', '#F39C12', '#2980B9', '#C0392B', '#7F8C8D',
    ];
    let colorCursor = 0;
    let orgUsers = [];               // 조회된 조직 사용자 캐시 (검색 필터용)
    let existingEmails = new Set();  // 이미 등록된 인물 email(소문자) — 목록서 '추가됨' 사전 표시용

    function escAttr(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ── 패널 컨테이너 ──
    const panel = document.createElement('div');
    panel.id = 'org-picker';
    // 상단 좌측(유일하게 빈 코너) 유지. 펼침 시 하단 좌측 #status-panel 과 겹치지 않도록
    // 최대 높이를 뷰포트 하단 여백(약 230px = status-panel + 마진) 만큼 비워 제한한다.
    panel.style.cssText = `
        position: absolute; top: 10px; left: 10px; z-index: 100;
        color: #fff; font-family: monospace; font-size: 12px;
        background: rgba(0,0,0,0.6); padding: 10px 14px; border-radius: 8px;
        backdrop-filter: blur(4px); width: 280px; max-height: calc(100vh - 230px);
        display: flex; flex-direction: column; overflow: hidden;
    `;

    // 토글 버튼(헤더)
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; cursor:pointer;';
    header.innerHTML = `
        <span class="section-label" style="margin:0; text-transform:uppercase; letter-spacing:1px; color:#888;">조직에서 추가 (FORMATIONLABS)</span>
        <span id="op-toggle" style="color:#aaa;">＋</span>
    `;

    // 본문(접힘 기본)
    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'margin-top:8px; display:none; flex-direction:column; overflow:hidden; min-height:0;';
    bodyEl.innerHTML = `
        <input id="op-search" type="text" placeholder="이름/이메일 검색…"
            style="background:rgba(255,255,255,0.06); color:#fff; border:1px solid #333;
                   border-radius:4px; padding:5px 8px; font-family:monospace; font-size:11px;
                   outline:none; margin-bottom:8px;" />
        <div id="op-list" style="overflow-y:auto; min-height:0; max-height:42vh;
            scrollbar-width:thin; scrollbar-color:#444 transparent;"></div>
        <div id="op-status" style="color:#888; font-size:10px; margin-top:6px;"></div>
    `;

    panel.appendChild(header);
    panel.appendChild(bodyEl);
    document.body.appendChild(panel);

    const searchEl = bodyEl.querySelector('#op-search');
    const listEl   = bodyEl.querySelector('#op-list');
    const statusEl = bodyEl.querySelector('#op-status');
    const toggleEl = header.querySelector('#op-toggle');

    function setStatus(msg, color = '#888') {
        statusEl.textContent = msg || '';
        statusEl.style.color = color;
    }

    let loaded = false;
    header.onclick = () => {
        const open = bodyEl.style.display === 'none';
        bodyEl.style.display = open ? 'flex' : 'none';
        toggleEl.textContent = open ? '－' : '＋';
        if (open && !loaded) { loaded = true; loadOrgUsers(); }
    };

    // 검색창 입력 → 필터 렌더
    searchEl.addEventListener('input', () => renderUsers(searchEl.value));
    // Enter → 아직 추가되지 않은 첫 후보를 바로 추가 (키보드 지원)
    searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && firstAddBtn) { e.preventDefault(); firstAddBtn.click(); }
    });

    // 등록된 people email 집합 갱신 — 목록에서 '추가됨' 사전 표시용
    async function refreshExistingEmails() {
        try {
            const people = await fetch(`${API_BASE}/api/people`).then(r => r.json());
            existingEmails = new Set(
                (Array.isArray(people) ? people : [])
                    .map(p => (p.email || '').toLowerCase()).filter(Boolean));
        } catch { /* 무시 — 빈 집합 유지 */ }
    }

    // ── 1. 조직 사용자 조회 ──
    async function loadOrgUsers() {
        setStatus('조직 사용자 불러오는 중…');
        listEl.innerHTML = '';
        try {
            // 이미 등록된 인물 email 집합 선조회 — 목록 렌더 시 '추가됨' 표시에 사용
            await refreshExistingEmails();
            const res = await fetch(`${API_BASE}/api/org-users`);
            if (res.status === 401) { setStatus('조직 인증 필요 (로그인 후 사용)', '#ff0'); return; }
            if (!res.ok) { setStatus(`사용자 조회 실패 (${res.status})`, '#f66'); return; }
            orgUsers = await res.json();
            if (!Array.isArray(orgUsers) || orgUsers.length === 0) {
                setStatus('표시할 사용자가 없습니다.');
                return;
            }
            setStatus(`${orgUsers.length}명`);
            renderUsers(searchEl.value);
        } catch (e) {
            setStatus('서버 오류: ' + e.message, '#f66');
        }
    }

    // ── 2. 사용자 목록 렌더 (검색어로 필터) ──
    let firstAddBtn = null;   // Enter 키로 추가할 첫 후보(미등록) 버튼
    function renderUsers(query) {
        const q = (query || '').toLowerCase().trim();
        const filtered = q
            ? orgUsers.filter(u =>
                (u.displayName || '').toLowerCase().includes(q)
                || (u.email || '').toLowerCase().includes(q))
            : orgUsers;

        // 검색 중이면 결과 건수(N/총M명), 아니면 총원만 표시
        setStatus(q ? `${filtered.length}/${orgUsers.length}명` : `${orgUsers.length}명`);

        listEl.innerHTML = '';
        firstAddBtn = null;
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color:#888; font-size:10px; padding:4px 0;';
            empty.textContent = '검색 결과 없음';
            listEl.appendChild(empty);
            return;
        }
        filtered.forEach(u => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 0; border-top:1px solid #2a2a2a;';
            // 부제: jobTitle 있으면 jobTitle, 없으면 email
            const sub = u.jobTitle || u.email;
            row.innerHTML = `
                <div style="min-width:0;">
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escAttr(u.displayName)}</div>
                    <div style="color:#888; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escAttr(sub)}</div>
                </div>
            `;
            // 이미 등록된 사용자는 비활성 '추가됨' 으로 사전 표시(클릭 전에 식별)
            const already = existingEmails.has((u.email || '').toLowerCase());
            const addBtn = document.createElement('button');
            if (already) {
                addBtn.textContent = '추가됨';
                addBtn.disabled = true;
                addBtn.style.cssText = `
                    flex:none; background:#3a3a3a; color:#888; border:none; border-radius:4px;
                    padding:3px 10px; font-family:monospace; font-size:11px; cursor:default;
                `;
            } else {
                addBtn.textContent = '추가';
                addBtn.style.cssText = `
                    flex:none; background:#2ecc71; color:#fff; border:none; border-radius:4px;
                    padding:3px 10px; font-family:monospace; font-size:11px; cursor:pointer; font-weight:bold;
                `;
                addBtn.onmouseover = () => { if (!addBtn.disabled) addBtn.style.background = '#27ae60'; };
                addBtn.onmouseout  = () => { if (!addBtn.disabled) addBtn.style.background = '#2ecc71'; };
                addBtn.onclick = () => addUser(u, addBtn);
                if (!firstAddBtn) firstAddBtn = addBtn;   // 첫 미등록 후보 → Enter 대상
            }
            row.appendChild(addBtn);
            listEl.appendChild(row);
        });
    }

    // ── 3. 사용자 추가 (중복 email 방지) ──
    async function addUser(user, addBtn) {
        addBtn.disabled = true;
        addBtn.textContent = '…';
        try {
            // 중복 확인: 이미 같은 email 이 있으면 추가하지 않음
            const existing = await fetch(`${API_BASE}/api/people`).then(r => r.json()).catch(() => []);
            const dup = Array.isArray(existing)
                && existing.some(p => (p.email || '').toLowerCase() === (user.email || '').toLowerCase());
            if (dup) {
                addBtn.textContent = '이미 있음';
                return;
            }
            const color = COLOR_PALETTE[colorCursor % COLOR_PALETTE.length];
            colorCursor++;
            const res = await fetch(`${API_BASE}/api/people`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: user.displayName, email: user.email, color }),
            });
            if (!res.ok) {
                addBtn.textContent = '실패';
                addBtn.disabled = false;
                return;
            }
            // people-update 브로드캐스트로 아바타가 자동 표시됨
            existingEmails.add((user.email || '').toLowerCase());   // 이후 렌더서 '추가됨' 유지
            addBtn.textContent = '추가됨';
            addBtn.style.background = '#3a3a3a';
            addBtn.style.color = '#888';
            addBtn.style.cursor = 'default';
        } catch (e) {
            addBtn.disabled = false;
            addBtn.textContent = '추가';
            setStatus('서버 오류: ' + e.message, '#f66');
        }
    }
})();

// ---- 사람 아바타 드래그 (P5-D) ----
// 레이캐스트로 아바타 캐릭터 메쉬를 집어 바닥 평면(y=PERSON_GROUND_Y) 위로 끌고,
// 드래그 종료 시 새 좌표를 서버에 PUT하여 영속화한다.
(function setupPersonDrag3D() {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    // 아바타가 이동하는 바닥 평면 (y = PERSON_GROUND_Y, 위쪽 법선)
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -PERSON_GROUND_Y);
    const hitPoint = new THREE.Vector3();
    const dom = renderer.domElement;

    /** 포인터 이벤트 → 정규화 장치 좌표(NDC) */
    function toNdc(ev) {
        const rect = dom.getBoundingClientRect();
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /** 현재 포인터 광선이 만나는 첫 아바타 캐릭터 메쉬를 반환 (없으면 null) */
    function pickAvatarMesh() {
        const meshes = [];
        for (const [, av] of personAvatarMap) {
            if (av.pickMeshes) meshes.push(...av.pickMeshes);
        }
        if (meshes.length === 0) return null;
        const hits = raycaster.intersectObjects(meshes, false);
        return hits.length ? hits[0].object : null;
    }

    dom.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return; // 좌클릭만
        toNdc(ev);
        raycaster.setFromCamera(ndc, camera);
        const mesh = pickAvatarMesh();
        if (!mesh) return;
        const id = mesh.userData.personId;
        const av = personAvatarMap.get(id);
        if (!av) return;
        draggingAvatar = av;
        draggingAvatar.personId = id;
        controls.enabled = false; // 카메라 회전 잠금 (드래그 중)
        dom.setPointerCapture?.(ev.pointerId);
        ev.preventDefault();
    });

    dom.addEventListener('pointermove', (ev) => {
        if (!draggingAvatar) return;
        toNdc(ev);
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
            // 평면 위 교점으로 아바타 이동 (y는 고정)
            draggingAvatar.group.position.set(hitPoint.x, PERSON_GROUND_Y, hitPoint.z);
        }
    });

    function endDrag(ev) {
        if (!draggingAvatar) return;
        const av = draggingAvatar;
        const id = av.personId;
        draggingAvatar = null;
        controls.enabled = true;
        dom.releasePointerCapture?.(ev.pointerId);

        // 3D 씬 좌표 → 서버 position(2D px) 역변환 후 영속화
        const pos = scenePosToPerson(av.group.position.x, av.group.position.z);
        fetch(`http://localhost:3300/api/people/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: pos }),
        }).catch(() => {});
    }

    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
})();

// ---- WebSocket ----
function connectWS() {
    const ws = new WebSocket(`ws://${location.hostname}:3300`);
    ws.onopen = () => { document.getElementById('conn-status').textContent = 'Connected'; document.getElementById('conn-status').style.color = '#0f0'; };
    ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.type === 'init') {
            Object.entries(d.agents).forEach(([r, s]) => updateAgentState(r, s));
        } else if (d.type === 'agent-update') {
            updateAgentState(d.agent, d.state);
        } else if (d.type === 'people-update') {
            syncPersonAvatars(d.people);
        } else if (d.type === 'teams-notification') {
            showTeamsNotification3D(d);
            handleTeamsNotification(d);   // CHAT-01: 열린 채팅창 즉시 갱신·닫힌 방 안읽음 배지
        } else if (d.type === 'meeting-status') {
            handleMeetingStatus(d);
        }
    };
    ws.onclose = () => { document.getElementById('conn-status').textContent = 'Reconnecting...'; document.getElementById('conn-status').style.color = '#f00'; setTimeout(connectWS, 3000); };
}
connectWS();

// ---- 인앱 Teams 채팅 UI 초기화 (CHAT-01) ----
initChatPanel({ apiBase: `http://${location.hostname}:3300` });

// ---- 점심 게임 초기화 ----
initLunchGame({
    getPeople: () => {
        const out = [];
        personAvatarMap.forEach((av, id) => {
            const name = av.displayName || id;
            out.push({ id, name, color: av.shirtColorHex || '#4a90d9' });
        });
        return out;
    },
    addFloatingText: (text, color) => addFloatingText(text, new THREE.Vector3(0, 6, -5), color, 48),
});

// 간식 내기 자동 트리거 — 12:00 (점심) · 18:00 (저녁) 하루 2회, 당일 각 1회만
const _lgFired = new Set(); // "YYYYMMDD_HHMM" 형태로 당일 발화 기록
setInterval(() => {
    const now = new Date();
    const hm = now.getHours() * 100 + now.getMinutes();
    if (hm !== 1200 && hm !== 1800) return;
    const key = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${hm}`;
    if (_lgFired.has(key)) return;
    _lgFired.add(key);
    triggerLunchGame();
}, 20000);

// 초기 사람 목록 fetch
fetch('http://localhost:3300/api/people')
    .then(r => r.json())
    .then(people => syncPersonAvatars(people))
    .catch(() => {});

// 디버그/툴 접근용 — CDP에서 카메라 조작 시 사용
window.__camera = camera;
window.__controls = controls;
window.__scene = scene;
window.__applyWeather = applyWeather;
window.__forceDayPhase = null; // 0..1 설정시 시간 고정

window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        fetch('http://localhost:3300/demo', { method: 'POST' }).catch(() => {});
        return;
    }
    // 프리셋 뷰 (1~5)
    if (VIEWS[e.key]) {
        tweenView(VIEWS[e.key]);
        const help = document.getElementById('view-hint');
        if (help) help.textContent = `📷 ${VIEWS[e.key].name}`;
    }
    // R 키로 초기 뷰
    if (e.code === 'KeyR') tweenView(VIEWS['1']);
    // G 키로 점심 게임 수동 실행
    if (e.code === 'KeyG') triggerLunchGame();
});
