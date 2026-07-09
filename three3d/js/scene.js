// ============================================
// Agent Monitor - 3D Living Office
// 카페테리아 + 야외마당 + 다양한 캐릭터
// ============================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFactory, updateFactory } from './factory.js';
import { createWarehouse, updateWarehouse } from './warehouse.js';
import { createDetailedPerson, createDetailedPerson as _createDetailedPersonForStairs, traitsFromSeed, updatePersonAnimation, createICharacter, createWatermelonCharacter, createBuriburimonCharacter } from './character.js';
import { buildTeamsDeeplink } from './deeplink.js';
import { initLunchGame, triggerLunchGame } from './lunchgame.js';
import { initChatPanel, openChat, handleTeamsNotification, isChatOpen } from './chat-panel.js';
import { initNotifications, notify } from './notifications.js';
import { initAuthGate, getAccount, getAccessToken, getFileAccessToken } from './auth-msal.js';
import { sendMessage as graphSendMessage } from './chat-graph.js';


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
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 부드러운 그림자 + VSM보다 가벼움(블러 패스 없음, 성능 최적화)
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
    '8': { name: '텐퍼센트/바디프렌드', pos: [-13, 13, 15], target: [-24, 5.5, -2] },
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
sun.shadow.mapSize.set(2048, 2048); // 성능 최적화: 4096→2048 (매 프레임 그림자맵 비용 1/4, 육안 차이 미미)
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0005; // 그림자 깨짐(아티팩트) 방지
scene.add(sun);

const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3d6e32, 1.2); // 하늘과 땅의 대비광 증가
scene.add(hemiLight);

// 사무실 내부 조명 (천장 형광등 느낌 -> 조금 더 따뜻한 LED 느낌)
// 성능 최적화: PointLight 그림자는 큐브 6면을 매 프레임 재렌더 → 2개면 12면. 조명만 남기고 그림자는 끔.
// (태양 DirectionalLight 그림자가 접지감을 제공하므로 실내 포인트광 그림자는 시각 손실 미미)
const interiorLight = new THREE.PointLight(0xfff0d0, 8.0, 25, 1.0);
interiorLight.position.set(-2, 3.2, 0);
interiorLight.castShadow = false;
scene.add(interiorLight);
const interiorLight2 = new THREE.PointLight(0xfff0d0, 8.0, 25, 1.0);
interiorLight2.position.set(2, 3.2, 0);
interiorLight2.castShadow = false;
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

// ── 아바타 키보드 이동 보조: 걸어다닐 수 있는 면 + 좌석 + 엘리베이터 진입존 ──
// walkables: 이동 시 발밑으로 레이캐스트해 y를 스냅(계단·슬래브·데크·플랫폼). 없으면 지면 0.
// seats: 근처에서 Enter로 앉기. elevatorZones: 근처에서 Enter로 층 선택.
const walkables = [];
// jumpTargets: 점프/낙하 시 착지할 수 있는 모든 정적 표면(바닥·슬래브·가구 상판 등).
// 모듈 끝에서 envGroup을 1회 순회해 채운다(아바타는 이후 비동기 추가되므로 자연히 제외됨).
const jumpTargets = [];
const seats = [];
const elevatorZones = [];   // [{ x, z, y, floor }]
const elevatorPick = [];    // 클릭 시 층 메뉴를 여는 엘리베이터/발판/포털 메쉬
const elevatorRings = [];   // 진입 포털 링(맥동 애니메이션용)
const floorCenters = {};    // floor → { x, z, y } : 층 선택 시 아바타가 도착할 '그 층 센터'
let cafeBounds = null;      // 카페 건물 footprint(로컬) — 엘리베이터는 건물 '안'에서만 호출
const _downRay = new THREE.Raycaster();
const _downDir = new THREE.Vector3(0, -1, 0);
const _rayOrigin = new THREE.Vector3();

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
walkables.push(o2Slab);

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
    walkables.push(step);
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
walkables.push(platform);
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

// ============================================
// 텐퍼센트 커피(1F) + 바디프렌드 안마의자(2F)
// FLLABS 2F OFFICE 왼쪽에, 오피스의 2배 크기(w·d 2배)로 세운 2층 건물.
// 1F: 오픈 카페(직원 1명 + 앞쪽 데크·테이블 2개), 2F: 안마의자 쇼룸 10대,
// 좌측 외부 계단으로 1F↔2F 연결. (좌표계는 OFFICE2와 동일한 envGroup 로컬)
// ============================================
// 카페 직원/연출 애니메이션 참조 (animate에서 updateCafeStaff로 매 프레임 구동)
// ⚠ TDZ 방지: animate() 호출보다 앞에서 선언(아래 IIFE가 값 할당).
let cafeBarista = null, cafeAlba = null, cafeAlba2 = null, cafeCoffeeStream = null;
let cafeDoor = null, cafeDoorOpen = false, cafeServer2F = null, cafeCat = null, cafeDiner = null, cafeClerk = null, cafeKitchen = null, cafeStocker = null;
const cafeSteam = [], cafeDoorPick = [], cafeCustomers = [], bodyfriendChairs = [], cafeMenuPick = [], diningGuests = [], mealPlanPick = [];
(function buildTenPercentBodyfriend() {
    const CAFE = { x: -24, z: 0, w: 16, d: 12, floorH: 2.8 };  // 오피스(8×6)의 2배
    const H  = CAFE.floorH * 4;         // 전체 높이(4층 건물)
    const F2 = CAFE.floorH + 0.09;          // 2층 바닥면(슬래브 윗면)
    const F3 = CAFE.floorH * 2 + 0.09;      // 3층 바닥면
    const F4 = CAFE.floorH * 3 + 0.09;      // 4층 바닥면

    // ---- 재질 ----
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xE8F5E9, transparent: true, opacity: 0.18, transmission: 0.9,
        roughness: 0.05, metalness: 0.0, ior: 1.5, thickness: 0.1, side: THREE.DoubleSide,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3E3A34, metalness: 0.6, roughness: 0.4 });
    const wallMat  = new THREE.MeshStandardMaterial({ color: 0xEDE7DA, roughness: 0.85, metalness: 0.03 });
    const woodMat  = new THREE.MeshStandardMaterial({ color: 0x9C6B3F, roughness: 0.7 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x6D4C33, roughness: 0.7 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.5, roughness: 0.4 });

    // 캔버스 간판/메뉴 텍스처
    function signTex(lines, bg, fg, sizes) {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
        const c = cv.getContext('2d');
        c.fillStyle = bg; c.fillRect(0, 0, 512, 192);
        c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
        const step = 192 / (lines.length + 1);
        lines.forEach((ln, i) => { c.font = (sizes && sizes[i]) || 'bold 56px sans-serif'; c.fillText(ln, 256, step * (i + 1)); });
        return new THREE.CanvasTexture(cv);
    }
    // 로고 이미지 간판 텍스처 — 배경색 위에 로고를 비율 유지(contain)로 중앙 배치.
    // 캔버스를 간판 판넬 비율(aspect=가로/세로)에 맞춰 만들어 로고 왜곡을 막는다.
    // 선명도: 고해상도 캔버스 + 이방성 필터(anisotropy) 최대 → 비스듬한 각도 흐림 방지.
    // 이미지는 비동기 로드 → onload 시점에 그린 뒤 needsUpdate로 텍스처를 갱신.
    function logoTex(src, bg, aspect, pad = 0.12) {
        const cw = 2048, ch = Math.round(cw / aspect);
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const c = cv.getContext('2d');
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.fillStyle = bg; c.fillRect(0, 0, cw, ch);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;                       // 색 정확도
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();   // 경사 각도 선명도
        const im = new Image();
        im.onload = () => {
            const s = Math.min(cw * (1 - pad) / im.width, ch * (1 - pad) / im.height);
            const dw = im.width * s, dh = im.height * s;
            c.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
            tex.needsUpdate = true;
        };
        im.src = src;
        return tex;
    }
    // 위치 지정 + envGroup 추가 헬퍼
    const add = (m, x, y, z) => { m.position.set(x, y, z); scene.add(m); return m; };

    // ---- 구조 ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CAFE.w, CAFE.d),
        new THREE.MeshStandardMaterial({ color: 0xB07C46, roughness: 0.55 }));  // 우드 플랭크
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; add(floor, CAFE.x, 0.02, CAFE.z);

    // 층 슬래브 3개(2·3·4F 바닥)
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xCBAE86, roughness: 0.6 });
    for (let f = 1; f <= 3; f++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(CAFE.w, 0.18, CAFE.d), slabMat);
        slab.castShadow = slab.receiveShadow = true; add(slab, CAFE.x, CAFE.floorH * f, CAFE.z);
        walkables.push(slab);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(CAFE.w + 0.5, 0.2, CAFE.d + 0.5),
        new THREE.MeshStandardMaterial({ color: 0x2E2A26, metalness: 0.3, roughness: 0.6 }));
    roof.castShadow = true; add(roof, CAFE.x, H + 0.1, CAFE.z);

    // 뒷벽 · 우측벽(솔리드) — 좌측(계단)·1F 정면(오픈 카페)은 개방
    const back = new THREE.Mesh(new THREE.BoxGeometry(CAFE.w, H, 0.15), wallMat);
    back.castShadow = back.receiveShadow = true; add(back, CAFE.x, H / 2, CAFE.z - CAFE.d / 2);
    const rightW = new THREE.Mesh(new THREE.BoxGeometry(0.15, H, CAFE.d), wallMat);
    rightW.castShadow = true; add(rightW, CAFE.x + CAFE.w / 2, H / 2, CAFE.z);

    // 코너 기둥 + 가로 보(정면/후면)
    for (const xo of [-CAFE.w / 2, CAFE.w / 2]) for (const zo of [-CAFE.d / 2, CAFE.d / 2]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, 0.2), frameMat); col.castShadow = true;
        add(col, CAFE.x + xo, H / 2, CAFE.z + zo);
    }
    for (const zo of [-CAFE.d / 2, CAFE.d / 2]) for (const yo of [0.08, CAFE.floorH, CAFE.floorH * 2, CAFE.floorH * 3, H - 0.08]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(CAFE.w, 0.16, 0.16), frameMat), CAFE.x, yo, CAFE.z + zo);
    }
    // 2·3·4F 정면 통유리(층별)
    for (let f = 1; f <= 3; f++) {
        add(new THREE.Mesh(new THREE.BoxGeometry(CAFE.w - 0.3, CAFE.floorH - 0.3, 0.06), glassMat),
            CAFE.x, CAFE.floorH * f + CAFE.floorH / 2, CAFE.z + CAFE.d / 2);
    }

    // ---- 우드톤 인테리어 + 따뜻한 조명 (칙칙함 개선) ----
    const woodDeep  = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.75 });
    const woodWarm  = new THREE.MeshStandardMaterial({ color: 0xC08A50, roughness: 0.7 });
    const seamMat   = new THREE.MeshStandardMaterial({ color: 0x6D4C33, roughness: 0.7 });
    // 바닥 플랭크 이음선
    for (let k = -3; k <= 3; k++) add(new THREE.Mesh(new THREE.BoxGeometry(CAFE.w - 0.4, 0.006, 0.04), seamMat), CAFE.x, 0.03, CAFE.z + k * 1.6);
    // 우드톤에 어울리는 카페트(러그) — 좌석 구역, 이중 테두리
    add(new THREE.Mesh(new THREE.PlaneGeometry(12, 7).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7A5230, roughness: 0.95 })), CAFE.x, 0.033, CAFE.z + 1.5);
    add(new THREE.Mesh(new THREE.PlaneGeometry(11, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xC2A06B, roughness: 0.95 })), CAFE.x, 0.037, CAFE.z + 1.5);
    // 1F 뒷벽 세로 우드 슬랫(피처월) — 메뉴판보다 살짝 뒤
    for (let k = 0; k <= 14; k++) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.18, CAFE.floorH - 0.3, 0.06), (k % 2 ? woodDeep : woodWarm)),
            CAFE.x - CAFE.w / 2 + 0.9 + k * 1.0, CAFE.floorH / 2, CAFE.z - CAFE.d / 2 + 0.06);
    }
    // 우측벽 안쪽 우드 패널 + 선반 2단(화분/원두)
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, CAFE.floorH - 0.2, CAFE.d - 0.6), woodDeep), CAFE.x + CAFE.w / 2 - 0.12, CAFE.floorH / 2, CAFE.z);
    for (const sy of [1.1, 1.8]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, CAFE.d - 2), woodWarm), CAFE.x + CAFE.w / 2 - 0.35, sy, CAFE.z);
        for (let j = -2; j <= 2; j++) {
            add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.18),
                new THREE.MeshStandardMaterial({ color: (j % 2 ? 0x4CAF50 : 0xB0764A), roughness: 0.7 })),
                CAFE.x + CAFE.w / 2 - 0.35, sy + 0.14, CAFE.z + j * 1.6);
        }
    }
    // 카운터 위 펜던트 조명 3개 (코드 + 우드 갓 + 전구)
    for (let p = -1; p <= 1; p++) {
        const px = CAFE.x + 1 + p * 1.6, pz = CAFE.z - CAFE.d / 2 + 1.6;
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), new THREE.MeshStandardMaterial({ color: 0x333333 })), px, CAFE.floorH - 0.35, pz);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0x6D4C33, roughness: 0.6 }));
        shade.rotation.x = Math.PI; add(shade, px, CAFE.floorH - 0.72, pz);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0xFFE9B0, emissive: 0xFFCC66, emissiveIntensity: 1.3 })), px, CAFE.floorH - 0.82, pz);
    }
    // 실내 따뜻한 조명(그림자 없이 밝기만) — 1F 2개 + 2·3·4F 각 1개
    add(new THREE.PointLight(0xffe6bf, 5.0, 20, 1.0), CAFE.x - 4, CAFE.floorH - 0.4, CAFE.z + 1);
    add(new THREE.PointLight(0xffe6bf, 5.0, 20, 1.0), CAFE.x + 4, CAFE.floorH - 0.4, CAFE.z - 1);
    for (let f = 1; f <= 3; f++) add(new THREE.PointLight(0xffe6bf, 5.0, 22, 1.0), CAFE.x, CAFE.floorH * f + CAFE.floorH - 0.4, CAFE.z);

    // ---- 1F 출입문 (좌측, 유리도어 + 초록 액센트 프레임) — 클릭 시 입장, 눈에 띄게 ----
    const doorCX = CAFE.x - 5, doorW = 1.3, doorH = 2.3, doorZ = CAFE.z + CAFE.d / 2 + 0.04;
    const doorAccent = new THREE.MeshStandardMaterial({ color: 0x1B8A4B, roughness: 0.5, metalness: 0.2 });  // 눈에 띄는 초록
    // 고정 문틀(좌우 기둥 + 상단 보)
    for (const ex of [doorCX - doorW / 2 - 0.07, doorCX + doorW / 2 + 0.07])
        add(new THREE.Mesh(new THREE.BoxGeometry(0.14, doorH + 0.18, 0.16), doorAccent), ex, (doorH + 0.18) / 2, doorZ);
    add(new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.42, 0.16, 0.16), doorAccent), doorCX, doorH + 0.12, doorZ);
    // 문짝(좌측 힌지로 회전) — 초록 프레임 + 유리 + 금색 손잡이
    const doorPivot = new THREE.Group();
    doorPivot.position.set(doorCX - doorW / 2, 0, doorZ);
    const dcx = doorW / 2, dcy = doorH / 2;
    for (const ex of [0.06, doorW - 0.06]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorH, 0.09), doorAccent); b.position.set(ex, dcy, 0); doorPivot.add(b); }
    for (const ey of [0.06, doorH - 0.06]) { const b = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.12, 0.09), doorAccent); b.position.set(dcx, ey, 0); doorPivot.add(b); }
    const dglass = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.22, doorH - 0.22, 0.03), glassMat); dglass.position.set(dcx, dcy, 0); doorPivot.add(dglass);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xC9A227, metalness: 0.8, roughness: 0.3 })); handle.position.set(doorW - 0.2, dcy, 0.07); doorPivot.add(handle);
    doorPivot.traverse(o => { if (o.isMesh) { o.castShadow = true; cafeDoorPick.push(o); } });
    scene.add(doorPivot);
    cafeDoor = doorPivot;

    // ---- 간판 ----
    // 간판(로고 이미지). 텐퍼센트 간판 클릭 시 메뉴 사진 표시.
    const tpSign = add(new THREE.Mesh(new THREE.PlaneGeometry(2.75, 0.7), new THREE.MeshBasicMaterial({
        map: logoTex('/3d/assets/tenpercent-logo.png', '#FFFFFF', 2.75 / 0.7), toneMapped: false })),
        CAFE.x, CAFE.floorH - 0.15, CAFE.z + CAFE.d / 2 + 0.12);
    cafeMenuPick.push(tpSign);
    add(new THREE.Mesh(new THREE.PlaneGeometry(3.25, 0.7), new THREE.MeshBasicMaterial({
        map: logoTex('/3d/assets/bodyfriend-logo.jpg', '#FFFFFF', 3.25 / 0.7), toneMapped: false })),
        CAFE.x, H - 0.35, CAFE.z + CAFE.d / 2 + 0.14);
    // 2F 식당 · 3F 매점 정면 간판(캔버스 텍스트). 식당 간판 클릭 시 이번 주 식단표 표시.
    const dinerSign = add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.66), new THREE.MeshBasicMaterial({
        map: signTex(['식당'], '#5D4037', '#FFF3E0', ['bold 110px sans-serif']), toneMapped: false })),
        CAFE.x, CAFE.floorH * 2 - 0.4, CAFE.z + CAFE.d / 2 + 0.14);
    mealPlanPick.push(dinerSign);   // MEALPLAN-01: 식당 간판 클릭 → 식단표
    add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.66), new THREE.MeshBasicMaterial({
        map: signTex(['매점'], '#1565C0', '#FFFFFF', ['bold 110px sans-serif']), toneMapped: false })),
        CAFE.x, CAFE.floorH * 3 - 0.4, CAFE.z + CAFE.d / 2 + 0.14);

    // ---- (좌측 외부 계단 제거) — 층 이동은 우측 엘리베이터로 ----
    const railMat = new THREE.MeshStandardMaterial({ color: 0x37474F, metalness: 0.5 });
    // 각 층(2·3·4F) 좌측 개방부 안전 난간(가로 2단 + 세로 기둥)
    for (const FY of [F2, F3, F4]) {
        for (const yo of [FY + 0.55, FY + 1.05]) {
            add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, CAFE.d - 1.2), railMat), CAFE.x - CAFE.w / 2 + 0.1, yo, CAFE.z);
        }
        for (let k = -2; k <= 2; k++) {
            add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), railMat), CAFE.x - CAFE.w / 2 + 0.1, FY + 0.55, CAFE.z + k * 2.4);
        }
    }

    // ---- 엘리베이터(1~4F 이동) — 건물 '오른쪽'에 붙인 외부 유리 엘리베이터 + 각 층 실내 진입구 ----
    // 우측벽 바깥(정면-우측)에 유리 샤프트를 붙이고, 정면(+z)·우측(+x) 양면에 큰 🛗 사인으로 확실히 보이게 한다.
    // 실내 우측(슬래브 위)에 진입 발판+도어를 두고, 발판 근처에서 자동으로 "몇 층?" 메뉴 → 선택 층으로 이동(카메라 동반).
    const EV = { x: CAFE.x + CAFE.w / 2 + 0.8, z: CAFE.z + CAFE.d / 2 - 2.3, r: 0.85 };   // 우측벽에 붙임
    const evFrame = new THREE.MeshStandardMaterial({ color: 0xCFD8DC, metalness: 0.75, roughness: 0.25 });
    const evGlass = new THREE.MeshPhysicalMaterial({ color: 0x81D4FA, transparent: true, opacity: 0.34, transmission: 0.72, roughness: 0.06, side: THREE.DoubleSide });
    const evDoorFrame = new THREE.MeshStandardMaterial({ color: 0x00695C, metalness: 0.5, roughness: 0.4 });
    cafeBounds = { minX: CAFE.x - CAFE.w / 2, maxX: CAFE.x + CAFE.w / 2, minZ: CAFE.z - CAFE.d / 2, maxZ: CAFE.z + CAFE.d / 2 };
    // 외부 샤프트: 4 기둥 + 지붕 + 유리 3면(+x/+z/−z) + 카(1F)
    for (const sx of [-EV.r, EV.r]) for (const sz of [-EV.r, EV.r])
        add(new THREE.Mesh(new THREE.BoxGeometry(0.16, H, 0.16), evFrame), EV.x + sx, H / 2, EV.z + sz);
    add(new THREE.Mesh(new THREE.BoxGeometry(EV.r * 2 + 0.3, 0.2, EV.r * 2 + 0.3), evFrame), EV.x, H + 0.1, EV.z);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, H, EV.r * 2), evGlass), EV.x + EV.r, H / 2, EV.z);   // 우측 유리
    add(new THREE.Mesh(new THREE.BoxGeometry(EV.r * 2, H, 0.05), evGlass), EV.x, H / 2, EV.z + EV.r);   // 정면 유리
    add(new THREE.Mesh(new THREE.BoxGeometry(EV.r * 2, H, 0.05), evGlass), EV.x, H / 2, EV.z - EV.r);   // 후면 유리
    add(new THREE.Mesh(new THREE.BoxGeometry(EV.r * 2 - 0.1, CAFE.floorH - 0.2, EV.r * 2 - 0.1),
        new THREE.MeshStandardMaterial({ color: 0x37474F, metalness: 0.5, roughness: 0.5 })), EV.x, (CAFE.floorH - 0.2) / 2, EV.z);
    // 외부 대형 사인: 정면(+z) + 우측(+x)
    add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), new THREE.MeshBasicMaterial({
        map: signTex(['🛗 ELEV'], '#0D47A1', '#FFFFFF', ['bold 60px sans-serif']), toneMapped: false })),
        EV.x, CAFE.floorH * 3 + 1.4, EV.z + EV.r + 0.04);
    const evSignR = add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), new THREE.MeshBasicMaterial({
        map: signTex(['🛗 ELEV'], '#0D47A1', '#FFFFFF', ['bold 60px sans-serif']), toneMapped: false })),
        EV.x + EV.r + 0.04, CAFE.floorH * 3 + 1.4, EV.z);
    evSignR.rotation.y = Math.PI / 2;   // 우측(+x) 향함
    // 각 층: 실내 우측벽 진입구(도어 프레임 + 은색 도어 + 사인) + 진입 발판/진입존
    const inX = CAFE.x + CAFE.w / 2 - 0.9;     // 실내 발판(슬래브 위)
    const wallX = CAFE.x + CAFE.w / 2 - 0.1;   // 우측벽 안쪽(실내 도어 위치)
    const evFrontZ = EV.z + EV.r;              // 외부 정면(+z) 도어면
    for (let n = 1; n <= 4; n++) {
        const fy = n === 1 ? 0 : (n - 1) * CAFE.floorH + 0.09;
        floorCenters[n] = { x: CAFE.x, z: CAFE.z, y: fy };   // 층 센터(도착 지점)
        // (실내) 우측벽 진입구: 도어 프레임 + 은색 도어 + 사인
        for (const dz of [EV.z - 0.7, EV.z + 0.7])
            add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.15, 0.14), evDoorFrame), wallX, fy + 1.07, dz);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.54), evDoorFrame), wallX, fy + 2.15, EV.z);
        for (const dz of [EV.z - 0.33, EV.z + 0.33])
            add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.64), evFrame), wallX - 0.05, fy + 1.0, dz);
        const sg = add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshBasicMaterial({
            map: signTex(['🛗 ELEV'], '#0D47A1', '#FFFFFF', ['bold 40px sans-serif']), toneMapped: false })),
            wallX - 0.12, fy + 2.42, EV.z);
        sg.rotation.y = -Math.PI / 2;   // 실내(−x) 향함
        // (외부) 정면(+z) 도어: 밖에서도 엘리베이터 문이 보이게 (클릭 대상)
        for (const dx of [EV.x - 0.7, EV.x + 0.7])
            add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.15, 0.12), evDoorFrame), dx, fy + 1.07, evFrontZ);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.12), evDoorFrame), EV.x, fy + 2.15, evFrontZ);
        for (const dx of [EV.x - 0.33, EV.x + 0.33])
            elevatorPick.push(add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.0, 0.06), evFrame), dx, fy + 1.0, evFrontZ - 0.04));
        // 실내 진입 발판(클릭 대상) + 포털 링(빛나는 초록) + 진입존
        elevatorPick.push(add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20),
            new THREE.MeshStandardMaterial({ color: 0x00C853, emissive: 0x1B5E20, emissiveIntensity: 0.6, roughness: 0.6 })), inX, fy + 0.05, EV.z));
        const evRing = add(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 10, 28),
            new THREE.MeshStandardMaterial({ color: 0x00E676, emissive: 0x00C853, emissiveIntensity: 0.9 })), inX, fy + 0.14, EV.z);
        evRing.rotation.x = -Math.PI / 2;
        elevatorPick.push(evRing); elevatorRings.push(evRing);
        elevatorZones.push({ x: inX, z: EV.z, y: fy, floor: n });
    }
    // (외부 포털 제거) — 엘리베이터는 실내 진입 발판/도어에서만 호출한다(건물 안).

    // ---- 1F 텐퍼센트 커피 인테리어 ----
    const cnt = new THREE.Mesh(new THREE.BoxGeometry(5, 1.05, 0.9), woodDark); cnt.castShadow = true;
    add(cnt, CAFE.x + 1, 0.55, CAFE.z - CAFE.d / 2 + 1.6);
    add(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 1.1), woodMat), CAFE.x + 1, 1.1, CAFE.z - CAFE.d / 2 + 1.6);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x4E342E, metalness: 0.6, roughness: 0.3 })),
        CAFE.x + 2.2, 1.4, CAFE.z - CAFE.d / 2 + 1.6);   // 에스프레소 머신
    add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.5 })),
        CAFE.x + 3.0, 1.38, CAFE.z - CAFE.d / 2 + 1.6);  // 그라인더
    const menuBoard = add(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({
        map: signTex(['AMERICANO  4.5', 'CAFE LATTE  5.0', 'FLAT WHITE  5.5'], '#20160F', '#F3E7CE',
            ['500 34px sans-serif', '500 34px sans-serif', '500 34px sans-serif']) })),
        CAFE.x - 3.5, 1.9, CAFE.z - CAFE.d / 2 + 0.12);  // 메뉴판(클릭 시 메뉴 사진)
    cafeMenuPick.push(menuBoard);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.7),
        new THREE.MeshPhysicalMaterial({ color: 0xEFEFEF, transparent: true, opacity: 0.35, roughness: 0.1, transmission: 0.7, side: THREE.DoubleSide })),
        CAFE.x - 1.6, 1.35, CAFE.z - CAFE.d / 2 + 1.6);  // 페이스트리 케이스

    // ---- 카페 테이블(실내/데크 공용) ----
    // opts.umbrella: 파라솔 유무, opts.baseY: 바닥 높이(실내 0 / 데크 0.12)
    function cafeTable(tx, tz, opts = {}) {
        const { umbrella = true, baseY = 0.12 } = opts;
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 16), woodMat); top.position.y = 0.75; top.castShadow = true; g.add(top);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), metalMat); post.position.y = 0.375; g.add(post);
        for (const ang of [0, Math.PI * (2 / 3), Math.PI * (4 / 3)]) {
            const cx = Math.sin(ang) * 0.95, cz = Math.cos(ang) * 0.95;
            const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), woodDark); seat.position.set(cx, 0.45, cz); seat.castShadow = true; g.add(seat);
            seats.push({ x: tx + cx, z: tz + cz, y: baseY, yaw: ang + Math.PI });   // 근처에서 앉기
            const cpost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), metalMat); cpost.position.set(cx, 0.225, cz); g.add(cpost);
            const bkk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.05), woodDark);
            bkk.position.set(cx + Math.sin(ang) * 0.2, 0.68, cz + Math.cos(ang) * 0.2); bkk.rotation.y = ang; g.add(bkk);
        }
        if (umbrella) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 8), metalMat); pole.position.y = 1.1; g.add(pole);
            const umb = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x2E7D32 })); umb.position.y = 2.15; umb.castShadow = true; g.add(umb);
        }
        // 커피잔 소품
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0xFFFFFF }));
        mug.position.set(0.18, 0.83, 0.05); g.add(mug);
        g.position.set(tx, baseY, tz); scene.add(g);
    }

    // ---- 1F 실내 테이블 6개 (3×2, 파라솔 없음) ----
    const indoorTables = [];
    for (const tz of [CAFE.z - 0.5, CAFE.z + 3.5]) for (const tx of [CAFE.x - 4.5, CAFE.x, CAFE.x + 4.5]) {
        cafeTable(tx, tz, { umbrella: false, baseY: 0.0 });
        indoorTables.push({ x: tx, z: tz });
    }

    // ---- 손님 5명 — 테이블에 앉아 수다 (작은 모션은 updateCafeStaff에서 구동) ----
    const custShirts = [0xE57373, 0x64B5F6, 0xFFB74D, 0xBA68C8, 0x4DB6AC];
    const seatPlan = [
        { ti: 0, ang: Math.PI * (2 / 3) }, { ti: 0, ang: Math.PI * (4 / 3) },  // 테이블0: 2명
        { ti: 2, ang: 0 },                                                      // 테이블2: 1명
        { ti: 4, ang: Math.PI * (2 / 3) }, { ti: 4, ang: Math.PI * (4 / 3) },  // 테이블4: 2명
    ];
    seatPlan.forEach((sp, i) => {
        const tb = indoorTables[sp.ti];
        const guest = createDetailedPerson(traitsFromSeed('tenpercent-guest-' + i, custShirts[i]));
        guest.group.scale.set(0.9, 0.9, 0.9);
        guest.group.position.set(tb.x + Math.sin(sp.ang) * 0.95, 0, tb.z + Math.cos(sp.ang) * 0.95);
        guest.group.rotation.y = sp.ang + Math.PI;   // 테이블을 바라봄
        scene.add(guest.group);
        cafeCustomers.push({ p: guest, seed: i * 1.7 });
    });

    // ---- 1F 앞 데크 + 테이블 3개 (문 앞 CAFE.x-4.5 자리는 비움 → 고양이 공간) ----
    const deckZ = CAFE.z + CAFE.d / 2 + 2.3;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(CAFE.w * 0.85, 0.12, 4.6), woodMat);
    deck.receiveShadow = true; walkables.push(add(deck, CAFE.x, 0.06, deckZ));
    for (let k = -6; k <= 6; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 4.6), woodDark), CAFE.x + k * 1.05, 0.065, deckZ);
    for (const tx of [CAFE.x - 1.5, CAFE.x + 1.5, CAFE.x + 4.5]) cafeTable(tx, deckZ, { umbrella: true, baseY: 0.12 });

    // ---- 데크 위 고양이 1마리 (앞쪽 가장자리를 좌우로 어슬렁 — updateCafeStaff에서 구동) ----
    function makeCat(furColor) {
        const g = new THREE.Group();
        const fur = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.85 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x2A2018, roughness: 0.8 });
        const pink = new THREE.MeshStandardMaterial({ color: 0xE79A9A, roughness: 0.7 });
        // 몸통(누운 캡슐, 로컬 +x가 정면)
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.34, 6, 12), fur);
        body.rotation.z = Math.PI / 2; body.position.y = 0.26; body.castShadow = true; g.add(body);
        // 머리(앞쪽 +x)
        const head = new THREE.Group(); head.position.set(0.32, 0.36, 0);
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), fur); skull.castShadow = true; head.add(skull);
        for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 10), fur); ear.position.set(-0.02, 0.14, s * 0.08); head.add(ear); }
        for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), dark); eye.position.set(0.12, 0.03, s * 0.06); head.add(eye); }
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), pink); nose.position.set(0.15, -0.02, 0); head.add(nose);
        g.add(head);
        // 다리 4개 [x, z]: 0=앞우 1=앞좌 2=뒤우 3=뒤좌
        const legs = [];
        const legGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.26, 8);
        for (const [lx, lz] of [[0.2, 0.1], [0.2, -0.1], [-0.2, 0.1], [-0.2, -0.1]]) {
            const leg = new THREE.Mesh(legGeo, fur); leg.position.set(lx, 0.13, lz); leg.castShadow = true; g.add(leg); legs.push(leg);
        }
        // 꼬리(뒤쪽 -x, 위로 살짝 세움)
        const tail = new THREE.Group(); tail.position.set(-0.34, 0.32, 0);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.3, 4, 8), fur);
        seg.position.set(-0.04, 0.13, 0); seg.rotation.z = 0.7; tail.add(seg);
        g.add(tail);
        return { group: g, head, tail, legs };
    }
    const cat = makeCat(0xD98A3D);   // 진저(치즈) 고양이
    cat.group.scale.setScalar(0.9);
    cat.group.position.set(CAFE.x - 4.5, 0.12, deckZ + 1.2);
    scene.add(cat.group);
    cat.patrol = { xMin: CAFE.x - 5.6, xMax: CAFE.x + 5.6, y: 0.12 };
    cafeCat = cat;

    // ---- 직원 2명: 바리스타(커피 추출) + 알바(주문받기), 둘 다 손님(+z) 바라봄 ----
    const barista = createDetailedPerson(traitsFromSeed('tenpercent-barista', 0x2E7D32));
    barista.group.scale.set(0.9, 0.9, 0.9);
    barista.group.position.set(CAFE.x + 2.0, 0, CAFE.z - CAFE.d / 2 + 0.95);  // 머신 앞
    barista.group.rotation.y = 0;
    scene.add(barista.group);
    cafeBarista = barista;

    const alba = createDetailedPerson(traitsFromSeed('tenpercent-alba', 0xF9A825));
    alba.group.scale.set(0.9, 0.9, 0.9);
    alba.group.position.set(CAFE.x - 1.8, 0, CAFE.z - CAFE.d / 2 + 0.95);      // 레지스터(좌측)
    alba.group.rotation.y = 0;
    scene.add(alba.group);
    cafeAlba = alba;
    // 레지스터(POS) — 알바 앞 카운터 위
    add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.4 })),
        CAFE.x - 1.8, 1.25, CAFE.z - CAFE.d / 2 + 1.5);

    // ---- 커피 추출 연출: 컵 + 추출 스트림 + 스팀 (머신 앞) ----
    const spoutX = CAFE.x + 2.2, spoutZ = CAFE.z - CAFE.d / 2 + 1.78;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xFFFFFF })),
        spoutX, 1.18, spoutZ);  // 컵
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.17, 6),
        new THREE.MeshStandardMaterial({ color: 0x3B2314 }));
    stream.position.set(spoutX, 1.30, spoutZ); scene.add(stream);
    cafeCoffeeStream = stream;
    for (let i = 0; i < 3; i++) {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.3, depthWrite: false }));
        sp.userData.baseY = 1.5;
        add(sp, spoutX + (i - 1) * 0.04, 1.5, spoutZ);
        cafeSteam.push(sp);
    }

    // ---- 서빙 알바 1명 — 트레이 들고 매장 안을 왕복(걷기) ----
    const alba2 = createDetailedPerson(traitsFromSeed('tenpercent-alba2', 0x00897B));
    alba2.group.scale.set(0.9, 0.9, 0.9);
    alba2.group.position.set(CAFE.x - 4, 0, CAFE.z + 1);
    scene.add(alba2.group);
    alba2.group.userData.patrol = { x0: CAFE.x - 4, x1: CAFE.x + 5, z: CAFE.z + 1 };
    cafeAlba2 = alba2;
    // 트레이(양손 앞) + 컵 2개
    const tray = new THREE.Group();
    tray.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: 0x5D4037 })));
    for (const cx of [-0.1, 0.1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0xFFFFFF }));
        cup.position.set(cx, 0.06, 0); tray.add(cup);
    }
    tray.position.set(0, 1.05, 0.28); alba2.group.add(tray);

    // ---- 4F 바디프렌드 안마의자 10대 (2열 × 5, 정면 +z 향함) ----
    function massageChair(mx, mz, accent) {
        const g = new THREE.Group();
        const black = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.5, metalness: 0.2 });
        const acc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.1), black); base.position.y = 0.18; g.add(base);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.9), acc); seat.position.set(0, 0.45, 0.05); g.add(seat);
        const bk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.22), black); bk.position.set(0, 1.0, -0.42); bk.rotation.x = -0.22; g.add(bk);
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.2), acc); hd.position.set(0, 1.55, -0.58); hd.rotation.x = -0.22; g.add(hd);
        for (const sx of [-0.5, 0.5]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 1.0), black); arm.position.set(sx, 0.6, 0.05); g.add(arm); }
        const ft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.6), black); ft.position.set(0, 0.42, 0.78); ft.rotation.x = 0.35; g.add(ft);
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        g.position.set(mx, F4, mz); scene.add(g);
        const chairRef = { bk, hd, ft, phase: bodyfriendChairs.length * 0.9 };
        bodyfriendChairs.push(chairRef);   // 미세 모션용
        seats.push({ x: mx, z: mz + 0.1, y: F4, yaw: 0, massage: chairRef });   // 안마의자에 앉기(정면 +z) + 의자 참조
    }
    const accents = [0xC62828, 0x00695C, 0x1565C0, 0x6A1B9A, 0xEF6C00];
    for (const rz of [CAFE.z - 2.4, CAFE.z + 2.2]) for (let k = 0; k < 5; k++) massageChair(CAFE.x - 6 + k * 3, rz, accents[k]);

    // ---- 4F 바디프렌드 안내 서버 1명 — 안마의자 앞에서 안내 ----
    const server2 = createDetailedPerson(traitsFromSeed('bodyfriend-server', 0x37474F));
    server2.group.scale.set(0.9, 0.9, 0.9);
    server2.group.position.set(CAFE.x, F4, CAFE.z + CAFE.d / 2 - 1.6);
    server2.group.rotation.y = Math.PI;   // 안마의자(−z) 쪽을 바라보며 안내
    scene.add(server2.group);
    cafeServer2F = server2;

    // ============================================
    // 2F 식당(구내식당) — 배식 카운터 + 식탁 4세트 + 직원 1명
    // ============================================
    const diningWood = new THREE.MeshStandardMaterial({ color: 0xB58A5C, roughness: 0.7 });
    const chairWood  = new THREE.MeshStandardMaterial({ color: 0x8D6742, roughness: 0.7 });
    function diningSet(dx, dz) {
        const g = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.95), diningWood); top.position.y = 0.72; g.add(top);
        for (const [lx, lz] of [[-0.65, -0.38], [0.65, -0.38], [-0.65, 0.38], [0.65, 0.38]]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), chairWood); leg.position.set(lx, 0.36, lz); g.add(leg);
        }
        for (const sx of [-0.35, 0.35]) {   // 식판 2개
            const tray = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: 0xECEFF1 })); tray.position.set(sx, 0.77, 0); g.add(tray);
        }
        for (const [cx, cz, ry] of [[0, -0.85, 0], [0, 0.85, Math.PI], [-1.05, 0, Math.PI / 2], [1.05, 0, -Math.PI / 2]]) {   // 의자 4개
            seats.push({ x: dx + cx, z: dz + cz, y: F2, yaw: ry });   // 근처에서 앉기
            const ch = new THREE.Group();
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.44), chairWood); seat.position.y = 0.45; ch.add(seat);
            const bk = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.06), chairWood); bk.position.set(0, 0.7, -0.19); ch.add(bk);
            for (const [sx, sz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
                const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), chairWood); l.position.set(sx, 0.225, sz); ch.add(l);
            }
            ch.position.set(cx, 0, cz); ch.rotation.y = ry; g.add(ch);
        }
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        g.position.set(dx, F2, dz); scene.add(g);
    }
    // 식탁 6세트 (3열 × 2행)
    for (const dz of [CAFE.z - 2.6, CAFE.z + 2.4]) for (const dx of [CAFE.x - 5, CAFE.x, CAFE.x + 4.5]) diningSet(dx, dz);
    // 배식 카운터(뒷벽) + 스테인리스 상판 + 음식 트레이
    add(new THREE.Mesh(new THREE.BoxGeometry(CAFE.w - 5, 0.95, 0.8), diningWood), CAFE.x - 1, F2 + 0.48, CAFE.z - CAFE.d / 2 + 0.7);
    add(new THREE.Mesh(new THREE.BoxGeometry(CAFE.w - 4.8, 0.06, 0.85), metalMat), CAFE.x - 1, F2 + 0.98, CAFE.z - CAFE.d / 2 + 0.7);
    for (let k = 0; k < 5; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.5),
        new THREE.MeshStandardMaterial({ color: [0xE57373, 0xFFB74D, 0x81C784, 0xFFF176, 0xA1887F][k], roughness: 0.8 })),
        CAFE.x - 4 + k * 1.5, F2 + 1.05, CAFE.z - CAFE.d / 2 + 0.7);
    // MEALPLAN-01: 배식대 뒷벽 '이번 주 식단표' 보드(클릭 시 오버레이). 흰 프레임 + 초록 패널.
    add(new THREE.Mesh(new THREE.PlaneGeometry(2.95, 1.22), new THREE.MeshBasicMaterial({ color: 0xFFFFFF })),
        CAFE.x + 3.5, F2 + 1.72, CAFE.z - CAFE.d / 2 + 0.10);
    const mealBoard = add(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.08), new THREE.MeshBasicMaterial({
        map: signTex(['이번 주 식단표', '👆 클릭'], '#2E7D32', '#FFFFFF', ['bold 74px sans-serif', 'bold 46px sans-serif']),
        toneMapped: false })),
        CAFE.x + 3.5, F2 + 1.72, CAFE.z - CAFE.d / 2 + 0.11);
    mealPlanPick.push(mealBoard);
    // 배식 직원(기존)
    const diner = createDetailedPerson(traitsFromSeed('cafeteria-staff', 0xEF6C00));
    diner.group.scale.set(0.9, 0.9, 0.9);
    diner.group.position.set(CAFE.x - 1, F2, CAFE.z - CAFE.d / 2 + 1.55);
    scene.add(diner.group);
    cafeDiner = diner;
    // 주방 아줌마 — 배식대 좌측에서 냄비 젓기(냄비 앞에 배치)
    const kitchen = createDetailedPerson(traitsFromSeed('kitchen-ajumma', 0xD81B60));
    kitchen.group.scale.set(0.9, 0.9, 0.9);
    kitchen.group.position.set(CAFE.x - 5, F2, CAFE.z - CAFE.d / 2 + 1.5);
    kitchen.group.rotation.y = Math.PI;   // 카운터(−z)의 냄비를 향함
    scene.add(kitchen.group);
    cafeKitchen = kitchen;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.24, 16), new THREE.MeshStandardMaterial({ color: 0x9E9E9E, metalness: 0.7, roughness: 0.3 })),
        CAFE.x - 5, F2 + 1.04, CAFE.z - CAFE.d / 2 + 0.85);   // 냄비
    // 식사하는 손님 5명 — 앉은 자세 + 식사 모션(updateCafeStaff에서 구동)
    const dinerShirts = [0xE57373, 0x64B5F6, 0xFFB74D, 0xBA68C8, 0x4DB6AC];
    const guestPlan = [
        { dx: CAFE.x - 5,   dz: CAFE.z - 2.6, cx: 0,     cz: -0.85, ry: 0 },
        { dx: CAFE.x - 5,   dz: CAFE.z + 2.4, cx: 0,     cz: 0.85,  ry: Math.PI },
        { dx: CAFE.x,       dz: CAFE.z - 2.6, cx: -1.05, cz: 0,     ry: Math.PI / 2 },
        { dx: CAFE.x,       dz: CAFE.z + 2.4, cx: 1.05,  cz: 0,     ry: -Math.PI / 2 },
        { dx: CAFE.x + 4.5, dz: CAFE.z + 2.4, cx: 0,     cz: -0.85, ry: 0 },
        { dx: CAFE.x + 4.5, dz: CAFE.z - 2.6, cx: -1.05, cz: 0,     ry: Math.PI / 2 },
        { dx: CAFE.x,       dz: CAFE.z - 2.6, cx: 0,     cz: -0.85, ry: 0 },
        { dx: CAFE.x - 5,   dz: CAFE.z - 2.6, cx: 1.05,  cz: 0,     ry: -Math.PI / 2 },
    ];
    guestPlan.forEach((gp, i) => {
        const g = createDetailedPerson(traitsFromSeed('diner-guest-' + i, dinerShirts[i % dinerShirts.length]));
        g.group.scale.set(0.9, 0.9, 0.9);
        g.group.position.set(gp.dx + gp.cx, F2, gp.dz + gp.cz);
        g.group.rotation.y = gp.ry;
        scene.add(g.group);
        diningGuests.push({ p: g, seed: i * 1.9 });
    });

    // ============================================
    // 3F 매점 (GS25 스타일) — 다양한 상품 진열 선반 6 + 음료 냉장고 + 계산대 + 알바생 2명
    // ============================================
    const shelfMetal = new THREE.MeshStandardMaterial({ color: 0xCFD8DC, roughness: 0.5, metalness: 0.3 });
    const prodPalette = [0xE53935, 0x1E88E5, 0xFDD835, 0x43A047, 0xFB8C00, 0x8E24AA, 0x00ACC1, 0xEC407A, 0x6D4C41, 0xECEFF1];
    // 상품 1개(종류별 형태) — 0 음료병 1 캔 2 과자박스 3 컵라면 4 과자봉지
    function gsProduct(kind, color) {
        const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        if (kind === 0) return new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), m);
        if (kind === 1) return new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.15, 8), m);
        if (kind === 2) return new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.15), m);
        if (kind === 3) return new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.15, 12), m);
        return new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.05), m);
    }
    const prodH = [0.3, 0.15, 0.26, 0.15, 0.3];
    function gsShelf(sx, sz) {
        const g = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 0.5), shelfMetal); frame.position.set(0, 0.8, -0.12); g.add(frame);
        for (let lv = 0; lv < 3; lv++) {
            const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 0.5), shelfMetal); board.position.set(0, 0.4 + lv * 0.5, 0); g.add(board);
            for (let c = 0; c < 7; c++) {
                const kind = (lv * 2 + c) % 5;
                const p = gsProduct(kind, prodPalette[(lv * 7 + c) % prodPalette.length]);
                p.position.set(-0.85 + c * 0.28, 0.4 + lv * 0.5 + prodH[kind] / 2 + 0.02, 0.12);
                g.add(p);
            }
        }
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        g.position.set(sx, F3, sz); scene.add(g);
    }
    for (const sz of [CAFE.z - 3.5, CAFE.z - 0.5, CAFE.z + 2.5]) for (const sx of [CAFE.x - 5, CAFE.x + 0.5]) gsShelf(sx, sz);
    // 음료 냉장고(뒷벽) — 본체 + 유리문 + 안쪽 음료 병
    add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 0.7), new THREE.MeshStandardMaterial({ color: 0xECEFF1, roughness: 0.5 })), CAFE.x - 4, F3 + 1.0, CAFE.z - CAFE.d / 2 + 0.5);
    add(new THREE.Mesh(new THREE.BoxGeometry(3.9, 1.8, 0.05), new THREE.MeshPhysicalMaterial({ color: 0xB3E5FC, transparent: true, opacity: 0.3, transmission: 0.7, roughness: 0.05, side: THREE.DoubleSide })), CAFE.x - 4, F3 + 1.0, CAFE.z - CAFE.d / 2 + 0.87);
    for (let r = 0; r < 3; r++) for (let cc = 0; cc < 10; cc++)
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 8), new THREE.MeshStandardMaterial({ color: prodPalette[(r * 3 + cc) % prodPalette.length], roughness: 0.6 })),
            CAFE.x - 5.75 + cc * 0.4, F3 + 0.45 + r * 0.55, CAFE.z - CAFE.d / 2 + 0.6);
    // 계산대 + 레지스터
    add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.75), woodDark), CAFE.x + 4.5, F3 + 0.5, CAFE.z + CAFE.d / 2 - 1.8);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.32), new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.4 })), CAFE.x + 4.5, F3 + 1.1, CAFE.z + CAFE.d / 2 - 1.8);
    // 계산대 알바생(기존) — 바코드 스캔
    const clerk = createDetailedPerson(traitsFromSeed('shop-clerk', 0x1565C0));
    clerk.group.scale.set(0.9, 0.9, 0.9);
    clerk.group.position.set(CAFE.x + 4.5, F3, CAFE.z + CAFE.d / 2 - 1.2);
    clerk.group.rotation.y = Math.PI;
    scene.add(clerk.group);
    cafeClerk = clerk;
    // 진열 알바생(추가) — 선반 앞에서 물건 채우기
    const stocker = createDetailedPerson(traitsFromSeed('shop-alba', 0x00897B));
    stocker.group.scale.set(0.9, 0.9, 0.9);
    stocker.group.position.set(CAFE.x + 0.5, F3, CAFE.z + 2.5 + 1.0);
    stocker.group.rotation.y = Math.PI;   // 선반(−z) 향함
    scene.add(stocker.group);
    cafeStocker = stocker;
})();

// 텐퍼센트 카페 직원/연출 애니메이션 (animate에서 매 프레임 호출)
// - 바리스타: 머신 쪽으로 팔을 뻗고 상하로 움직이며 커피 추출
// - 알바: 가벼운 끄덕임 + 이따금 손짓(주문받기)
// - 추출 스트림: 주기적으로 흐름(추출/대기 반복), 스팀은 상승·소멸 반복
function updateCafeStaff(elapsed) {
    // 바리스타 — 머신 조작(팔 상하) + 무게중심 이동 + 고개 움직임
    if (cafeBarista) {
        const t = elapsed * 2.2, b = cafeBarista;
        b.armR.shoulder.rotation.x = -0.78 + Math.sin(t) * 0.24;
        b.armR.elbow.rotation.x = -0.85;
        b.armL.shoulder.rotation.x = -0.45 + Math.sin(t * 0.5) * 0.08;
        b.armL.elbow.rotation.x = -0.5;
        b.torso.rotation.y = Math.sin(t * 0.5) * 0.06;
        b.headGroup.rotation.x = 0.15 + Math.sin(t * 0.3) * 0.06;
        b.headGroup.rotation.y = Math.sin(t * 0.2) * 0.1;
        b.legL.hip.rotation.x = Math.sin(t * 0.25) * 0.04;   // 무게중심 이동
    }
    // 알바(주문받기) — 끄덕임 + 몸 흔들 + 이따금 손짓
    if (cafeAlba) {
        const t = elapsed * 1.6, a = cafeAlba;
        a.headGroup.rotation.x = Math.sin(t) * 0.07 + 0.03;
        a.headGroup.rotation.y = Math.sin(t * 0.4) * 0.2;
        a.torso.rotation.y = Math.sin(t * 0.3) * 0.05;
        const g = Math.max(0, Math.sin(elapsed * 0.7));      // 손짓 사이클
        a.armR.shoulder.rotation.x = -0.15 - g * 0.6;
        a.armR.elbow.rotation.x = -0.3 - g * 0.7;
        a.armL.shoulder.rotation.z = 0.08;
    }
    // 서빙 알바 — 트레이 들고 매장 안 왕복(걷기)
    if (cafeAlba2 && cafeAlba2.group.userData.patrol) {
        const a2 = cafeAlba2, pr = a2.group.userData.patrol, period = 10;
        const ph = (elapsed % period) / period;
        const tt = ph < 0.5 ? ph * 2 : (1 - ph) * 2;         // 0→1→0 왕복
        a2.group.position.x = pr.x0 + (pr.x1 - pr.x0) * tt;
        a2.group.position.z = pr.z;
        a2.group.rotation.y = ph < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        const sw = Math.sin(elapsed * 9) * 0.38;             // 다리 스윙
        a2.legL.hip.rotation.x = sw;  a2.legL.knee.rotation.x = Math.max(0, -sw) * 1.2;
        a2.legR.hip.rotation.x = -sw; a2.legR.knee.rotation.x = Math.max(0, sw) * 1.2;
        a2.armL.shoulder.rotation.x = -0.95; a2.armL.elbow.rotation.x = -1.15;  // 트레이 든 팔
        a2.armR.shoulder.rotation.x = -0.95; a2.armR.elbow.rotation.x = -1.15;
        a2.pelvis.position.y = 0.9 + Math.abs(Math.sin(elapsed * 9)) * 0.04;
    }
    // 손님 5명 — 앉은 자세 + 수다(고개·몸 흔들, 이따금 손짓)
    for (let i = 0; i < cafeCustomers.length; i++) {
        const c = cafeCustomers[i].p, seed = cafeCustomers[i].seed;
        c.pelvis.position.y = 0.55;   // 앉은 높이
        c.legL.hip.rotation.x = -Math.PI / 2 + 0.1; c.legL.knee.rotation.x = Math.PI / 2 - 0.1;
        c.legR.hip.rotation.x = -Math.PI / 2 + 0.1; c.legR.knee.rotation.x = Math.PI / 2 - 0.1;
        c.armL.shoulder.rotation.x = 0.2; c.armL.elbow.rotation.x = -0.7;
        const t = elapsed * 1.5 + seed;
        c.headGroup.rotation.y = Math.sin(t) * 0.22;
        c.headGroup.rotation.x = Math.sin(t * 0.6 + seed) * 0.06;
        c.torso.rotation.y = Math.sin(t * 0.4) * 0.05;
        const gest = Math.max(0, Math.sin(elapsed * 0.8 + seed * 2));   // 이따금 손짓
        c.armR.shoulder.rotation.x = 0.2 - gest * 0.6;
        c.armR.elbow.rotation.x = -0.7 - gest * 0.3;
    }
    // 4F 안마의자 모션 — 아바타가 앉은 의자는 '작동 중'(리클라이닝 + 롤러 진동), 나머지는 대기 미세 모션
    for (let i = 0; i < bodyfriendChairs.length; i++) {
        const c = bodyfriendChairs[i];
        if (sittingSeat && sittingSeat.massage === c) {
            const roll = Math.sin(elapsed * 9);                     // 빠른 롤러 진동
            const recline = (Math.sin(elapsed * 0.6) + 1) / 2;      // 천천히 눕혔다 세우기(0→1)
            c.bk.rotation.x = -0.22 - recline * 0.4 - roll * 0.03;
            c.hd.rotation.x = -0.22 - recline * 0.4;
            c.ft.rotation.x = 0.35 + recline * 0.7 + roll * 0.05;
        } else {
            const d = Math.sin(elapsed * 1.2 + c.phase) * 0.05;
            c.bk.rotation.x = -0.22 - d;
            c.hd.rotation.x = -0.22 - d;
            c.ft.rotation.x = 0.35 + d * 1.5;
        }
    }
    // 안마의자에 앉은 아바타 — 롤러에 맞춰 살짝 흔들림(마사지 진동)
    if (sittingSeat && sittingSeat.massage && selectedAvatarId) {
        const sav = personAvatarMap.get(selectedAvatarId);
        if (sav) sav.group.position.y = sittingSeat.y + Math.abs(Math.sin(elapsed * 9)) * 0.02;
    }
    // 4F 안내 서버 — 고개 돌림 + 안마의자 안내 제스처
    if (cafeServer2F) {
        const t = elapsed * 1.3, s = cafeServer2F;
        s.headGroup.rotation.y = Math.sin(t * 0.5) * 0.25;
        s.torso.rotation.y = Math.sin(t * 0.3) * 0.06;
        const gest = Math.max(0, Math.sin(elapsed * 0.5));
        s.armR.shoulder.rotation.x = -0.3 - gest * 0.7;
        s.armR.shoulder.rotation.z = -0.3;
        s.armR.elbow.rotation.x = -0.2;
    }
    // 2F 식당 직원 — 끄덕임 + 배식(국자 뜨는 듯 오른팔 상하)
    if (cafeDiner) {
        const t = elapsed * 1.8, d = cafeDiner;
        d.headGroup.rotation.x = Math.sin(t) * 0.06 + 0.05;
        d.headGroup.rotation.y = Math.sin(t * 0.5) * 0.15;
        d.torso.rotation.y = Math.sin(t * 0.35) * 0.05;
        const scoop = (Math.sin(elapsed * 2.2) + 1) / 2;     // 0→1 배식 사이클
        d.armR.shoulder.rotation.x = -0.5 - scoop * 0.5;
        d.armR.elbow.rotation.x = -0.6 - scoop * 0.5;
        d.armL.shoulder.rotation.x = -0.25;
        d.armL.elbow.rotation.x = -0.35;
    }
    // 2F 식당 손님들 — 앉은 자세 + 식사(숟가락질) + 수다
    for (let i = 0; i < diningGuests.length; i++) {
        const c = diningGuests[i].p, seed = diningGuests[i].seed;
        c.pelvis.position.y = 0.55;   // 앉은 높이
        c.legL.hip.rotation.x = -Math.PI / 2 + 0.1; c.legL.knee.rotation.x = Math.PI / 2 - 0.1;
        c.legR.hip.rotation.x = -Math.PI / 2 + 0.1; c.legR.knee.rotation.x = Math.PI / 2 - 0.1;
        const t = elapsed * 2 + seed;
        const eat = (Math.sin(t) + 1) / 2;                 // 숟가락 입↔식판
        c.armR.shoulder.rotation.x = -0.4 - eat * 0.5;
        c.armR.elbow.rotation.x = -0.8 - eat * 0.9;
        c.armL.shoulder.rotation.x = -0.2; c.armL.elbow.rotation.x = -0.5;
        c.headGroup.rotation.x = 0.12 + Math.sin(t) * 0.06;
        c.headGroup.rotation.y = Math.sin(elapsed * 0.7 + seed) * 0.18;
        c.torso.rotation.y = Math.sin(elapsed * 0.4 + seed) * 0.05;
    }
    // 주방 아줌마 — 냄비 젓기(오른팔 원 운동) + 끄덕임
    if (cafeKitchen) {
        const t = elapsed * 2.6, k = cafeKitchen;
        k.armR.shoulder.rotation.x = -0.7 + Math.sin(t) * 0.2;
        k.armR.shoulder.rotation.z = -0.2;
        k.armR.elbow.rotation.x = -1.0 + Math.cos(t) * 0.25;
        k.armL.shoulder.rotation.x = -0.5; k.armL.elbow.rotation.x = -0.9;
        k.headGroup.rotation.x = 0.15 + Math.sin(t * 0.5) * 0.05;
        k.torso.rotation.y = Math.sin(elapsed * 0.3) * 0.04;
    }
    // 3F 매점 직원 — 끄덕임 + 바코드 스캔(오른팔 좌우/상하)
    if (cafeClerk) {
        const t = elapsed * 1.5, c = cafeClerk;
        c.headGroup.rotation.x = Math.sin(t) * 0.05 + 0.04;
        c.headGroup.rotation.y = Math.sin(t * 0.6) * 0.18;
        c.torso.rotation.y = Math.sin(t * 0.3) * 0.04;
        const scan = Math.sin(elapsed * 3.0);                // 스캔 왕복
        c.armR.shoulder.rotation.x = -0.6 + scan * 0.25;
        c.armR.shoulder.rotation.z = -0.15;
        c.armR.elbow.rotation.x = -0.8;
        c.armL.shoulder.rotation.x = -0.2;
    }
    // 엘리베이터 포털 링 — 맥동(크기·발광)으로 '포털' 느낌
    for (let i = 0; i < elevatorRings.length; i++) {
        const r = elevatorRings[i];
        const s = 1 + Math.sin(elapsed * 2 + i) * 0.12;
        r.scale.set(s, s, 1);
        r.material.emissiveIntensity = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(elapsed * 3 + i));
    }
    // 3F 매점 진열 알바생 — 선반에 물건 채우기(팔 올림 반복) + 끄덕임
    if (cafeStocker) {
        const t = elapsed * 1.6, s = cafeStocker;
        const reach = (Math.sin(t) + 1) / 2;
        s.armR.shoulder.rotation.x = -0.6 - reach * 0.8;
        s.armR.elbow.rotation.x = -0.5 - reach * 0.4;
        s.armL.shoulder.rotation.x = -0.3 - reach * 0.3;
        s.headGroup.rotation.x = -0.05 - reach * 0.1;
        s.torso.rotation.y = Math.sin(elapsed * 0.4) * 0.05;
    }
    // 출입문 개폐(입장 시 바깥쪽으로 열림)
    if (cafeDoor) cafeDoor.rotation.y += ((cafeDoorOpen ? -1.2 : 0) - cafeDoor.rotation.y) * 0.12;
    // 커피 추출 스트림 + 스팀
    if (cafeCoffeeStream) cafeCoffeeStream.visible = (elapsed % 3.2) < 2.4;   // 추출 2.4s / 대기 0.8s
    for (let i = 0; i < cafeSteam.length; i++) {
        const sp = cafeSteam[i];
        const tt = (elapsed * 0.5 + i * 0.33) % 1;
        sp.position.y = sp.userData.baseY + tt * 0.5;
        sp.material.opacity = 0.3 * (1 - tt);
        sp.scale.setScalar(0.6 + tt * 0.8);
    }
    // 데크 고양이 — 앞쪽 데크를 좌우로 어슬렁(걸음·바운스·꼬리 흔들기·방향 전환·두리번)
    if (cafeCat && cafeCat.patrol) {
        const c = cafeCat, p = cafeCat.patrol, period = 18;
        const ph = (elapsed % period) / period;
        const tri = ph < 0.5 ? ph * 2 : (1 - ph) * 2;                 // 0→1→0 왕복
        c.group.position.x = p.xMin + (p.xMax - p.xMin) * tri;
        c.group.position.y = p.y + Math.abs(Math.sin(elapsed * 7)) * 0.02;
        const targetRY = ph < 0.5 ? 0 : Math.PI;                       // 진행 방향(+x/−x) 바라봄
        c.group.rotation.y += (targetRY - c.group.rotation.y) * 0.12;
        const sw = Math.sin(elapsed * 7) * 0.5;                        // 대각선 보행
        c.legs[0].rotation.z = sw;  c.legs[3].rotation.z = sw;
        c.legs[1].rotation.z = -sw; c.legs[2].rotation.z = -sw;
        c.tail.rotation.y = Math.sin(elapsed * 2.5) * 0.5;
        c.tail.rotation.x = Math.sin(elapsed * 1.7) * 0.15;
        c.head.rotation.y = Math.sin(elapsed * 0.8) * 0.35;
    }
}

// 텐퍼센트 입장 — 문 열기 + 매장 내부 뷰로 카메라 이동 + 메뉴 사진 오버레이
function enterCafe() {
    cafeDoorOpen = true;
    // 매장 내부 뷰(월드좌표 = envGroup 로컬 + z(-18)). 문 안쪽에서 카운터를 바라봄.
    tweenView({ pos: [-24, 1.6, -13.5], target: [-24, 1.25, -22.4] }, 900);
    if (window.__showCafeMenu) window.__showCafeMenu();
}

// ============================================
// 텐퍼센트 주문 시스템 — 인터랙티브 메뉴 오버레이 + ORDER 폼(우상단 패널)
// 메뉴에서 음료 선택(✓)·온도·수량·옵션 → 저장 시 "음료/온도/N잔/옵션" 문자열로
// localStorage(로그인 사용자별)에 적재. ORDER 폼의 행 클릭 → 같은 오버레이로 수정/삭제.
// ============================================
(function setupCafeOrder() {
    // ---- 메뉴 데이터(메뉴 사진 → 카테고리별 주요 음료) ----
    const CAFE_MENU = [
        { cat: 'SIGNATURE', items: ['시그니처 라떼', '텐퍼 라떼', '솔티드 밀크카라멜', '더티 망고라떼', '아인슈페너', '리얼 초코라떼'] },
        { cat: 'COFFEE', items: ['아메리카노', '에스프레소', '쇼콜라프레소', '플랫화이트', '카페라떼', '바닐라빈라떼', '돌체라떼', '밀크카라멜라떼', '카페모카', '콜드브루', '돌체브루라떼', '제주바닐라브루라떼'] },
        { cat: 'TEN-UP', items: ['사과라떼', '초콜릿크런치치즈폼', '쿠키치즈폼', '요거트(플레인)', '요거트(망고/딸기/블루베리)', '아보카도바나나', '애플망고', '망고딸기'] },
        { cat: '제로', items: ['딥앤베리', '딥앤초코', '딥앤커피', '우바피치아이스티', '제로피치아이스티', '제로망고아이스티', '제로사과아이스티', '제로체리콕'] },
        { cat: '라이트', items: ['애플사이다비니거', '그린텐피즈', '리얼딸기라떼', '진한곡물라떼', '로얄밀크티', '착즙에이드(레몬/자몽)', '고흥유자차'] },
        { cat: '티', items: ['허니티(레몬/자몽)', '블랙자몽티', '잉글리쉬브렉퍼스트', '얼그레이', '유기농녹차', '시트러스그린', '히비스커스에이드', '페퍼민트', '캐모마일'] },
        { cat: 'MATCHA', items: ['진한 말차라떼', '진한 말차카페라떼', '진한 말차슈페너', '말차칩크림라떼', '말차초코라떼', '말차치즈프레치노'] },
        { cat: 'DESSERT', items: ['우유버터쿠키', '초코버터쿠키', '코코넛쿠키', '갈레트브루통', '텐퍼샌드', '휘낭시에', '크림카스텔라', '고메버터바', '버터밀크스콘', '초코스콘', '마카롱', '아몬드케익', '수제쿠키'] },
    ];
    const TEMPS = ['아이스', '핫'];
    const OPTIONS = ['노옵션', '샷 추가', '시럽 추가', '연하게', '크림 많이'];

    // ---- 주문 저장(로그인 사용자별 localStorage) ----
    const keyFor = () => 'tp_orders__' + ((getAccount() && getAccount().username) || 'guest');
    const loadOrders = () => { try { return JSON.parse(localStorage.getItem(keyFor())) || []; } catch { return []; } };
    const ORDER_API = ''; // 같은 origin(상대경로) — nginx HTTPS 뒤/로컬 3300 양쪽 동작
    // 저장 = 로컬(본인 뷰) + 서버 동기화(ORDER-01 집계용). 비로그인 시 서버 동기화는 스킵.
    const saveOrders = (list) => {
        try { localStorage.setItem(keyFor(), JSON.stringify(list)); } catch { /* noop */ }
        const acct = getAccount();
        if (acct && acct.username) {
            fetch(`${ORDER_API}/api/orders`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: acct.username, name: acct.name || acct.username, items: list }),
            }).catch(() => { /* noop */ });
        }
    };
    const orderText = (o) => `${o.drink}/${o.temp}/${o.qty}잔/${o.option}`;
    let seq = Date.now();
    const newId = () => 'o' + (++seq).toString(36);

    // ---- ORDER 폼 렌더(우상단 #order-list) ----
    function renderOrders() {
        const box = document.getElementById('order-list');
        if (!box) return;
        const list = loadOrders();
        box.innerHTML = '';
        if (!list.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color:#666;';
            empty.textContent = '주문 없음 — 텐퍼센트 메뉴에서 담기';
            box.appendChild(empty);
            return;
        }
        list.forEach((o) => {
            const row = document.createElement('div');
            row.title = '클릭하여 수정';
            row.style.cssText = 'cursor:pointer; padding:3px 6px; border-radius:4px; margin:2px 0; background:rgba(255,255,255,0.05); border:1px solid #2a2a2a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            row.textContent = '• ' + orderText(o);
            row.onmouseenter = () => { row.style.background = 'rgba(76,175,80,0.25)'; };
            row.onmouseleave = () => { row.style.background = 'rgba(255,255,255,0.05)'; };
            row.onclick = () => openMenu(o);
            box.appendChild(row);
        });
    }
    window.__renderOrders = renderOrders;
    // ORDER-01: 서버 스케줄(WS) 연동 — 10:00 clear / 09:18 마감 알림창
    window.__clearOrders = () => { try { localStorage.setItem(keyFor(), '[]'); } catch { /* noop */ } renderOrders(); };
    window.__orderDeadlineAlert = () => {
        if (document.getElementById('order-deadline-modal')) return;
        const ov = document.createElement('div');
        ov.id = 'order-deadline-modal';
        ov.style.cssText = 'position:fixed; inset:0; z-index:1700; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); font-family:sans-serif;';
        const bx = document.createElement('div');
        bx.style.cssText = 'background:#1b1b1b; color:#eee; border:2px solid #e74c3c; border-radius:14px; padding:26px 30px; max-width:90vw; text-align:center; box-shadow:0 12px 48px rgba(0,0,0,0.6);';
        bx.innerHTML = '<div style="font-size:20px; font-weight:800; margin-bottom:10px;">☕ 커피 주문 마감</div>'
            + '<div style="font-size:14px; color:#ccc; line-height:1.6;">텐퍼센트 커피 주문이 마감되었습니다.<br>잠시 후 09:20에 MOM 채팅방으로 전체 주문이 공유됩니다.</div>';
        const btn = document.createElement('button');
        btn.textContent = '확인';
        btn.style.cssText = 'margin-top:18px; background:#e74c3c; color:#fff; border:none; border-radius:8px; padding:9px 22px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit;';
        btn.onclick = () => ov.remove();
        bx.appendChild(btn); ov.appendChild(bx); document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    };

    // ---- 오버레이(메뉴 선택 + 수정 겸용) ----
    let selDrink = null, selTemp = '아이스', selQty = 1, selOpt = '노옵션', editingId = null;

    const overlay = document.createElement('div');
    overlay.id = 'cafe-menu-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:1500; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,0.72); backdrop-filter:blur(3px); font-family:sans-serif;';

    const box = document.createElement('div');
    box.style.cssText = 'position:relative; width:1600px; max-width:96vw; max-height:90vh; display:flex; flex-direction:column; background:#1b1b1b; color:#eee; border-radius:14px; box-shadow:0 12px 48px rgba(0,0,0,0.6); overflow:hidden;';

    const header = document.createElement('div');
    header.style.cssText = 'padding:14px 18px; font-size:16px; font-weight:800; letter-spacing:1px; background:#2b2b2b; border-bottom:1px solid #000;';
    header.textContent = '☕ TENPERCENT 주문';

    // 좌: 텐퍼센트 메뉴 이미지 / 우: 인터랙티브 음료 리스트
    const midRow = document.createElement('div');
    midRow.style.cssText = 'display:flex; flex:1 1 auto; min-height:0;';

    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'flex:0 0 64%; overflow:hidden; min-height:0; background:#111; border-right:1px solid #000; padding:10px; display:flex; align-items:center; justify-content:center;';
    const menuImg = document.createElement('img');
    menuImg.src = '/3d/assets/tenpercent-menu.jpg';
    menuImg.alt = '텐퍼센트 메뉴';
    menuImg.style.cssText = 'max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; border-radius:8px; display:block;';
    imgWrap.appendChild(menuImg);

    // 메뉴 리스트(스크롤, 카테고리별 2열)
    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'overflow-y:auto; padding:6px 14px 12px; flex:1 1 0; min-width:0; min-height:120px;';
    const drinkEls = new Map();   // 음료명 → { it, check }
    CAFE_MENU.forEach((grp) => {
        const cat = document.createElement('div');
        cat.textContent = '· ' + grp.cat;
        cat.style.cssText = 'color:#4CAF50; font-size:11px; font-weight:700; margin:12px 0 4px; letter-spacing:1px;';
        listWrap.appendChild(cat);
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:4px;';
        grp.items.forEach((name) => {
            const it = document.createElement('div');
            it.style.cssText = 'padding:5px 8px; font-size:12px; border-radius:5px; cursor:pointer; border:1px solid transparent; display:flex; align-items:center; gap:5px;';
            const check = document.createElement('span'); check.textContent = '✓';
            check.style.cssText = 'color:#4CAF50; font-weight:700; visibility:hidden;';
            const label = document.createElement('span'); label.textContent = name;
            it.append(check, label);
            it.onmouseenter = () => { if (selDrink !== name) it.style.background = 'rgba(255,255,255,0.07)'; };
            it.onmouseleave = () => { if (selDrink !== name) it.style.background = 'transparent'; };
            it.onclick = () => selectDrink(name);
            drinkEls.set(name, { it, check });
            grid.appendChild(it);
        });
        listWrap.appendChild(grid);
    });
    function selectDrink(name) {
        selDrink = name;
        drinkEls.forEach(({ it, check }, n) => {
            const on = (n === name);
            check.style.visibility = on ? 'visible' : 'hidden';
            it.style.background = on ? 'rgba(76,175,80,0.22)' : 'transparent';
            it.style.borderColor = on ? '#4CAF50' : 'transparent';
        });
    }

    // 컨트롤(온도 / 수량 / 옵션)
    const controls = document.createElement('div');
    controls.style.cssText = 'padding:10px 16px; border-top:1px solid #000; background:#232323; display:flex; flex-wrap:wrap; gap:14px; align-items:center; font-size:13px;';

    const tempWrap = document.createElement('div'); tempWrap.style.cssText = 'display:flex; gap:6px; align-items:center;';
    const tempLabel = document.createElement('span'); tempLabel.textContent = '온도'; tempLabel.style.color = '#aaa';
    tempWrap.appendChild(tempLabel);
    const tempBtns = {};
    TEMPS.forEach((t) => {
        const b = document.createElement('button'); b.textContent = t;
        b.style.cssText = 'border:1px solid #555; background:#333; color:#ddd; border-radius:6px; padding:4px 10px; cursor:pointer; font-family:inherit; font-size:13px;';
        b.onclick = () => setTemp(t);
        tempBtns[t] = b; tempWrap.appendChild(b);
    });
    function setTemp(t) {
        selTemp = t;
        TEMPS.forEach((k) => {
            const on = k === t;
            tempBtns[k].style.background = on ? '#4CAF50' : '#333';
            tempBtns[k].style.color = on ? '#fff' : '#ddd';
            tempBtns[k].style.borderColor = on ? '#4CAF50' : '#555';
        });
    }

    const qtyWrap = document.createElement('div'); qtyWrap.style.cssText = 'display:flex; gap:6px; align-items:center;';
    const qtyLabel = document.createElement('span'); qtyLabel.textContent = '수량'; qtyLabel.style.color = '#aaa';
    const minus = document.createElement('button'); minus.textContent = '−';
    const qtyVal = document.createElement('span'); qtyVal.style.cssText = 'min-width:26px; text-align:center; font-weight:700;';
    const plus = document.createElement('button'); plus.textContent = '＋';
    [minus, plus].forEach((b) => { b.style.cssText = 'border:1px solid #555; background:#333; color:#ddd; border-radius:6px; width:28px; height:28px; cursor:pointer; font-family:inherit; font-size:14px;'; });
    minus.onclick = () => setQty(selQty - 1); plus.onclick = () => setQty(selQty + 1);
    function setQty(n) { selQty = Math.max(1, Math.min(20, n)); qtyVal.textContent = selQty; }
    qtyWrap.append(qtyLabel, minus, qtyVal, plus);

    const optWrap = document.createElement('div'); optWrap.style.cssText = 'display:flex; gap:6px; align-items:center;';
    const optLabel = document.createElement('span'); optLabel.textContent = '옵션'; optLabel.style.color = '#aaa';
    const optSel = document.createElement('select');
    optSel.style.cssText = 'background:#333; color:#ddd; border:1px solid #555; border-radius:6px; padding:4px 8px; font-family:inherit; font-size:13px;';
    OPTIONS.forEach((o) => { const op = document.createElement('option'); op.value = o; op.textContent = o; optSel.appendChild(op); });
    optSel.onchange = () => { selOpt = optSel.value; };
    optWrap.append(optLabel, optSel);

    controls.append(tempWrap, qtyWrap, optWrap);

    // 푸터(삭제 / 닫기 / 저장)
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 16px; border-top:1px solid #000; background:#1b1b1b; display:flex; justify-content:flex-end; gap:10px; align-items:center;';
    const delBtn = document.createElement('button'); delBtn.textContent = '🗑 삭제';
    delBtn.style.cssText = 'margin-right:auto; background:#7a2b2b; color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; font-family:inherit; display:none;';
    const closeBtn = document.createElement('button'); closeBtn.textContent = '✕ 닫기';
    closeBtn.style.cssText = 'background:#e74c3c; color:#fff; border:none; border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; font-family:inherit;';
    const saveBtn = document.createElement('button'); saveBtn.textContent = '＋ 저장';
    saveBtn.style.cssText = 'background:#2ecc71; color:#fff; border:none; border-radius:8px; padding:8px 18px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit;';
    footer.append(delBtn, closeBtn, saveBtn);

    midRow.append(imgWrap, listWrap);
    box.append(header, midRow, controls, footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const hide = () => { overlay.style.display = 'none'; };
    closeBtn.onclick = hide;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });   // 배경 클릭도 닫기

    saveBtn.onclick = () => {
        if (!selDrink) { alert('음료를 먼저 선택하세요.'); return; }
        const list = loadOrders();
        if (editingId) {
            const o = list.find((x) => x.id === editingId);
            if (o) { o.drink = selDrink; o.temp = selTemp; o.qty = selQty; o.option = selOpt; }
        } else {
            list.push({ id: newId(), drink: selDrink, temp: selTemp, qty: selQty, option: selOpt });
        }
        saveOrders(list); renderOrders(); hide();
    };
    delBtn.onclick = () => {
        if (!editingId) return;
        saveOrders(loadOrders().filter((x) => x.id !== editingId));
        renderOrders(); hide();
    };

    // 열기: existing 없으면 새 주문, 있으면 수정 모드(값 프리필 + 삭제 버튼 표시)
    function openMenu(existing) {
        editingId = existing ? existing.id : null;
        selectDrink(existing ? existing.drink : null);
        setTemp(existing ? existing.temp : '아이스');
        setQty(existing ? existing.qty : 1);
        selOpt = existing ? existing.option : '노옵션';
        optSel.value = selOpt;
        header.textContent = existing ? '✏ 주문 수정' : '☕ TENPERCENT 주문';
        saveBtn.textContent = existing ? '💾 수정 저장' : '＋ 저장';
        delBtn.style.display = existing ? 'inline-block' : 'none';
        listWrap.scrollTop = 0;
        overlay.style.display = 'flex';
    }
    window.__showCafeMenu = () => openMenu(null);

    // 출입문 클릭 → 입장(내부 뷰 + 메뉴) / 텐퍼센트 간판·메뉴판 클릭 → 메뉴
    const ray = new THREE.Raycaster();
    const ndv = new THREE.Vector2();
    renderer.domElement.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        const rect = renderer.domElement.getBoundingClientRect();
        ndv.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndv.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(ndv, camera);
        if (cafeDoorPick.length && ray.intersectObjects(cafeDoorPick, true).length > 0) { enterCafe(); return; }
        if (cafeMenuPick.length && ray.intersectObjects(cafeMenuPick, true).length > 0) { window.__showCafeMenu(); return; }
        if (mealPlanPick.length && ray.intersectObjects(mealPlanPick, true).length > 0) { if (window.__showMealPlan) window.__showMealPlan(); return; }
        // 엘리베이터/발판/포털 클릭 → 층 메뉴 (아바타 미선택 시 가까운 아바타 자동 선택)
        if (elevatorPick.length && ray.intersectObjects(elevatorPick, true).length > 0) {
            if (!selectedAvatarId) { const nid = nearestAvatarId(); if (nid) setSelectedAvatar(nid); }
            if (selectedAvatarId) openFloorMenu();
            else showSelectToast('먼저 아바타를 추가/선택하세요');
            return;
        }
    });

    renderOrders();   // 초기 렌더(로드시 저장된 주문 표시)
})();

// ============================================
// MEALPLAN-01: 2F 식당 이번 주 식단표 오버레이
//  - 서버가 SharePoint 주간식단표(.pptx) 첫 슬라이드를 캐시 → /api/mealplan/image 서빙.
//  - 식당 간판·식단표 보드 클릭 또는 평일 12:00 알림 클릭 시 열림.
// ============================================
(function setupMealPlan() {
    const API = ''; // 같은 origin(상대경로)
    const IMG_URL = `${API}/api/mealplan/image`;

    const overlay = document.createElement('div');
    overlay.id = 'mealplan-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:1500; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,0.72); backdrop-filter:blur(3px); font-family:sans-serif;';

    const box = document.createElement('div');
    box.style.cssText = 'position:relative; width:1100px; max-width:94vw; max-height:92vh; display:flex; flex-direction:column; background:#1b1b1b; color:#eee; border-radius:14px; box-shadow:0 12px 48px rgba(0,0,0,0.6); overflow:hidden;';

    const header = document.createElement('div');
    header.style.cssText = 'padding:14px 18px; font-size:16px; font-weight:800; letter-spacing:1px; background:#2E7D32; display:flex; align-items:center; gap:10px;';
    const title = document.createElement('span'); title.textContent = '🍚 이번 주 식단표';
    const metaLbl = document.createElement('span'); metaLbl.style.cssText = 'font-size:11px; font-weight:400; color:#d7ffd9; margin-left:auto;';
    header.append(title, metaLbl);

    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'flex:1 1 auto; min-height:0; overflow:auto; background:#111; padding:12px; display:flex; align-items:center; justify-content:center;';
    const img = document.createElement('img');
    img.alt = '이번 주 식단표';
    img.style.cssText = 'max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; border-radius:8px; display:none;';
    // iframe 임베드: 본인 SharePoint 로그인 세션으로 인증 → 관리자 동의/서버 불필요
    const frame = document.createElement('iframe');
    frame.setAttribute('allowfullscreen', '');
    frame.style.cssText = 'width:100%; height:75vh; max-height:100%; border:0; border-radius:8px; display:none; background:#fff;';
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#bbb; font-size:14px; line-height:1.7; text-align:center; padding:40px 20px; white-space:pre-line; display:none;';
    imgWrap.append(img, frame, msg);

    // iframe(임베드)이 비어 보일 때 안내 — 감지가 안 되므로 상시 힌트로 유도
    const hint = document.createElement('div');
    hint.textContent = 'PPT가 안 보이면 → 아래 "🔗 SharePoint에서 열기" 클릭';
    hint.style.cssText = 'padding:6px 16px; font-size:12px; color:#9fb4c9; background:#151515; border-top:1px solid #000; text-align:center; display:none;';

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 16px; border-top:1px solid #000; background:#1b1b1b; display:flex; justify-content:flex-end; gap:10px;';
    const refreshBtn = document.createElement('button'); refreshBtn.textContent = '⟳ 새로고침';
    refreshBtn.style.cssText = 'margin-right:auto; background:#333; color:#ddd; border:1px solid #555; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; font-family:inherit;';
    // 식단표 이미지를 base64 로 확보: ① 서버 캐시(/api/mealplan/image) ② 본인 파일 토큰으로 Graph 썸네일. 실패 시 null.
    const blobToB64 = (blob) => new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] || null);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
    });
    async function getMealImageB64() {
        // ① 서버 캐시(관리자 동의 완료 또는 수동 배치 시 존재)
        try {
            const st = await (await fetch(`${API}/api/mealplan`)).json();
            if (st && st.available) {
                const blob = await (await fetch(`${IMG_URL}?t=${Date.now()}`)).blob();
                const bytes = await blobToB64(blob);
                if (bytes) return { bytes, type: blob.type || 'image/jpeg' };
            }
        } catch { /* noop */ }
        // ② 본인 토큰(Files.Read.All 증분 동의) → Graph 썸네일 바이너리(Graph 경유라 CORS 허용)
        // 이 테넌트는 사용자 동의 차단 확인됨(2026-07) → 시도 비활성화. 관리자 동의 후 아래 false 제거.
        const FILE_TOKEN_ENABLED = false;
        try {
            const ft = FILE_TOKEN_ENABLED ? await getFileAccessToken() : null;
            if (!ft) return null;
            const share = 'u!' + btoa(unescape(encodeURIComponent(sourceUrl))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
            const item = await (await fetch(`https://graph.microsoft.com/v1.0/shares/${share}/driveItem?$select=id,parentReference`, {
                headers: { Authorization: `Bearer ${ft}` } })).json();
            const driveId = item.parentReference && item.parentReference.driveId;
            if (!driveId || !item.id) return null;
            for (const size of ['c1600x1200', 'large']) {
                const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}/thumbnails/0/${size}/content`, {
                    headers: { Authorization: `Bearer ${ft}` } });
                if (r.ok) {
                    const blob = await r.blob();
                    const bytes = await blobToB64(blob);
                    if (bytes) return { bytes, type: blob.type || 'image/jpeg' };
                }
            }
        } catch (e) { console.warn('[mealplan] 썸네일 확보 실패:', e && e.message); }
        return null;
    }

    // 후보 방들의 최근 메시지를 미리보기로 보여주고, 사용자가 '나만을 위해' 방을 직접 고르게 한다.
    async function pickSelfChat(token, candidates) {
        const rows = [];
        for (const c of candidates.slice(0, 8)) {
            let preview = '(메시지 없음)';
            try {
                const d = await (await fetch(`https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(c.id)}/messages?$top=1`, {
                    headers: { Authorization: `Bearer ${token}` } })).json();
                const m = d.value && d.value[0];
                if (m) {
                    const who = (m.from && m.from.user && m.from.user.displayName) || (m.from && m.from.application && m.from.application.displayName) || '?';
                    const txt = ((m.body && m.body.content) || '').replace(/<[^>]*>/g, '').slice(0, 60);
                    preview = `${who}: ${txt}`;
                }
            } catch { /* noop */ }
            rows.push({ id: c.id, preview });
        }
        return new Promise((resolve) => {
            const ov = document.createElement('div');
            ov.style.cssText = 'position:fixed; inset:0; z-index:1800; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.7); font-family:sans-serif;';
            const bx = document.createElement('div');
            bx.style.cssText = 'background:#1b1b1b; color:#eee; border-radius:12px; padding:20px 22px; width:560px; max-width:92vw; max-height:80vh; overflow-y:auto;';
            bx.innerHTML = '<div style="font-weight:800; margin-bottom:6px;">어느 방이 \'나만을 위해\'(나와의 채팅)인가요?</div>'
                + '<div style="font-size:12px; color:#aaa; margin-bottom:12px;">최근 메시지를 보고 골라주세요. 한 번 고르면 기억해서 다음부턴 바로 보냅니다.</div>';
            rows.forEach((r) => {
                const b = document.createElement('button');
                b.textContent = r.preview;
                b.style.cssText = 'display:block; width:100%; text-align:left; margin:4px 0; padding:9px 12px; background:#2b2b2b; color:#ddd; border:1px solid #444; border-radius:8px; cursor:pointer; font-family:inherit; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
                b.onmouseenter = () => { b.style.background = '#3a3a3a'; };
                b.onmouseleave = () => { b.style.background = '#2b2b2b'; };
                b.onclick = () => { ov.remove(); resolve(r.id); };
                bx.appendChild(b);
            });
            const cancel = document.createElement('button');
            cancel.textContent = '취소';
            cancel.style.cssText = 'margin-top:10px; background:#555; color:#fff; border:none; border-radius:8px; padding:7px 14px; cursor:pointer; font-family:inherit; font-size:13px;';
            cancel.onclick = () => { ov.remove(); resolve(null); };
            bx.appendChild(cancel);
            ov.appendChild(bx);
            document.body.appendChild(ov);
        });
    }

    const notifyBtn = document.createElement('button'); notifyBtn.textContent = '🔔 내 팀즈로 보내기';
    notifyBtn.style.cssText = 'background:#8e44ad; color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; font-family:inherit;';
    // 본인 토큰으로 Teams "나와의 채팅"(self-chat)에 식단표 링크 전송
    async function sendMealPlanToMyTeams() {
        const orig = notifyBtn.textContent;
        notifyBtn.disabled = true; notifyBtn.textContent = '전송 중…';
        try {
            const token = await getAccessToken();
            if (!token) { alert('Teams 전송을 위해 로그인이 필요합니다.'); return; }
            const acct = getAccount() || {};
            const myId = (acct.localAccountId || '').toLowerCase();
            const myUpn = (acct.username || '').toLowerCase();
            // 1순위: '기존' 나와의 채팅(나만을 위해)을 탐색해 그대로 사용 — 새 방을 만들지 않는다.
            // 후보 = oneOnOne + 모든 멤버 ID가 나(ID 없는 멤버는 나로 안 침 → 퇴사자 방 오발송 차단).
            // 후보 중 '멤버 1명짜리'(Teams 기본 나만을 위해 방 형태)를 우선한다.
            const isMeMember = (m) => ((m.userId || '').toLowerCase() === myId && !!myId)
                || ((m.userPrincipalName || m.email || '').toLowerCase() === myUpn && !!myUpn);
            const candidates = [];
            let url = 'https://graph.microsoft.com/v1.0/me/chats?$expand=members&$top=50';
            for (let page = 0; url && page < 20; page++) {
                const data = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
                for (const c of (data.value || [])) {
                    if (c.chatType === 'oneOnOne' && (c.members || []).length > 0 && c.members.every(isMeMember)) candidates.push(c);
                }
                url = data['@odata.nextLink'] || null;
            }
            // 확정 순서: ⓪ 이전에 사용자가 고른 방(저장됨) → ① ID에 내 oid 2번(진짜 나만을 위해)
            //  → ② '나 2명'으로 생성(이 테넌트는 1명 생성 거부: "requires 2 members")
            //  → ③ 후보 방 최근 메시지를 보여주고 사용자가 직접 선택(선택은 저장되어 다음부턴 즉시 전송)
            const savedKey = 'tp_selfchat__' + (myUpn || myId);
            let selfChatId = localStorage.getItem(savedKey) || null;
            if (!selfChatId) {
                const native = candidates.find((c) => (c.id || '').toLowerCase().includes(`${myId}_${myId}`));
                if (native) selfChatId = native.id;
            }
            if (!selfChatId && myId) {
                const meMember = {
                    '@odata.type': '#microsoft.graph.aadUserConversationMember',
                    roles: ['owner'],
                    'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${myId}')`,
                };
                const res = await fetch('https://graph.microsoft.com/v1.0/chats', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chatType: 'oneOnOne', members: [meMember, meMember] }),
                });
                if (res.ok) selfChatId = (await res.json()).id;
                else console.warn('[mealplan] self-chat 생성(나×2) 실패', res.status, await res.text().catch(() => ''));
            }
            if (!selfChatId && candidates.length) {
                selfChatId = await pickSelfChat(token, candidates);
            }
            if (!selfChatId) { alert('Teams "나와의 채팅"을 찾지 못했어요.\nTeams 앱에서 나와의 채팅(내 이름 검색)에 아무 메시지나 하나 남긴 뒤 다시 시도해주세요.'); return; }
            localStorage.setItem(savedKey, selfChatId);   // 다음부턴 즉시 이 방으로
            // 식단표 '사진' 확보 시도: ① 서버 캐시 ② 본인 파일 토큰으로 Graph 썸네일. 실패 시 링크만 전송.
            const imgB64 = await getMealImageB64();
            if (imgB64) {
                // 이미지 포함 메시지(hostedContents) — Teams 채팅에 사진이 바로 뜬다.
                const r = await fetch(`https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(selfChatId)}/messages`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        body: { contentType: 'html', content: `<div>🍚 이번 주 식단표</div><img src="../hostedContents/1/$value" style="max-width:100%"><div><a href="${sourceUrl}">원본 PPT 열기</a></div>` },
                        hostedContents: [{ '@microsoft.graph.temporaryId': '1', contentBytes: imgB64.bytes, contentType: imgB64.type }],
                    }),
                });
                if (!r.ok) { console.warn('[mealplan] 이미지 메시지 실패', r.status, await r.text().catch(() => '')); await graphSendMessage(token, selfChatId, `🍚 이번 주 식단표\n${sourceUrl}`); }
            } else {
                await graphSendMessage(token, selfChatId, `🍚 이번 주 식단표\n${sourceUrl}`);
            }
            notify('system', '식단표 전송 완료', '내 Teams(나와의 채팅)로 보냈어요.', { ttl: 8000 });
        } catch (e) {
            alert(e && e.status === 401 ? '인증이 만료됐어요. 다시 로그인해주세요.' : `전송 실패 (${(e && e.status) || '오류'})`);
        } finally {
            notifyBtn.disabled = false; notifyBtn.textContent = orig;
        }
    }
    notifyBtn.onclick = () => sendMealPlanToMyTeams();
    // ── 평일 12:00 자동 전송(사용자별 opt-in) ──
    // 브라우저(이 탭)가 열려 있어야 발송된다. 하루 1회 중복 방지.
    const autoKey = () => 'tp_mealplan_auto__' + (((getAccount() || {}).username) || '').toLowerCase();
    const lastAutoKey = () => 'tp_mealplan_last__' + (((getAccount() || {}).username) || '').toLowerCase();
    setInterval(() => {
        if (localStorage.getItem(autoKey()) !== 'on') return;
        const now = new Date();
        const day = now.getDay();
        if (day === 0 || day === 6) return;                    // 월~금만
        if (now.getHours() !== 12 || now.getMinutes() !== 0) return;   // 12:00
        const today = now.toDateString();
        if (localStorage.getItem(lastAutoKey()) === today) return;     // 하루 1회
        localStorage.setItem(lastAutoKey(), today);
        sendMealPlanToMyTeams();
    }, 30 * 1000);

    // 기억된 '내 방'을 초기화: __resetMealPlanTarget() → 다음 전송 때 선택창 다시 뜸
    window.__resetMealPlanTarget = () => {
        const acct = getAccount() || {};
        localStorage.removeItem('tp_selfchat__' + ((acct.username || '').toLowerCase() || (acct.localAccountId || '').toLowerCase()));
        return '초기화됨 — 다음 전송 때 방을 다시 고릅니다';
    };
    // 특정 사람과의 1:1 방으로 식단표 전송: __sendMealPlanTo('김가현')
    // 내 채팅 목록에서 '상대 표시 이름'이 일치하는 oneOnOne 방을 찾아 보낸다(전송 전 확인창).
    window.__sendMealPlanTo = async (personName) => {
        const q = String(personName || '').replace(/\s+/g, '');
        if (!q) return '이름을 입력하세요: __sendMealPlanTo("김가현")';
        const token = await getAccessToken();
        if (!token) { alert('로그인이 필요합니다.'); return null; }
        const acct = getAccount() || {};
        const myId = (acct.localAccountId || '').toLowerCase();
        // 본인 이름이면 → 나에게 보내기(버튼과 동일 로직: 기억된 방 or 선택창)
        if (((acct.name || '').replace(/\s+/g, '')).includes(q)) { await sendMealPlanToMyTeams(); return '나에게 전송'; }
        const matches = [];
        let url = 'https://graph.microsoft.com/v1.0/me/chats?$expand=members&$top=50';
        for (let page = 0; url && page < 20; page++) {
            const data = await (await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).json();
            for (const c of (data.value || [])) {
                if (c.chatType !== 'oneOnOne') continue;
                const others = (c.members || []).filter((m) => (m.userId || '').toLowerCase() !== myId);
                if (others.some((m) => ((m.displayName || '').replace(/\s+/g, '')).includes(q))) {
                    matches.push({ id: c.id, name: others.map((m) => m.displayName).join(', ') });
                }
            }
            url = data['@odata.nextLink'] || null;
        }
        if (!matches.length) { alert(`'${personName}'과(와)의 1:1 채팅방을 찾지 못했어요.\nTeams에서 대화를 한 번 시작한 뒤 다시 시도해주세요.`); return null; }
        const target = matches[0];
        if (matches.length > 1) console.info('[mealplan] 동명 후보 여러 개, 첫 번째 사용:', matches.map((m) => m.name));
        if (!confirm(`'${target.name}'님에게 식단표를 보낼까요?`)) return '취소됨';
        await graphSendMessage(token, target.id, `🍚 이번 주 식단표\n${sourceUrl}`);
        notify('system', '식단표 전송 완료', `${target.name}님에게 보냈어요.`, { ttl: 8000 });
        return `${target.name}에게 전송 완료`;
    };
    // 지연 전송: __sendMealPlanToTeams(60) = 60초 뒤 내 팀즈로 전송(브라우저 탭이 열려 있어야 함)
    window.__sendMealPlanToTeams = (delaySec = 0) => {
        const s = Math.max(0, Number(delaySec) || 0);
        if (s > 0) notify('system', '식단표 예약 전송', `${s}초 뒤 내 팀즈로 보냅니다.`, { ttl: 6000 });
        setTimeout(() => sendMealPlanToMyTeams(), s * 1000);
        return `${s}초 뒤 전송 예약됨`;
    };
    // 평일 12:00 자동 전송 토글(사용자별 저장)
    const autoWrap = document.createElement('label');
    autoWrap.style.cssText = 'display:flex; align-items:center; gap:5px; font-size:12px; color:#ccc; cursor:pointer; user-select:none;';
    const autoChk = document.createElement('input'); autoChk.type = 'checkbox';
    autoChk.onchange = () => {
        localStorage.setItem(autoKey(), autoChk.checked ? 'on' : 'off');
        notify('system', '식단표 자동 전송', autoChk.checked ? '평일 12:00에 내 팀즈로 자동 전송합니다. (이 탭이 켜져 있어야 함)' : '자동 전송을 껐습니다.', { ttl: 6000 });
    };
    autoWrap.append(autoChk, document.createTextNode('평일 12시 자동 전송'));
    const openBtn = document.createElement('button'); openBtn.textContent = '🔗 SharePoint에서 열기';
    openBtn.style.cssText = 'background:#0364B8; color:#fff; border:none; border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; font-family:inherit;';
    const closeBtn = document.createElement('button'); closeBtn.textContent = '✕ 닫기';
    closeBtn.style.cssText = 'background:#e74c3c; color:#fff; border:none; border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; font-family:inherit;';
    footer.append(refreshBtn, autoWrap, notifyBtn, openBtn, closeBtn);
    // 원본 PPT 링크(기본값). 서버 /api/mealplan 의 sourceUrl 이 있으면 덮어씀 → 서버 재시작 전에도 링크 버튼 동작.
    let sourceUrl = 'https://ctrcentral.sharepoint.com/:p:/r/sites/CTR-News/_layouts/15/Doc.aspx?sourcedoc=%7BA713FB0F-B068-4C75-9F9D-525827278974%7D&file=CTR%EB%B9%8C%EB%94%A9%20%EC%A3%BC%EA%B0%84%EC%8B%9D%EB%8B%A8%ED%91%9C.pptx&action=edit&mobileredirect=true';
    openBtn.onclick = () => { if (sourceUrl) window.open(sourceUrl, '_blank', 'noopener'); };

    box.append(header, imgWrap, hint, footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const hide = () => { overlay.style.display = 'none'; };
    closeBtn.onclick = hide;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });   // 배경 클릭 닫기

    const showMsg = (t) => { img.style.display = 'none'; frame.style.display = 'none'; hint.style.display = 'none'; msg.style.display = 'block'; msg.textContent = t; };
    const fmtWhen = (iso) => {
        if (!iso) return '';
        try { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())} 갱신`; }
        catch { return ''; }
    };

    async function load() {
        autoChk.checked = localStorage.getItem(autoKey()) === 'on';   // 자동 전송 토글 상태 반영
        img.style.display = 'none'; frame.style.display = 'none'; msg.style.display = 'none';
        let status = null;
        try { status = await (await fetch(`${API}/api/mealplan`)).json(); } catch { /* noop */ }
        if (status && status.sourceUrl) sourceUrl = status.sourceUrl;
        openBtn.style.display = sourceUrl ? 'inline-block' : 'none';
        if (status && status.available) {
            // 서버가 이미지를 가진 경우(관리자 동의 완료) → 이미지 우선, 실패 시 임베드 폴백
            img.onload = () => { img.style.display = 'block'; frame.style.display = 'none'; hint.style.display = 'none'; msg.style.display = 'none'; };
            img.onerror = () => embed();
            img.src = `${IMG_URL}?t=${Date.now()}`;   // cache-bust로 최신 강제
            metaLbl.textContent = fmtWhen(status.fetchedAt) + (status.source === 'manual' ? ' · 수동' : '');
        } else {
            embed();   // 이미지 없으면 본인 로그인 세션으로 iframe 임베드
        }
    }
    // 원본 PPT 링크를 embedview 로 바꿔 iframe 에 표시(브라우저 SharePoint 세션으로 인증)
    function embed() {
        if (!sourceUrl) { showMsg('식단표 링크가 없습니다.'); return; }
        let embedUrl = sourceUrl.replace('&mobileredirect=true', '');
        if (embedUrl.includes('action=edit')) embedUrl = embedUrl.replace('action=edit', 'action=embedview');
        else if (!embedUrl.includes('action=embedview')) embedUrl += (embedUrl.includes('?') ? '&' : '?') + 'action=embedview';
        frame.src = embedUrl;
        img.style.display = 'none'; msg.style.display = 'none'; frame.style.display = 'block'; hint.style.display = 'block';
        metaLbl.textContent = '';
    }

    refreshBtn.onclick = async () => {
        refreshBtn.disabled = true; refreshBtn.textContent = '⟳ 갱신 중…';
        try { await fetch(`${API}/api/mealplan/refresh`, { method: 'POST' }); } catch { /* noop */ }
        await load();
        refreshBtn.disabled = false; refreshBtn.textContent = '⟳ 새로고침';
    };

    window.__showMealPlan = () => { overlay.style.display = 'flex'; load(); };
    window.__reloadMealPlan = () => { if (overlay.style.display !== 'none') load(); };   // 서버 갱신 푸시 시 재로드
})();

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

// ============================================================
// 강아지·고양이 패트롤 + 재롱(클릭 인터랙션) 시스템
// ============================================================

// 순찰 웨이포인트 — 사무실 3곳 · 야외 회의실 3곳 · 풀사이드 · 공원 · 야외 중간
const ANIMAL_PATROL_WPS = [
    { x: -12, z:  -1 },  // 사무실 좌측
    { x: -10, z:   2 },  // 사무실 우측
    { x:  -8, z:  -2 },  // 사무실 앞
    { x:   1, z:  10 },  // Guam 야외 회의실
    { x:  16, z:   5 },  // Okinawa 야외 회의실
    { x:  16, z:  18 },  // Boracay 야외 회의실
    { x:   8, z:   1 },  // 풀사이드
    { x:   5, z:  -3 },  // 야외 공원
    { x:  12, z:   8 },  // 야외 중간
];

// 강아지 패트롤 상태 (사무실에서 출발)
const dogState = {
    wpIdx: 0, state: 'idle', timer: 0.8, trickT: 0,
    targetX: ANIMAL_PATROL_WPS[0].x, targetZ: ANIMAL_PATROL_WPS[0].z,
    pickMeshes: [],
};
// 고양이 패트롤 상태 (강아지와 엇갈리게 Guam부터)
const catState = {
    wpIdx: 3, state: 'idle', timer: 2.2, trickT: 0,
    targetX: ANIMAL_PATROL_WPS[3].x, targetZ: ANIMAL_PATROL_WPS[3].z,
    pickMeshes: [], bodyMesh: null,
};

// 아바타 쓰다듬기 상태 — 펫 근처에서 클릭 시 아바타가 앉아 쓰다듬는 동안 유지
let _pettingUntil = 0;      // ms(performance.now 기준) 종료 시각
let _pettingAvId  = null;   // 쓰다듬는 아바타 personId

// 강아지 초기 위치 → 첫 웨이포인트(사무실)
dog.group.position.set(ANIMAL_PATROL_WPS[0].x, 0, ANIMAL_PATROL_WPS[0].z);

// raycaster pick 메쉬 등록 (클릭 감지용)
dog.group.traverse(o => { if (o.isMesh) { o.userData.animalType = 'dog'; dogState.pickMeshes.push(o); } });
sleepingCat.traverse(o => { if (o.isMesh) { o.userData.animalType = 'cat'; catState.pickMeshes.push(o); } });
catState.bodyMesh = sleepingCat.children[0]; // body capsule (rotation.z = π/2 = 수평)

/** 다음 목표 결정: 30% 확률로 근처 사용자 아바타 → 나머지는 순서대로 웨이포인트 */
function _nextAnimalTarget(state, group) {
    if (Math.random() < 0.30 && personAvatarMap.size > 0) {
        let best = null, bestD = Infinity;
        personAvatarMap.forEach(av => {
            const dx = av.group.position.x - group.position.x;
            const dz = av.group.position.z - group.position.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d > 1.5 && d < bestD) { bestD = d; best = av.group.position; }
        });
        if (best) return { x: best.x, z: best.z, isApproach: true };
    }
    state.wpIdx = (state.wpIdx + 1) % ANIMAL_PATROL_WPS.length;
    const wp = ANIMAL_PATROL_WPS[state.wpIdx];
    return { x: wp.x, z: wp.z, isApproach: false };
}

/** 강아지 재롱 — 점프 → 제자리 스핀 → 엎드려(bow) → 재점프 (0~2.5s) */
function _animDogTrick(t, elapsed, delta) {
    if (t < 0.45) {
        dog.group.position.y = Math.sin(t / 0.45 * Math.PI) * 0.55;
        dog.tail.rotation.z  = -1.8;
        dog.tail.rotation.y  = Math.sin(elapsed * 18) * 1.2;
    } else if (t < 1.15) {
        dog.group.position.y = 0;
        dog.group.rotation.y += delta * 13;  // 스핀
        dog.tail.rotation.z  = -1.8;
        dog.tail.rotation.y  = Math.sin(elapsed * 18) * 1.2;
    } else if (t < 2.0) {
        const p = Math.min(1, (t - 1.15) / 0.45);
        dog.head.position.y  = 0.42 - p * 0.22;   // 머리 내리기(엎드려)
        dog.tail.rotation.z  = -1.5 - p * 0.3;
        dog.tail.rotation.y  = Math.sin(elapsed * 22) * 1.5;
        dog.group.position.y = 0;
    } else {
        dog.head.position.y  = 0.42;
        dog.tail.rotation.z  = -0.7;
        dog.group.position.y = Math.abs(Math.sin((t - 2.0) / 0.5 * Math.PI * 2)) * 0.22;
    }
    dog.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(elapsed * 13 + i * Math.PI / 2) * 0.75; });
}

/** 고양이 재롱 — 뒷발 서기 → 앞발 흔들기 → 통통 점프 → 눕기 (0~2.5s) */
function _animCatTrick(t, elapsed) {
    const body = catState.bodyMesh;
    if (t < 0.55) {
        // 뒷발로 일어나기 (몸통 수평 → 수직)
        if (body) body.rotation.z = (1 - t / 0.55) * Math.PI / 2;
        sleepingCat.position.y = (t / 0.55) * 0.08;
    } else if (t < 1.5) {
        // 앞발 흔들기 (그룹 좌우 기울기)
        if (body) body.rotation.z = 0;
        const wave = Math.sin((t - 0.55) * Math.PI * 3.8);
        sleepingCat.rotation.z  = wave * 0.28;
        sleepingCat.position.y  = 0.08 + Math.abs(wave) * 0.08;
    } else if (t < 2.05) {
        // 통통 점프
        sleepingCat.rotation.z = 0;
        sleepingCat.position.y = Math.abs(Math.sin((t - 1.5) * Math.PI * 3.5)) * 0.28;
    } else {
        // 다시 눕기 (몸통 수직 → 수평)
        sleepingCat.rotation.z = 0;
        const p = Math.min(1, (t - 2.05) / 0.45);
        if (body) body.rotation.z = p * Math.PI / 2;
        sleepingCat.position.y = 0;
    }
}

/** 강아지 배 까고 재롱 — 등으로 눕기 → 네 발 버둥·꼬리흔들·좌우 뒹굴 → 일어나기 (0~3.0s) */
function _animDogBelly(t, elapsed) {
    const DUR = 3.0;
    if (t < 0.4) {                                   // 눕기(등으로 구르기)
        const p = t / 0.4;
        dog.group.rotation.x = p * (Math.PI * 0.9);
        dog.group.position.y = p * 0.1;
    } else if (t < DUR - 0.4) {                      // 배 까고 버둥
        dog.group.rotation.x = Math.PI * 0.9;
        dog.group.rotation.z = Math.sin(elapsed * 6) * 0.2;
        dog.group.position.y = 0.1 + Math.abs(Math.sin(elapsed * 5)) * 0.03;
        dog.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(elapsed * 13 + i * 1.3) * 0.9; });
        dog.tail.rotation.y = Math.sin(elapsed * 20) * 1.2;
    } else {                                         // 일어나기
        const p = (t - (DUR - 0.4)) / 0.4;
        dog.group.rotation.x = Math.PI * 0.9 * (1 - p);
        dog.group.rotation.z = 0;
        dog.group.position.y = 0.1 * (1 - p);
    }
}

/** 고양이 배 까고 재롱 — 등으로 눕기 → 좌우 뒹굴 → 일어나기 (0~3.0s) */
function _animCatBelly(t, elapsed) {
    const DUR = 3.0;
    if (t < 0.4) {
        const p = t / 0.4;
        sleepingCat.rotation.x = p * (Math.PI * 0.85);
        sleepingCat.position.y = p * 0.08;
    } else if (t < DUR - 0.4) {
        sleepingCat.rotation.x = Math.PI * 0.85;
        sleepingCat.rotation.z = Math.sin(elapsed * 7) * 0.22;
        sleepingCat.position.y = 0.08 + Math.abs(Math.sin(elapsed * 6)) * 0.03;
    } else {
        const p = (t - (DUR - 0.4)) / 0.4;
        sleepingCat.rotation.x = Math.PI * 0.85 * (1 - p);
        sleepingCat.rotation.z = 0;
        sleepingCat.position.y = 0.08 * (1 - p);
    }
}

/** 강아지·고양이 공통 패트롤 업데이트 — animate() 루프에서 매 프레임 호출 */
function updateAnimalPatrol(state, group, speed, elapsed, delta, isdog) {

    // ── 배 까고 재롱 상태(쓰다듬기 트리거) ──
    if (state.state === 'bellyup') {
        state.trickT += delta;
        if (isdog) _animDogBelly(state.trickT, elapsed);
        else       _animCatBelly(state.trickT, elapsed);
        if (state.trickT > 3.0) {
            state.state = 'idle';
            state.timer = 1.0 + Math.random() * 1.5;
            state.trickT = 0;
            if (isdog) {
                dog.group.rotation.x = 0; dog.group.rotation.z = 0; dog.group.position.y = 0;
                dog.legs.forEach(l => { l.rotation.x = 0; });
                dog.tail.rotation.z = -0.7; dog.tail.rotation.y = 0;
            } else {
                sleepingCat.rotation.x = 0; sleepingCat.rotation.z = 0; sleepingCat.position.y = 0;
                if (catState.bodyMesh) catState.bodyMesh.rotation.z = Math.PI / 2;
            }
        }
        return;
    }

    // ── 재롱 상태 ──
    if (state.state === 'trick') {
        state.trickT += delta;
        if (isdog) _animDogTrick(state.trickT, elapsed, delta);
        else       _animCatTrick(state.trickT, elapsed);
        if (state.trickT > 2.5) {
            state.state  = 'idle';
            state.timer  = 0.8 + Math.random() * 1.0;
            state.trickT = 0;
            group.position.y = 0;
            if (isdog) { dog.tail.rotation.z = -0.7; dog.tail.rotation.y = 0; }
            else { sleepingCat.rotation.z = 0; if (catState.bodyMesh) catState.bodyMesh.rotation.z = Math.PI / 2; }
        }
        return;
    }

    // ── 대기 상태 ──
    if (state.state === 'idle') {
        state.timer -= delta;
        if (!isdog) group.scale.y = 1 + Math.sin(elapsed * 1.4) * 0.04; // 고양이 호흡
        if (state.timer <= 0) {
            const t = _nextAnimalTarget(state, group);
            state.targetX = t.x; state.targetZ = t.z;
            state.state = t.isApproach ? 'approach' : 'patrol';
            if (!isdog) { group.position.y = 0; group.scale.y = 1; } // 고양이: 바닥으로 내려옴
        }
        return;
    }

    // ── 이동 상태 (patrol / approach) ──
    const dx = state.targetX - group.position.x;
    const dz = state.targetZ - group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const arrivalDist = state.state === 'approach' ? 1.8 : 0.45;

    if (dist < arrivalDist) {
        group.position.set(state.targetX, 0, state.targetZ);
        if (state.state === 'approach') { state.state = 'trick'; state.trickT = 0; }
        else { state.state = 'idle'; state.timer = 2.0 + Math.random() * 3.0; }
        return;
    }

    const nx = dx / dist, nz = dz / dist;
    group.position.x += nx * speed * delta;
    group.position.z += nz * speed * delta;
    group.rotation.y  = Math.atan2(nx, nz);
    group.position.y  = Math.abs(Math.sin(elapsed * (isdog ? 9 : 5.5))) * 0.055;

    if (isdog) {
        dog.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(elapsed * 10 + i * Math.PI / 2) * 0.5; });
        dog.tail.rotation.y = Math.sin(elapsed * 8) * 0.6;
        dog.tail.rotation.z = -0.7;
    }
}


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

// ---- 아바타 머리 위 버튼(🤖 AI / 👤 정보) 데이터 ----
// avatarAgents: 이메일(소문자) → { role: {status, action, detail, tool, lastUpdate} }
//   각 PC의 Claude Code 훅이 sessionId=이메일로 보낸 상태를 사용자별로 누적.
const avatarAgents = new Map();
// avatarConn: 이메일 → { connected:true, lastWorkingAt:ms } — 버튼 색(연결/작업중/여운) 계산용
const avatarConn = new Map();
const AI_WORK_LINGER_MS = 4000;   // 마지막 working 이후 초록 유지 시간(짧은 작업 가시성)
let orgUsersByEmail = null;       // /api/org-users 캐시(Map: email → {displayName, jobTitle})
let _openInfoPanel = null;        // 현재 열린 팝업 { kind:'ai'|'user', email } 추적(라이브 갱신용)

// ============================================
// 메인 루프
// ============================================
const clock = new THREE.Clock();

// 키보드 이동용 사전 할당 벡터 (매 프레임 GC 방지)
const _kbFwd = new THREE.Vector3();
const _kbRgt = new THREE.Vector3();
const _kbUp  = new THREE.Vector3(0, 1, 0);

// ---- 아바타 뷰 모드 (VIEW 옵션) ----
// 'tower'    : 멀리서 조망(기본, OrbitControls 자유 조작)
// 'approach' : 아바타 뒤 위에서 따라가는 3인칭
// 'fpv'      : 아바타 머리에서 전방 응시(1인칭)
let avatarViewMode = 'tower';
const _camTmpPos = new THREE.Vector3();
const _camTmpTgt = new THREE.Vector3();

// ---- 점프/수직 물리 (본인 아바타 전용) ----
const GRAVITY    = 22;    // 중력 가속도(유닛/s²)
const JUMP_SPEED = 8;     // 점프 초기 상승 속도 → 최고점 ≈ 1.45유닛(의자·낮은 탁자 착지 가능)
const STEP_UP    = 0.6;   // 걷다가 오를 수 있는 최대 단차(계단·낮은 발판)
let _jumpVelY = 0;        // 현재 수직 속도
let _airborne = false;    // 공중(점프/낙하) 여부

/** 입력 포커스가 텍스트 필드에 있으면 true — 채팅 입력 중 이동 방지 */
function _isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable;
}

/** 내 캐릭터 현재 3D 위치를 서버에 저장 (debounce 후 호출) */
function _saveMyPosition() {
    if (!myPersonId) return;
    const av = personAvatarMap.get(myPersonId);
    if (!av) return;
    const pos = scenePosToPerson(av.group.position.x, av.group.position.z);
    fetch(`/api/people/${myPersonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: pos }),
    }).catch(() => {});
}

/** 300ms 디바운스 — 키를 누르고 있는 동안 매 프레임 저장하지 않고 멈출 때 한 번만 저장 */
function _scheduleSaveMyPosition() {
    if (_savePositionTimer) clearTimeout(_savePositionTimer);
    _savePositionTimer = setTimeout(_saveMyPosition, 300);
}

/**
 * 본인 아바타 수직 물리(점프·중력·착지) — 매 프레임 호출.
 * 지상: 발밑 표면(바닥·가구 상판)에 스냅(단차 STEP_UP 이내 오르내림, 가장자리 벗어나면 낙하 시작).
 * 공중: 중력 적용 후 하강 중 표면에 닿으면 착지. → 점프해서 의자·탁자 위에 올라설 수 있다.
 */
function updateSelfVertical(delta, moving) {
    const av = myPersonId && personAvatarMap.get(myPersonId);
    if (!av || sittingSeat) return;                 // 앉은 상태면 물리 생략
    // 지상+정지 상태면 레이캐스트 불필요(위치 불변) → 매 프레임 캐스트 방지
    if (!_airborne && !moving) return;
    const px = av.group.position.x, pz = av.group.position.z;
    const feetY = av.group.position.y;

    if (_airborne) {
        // ── 공중: 중력 → 하강 중 착지 판정 ──
        _jumpVelY -= GRAVITY * delta;
        let ny = feetY + _jumpVelY * delta;
        // 머리 위에서 아래로 레이캐스트 → 발 근처/아래에서 가장 높은 표면
        _rayOrigin.set(px, feetY + 2.2, pz);
        _downRay.set(_rayOrigin, _downDir);
        _downRay.far = 300;
        const hits = _downRay.intersectObjects(jumpTargets, false);
        let landY = 0;
        for (const h of hits) { if (h.point.y <= feetY + 0.3) { landY = h.point.y; break; } }
        if (_jumpVelY <= 0 && ny <= landY) {        // 하강 중 표면 도달 → 착지
            ny = landY; _jumpVelY = 0; _airborne = false;
        }
        av.group.position.y = ny;
    } else {
        // ── 지상: 걷는 표면에 스냅 ──
        _rayOrigin.set(px, feetY + STEP_UP, pz);
        _downRay.set(_rayOrigin, _downDir);
        _downRay.far = STEP_UP + 400;
        const hits = _downRay.intersectObjects(jumpTargets, false);
        const target = hits.length ? hits[0].point.y : 0;   // 발밑 가장 높은 표면(없으면 지면 0)
        if (target > feetY + 0.02) {
            // 낮은 단차(≤STEP_UP) → 걸어 올라섬
            av.group.position.y = target;
        } else if (target < feetY - 0.06) {
            // 발밑이 꺼짐(가장자리 이탈) → 낙하 시작
            _airborne = true; _jumpVelY = 0;
        } else {
            av.group.position.y = target;           // 미세 보정
        }
    }
}

/** SPACE 점프 트리거 — 지상에 있을 때만. 본인 아바타 필요. */
function trySelfJump() {
    const av = myPersonId && personAvatarMap.get(myPersonId);
    if (!av || sittingSeat) return;
    if (_airborne) return;                          // 이미 공중이면 무시(더블점프 방지)
    _jumpVelY = JUMP_SPEED;
    _airborne = true;
}

/**
 * 아바타 위치 초기화 — 벽·가구 사이 등 잘못된 곳에 끼었을 때 안전한 홈으로 즉시 복귀.
 * 홈: 부서 소속이면 해당 부서 방(DEPT_ROOMS), 아니면 정문 광장 고정점(0, 8).
 * 앉기/점프·낙하 상태를 정리하고 서버에 위치를 저장한다.
 */
function resetSelfPosition() {
    const av = myPersonId && personAvatarMap.get(myPersonId);
    if (!av) { showSelectToast('로그인 후 본인 아바타가 있을 때 사용할 수 있어요'); return; }
    if (sittingSeat) standUp();                     // 앉아 있으면 먼저 일어서기
    // 홈 좌표 산정
    let hx = 0, hz = 8;                              // 기본: 정문 광장
    if (av.department && DEPT_ROOMS[av.department]) {
        hx = DEPT_ROOMS[av.department].x;
        hz = DEPT_ROOMS[av.department].z;
    }
    av.group.position.set(hx, PERSON_GROUND_Y, hz); // 즉시 이동(층 높이도 지상으로 복귀)
    av.group.rotation.y = 0;
    av.targetPos = { x: hx, z: hz };                // 원격 보간이 되돌리지 않게 목표점도 동기화
    _airborne = false; _jumpVelY = 0;               // 점프/낙하 상태 해제
    _saveMyPosition();                              // 서버 저장
    showSelectToast('🏠 위치를 초기화했어요');
}

/** 펫 클릭 처리: 내 아바타가 가까우면 앉아 쓰다듬기 + 펫 배까기, 멀면 기존 재롱. */
function startPetOrTrick(anType) {
    const isDog = anType === 'dog';
    const state = isDog ? dogState : catState;
    const petGroup = isDog ? dog.group : sleepingCat;
    if (state.state === 'bellyup' || state.state === 'trick') return;   // 이미 연출 중

    const av = myPersonId && personAvatarMap.get(myPersonId);
    let near = false;
    if (av) {
        const pw = new THREE.Vector3(); petGroup.getWorldPosition(pw);
        const aw = new THREE.Vector3(); av.group.getWorldPosition(aw);
        near = pw.distanceTo(aw) < 3.5;             // 좌표계 무관(월드 기준)
        if (near) {
            av.group.rotation.y = Math.atan2(pw.x - aw.x, pw.z - aw.z);   // 펫을 바라봄(+z 정면)
            _pettingAvId  = myPersonId;
            _pettingUntil = performance.now() + 3000;
            showSelectToast(isDog ? '🐶 강아지를 쓰다듬는다…' : '🐱 고양이를 쓰다듬는다…');
        }
    }
    state.state = near ? 'bellyup' : 'trick';       // 근처=배까기, 멀리=기존 재롱
    state.trickT = 0;
}

/** 쓰다듬는 동안 아바타 포즈(앞으로 숙여 오른팔 stroke). */
function poseSelfPetting(walkAv, elapsed) {
    const stroke = Math.sin(elapsed * 6);
    const po = walkAv.personObj;
    if (po && po.legL) {                            // 상세 휴먼
        if (po.torso) po.torso.rotation.x = 0.55;
        if (po.armR && po.armR.shoulder) po.armR.shoulder.rotation.x = 1.1 + stroke * 0.25;
        if (po.armR && po.armR.elbow) po.armR.elbow.rotation.x = -0.3;
    } else {                                        // 수박/부리부리몬
        if (!walkAv._wl) { walkAv._wl = {}; walkAv.group.traverse(o => { if (o.userData.walkLimbType) walkAv._wl[o.userData.walkLimbType] = o; }); }
        if (walkAv._wl.armR) walkAv._wl.armR.rotation.x = 1.2 + stroke * 0.3;
    }
}
/** 쓰다듬기 종료 시 포즈 복원. */
function resetSelfPettingPose(walkAv) {
    const po = walkAv.personObj;
    if (po) {
        if (po.torso) po.torso.rotation.x = 0;
        if (po.armR && po.armR.shoulder) po.armR.shoulder.rotation.x = 0;
        if (po.armR && po.armR.elbow) po.armR.elbow.rotation.x = 0;
    }
    if (walkAv._wl && walkAv._wl.armR) walkAv._wl.armR.rotation.x = 0;
}

/**
 * 접근/1인칭 뷰에서 매 프레임 카메라를 본인 아바타에 맞춰 배치.
 * 타워 모드거나 본인 아바타가 없으면 아무것도 안 함(OrbitControls 자유).
 */
function updateAvatarCamera(delta) {
    if (avatarViewMode === 'tower') return;
    const av = myPersonId && personAvatarMap.get(myPersonId);
    if (!av) return;
    const ry = av.group.rotation.y;
    const fx = Math.sin(ry), fz = Math.cos(ry);   // 아바타 정면(+z) 방향
    const px = av.group.position.x, py = av.group.position.y, pz = av.group.position.z;
    const a = 1 - Math.exp(-9 * delta);           // 프레임레이트 독립 스무딩

    if (avatarViewMode === 'fpv') {
        av.group.visible = false;                 // 1인칭 — 본인 몸 숨김(로컬 렌더만)
        const eyeH = 1.55;
        _camTmpPos.set(px + fx * 0.2, py + eyeH, pz + fz * 0.2);
        _camTmpTgt.set(px + fx * 12, py + eyeH * 0.92, pz + fz * 12);
    } else {
        // approach — 아바타 뒤 위에서 어깨너머로
        av.group.visible = true;
        const DIST = 5.5, HEIGHT = 3.2;
        _camTmpPos.set(px - fx * DIST, py + HEIGHT, pz - fz * DIST);
        _camTmpTgt.set(px + fx * 2, py + 1.3, pz + fz * 2);
    }
    camera.position.lerp(_camTmpPos, a);
    controls.target.lerp(_camTmpTgt, a);
    camera.lookAt(controls.target);
}

/** 뷰 모드 전환(버튼/단축키에서 호출). approach·fpv는 본인 아바타 필요. */
function setAvatarViewMode(mode) {
    if ((mode === 'approach' || mode === 'fpv') && !(myPersonId && personAvatarMap.get(myPersonId))) {
        showSelectToast('로그인 후 본인 아바타가 있을 때 사용할 수 있어요');
        return;
    }
    // 1인칭에서 빠져나올 때 숨겼던 본인 아바타 복구
    const av = myPersonId && personAvatarMap.get(myPersonId);
    if (av) av.group.visible = true;

    avatarViewMode = mode;
    if (mode === 'tower') {
        controls.enabled = true;                  // 마우스 자유 조작 복귀
        if (av) {
            // 본인 아바타를 중심으로 멀리서 조망
            tweenView({
                pos: [av.group.position.x - 18, 26, av.group.position.z + 34],
                target: [av.group.position.x, 1, av.group.position.z],
            });
        }
    } else {
        controls.enabled = false;                 // 카메라를 코드가 제어(마우스 회전/줌 잠금)
    }
    updateViewButtons();
}

/** 뷰 전환 버튼 활성 표시 갱신. */
function updateViewButtons() {
    const wrap = document.getElementById('view-switcher');
    if (!wrap) return;
    wrap.querySelectorAll('button[data-view]').forEach((b) => {
        const active = b.getAttribute('data-view') === avatarViewMode;
        b.style.background = active ? '#2F6FED' : 'rgba(255,255,255,0.08)';
        b.style.color = active ? '#fff' : '#cfe0ff';
    });
}

/**
 * 아바타 걷기/idle 손발 애니메이션 (자기·원격 아바타 공용 헬퍼).
 * DetailedPerson은 updatePersonAnimation, 수박/부리부리몬은 walkLimbType 메쉬를 직접 제어.
 */
function animateAvatarWalk(av, isWalking, elapsed, delta) {
    if (av.personObj && av.personObj.legL) {
        updatePersonAnimation(av.personObj, isWalking ? 'walking-in' : 'idle', 100, elapsed, delta, false);
    } else {
        if (!av._wl) {
            av._wl = {};
            av.group.traverse(o => { if (o.userData.walkLimbType) av._wl[o.userData.walkLimbType] = o; });
        }
        const wl = av._wl;
        if (isWalking) {
            const wp = elapsed * 4;
            if (wl.armL) wl.armL.rotation.x = Math.sin(wp + Math.PI) * 0.5;
            if (wl.armR) wl.armR.rotation.x = Math.sin(wp) * 0.5;
            if (wl.legL) wl.legL.rotation.x = Math.sin(wp) * 0.55;
            if (wl.legR) wl.legR.rotation.x = Math.sin(wp + Math.PI) * 0.55;
        } else {
            if (wl.armL) wl.armL.rotation.x *= 0.85;
            if (wl.armR) wl.armR.rotation.x *= 0.85;
            if (wl.legL) wl.legL.rotation.x *= 0.85;
            if (wl.legR) wl.legR.rotation.x *= 0.85;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    // 타워 모드에서만 OrbitControls 갱신 — 접근/1인칭은 updateAvatarCamera가 카메라 전담(충돌 방지)
    if (avatarViewMode === 'tower') controls.update();
    updateAvatarKeyboardMove(delta, elapsed);
    updateSelectionIndicator(elapsed);
    updateInteractHint();

    // ── 내 캐릭터 키보드 이동 (WASD / 화살표) ──
    if (myPersonId && keysDown.size > 0 && !_isTyping()) {
        const av = personAvatarMap.get(myPersonId);
        if (av) {
            const SPEED = 5; // 3D 단위/초
            if (avatarViewMode === 'tower') {
                // [타워] 카메라가 바라보는 수평 방향 기준으로 이동 — 자유 조망에 맞는 조작감
                camera.getWorldDirection(_kbFwd); _kbFwd.y = 0; _kbFwd.normalize();
                _kbRgt.crossVectors(_kbFwd, _kbUp).normalize();

                let mx = 0, mz = 0;
                if (keysDown.has('KeyW') || keysDown.has('ArrowUp'))    { mx += _kbFwd.x; mz += _kbFwd.z; }
                if (keysDown.has('KeyS') || keysDown.has('ArrowDown'))  { mx -= _kbFwd.x; mz -= _kbFwd.z; }
                if (keysDown.has('KeyA') || keysDown.has('ArrowLeft'))  { mx -= _kbRgt.x; mz -= _kbRgt.z; }
                if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) { mx += _kbRgt.x; mz += _kbRgt.z; }

                if (mx !== 0 || mz !== 0) {
                    const len = Math.sqrt(mx * mx + mz * mz);
                    av.group.position.x += (mx / len) * SPEED * delta;
                    av.group.position.z += (mz / len) * SPEED * delta;
                    av.group.rotation.y = Math.atan2(mx / len, mz / len); // 이동 방향으로 캐릭터 회전
                    _scheduleSaveMyPosition();
                }
            } else {
                // [접근/1인칭] W/S = 바라보는 방향 전진·후진, A/D = 좌우 회전(방향 전환)
                const TURN = 2.4; // rad/s
                let turned = false;
                if (keysDown.has('KeyA') || keysDown.has('ArrowLeft'))  { av.group.rotation.y += TURN * delta; turned = true; }
                if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) { av.group.rotation.y -= TURN * delta; turned = true; }
                let fwd = 0;
                if (keysDown.has('KeyW') || keysDown.has('ArrowUp'))   fwd += 1;
                if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) fwd -= 1;
                if (fwd !== 0) {
                    const ry = av.group.rotation.y;           // +z가 정면
                    av.group.position.x += Math.sin(ry) * fwd * SPEED * delta;
                    av.group.position.z += Math.cos(ry) * fwd * SPEED * delta;
                }
                if (fwd !== 0 || turned) _scheduleSaveMyPosition();
            }
        }
    }

    // ── 본인 아바타 수직 물리(점프·중력·가구 위 착지) — 매 프레임 ──
    updateSelfVertical(delta, myPersonId && keysDown.size > 0 && !_isTyping());

    // ── 아바타 뷰 카메라 갱신(접근/1인칭) — 이동 여부와 무관하게 매 프레임 추종 ──
    updateAvatarCamera(delta);

    // ── 내 캐릭터 걷기 애니메이션 (손발 움직임) ──
    if (myPersonId) {
        const walkAv = personAvatarMap.get(myPersonId);
        if (walkAv) {
          // 펫 쓰다듬기 중이면 걷기/idle 대신 쓰다듬기 포즈
          const _pet = _pettingAvId === myPersonId && performance.now() < _pettingUntil;
          if (_pet || _pettingAvId === myPersonId) {
            if (_pet) {
                poseSelfPetting(walkAv, elapsed);
            } else {
                resetSelfPettingPose(walkAv);   // 방금 종료 → 복원 1회
                _pettingAvId = null; _pettingUntil = 0;
            }
          } else {
            const isWalking = keysDown.size > 0 && !_isTyping();
            animateAvatarWalk(walkAv, isWalking, elapsed, delta);
          }
        }
    }

    // ── 원격(타인) 아바타: 목표점(targetPos) 향해 부드럽게 이동 + 걷기 애니메이션 ──
    // syncPersonAvatars가 하드 스냅 대신 av.targetPos만 갱신 → 여기서 프레임 보간으로 걸어가듯 이동.
    if (personAvatarMap.size > 0) {
        const smooth = 1 - Math.exp(-10 * delta);   // 프레임레이트 독립 스무딩
        for (const [id, av] of personAvatarMap) {
            if (id === myPersonId || av === draggingAvatar) continue;   // 자기·드래그중 제외
            const tp = av.targetPos;
            if (!tp) { animateAvatarWalk(av, false, elapsed, delta); continue; }
            const dx = tp.x - av.group.position.x;
            const dz = tp.z - av.group.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            let isWalking = false;
            if (dist > 0.02) {
                av.group.position.x += dx * smooth;
                av.group.position.z += dz * smooth;
                if (dist > 0.05) { av.group.rotation.y = Math.atan2(dx, dz); isWalking = true; }   // 진행 방향 회전(+z 정면)
            }
            animateAvatarWalk(av, isWalking, elapsed, delta);
        }
    }

    updateFloatingTexts(delta);
    updateFactory(delta, elapsed);
    updateWarehouse(delta, elapsed);
    updateStairAgent(elapsed);
    updateCafeStaff(elapsed);


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
    // 강아지·고양이 패트롤 + 재롱 업데이트
    updateAnimalPatrol(dogState, dog.group, 2.8, elapsed, delta, true);
    updateAnimalPatrol(catState, sleepingCat, 1.8, elapsed, delta, false);

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

// ---- 선택 아바타 방향키 이동 (게임식 이동) ----
// keyboardMoveEnabled: 좌하단 토글(또는 M키)로 on/off. on이면 방향키가 카메라 패닝 대신
//   선택된 아바타를 카메라 기준(전/후/좌/우)으로 이동시킨다.
// selectedAvatarId: 아바타 클릭 시 선택되는 대상(이동·하이라이트 링 대상).
// pressedMoveKeys: 현재 눌린 방향키 집합(부드러운 프레임 단위 이동용).
// ⚠ TDZ 방지: animate()가 updateAvatarKeyboardMove()에서 이 값들을 참조하므로 animate() 앞에서 선언.
let keyboardMoveEnabled = false;
let selectedAvatarId = null;
let sittingSeat = null;   // 앉아 있는 좌석({x,z,y,yaw}) 또는 null
// ⚠ TDZ 방지: animate()가 updateInteractHint()에서 아래 값들을 참조하므로 animate() 앞에서 선언.
const SIT_RANGE = 2.6;    // 좌석 인식 반경(넉넉히)
const EV_RANGE  = 2.5;    // 엘리베이터 진입존 인식 반경
let sitHintEl = null;      // 상호작용 힌트 DOM (updateInteractHint에서 지연 생성)
let evMenuArmed = true;    // 발판 진입 시 층 메뉴 1회 자동 오픈(발판을 벗어나면 재장전)
const pressedMoveKeys = new Set();
let selectionRing = null;

// 키보드 이동 — 로그인 사용자 아바타 ID · 현재 눌린 키 · 저장 디바운스 타이머
let myPersonId = null;
const keysDown = new Set();
let _savePositionTimer = null;

animate();

// ---- /api/roles SSoT 초기화 ----
// P1-A: AGENT_DEFS·ROLE_LABEL·ROLE_COLOR를 서버 SSoT(/api/roles)에서 동적으로 채운다.
// CSS 색상(#rrggbb) → Three.js 정수(0xrrggbb) 변환 헬퍼
function cssColorToHex(css) {
    return parseInt(css.replace('#', '0x'), 16);
}

async function initFromRolesApi() {
    try {
        const res = await fetch(`/api/roles`);
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
// 아바타 머리 위 버튼(🤖 AI / 👤 정보) + 정보 팝업
// ============================================================
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function _infoHeader(t) { return `<div style="font-size:14px; font-weight:bold; border-bottom:1px solid #2a3550; padding-bottom:8px; margin-bottom:6px;">${t}</div>`; }
function _infoCloseBtn() { return `<button id="avatar-info-close" style="margin-top:14px; width:100%; background:#26324d; color:#cfe0ff; border:none; border-radius:8px; padding:8px; font-family:monospace; font-size:12px; cursor:pointer;">닫기</button>`; }
function _wireInfoClose(card) { const b = card.querySelector('#avatar-info-close'); if (b) b.onclick = closeInfoPopup; }

function getInfoPopup() {
    let ov = document.getElementById('avatar-info-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'avatar-info-overlay';
    ov.style.cssText = `position:fixed; inset:0; z-index:1200; display:none; align-items:center; justify-content:center; background:rgba(5,8,15,0.45);`;
    const card = document.createElement('div');
    card.id = 'avatar-info-card';
    card.style.cssText = `min-width:300px; max-width:90vw; max-height:80vh; overflow:auto; background:rgba(12,18,30,0.97); border:1px solid #2a3550; border-radius:14px; padding:18px 20px; font-family:monospace; color:#fff; box-shadow:0 12px 48px rgba(0,0,0,0.6);`;
    ov.appendChild(card);
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeInfoPopup(); });
    return ov;
}
function closeInfoPopup() {
    _openInfoPanel = null;
    const ov = document.getElementById('avatar-info-overlay');
    if (ov) ov.style.display = 'none';
}

/** AI 진행 현황 패널 렌더 (역할별 상태). */
function renderAiPanel(email, name) {
    const card = document.getElementById('avatar-info-card');
    if (!card) return;
    const roles = avatarAgents.get((email || '').toLowerCase());
    const order = ['pm', 'leader', 'developer', 'devops', 'qa'];
    let rows = '';
    for (const r of order) {
        const st = roles && roles[r];
        const label = ROLE_LABEL[r] || r.toUpperCase();
        const color = ROLE_COLOR[r] || '#8892a6';
        const working = !!(st && st.status === 'working');
        const action = st ? (st.detail || st.action || (working ? '작업 중' : '대기 중')) : '—';
        rows += `<div style="display:flex; gap:8px; align-items:flex-start; margin:7px 0;">
            <span style="width:8px;height:8px;border-radius:50%;margin-top:5px;flex:none;background:${working ? '#39ff14' : '#4a5570'};${working ? 'box-shadow:0 0 7px #39ff14;' : ''}"></span>
            <span style="color:${color}; font-weight:bold; min-width:48px;">${label}</span>
            <span style="color:${working ? '#e6f5ff' : '#7a8aa5'}; word-break:break-all; flex:1;">${_esc(action)}</span>
        </div>`;
    }
    const conn = avatarConn.get((email || '').toLowerCase());
    const working = conn && (Date.now() - conn.lastWorkingAt < AI_WORK_LINGER_MS);
    const connLine = conn && conn.connected
        ? `<div style="font-size:11px; margin:2px 0 8px; color:${working ? '#39ff14' : '#29b6f6'};">${working ? '🟢 작업 중' : '🔵 연결됨 · 대기'}</div>`
        : `<div style="font-size:11px; margin:2px 0 8px; color:#7a8aa5;">⚪ 미연결</div>`;
    card.innerHTML = _infoHeader(`🤖 ${_esc(name || email || '사용자')} — AI 진행 현황`) +
        connLine +
        `<div style="margin-top:6px;">${rows}</div>` +
        (roles ? '' : `<div style="color:#7a8aa5; font-size:11px; margin-top:12px; line-height:1.6;">이 사용자의 Claude Code 훅이 아직 서버로 연결되지 않았습니다.<br>아래 <b>내 PC 연결 설정</b>으로 훅을 등록하면 실시간 표시됩니다.</div>`) +
        `<button id="ai-setup-btn" style="margin-top:14px; width:100%; background:#2F6FED; color:#fff; border:none; border-radius:8px; padding:9px; font-family:monospace; font-size:12px; font-weight:bold; cursor:pointer;">⚙ 내 PC 연결 설정</button>` +
        _infoCloseBtn();
    const setupBtn = card.querySelector('#ai-setup-btn');
    if (setupBtn) setupBtn.onclick = () => openMonitorSetupModal();
    _wireInfoClose(card);
}

/** /api/org-users 1회 로드(이메일→조직정보 캐시). */
async function ensureOrgUsers() {
    if (orgUsersByEmail) return;
    orgUsersByEmail = new Map();
    try {
        const list = await fetch('/api/org-users').then(r => r.json());
        (Array.isArray(list) ? list : []).forEach(u => {
            if (u.email) orgUsersByEmail.set(u.email.toLowerCase(), { displayName: u.displayName || '', jobTitle: u.jobTitle || '' });
        });
    } catch { /* 실패 시 빈 캐시(로컬 정보로 폴백) */ }
}

/** Azure 조직 사용자 정보 패널 렌더. */
async function renderUserPanel(email, name) {
    const card = document.getElementById('avatar-info-card');
    if (!card) return;
    card.innerHTML = _infoHeader('👤 사용자 정보') + `<div style="color:#9fb3d1;">불러오는 중…</div>`;
    await ensureOrgUsers();
    if (!_openInfoPanel || _openInfoPanel.kind !== 'user' || _openInfoPanel.email !== (email || '').toLowerCase()) return; // 그새 닫힘/전환
    const key = (email || '').toLowerCase();
    const info = orgUsersByEmail && orgUsersByEmail.get(key);
    const av = [...personAvatarMap.values()].find(a => a.email === key);
    const dn = (info && info.displayName) || name || (av && av.displayName) || email || '사용자';
    const job = (info && info.jobTitle) || (av && av.department) || '';
    card.innerHTML = _infoHeader(`👤 ${_esc(dn)}`) +
        `<div style="margin-top:8px; line-height:2.0; font-size:13px;">
            <div><span style="color:#7a8aa5; display:inline-block; width:56px;">이메일</span>${_esc(email || '-')}</div>
            <div><span style="color:#7a8aa5; display:inline-block; width:56px;">직책</span>${_esc(job || '-')}</div>
            <div><span style="color:#7a8aa5; display:inline-block; width:56px;">조직</span>FORMATIONLABS · Azure AD</div>
        </div>` +
        (info ? '' : `<div style="color:#7a8aa5; font-size:11px; margin-top:12px;">Azure 조직 디렉터리에서 추가 정보를 찾지 못해 로컬 정보를 표시합니다.</div>`) +
        _infoCloseBtn();
    _wireInfoClose(card);
}

function openAiPanel(email, name) {
    _openInfoPanel = { kind: 'ai', email: (email || '').toLowerCase() };
    getInfoPopup().style.display = 'flex';
    renderAiPanel(email, name);
}

/** 클립보드 복사(HTTPS 보안 컨텍스트 → navigator.clipboard, 폴백 execCommand). */
function _copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* noop */ }
    ta.remove();
    return Promise.resolve();
}

/**
 * 내 PC ↔ 서버 연결 설정 모달.
 * ⚠ 브라우저는 OS 환경변수를 직접 못 쓴다 → 입력값으로 (1)복사용 명령 (2).bat 다운로드를 생성.
 * 사용자가 1회 실행하면 각 PC에 환경변수가 등록되어 훅이 서버로 전송된다.
 */
function openMonitorSetupModal(prefillEmail) {
    const acct = (typeof getAccount === 'function' && getAccount()) || null;
    const email = prefillEmail || (acct && acct.username) || '';
    const serverUrl = `${location.protocol}//${location.host}`;   // 현재 접속 서버(=전송 대상)

    let ov = document.getElementById('monitor-setup-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'monitor-setup-overlay';
        ov.style.cssText = `position:fixed; inset:0; z-index:1300; display:flex; align-items:center; justify-content:center; background:rgba(5,8,15,0.55);`;
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
    }
    ov.innerHTML = '';
    const card = document.createElement('div');
    card.style.cssText = `width:440px; max-width:92vw; max-height:86vh; overflow:auto; background:rgba(12,18,30,0.98); border:1px solid #2a3550; border-radius:14px; padding:20px 22px; font-family:monospace; color:#fff; box-shadow:0 12px 48px rgba(0,0,0,0.65);`;

    const field = (label, id, value, ph) => `
        <label style="display:block; margin:10px 0 4px; color:#9fb3d1; font-size:11px;">${label}</label>
        <input id="${id}" value="${_esc(value)}" placeholder="${ph || ''}" spellcheck="false"
            style="width:100%; box-sizing:border-box; background:#0e1526; color:#e6f0ff; border:1px solid #2a3550; border-radius:7px; padding:8px 10px; font-family:monospace; font-size:12px;">`;

    card.innerHTML = `
        <div style="font-size:15px; font-weight:bold; margin-bottom:2px;">⚙ 내 PC 에이전트 모니터링 연결</div>
        <div style="color:#7a8aa5; font-size:11px; line-height:1.6; margin-bottom:6px;">
            아래 값으로 <b>명령을 복사</b>해 터미널에 1회 실행하거나 <b>.bat 다운로드</b> 후 더블클릭하세요.<br>
            (브라우저는 PC 환경변수를 직접 등록할 수 없어 1회 실행이 필요합니다.)
        </div>
        ${field('서버 URL (전송 대상)', 'ms-url', serverUrl, 'https://metaoffice.fllab.internal')}
        ${field('내 이메일 (3D 로그인과 동일해야 아바타 매칭)', 'ms-user', email, 'hong@ctr.co.kr')}
        <label style="display:block; margin:10px 0 4px; color:#9fb3d1; font-size:11px;">역할</label>
        <select id="ms-role" style="width:100%; box-sizing:border-box; background:#0e1526; color:#e6f0ff; border:1px solid #2a3550; border-radius:7px; padding:8px 10px; font-family:monospace; font-size:12px;">
            <option value="developer">developer</option>
            <option value="devops">devops</option>
            <option value="qa">qa</option>
            <option value="pm">pm</option>
            <option value="leader">leader</option>
        </select>
        <label style="display:block; margin:12px 0 4px; color:#9fb3d1; font-size:11px;">생성된 설정 명령 (PowerShell)</label>
        <textarea id="ms-cmd" readonly rows="4" style="width:100%; box-sizing:border-box; background:#0a1120; color:#8affc0; border:1px solid #2a3550; border-radius:7px; padding:8px 10px; font-family:monospace; font-size:11px; resize:none;"></textarea>
        <div style="display:flex; gap:8px; margin-top:12px;">
            <button id="ms-copy"    style="flex:1; background:#2F6FED; color:#fff; border:none; border-radius:8px; padding:9px; font-family:monospace; font-size:12px; font-weight:bold; cursor:pointer;">📋 명령 복사</button>
            <button id="ms-dl"      style="flex:1; background:#1f8a3b; color:#fff; border:none; border-radius:8px; padding:9px; font-family:monospace; font-size:12px; font-weight:bold; cursor:pointer;">⬇ .bat 다운로드</button>
        </div>
        <button id="ms-close" style="margin-top:8px; width:100%; background:#26324d; color:#cfe0ff; border:none; border-radius:8px; padding:8px; font-family:monospace; font-size:12px; cursor:pointer;">닫기</button>
        <div style="color:#7a8aa5; font-size:10px; margin-top:8px;">설정 후 <b>새 터미널</b>에서 Claude Code를 재시작해야 적용됩니다.</div>`;
    ov.appendChild(card);

    const $ = (id) => card.querySelector(id);
    const buildCmd = () => {
        const url = $('#ms-url').value.trim();
        const usr = $('#ms-user').value.trim();
        const role = $('#ms-role').value;
        return `setx AGENT_MONITOR_URL  "${url}"\nsetx AGENT_MONITOR_USER "${usr}"\nsetx CLAUDE_ROLE        "${role}"`;
    };
    const buildBat = () => {
        const url = $('#ms-url').value.trim();
        const usr = $('#ms-user').value.trim();
        const role = $('#ms-role').value;
        return `@echo off\r\nchcp 65001 >nul\r\nsetx AGENT_MONITOR_URL "${url}"\r\nsetx AGENT_MONITOR_USER "${usr}"\r\nsetx CLAUDE_ROLE "${role}"\r\necho.\r\necho [완료] 새 터미널에서 Claude Code를 재시작하세요.\r\npause\r\n`;
    };
    const refresh = () => { $('#ms-cmd').value = buildCmd(); };
    ['#ms-url', '#ms-user', '#ms-role'].forEach(sel => $(sel).addEventListener('input', refresh));
    refresh();

    $('#ms-copy').onclick = () => {
        _copyText(buildCmd()).then(() => { $('#ms-copy').textContent = '✅ 복사됨'; setTimeout(() => { $('#ms-copy').textContent = '📋 명령 복사'; }, 1500); });
    };
    $('#ms-dl').onclick = () => {
        const blob = new Blob([buildBat()], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'metaoffice-monitor-setup.bat';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        ov.remove();                              // 설정 모달 닫고
        showBatInstallGuide($('#ms-user').value.trim());   // 큰 설치 안내창 표시
    };
    $('#ms-close').onclick = () => ov.remove();
}

/** .bat 다운로드 후 표시하는 '크게' 설치 안내 매뉴얼 — 용도·설치 단계·주의사항. */
function showBatInstallGuide(email) {
    let ov = document.getElementById('bat-guide-overlay');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'bat-guide-overlay';
    ov.style.cssText = `position:fixed; inset:0; z-index:1400; display:flex; align-items:center; justify-content:center; background:rgba(4,7,14,0.72); backdrop-filter:blur(3px);`;
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });

    const card = document.createElement('div');
    card.style.cssText = `width:600px; max-width:94vw; max-height:90vh; overflow:auto; background:linear-gradient(160deg,#0f1a2e,#0c1220); border:1px solid #34507f; border-radius:18px; padding:28px 30px; font-family:monospace; color:#eaf2ff; box-shadow:0 18px 64px rgba(0,0,0,0.7);`;

    card.innerHTML = `
        <div style="font-size:22px; font-weight:800; letter-spacing:0.5px; margin-bottom:4px;">📥 설정 파일이 다운로드되었습니다</div>
        <div style="color:#9fb3d1; font-size:13px; margin-bottom:18px;">아래 순서대로 <b style="color:#fff">실행(설치)</b>하면 연동이 완료됩니다.</div>

        <div style="background:rgba(47,111,237,0.12); border:1px solid #2F6FED55; border-radius:12px; padding:14px 16px; margin-bottom:18px;">
            <div style="font-size:14px; font-weight:bold; color:#8ab4ff; margin-bottom:6px;">💡 이게 무슨 설정인가요? (용도)</div>
            <div style="font-size:12.5px; line-height:1.75; color:#cfe0ff;">
                내 PC의 <b>Claude Code(AI 에이전트)</b>가 하는 작업(파일 편집·명령 실행 등)을
                이 모니터링 서버로 실시간 전송하도록 연결합니다.<br>
                설치하면 3D 오피스에서 <b>내 아바타 머리 위 🤖 AI 버튼</b>이 켜지고,
                클릭 시 <b>PM·LEAD·DEV·OPS·QA 역할별 진행 현황</b>이 실시간으로 보입니다.<br>
                즉, "누가 지금 무슨 AI 작업을 하는지"를 가상 오피스에서 함께 보기 위한 연결입니다.
            </div>
        </div>

        <div style="font-size:14px; font-weight:bold; color:#8affc0; margin-bottom:10px;">🛠 설치 순서</div>
        <ol style="margin:0 0 4px 20px; padding:0; font-size:13px; line-height:2.0; color:#eaf2ff;">
            <li><b>다운로드 폴더</b>에서 <code style="background:#0a1120; padding:2px 6px; border-radius:5px; color:#8affc0;">metaoffice-monitor-setup.bat</code> 를 찾습니다.</li>
            <li>파일을 <b>더블클릭</b>합니다. (관리자 권한 불필요)</li>
            <li>Windows 보안 경고가 뜨면 <b>추가 정보 → 실행</b> 을 누릅니다.</li>
            <li>검은 창에 <b style="color:#8affc0;">[완료]</b> 메시지가 뜨면 아무 키나 눌러 닫습니다.</li>
            <li><b>Claude Code</b> (와 터미널)를 <b>완전히 종료 후 재시작</b> 합니다. <span style="color:#8aa;">(환경변수 적용)</span></li>
            <li>이 3D 화면을 <b>새로고침</b> 하고, 내 아바타 <b>🤖 AI</b> 버튼이 초록으로 켜지는지 확인합니다.</li>
        </ol>

        <div style="background:rgba(255,193,7,0.10); border:1px solid #ffc10744; border-radius:10px; padding:11px 14px; margin:16px 0; font-size:12px; line-height:1.7; color:#ffe08a;">
            ⚠ <b>이메일이 정확해야 합니다.</b> 설정된 이메일<b style="color:#fff;">${email ? ` (${_esc(email)})` : ''}</b>은
            3D에서 로그인한 Azure 계정과 <b>동일</b>해야 내 아바타에 매칭됩니다.
        </div>

        <div style="color:#7a8aa5; font-size:11px; line-height:1.7; margin-bottom:16px;">
            · 설정 파일은 환경변수 3개(<code>AGENT_MONITOR_URL</code>, <code>AGENT_MONITOR_USER</code>, <code>CLAUDE_ROLE</code>)만 등록합니다.<br>
            · 브라우저는 보안상 PC 환경변수를 직접 못 바꾸므로 이 파일을 1회 실행하는 방식입니다.<br>
            · 연동 해제는 시스템 환경변수에서 위 3개를 삭제하면 됩니다.
        </div>

        <button id="bat-guide-close" style="width:100%; background:#2F6FED; color:#fff; border:none; border-radius:10px; padding:11px; font-family:monospace; font-size:13px; font-weight:bold; cursor:pointer;">확인했습니다</button>`;
    ov.appendChild(card);
    document.body.appendChild(ov);
    card.querySelector('#bat-guide-close').onclick = () => ov.remove();
}
function openUserPanel(email, name) {
    _openInfoPanel = { kind: 'user', email: (email || '').toLowerCase() };
    getInfoPopup().style.display = 'flex';
    renderUserPanel(email, name);
}

/** 아바타 머리 위 버튼 묶음(🤖 AI / 👤 정보) 생성. personId로 클릭 시 최신 아바타 조회. */
function makeAvatarButtons(personId) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute; transform:translateX(-50%); display:flex; gap:4px; pointer-events:auto; z-index:60;`;
    const mk = (txt, bg) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.style.cssText = `background:${bg}; color:#fff; border:none; border-radius:6px; padding:2px 7px; font-family:monospace; font-size:10px; font-weight:bold; cursor:pointer; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.4);`;
        return b;
    };
    const aiBtn = mk('🤖 AI', '#2F6FED');
    const userBtn = mk('👤 정보', '#6b7fa6');
    aiBtn.onclick = (e) => { e.stopPropagation(); const av = personAvatarMap.get(personId); if (av) openAiPanel(av.email, av.displayName); };
    userBtn.onclick = (e) => { e.stopPropagation(); const av = personAvatarMap.get(personId); if (av) openUserPanel(av.email, av.displayName); };
    wrap.appendChild(aiBtn); wrap.appendChild(userBtn);
    wrap._aiBtn = aiBtn;
    document.body.appendChild(wrap);
    return wrap;
}

/** WS agent-update 수신 시 사용자별 상태 누적 + 버튼 강조 + 열린 패널 라이브 갱신. */
function applyAgentUpdate(sessionId, role, state) {
    const email = (sessionId || '').toLowerCase();
    if (!email || email === 'default') return;   // default 세션은 기존 하단 패널 담당
    if (!avatarAgents.has(email)) avatarAgents.set(email, {});
    avatarAgents.get(email)[role] = state;
    // 연결 상태 갱신: 한 번이라도 이벤트 오면 connected, working이면 여운 타이머 리셋
    const conn = avatarConn.get(email) || { connected: true, lastWorkingAt: 0 };
    conn.connected = true;
    if (state && state.status === 'working') conn.lastWorkingAt = Date.now();
    avatarConn.set(email, conn);
    refreshAiButton(email);
    // 열린 AI 패널이 이 사용자면 즉시 갱신
    if (_openInfoPanel && _openInfoPanel.kind === 'ai' && _openInfoPanel.email === email) {
        const av = [...personAvatarMap.values()].find(a => a.email === email);
        renderAiPanel(email, av && av.displayName);
    }
}

/** 이메일에 해당하는 아바타 AI 버튼 색 갱신: 작업중(초록·여운) → 연결됨(파랑) → 미연결(기본). */
function refreshAiButton(email) {
    const av = [...personAvatarMap.values()].find(a => a.email === email);
    if (!av || !av.btnsEl || !av.btnsEl._aiBtn) return;
    const btn = av.btnsEl._aiBtn;
    const conn = avatarConn.get(email);
    const working = conn && (Date.now() - conn.lastWorkingAt < AI_WORK_LINGER_MS);
    if (working) {                          // 작업 중 — 초록 글로우
        btn.style.background = '#1f8a3b';
        btn.style.boxShadow = '0 0 10px #39ff14, 0 2px 6px rgba(0,0,0,0.4)';
        btn.textContent = '🤖 AI ●';
    } else if (conn && conn.connected) {    // 연결됨(대기) — 청록
        btn.style.background = '#1d6fa5';
        btn.style.boxShadow = '0 0 6px #29b6f6aa, 0 2px 6px rgba(0,0,0,0.4)';
        btn.textContent = '🤖 AI';
    } else {                                // 미연결 — 회색
        btn.style.background = '#5a6472';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
        btn.textContent = '🤖 AI';
    }
}

/** 서버에서 현재 세션 상태를 받아 복원(새로고침/재접속 시 버튼·패널 유지). */
async function restoreAgentStates() {
    try {
        const st = await fetch('/api/status').then(r => r.json());
        const sess = st && st.sessions;
        if (!sess) return;
        for (const sid of Object.keys(sess)) {
            const email = sid.toLowerCase();
            if (!email || email === 'default') continue;
            const roles = sess[sid];
            avatarAgents.set(email, { ...roles });
            const conn = { connected: true, lastWorkingAt: 0 };
            for (const r of Object.keys(roles)) {
                if (roles[r] && roles[r].status === 'working') conn.lastWorkingAt = Date.now();
            }
            avatarConn.set(email, conn);
        }
        // 아바타가 이미 있으면 버튼 즉시 갱신(없으면 1초 주기 타이머가 처리)
        avatarConn.forEach((_, email) => refreshAiButton(email));
    } catch { /* noop */ }
}

// 1초 주기: 작업 여운 만료 → 연결됨 색으로 자연 감쇠. 늦게 생성된 아바타 버튼도 반영.
setInterval(() => { avatarConn.forEach((_, email) => refreshAiButton(email)); }, 1000);

// 페이지 로드 시 서버 세션 상태 복원(새로고침해도 연결/작업 상태 유지).
restoreAgentStates();

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

// ============================================================
// 🏢 6실 오피스 단지 — 중정(中庭) 배치
// ============================================================
// 이 단지는 scene.add 최종 복원(위 envGroup 마무리) 이후에 생성되어 envGroup의
// -18 뒤로이동을 못 받아 CAFE 타워(2F 식당·3F 매점)와 월드좌표상 겹쳤다.
// 단지 전체(시각 Group·DEPT_ROOMS·동물 순찰 WP)를 아래 단일 오프셋으로 뒤(-z)로 민다.
const OFFICE_COMPLEX_OFFSET_Z = -16;
{
    // 블록 내부 scene.add(...) 호출을 officeComplexGroup으로 리다이렉트 → position.z 한 번으로 전체 이동.
    const officeComplexGroup = new THREE.Group();
    officeComplexGroup.position.z = OFFICE_COMPLEX_OFFSET_Z;
    _origSceneAdd(officeComplexGroup);
    const _preOCAdd = scene.add;
    scene.add = function (o) { officeComplexGroup.add(o); return scene; };

    const OCX = -35, OCZ = -25;
    const OCH = 3.2;
    const OWT = 0.18;
    const DW  = 2.8;
    const DH  = 2.4;

    const ocWallMat  = new THREE.MeshStandardMaterial({ color: 0xf0ece4, roughness: 0.85 });
    const ocRoofMat  = new THREE.MeshStandardMaterial({ color: 0x8d9fa8, roughness: 0.7, metalness: 0.2 });
    const ocFloorMat = new THREE.MeshStandardMaterial({ color: 0xdcd0b4, roughness: 0.9 });
    const ocCourtMat = new THREE.MeshStandardMaterial({ color: 0xc8bca0, roughness: 0.95 });
    const ocPathMat  = new THREE.MeshStandardMaterial({ color: 0xe0d4bc, roughness: 0.9 });
    const ocFrameMat = new THREE.MeshStandardMaterial({ color: 0x607d8b, roughness: 0.3, metalness: 0.5 });
    const ocGlassMat = new THREE.MeshPhysicalMaterial({ color: 0xadd8e6, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
    const ocDeskMat  = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.5 });
    const ocAccentMats = [
        new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: 0x6a1b9a, roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: 0xe65100, roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: 0x00838f, roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.7 }),
    ];

    function ocBx(w, h, d, mat) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.castShadow = true; m.receiveShadow = true;
        return m;
    }

    function ocSign(label, bgHex) {
        const cw = 256, ch = 64;
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const c2 = cv.getContext('2d');
        c2.fillStyle = bgHex || '#1a237e';
        c2.fillRect(0, 0, cw, ch);
        c2.fillStyle = '#ffffff';
        c2.font = 'bold 20px sans-serif';
        c2.textAlign = 'center'; c2.textBaseline = 'middle';
        c2.fillText(label, cw / 2, ch / 2);
        const m = new THREE.Mesh(
            new THREE.PlaneGeometry(2.4, 0.6),
            new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.5 })
        );
        return m;
    }

    function ocDesk(x, y, z, rot) {
        const g = new THREE.Group();
        const top = ocBx(1.6, 0.06, 0.8, ocDeskMat); top.position.y = 0.76;
        const l1 = ocBx(0.06, 0.76, 0.06, ocDeskMat); l1.position.set(-0.75, 0.38, -0.36);
        const l2 = ocBx(0.06, 0.76, 0.06, ocDeskMat); l2.position.set( 0.75, 0.38, -0.36);
        const l3 = ocBx(0.06, 0.76, 0.06, ocDeskMat); l3.position.set(-0.75, 0.38,  0.36);
        const l4 = ocBx(0.06, 0.76, 0.06, ocDeskMat); l4.position.set( 0.75, 0.38,  0.36);
        g.add(top, l1, l2, l3, l4);
        g.position.set(x, y, z);
        if (rot) g.rotation.y = rot;
        return g;
    }

    // ── 중정 바닥 ──────────────────────────────────────────
    const cyW = 16, cyD = 10;
    const courtFloor = ocBx(cyW, 0.12, cyD, ocCourtMat);
    courtFloor.position.set(OCX, 0.06, OCZ);
    scene.add(courtFloor);

    for (let i = -7; i <= 7; i += 2) {
        const tl = ocBx(0.05, 0.13, cyD, new THREE.MeshStandardMaterial({ color: 0xb0a488 }));
        tl.position.set(OCX + i, 0.07, OCZ);
        scene.add(tl);
    }

    function ocTree(x, z) {
        const g = new THREE.Group();
        const trunk = ocBx(0.18, 1.2, 0.18, new THREE.MeshStandardMaterial({ color: 0x795548 }));
        trunk.position.y = 0.6;
        const top1 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 7, 6), new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.9 }));
        top1.position.y = 1.6; top1.castShadow = true;
        const top2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 6), new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.9 }));
        top2.position.set(0.45, 1.9, 0.3); top2.castShadow = true;
        g.add(trunk, top1, top2);
        g.position.set(x, 0, z);
        scene.add(g);
    }
    ocTree(OCX - 5, OCZ - 3);
    ocTree(OCX + 5, OCZ - 3);
    ocTree(OCX - 5, OCZ + 3);
    ocTree(OCX + 5, OCZ + 3);

    const fountain = new THREE.Group();
    const fBase = ocBx(1.4, 0.25, 1.4, ocCourtMat); fBase.position.y = 0.125;
    const fPool = ocBx(1.2, 0.18, 1.2, new THREE.MeshStandardMaterial({ color: 0x5c9adb, roughness: 0.1, metalness: 0.3 }));
    fPool.position.y = 0.25;
    const fPillar = ocBx(0.15, 0.6, 0.15, ocFrameMat); fPillar.position.y = 0.55;
    fountain.add(fBase, fPool, fPillar);
    fountain.position.set(OCX, 0, OCZ);
    scene.add(fountain);

    function ocBench(x, z, ry) {
        const g = new THREE.Group();
        const seat = ocBx(1.2, 0.08, 0.38, new THREE.MeshStandardMaterial({ color: 0xa1887f }));
        seat.position.y = 0.46;
        const back = ocBx(1.2, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xa1887f }));
        back.position.set(0, 0.75, -0.16);
        const bl1 = ocBx(0.06, 0.46, 0.38, ocFrameMat); bl1.position.set(-0.55, 0.23, 0);
        const bl2 = ocBx(0.06, 0.46, 0.38, ocFrameMat); bl2.position.set( 0.55, 0.23, 0);
        g.add(seat, back, bl1, bl2);
        g.position.set(x, 0, z);
        g.rotation.y = ry || 0;
        scene.add(g);
    }
    ocBench(OCX - 6, OCZ, 0);
    ocBench(OCX + 6, OCZ, Math.PI);
    ocBench(OCX, OCZ - 3.5, Math.PI / 2);
    ocBench(OCX, OCZ + 3.5, -Math.PI / 2);

    // ── 방 생성 함수 ──────────────────────────────────────
    function ocRoom(cx2, cz2, rw, rd, openDir, label, accentMat, deskList, isCEO) {
        const g = new THREE.Group();
        const hw = rw / 2, hd = rd / 2;
        const wh = OCH, wy = wh / 2;

        const floor = ocBx(rw, 0.12, rd, ocFloorMat); floor.position.y = 0.06; g.add(floor);
        const roof  = ocBx(rw + OWT * 2, 0.2, rd + OWT * 2, ocRoofMat); roof.position.y = OCH + 0.1; g.add(roof);

        function sw(w, h, d, px, py, pz) {
            // 통유리 패널
            const glass = ocBx(w, h, d, ocGlassMat);
            glass.position.set(px, py, pz); g.add(glass);
            // 상단 프레임 레일
            const tw = Math.max(w, OWT) + 0.02, td = Math.max(d, OWT) + 0.02;
            const rail = ocBx(tw, 0.07, td, ocFrameMat);
            rail.position.set(px, h, pz); g.add(rail);
            // 수직 멀리언 (2 m 간격)
            const span = w > d ? w : d;
            const cnt = Math.max(0, Math.floor(span / 2) - 1);
            for (let i = 0; i < cnt; i++) {
                const t = -span / 2 + (i + 1) * (span / (cnt + 1));
                const mul = w > d
                    ? ocBx(0.07, h, OWT + 0.02, ocFrameMat)
                    : ocBx(OWT + 0.02, h, 0.07, ocFrameMat);
                mul.position.set(px + (w > d ? t : 0), py, pz + (w > d ? 0 : t));
                g.add(mul);
            }
        }
        function aw(w, h, d, px, py, pz) {
            // 통유리 + 액센트 상단 밴드 + 하단 베이스
            const glass = ocBx(w, h, d, ocGlassMat);
            glass.position.set(px, py, pz); g.add(glass);
            const tw = w + 0.02, td = d + 0.02;
            const band = ocBx(tw, 0.38, td, accentMat);
            band.position.set(px, h - 0.19, pz); g.add(band);
            const base = ocBx(tw, 0.16, td, accentMat);
            base.position.set(px, 0.08, pz); g.add(base);
            // 상단 레일
            const rail = ocBx(tw, 0.07, td, ocFrameMat);
            rail.position.set(px, h, pz); g.add(rail);
        }
        function doorWallZ(faceZ) {
            sw((rw - DW) / 2, wh, OWT, -(DW / 2 + (rw - DW) / 4), wy, faceZ);
            sw((rw - DW) / 2, wh, OWT,  (DW / 2 + (rw - DW) / 4), wy, faceZ);
            sw(DW, wh - DH, OWT, 0, DH + (wh - DH) / 2, faceZ);
            const gp1 = ocBx(0.06, DH, 0.3, ocGlassMat); gp1.position.set(-DW / 2 + 0.03, DH / 2, faceZ); g.add(gp1);
            const gp2 = ocBx(0.06, DH, 0.3, ocGlassMat); gp2.position.set( DW / 2 - 0.03, DH / 2, faceZ); g.add(gp2);
        }
        function doorWallX(faceX) {
            sw(OWT, wh, (rd - DW) / 2, faceX, wy, -(DW / 2 + (rd - DW) / 4));
            sw(OWT, wh, (rd - DW) / 2, faceX, wy,  (DW / 2 + (rd - DW) / 4));
            sw(OWT, wh - DH, DW, faceX, DH + (wh - DH) / 2, 0);
            const gp1 = ocBx(0.3, DH, 0.06, ocGlassMat); gp1.position.set(faceX, DH / 2, -DW / 2 + 0.03); g.add(gp1);
            const gp2 = ocBx(0.3, DH, 0.06, ocGlassMat); gp2.position.set(faceX, DH / 2,  DW / 2 - 0.03); g.add(gp2);
        }

        if (openDir === 'N') {
            doorWallZ( hd);
            aw(rw, wh, OWT, 0, wy, -hd);
            sw(OWT, wh, rd, -hw, wy, 0);
            sw(OWT, wh, rd,  hw, wy, 0);
        } else if (openDir === 'S') {
            doorWallZ(-hd);
            aw(rw, wh, OWT, 0, wy,  hd);
            sw(OWT, wh, rd, -hw, wy, 0);
            sw(OWT, wh, rd,  hw, wy, 0);
        } else if (openDir === 'W') {
            doorWallX(-hw);
            sw(OWT, wh, rd,  hw, wy, 0);
            aw(rw, wh, OWT, 0, wy,  hd);
            aw(rw, wh, OWT, 0, wy, -hd);
        } else {
            doorWallX( hw);
            sw(OWT, wh, rd, -hw, wy, 0);
            aw(rw, wh, OWT, 0, wy,  hd);
            aw(rw, wh, OWT, 0, wy, -hd);
        }

        for (const [sx, sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
            const col = ocBx(0.25, OCH, 0.25, ocFrameMat); col.position.set(sx * hw, OCH / 2, sz * hd); g.add(col);
        }

        const hexStr = '#' + accentMat.color.getHexString();
        const sign = ocSign(label, hexStr);
        if (openDir === 'S') { sign.position.set(0, DH + 0.45, -hd - 0.02); sign.rotation.y = Math.PI; }
        else if (openDir === 'N') { sign.position.set(0, DH + 0.45,  hd + 0.02); }
        else if (openDir === 'W') { sign.position.set(-hw - 0.02, DH + 0.45, 0); sign.rotation.y = -Math.PI / 2; }
        else                      { sign.position.set( hw + 0.02, DH + 0.45, 0); sign.rotation.y =  Math.PI / 2; }
        g.add(sign);

        if (deskList) { for (const [dx, dz, dr] of deskList) g.add(ocDesk(dx, 0, dz, dr)); }

        if (isCEO) {
            const carpet = ocBx(rw - 0.6, 0.02, rd - 0.6, new THREE.MeshStandardMaterial({ color: 0x7b1fa2, roughness: 0.98 }));
            carpet.position.y = 0.13; g.add(carpet);
            const bigDesk = ocBx(2.4, 0.08, 1.0, ocDeskMat); bigDesk.position.set(0, 0.82, -hd + 2.2); g.add(bigDesk);
            const sofa = ocBx(2.2, 0.5, 0.7, new THREE.MeshStandardMaterial({ color: 0x37474f }));
            sofa.position.set(0, 0.25, hd - 1.8); g.add(sofa);
            const ct = ocBx(0.8, 0.06, 0.5, ocDeskMat); ct.position.set(0, 0.38, hd - 2.5); g.add(ct);
        }

        g.position.set(cx2, 0, cz2);
        scene.add(g);
        return g;
    }

    // ── 6개 방 배치 ──────────────────────────────────────
    ocRoom(-39, -33.5, 8, 7, 'S', '솔루션 개발 1팀', ocAccentMats[0], [
        [-2.5, -0.8, 0], [0, -0.8, 0], [2.5, -0.8, 0],
        [-2.5,  1.5, Math.PI], [0,  1.5, Math.PI],
    ]);
    ocRoom(-31, -33.5, 8, 7, 'S', '솔루션 개발 2팀', ocAccentMats[1], [
        [-2.5, -0.8, 0], [0, -0.8, 0], [2.5, -0.8, 0],
        [-2.5,  1.5, Math.PI], [0,  1.5, Math.PI],
    ]);
    ocRoom(-48, -25, 10, 10, 'E', '대표님 사무실', ocAccentMats[2], [], true);
    ocRoom(-22, -25, 10, 10, 'W', '시스템 운영팀', ocAccentMats[3], [
        [-2.0, -2.5, 0], [0, -2.5, 0], [2.0, -2.5, 0],
        [-2.0,  0.0, 0], [0,  0.0, 0], [2.0,  0.0, 0],
        [-2.0,  2.5, 0], [0,  2.5, 0],
    ]);
    ocRoom(-39, -16.5, 8, 7, 'N', '인프라팀', ocAccentMats[4], [
        [-2.5,  0.8, Math.PI], [0,  0.8, Math.PI], [2.5,  0.8, Math.PI],
        [-2.5, -1.5, 0], [0, -1.5, 0],
    ]);
    ocRoom(-31, -16.5, 8, 7, 'N', '창고', ocAccentMats[5], [[0, 0.5, 0]]);

    // ── 중정 입구 게이트 ─────────────────────────────────
    const gateL = ocBx(0.3, OCH + 0.4, 0.3, ocFrameMat); gateL.position.set(OCX - 1.8, (OCH + 0.4) / 2, OCZ + cyD / 2 + 0.15); scene.add(gateL);
    const gateR = ocBx(0.3, OCH + 0.4, 0.3, ocFrameMat); gateR.position.set(OCX + 1.8, (OCH + 0.4) / 2, OCZ + cyD / 2 + 0.15); scene.add(gateR);
    const gateBeam = ocBx(3.6, 0.22, 0.22, ocFrameMat); gateBeam.position.set(OCX, OCH + 0.4, OCZ + cyD / 2 + 0.15); scene.add(gateBeam);
    const gateSign = ocSign('OFFICE COMPLEX', '#1a237e');
    gateSign.position.set(OCX, OCH + 0.1, OCZ + cyD / 2 + 0.28);
    scene.add(gateSign);

    // ── 남쪽 진입로 ──────────────────────────────────────
    const southPath = ocBx(3.6, 0.1, 8, ocPathMat);
    southPath.position.set(OCX, 0.05, OCZ + cyD / 2 + 4);
    scene.add(southPath);

    // ── 동물 순찰 웨이포인트 추가 (단지 이동 오프셋 반영) ───
    ANIMAL_PATROL_WPS.push(
        { x: -35, z: -25 + OFFICE_COMPLEX_OFFSET_Z },
        { x: -39, z: -31 + OFFICE_COMPLEX_OFFSET_Z },
        { x: -31, z: -31 + OFFICE_COMPLEX_OFFSET_Z },
        { x: -44, z: -25 + OFFICE_COMPLEX_OFFSET_Z },
        { x: -26, z: -25 + OFFICE_COMPLEX_OFFSET_Z },
        { x: -39, z: -19 + OFFICE_COMPLEX_OFFSET_Z },
        { x: -31, z: -19 + OFFICE_COMPLEX_OFFSET_Z },
    );

    scene.add = _preOCAdd;   // 오피스 단지 블록 종료 — scene.add 패치 복원
}

// 부서 → 3D 룸 좌표 매핑 (createPersonAvatar에서 참조)
// z에는 시각 이동과 동일한 OFFICE_COMPLEX_OFFSET_Z를 더해 아바타 스폰을 방 위치와 일치시킨다.
const DEPT_ROOMS = {
    '솔루션 개발 1팀': { x: -39, z: -33.5 + OFFICE_COMPLEX_OFFSET_Z },
    '솔루션 개발 2팀': { x: -31, z: -33.5 + OFFICE_COMPLEX_OFFSET_Z },
    '대표님 사무실':   { x: -48, z: -25   + OFFICE_COMPLEX_OFFSET_Z },
    '시스템 운영팀':   { x: -22, z: -25   + OFFICE_COMPLEX_OFFSET_Z },
    '인프라팀':        { x: -39, z: -16.5 + OFFICE_COMPLEX_OFFSET_Z },
    '창고':            { x: -31, z: -16.5 + OFFICE_COMPLEX_OFFSET_Z },
};

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
// 특정 사용자 → 검은수박 캐릭터 (요청: 102450@CTR.CO.KR).
// 로그인 자동아바타는 /api/me(=doohwan.kim@formationlabs.co.kr, 김두환)로 등록되므로 두 식별자를 모두 매칭한다.
const WATERMELON_IDS = ['102450@ctr.co.kr', 'doohwan.kim@formationlabs.co.kr'];
function isWatermelon(person) {
    const e = (person.email || '').toLowerCase().trim();
    const n = (person.name || '').toLowerCase().trim();
    return WATERMELON_IDS.includes(e) || WATERMELON_IDS.includes(n)
        || e.startsWith('102450@ctr') || n.includes('김두환') || n.includes('doohwan');
}

// 특정 사용자 → 부리부리몬(돼지) 캐릭터 (요청: 김수비).
function isBuriburimon(person) {
    const e = (person.email || '').toLowerCase().trim();
    const n = (person.name || '').toLowerCase().trim();
    return e.startsWith('106079@ctr') || e.includes('subi.kim') || n.includes('김수비') || n.includes('subi kim');
}

function createPersonAvatar(person) {
    const color = parseInt((person.color || '#4A90E2').replace('#', ''), 16);

    // 상세 캐릭터 모델 — person.id 해시로 외형(피부·머리색·헤어스타일·성별)을 결정적 다양화.
    // 같은 id 는 항상 같은 외형 → 새로고침·재접속에도 일관. 셔츠색만 person.color 반영(바지·신발 고정).
    // 특별 캐릭터: ZEPHONI='i' 문자 / 102450@CTR.CO.KR=검은수박 / 김수비=부리부리몬 / 나머지=상세 휴먼.
    const isZephoni = (person.name || '').trim().toUpperCase() === 'ZEPHONI';
    const personObj = isZephoni
        ? createICharacter(color)
        : isWatermelon(person)
            ? createWatermelonCharacter()
            : isBuriburimon(person)
                ? createBuriburimonCharacter()
                : createDetailedPerson(traitsFromSeed(person.id, color));
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

    // 부서 배치 우선 → person.position 변환 → 격자 기본 배치
    if (person.department && DEPT_ROOMS[person.department]) {
        const rm = DEPT_ROOMS[person.department];
        let seatIdx = 0;
        personAvatarMap.forEach(av => { if (av.department === person.department) seatIdx++; });
        const col = seatIdx % 3, row = Math.floor(seatIdx / 3);
        group.position.set(rm.x + col * 2.0 - 2.0, PERSON_GROUND_Y, rm.z + row * 2.0 - 1.0);
    } else if (person.position && (person.position.x !== undefined) && (person.position.y !== undefined)) {
        const s = personPosToScene(person.position);
        group.position.set(s.x, PERSON_GROUND_Y, s.z);
    } else {
        const idx = personAvatarMap.size;
        const targetX = -4 + (idx % 5) * 2;
        const targetZ = 7 + Math.floor(idx / 5) * 2;
        group.position.set(targetX, PERSON_GROUND_Y, targetZ);
    }

    _origSceneAdd(group);

    // HTML 레이블
    const labelEl = makePersonLabel(person.name, person.color || '#4A90E2');

    // P3: WS 세션 신분 가시성 매칭용 이메일 키(소문자 정규화)
    const _emailKey = (person.email || '').toLowerCase();

    const btnsEl = makeAvatarButtons(person.id);   // 머리 위 🤖 AI / 👤 정보 버튼

    personAvatarMap.set(person.id, { group, personObj, pickMeshes, badge, labelEl, bubbleEl: null, unreadCount: 0,
        meetingEl: null, preMeetingPos: null, meetingSeatIdx: -1, meetingJoinUrl: null, btnsEl,
        displayName: person.name, shirtColorHex: person.color || '#4A90E2',
        department: person.department || null, email: _emailKey });

    // P3: 세션 추적이 이미 시작된 상태(current-users 수신 후)라면, 신규 아바타 생성 시점에도
    // 온라인 여부를 즉시 반영한다(사람 아바타 생성 → user-joined 브로드캐스트 순서가 뒤바뀌는 경합 방지).
    if (_sessionTrackingActive) {
        const _isOnline = onlineEmails.has(_emailKey);
        group.visible = _isOnline;
        if (labelEl) labelEl.style.display = _isOnline ? '' : 'none';
    }
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
            if (av.btnsEl) av.btnsEl.remove();
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
            continue;
        }
        // 이름 변경(예: 서유지→ZEPHONI) 시 라벨·캐릭터 모델이 바뀌도록 아바타를 재생성한다.
        if (av.displayName !== person.name) {
            scene.remove(av.group);
            av.labelEl.remove();
            if (av.bubbleEl) av.bubbleEl.remove();
            if (av.meetingEl) av.meetingEl.remove();
            if (av.btnsEl) av.btnsEl.remove();
            if (av.meetingSeatIdx >= 0 && meetingSeats[av.meetingSeatIdx]) {
                meetingSeats[av.meetingSeatIdx].occupied = false;
            }
            personAvatarMap.delete(person.id);
            createPersonAvatar(person);
            continue;
        }
        // 위치 갱신 (드래그 중·키보드 이동 중·부서 배치 중이 아니면)
        if (person.position && (person.position.x !== undefined) && (person.position.y !== undefined)
            && !person.department) {
            const isMovingByKey = person.id === myPersonId && keysDown.size > 0;
            if (av !== draggingAvatar && !isMovingByKey) {
                const s = personPosToScene(person.position);
                if (person.id === myPersonId) {
                    // 자기 아바타: 즉시 반영(로컬 조작 기준). y(층 높이) 보존.
                    av.group.position.set(s.x, av.group.position.y, s.z);
                } else {
                    // 원격 아바타: 하드 스냅 대신 목표점만 갱신 → animate 루프가 부드럽게 보간 이동.
                    av.targetPos = { x: s.x, z: s.z };
                }
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

        // 머리 위 버튼(🤖 AI / 👤 정보) — 이름 라벨 위쪽. 숨김 상태(오프라인/1인칭 자기몸)는 함께 숨김.
        if (av.btnsEl) {
            const hidden = av.labelEl.style.display === 'none' || av.group.visible === false;
            av.btnsEl.style.display = hidden ? 'none' : 'flex';
            if (!hidden) {
                const bp = av.group.position.clone(); bp.y += 2.45;
                const bs = worldToScreen(bp);
                av.btnsEl.style.left = `${bs.x}px`;
                av.btnsEl.style.top  = `${bs.y}px`;
            }
        }

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
            const res = await fetch('/api/people', {
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
    const API_BASE = ''; // 같은 origin(상대경로)
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

        // 동물 클릭 우선 확인 (근처면 쓰다듬기+배까기, 아니면 재롱)
        const animalMeshes = [...dogState.pickMeshes, ...catState.pickMeshes];
        if (animalMeshes.length > 0) {
            const animalHits = raycaster.intersectObjects(animalMeshes);
            if (animalHits.length > 0) {
                startPetOrTrick(animalHits[0].object.userData.animalType);
                return;
            }
        }

        const mesh = pickAvatarMesh();
        if (!mesh) return;
        const id = mesh.userData.personId;
        const av = personAvatarMap.get(id);
        if (!av) return;

        // AI 진행 중인 아바타를 클릭하면 → 에이전트 활동 모달을 띄운다(선택/드래그 대신).
        const _ek = (av.email || '').toLowerCase();
        const _roles = avatarAgents.get(_ek);
        const _aiWorking = _roles && Object.values(_roles).some(s => s && s.status === 'working');
        if (_aiWorking) {
            openAiPanel(av.email, av.displayName);
            ev.preventDefault();
            return;
        }

        setSelectedAvatar(id);    // 클릭한 아바타를 선택(방향키 이동 대상)
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

        // 3D 씬 좌표 → 서버 position(2D px) 역변환 후 영속화 (키보드 이동과 공용)
        persistPersonPosition(id);
    }

    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
})();

// ---- 선택 아바타 방향키 이동 + 좌하단 토글 (게임식 이동) ----
// - 아바타를 클릭하면 선택된다(setupPersonDrag3D에서 setSelectedAvatar 호출).
// - 좌하단 토글 버튼(또는 M키)으로 이동 모드 on/off.
// - 이동 모드 on: 방향키가 카메라 패닝(OrbitControls) 대신 선택 아바타를 카메라 기준으로 이동.
//   off로 돌리면 controls.listenToKeyEvents로 방향키를 다시 카메라 패닝에 돌려준다.
// - 이동은 바닥 평면(y=PERSON_GROUND_Y)에서만 일어나고, 멈추면 서버에 위치를 영속화(드래그와 동일).

const AVATAR_MOVE_SPEED = 6;   // 초당 씬 유닛 이동 속도
const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// 3인칭 팔로우 카메라 — 아바타가 방향키(카메라 기준 상/하/좌/우)로 이동하는 동안,
// 카메라는 시야 각도·줌·높이를 그대로 둔 채 아바타를 따라 '평행 이동'만 한다.
// (카메라 회전이 없으므로 빙글빙글 돌지 않아 어지럽지 않다.) 멈추면 자유 시점으로 복귀.
const FOLLOW_TARGET_Y = 1.4;  // 카메라가 바라보는 지점 높이(아바타 눈높이 근처)
const FOLLOW_LERP     = 10;   // 팔로우 부드러움(클수록 빠르게 따라붙음)

// ---- 상호작용: 의자에 앉기 / 엘리베이터로 층 이동 (이동 모드 + 선택 아바타) ----
// SIT_RANGE·EV_RANGE·sitHintEl 은 animate() 호출보다 앞(위쪽 TDZ 안전 구역)에서 선언함.

/** 로컬 좌표 lp가 카페 건물 footprint 안인지 */
function insideCafe(lp) {
    return !!cafeBounds && lp.x >= cafeBounds.minX && lp.x <= cafeBounds.maxX
        && lp.z >= cafeBounds.minZ && lp.z <= cafeBounds.maxZ;
}

/** pos에서 range 이내의 가장 가까운 항목({x,z,y?}) 반환. yTol 지정 시 같은 층(y 근접)만 고려. */
function nearestInRange(pos, arr, range, yTol) {
    let best = null, bestD = range * range;
    for (const s of arr) {
        if (yTol != null && pos.y != null && Math.abs((s.y || 0) - pos.y) > yTol) continue;   // 다른 층 제외
        const dx = s.x - pos.x, dz = s.z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = s; }
    }
    return best;
}

/** Enter/Space: 엘리베이터 우선 → 앉기/일어서기 */
function avatarInteract() {
    if (!keyboardMoveEnabled || !selectedAvatarId) return;
    const av = personAvatarMap.get(selectedAvatarId);
    if (!av) return;
    if (sittingSeat) { standUp(); return; }
    // 아바타(월드) → 시설(envGroup 로컬): envGroup은 z만 오프셋. y(층)는 그대로.
    const lp = { x: av.group.position.x, y: av.group.position.y, z: av.group.position.z - envGroup.position.z };
    const seat = nearestInRange(lp, seats, SIT_RANGE, 1.5);          // 같은 층 좌석만
    const ev = insideCafe(lp) ? nearestInRange(lp, elevatorZones, EV_RANGE, 1.5) : null;
    const d2 = (o) => (o.x - lp.x) ** 2 + (o.z - lp.z) ** 2;
    // 둘 다 근처면 '더 가까운 것' 우선 (안마의자 옆에서 엘리베이터가 열리지 않도록)
    if (seat && ev) { if (d2(seat) <= d2(ev)) sitOn(av, seat); else openFloorMenu(); return; }
    if (seat) { sitOn(av, seat); return; }
    if (ev) { openFloorMenu(); return; }
    showSelectToast('가까운 의자·엘리베이터가 없습니다');
}

/** 좌석에 앉기: 좌석 위치·방향으로 스냅 + 앉은 자세 */
function sitOn(av, s) {
    sittingSeat = s;
    pressedMoveKeys.clear();
    av.group.position.set(s.x, s.y, s.z + envGroup.position.z);   // 좌석(로컬) → 아바타(월드)
    av.group.rotation.y = s.yaw;
    const po = av.personObj;
    if (po && po.legL) updatePersonAnimation(po, 'sitting', 100, 0, 0, false);
    showSelectToast('🪑 앉음 — 방향키 또는 Enter로 일어서기');
}

/** 일어서기: 서 있는 자세 복귀 + 현재 층 높이 유지 */
function standUp() {
    const av = selectedAvatarId && personAvatarMap.get(selectedAvatarId);
    const floorY = sittingSeat ? sittingSeat.y : PERSON_GROUND_Y;
    sittingSeat = null;
    if (av) { resetAvatarPose(selectedAvatarId); av.group.position.y = floorY; }
}

/** 엘리베이터 층 선택 모달 */
function openFloorMenu() {
    if (document.getElementById('elevator-menu')) return;
    const FLOORS = [
        { n: 1, label: '1F · 텐퍼센트 카페' },
        { n: 2, label: '2F · 식당' },
        { n: 3, label: '3F · 매점' },
        { n: 4, label: '4F · 바디프렌드' },
    ];
    const ov = document.createElement('div');
    ov.id = 'elevator-menu';
    ov.style.cssText = 'position:fixed; inset:0; z-index:1700; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); font-family:sans-serif;';
    const bx = document.createElement('div');
    bx.style.cssText = 'background:#1b1b1b; color:#eee; border:2px solid #00C853; border-radius:14px; padding:22px 26px; min-width:260px; text-align:center; box-shadow:0 12px 48px rgba(0,0,0,0.6);';
    bx.innerHTML = '<div style="font-size:18px; font-weight:800; margin-bottom:14px;">🛗 몇 층으로 이동하시겠어요?</div>';
    FLOORS.forEach((f) => {
        const b = document.createElement('button');
        b.textContent = f.label;
        b.style.cssText = 'display:block; width:100%; margin:6px 0; background:#2b2b2b; color:#fff; border:1px solid #00C853; border-radius:8px; padding:10px 14px; font-size:14px; cursor:pointer; font-family:inherit;';
        b.onmouseenter = () => { b.style.background = '#00693a'; };
        b.onmouseleave = () => { b.style.background = '#2b2b2b'; };
        b.onclick = () => { ov.remove(); gotoFloor(f.n); };
        bx.appendChild(b);
    });
    const cancel = document.createElement('button');
    cancel.textContent = '취소';
    cancel.style.cssText = 'margin-top:10px; background:#444; color:#ccc; border:none; border-radius:8px; padding:7px 16px; font-size:13px; cursor:pointer; font-family:inherit;';
    cancel.onclick = () => ov.remove();
    bx.appendChild(cancel);
    ov.appendChild(bx); document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
}

/** 선택 층으로 아바타 텔레포트 + 카메라 이동 */
function gotoFloor(n) {
    const av = selectedAvatarId && personAvatarMap.get(selectedAvatarId);
    if (!av) return;
    const c = floorCenters[n];
    if (!c) return;
    if (sittingSeat) standUp();
    pressedMoveKeys.clear();
    evMenuArmed = false;
    const wz = c.z + envGroup.position.z;   // 시설(로컬) → 월드 z
    av.group.position.set(c.x, c.y, wz);   // 해당 층 '센터'(월드)로 이동
    av.group.rotation.y = 0;
    persistPersonPosition(selectedAvatarId);
    // 카메라도 그 층 센터를 비추게(정면-상단에서 층 내부 조망)
    tweenView({ pos: [c.x + 3, c.y + 6, wz + 15], target: [c.x, c.y + 1.5, wz] }, 800);
    showSelectToast(`🛗 ${n}층 도착 — 층 센터`);
}

/** 하단 중앙 상호작용 힌트(의자/엘리베이터/앉음) — animate에서 매 프레임 */
function updateInteractHint() {
    if (!sitHintEl) {
        sitHintEl = document.createElement('div');
        sitHintEl.style.cssText = 'position:fixed; bottom:130px; left:50%; transform:translateX(-50%); z-index:1600;'
            + ' background:rgba(0,150,80,0.92); color:#fff; font-family:sans-serif; font-size:15px; font-weight:700; padding:9px 18px;'
            + ' border-radius:18px; pointer-events:none; display:none; box-shadow:0 4px 16px rgba(0,0,0,0.35);';
        document.body.appendChild(sitHintEl);
    }
    const show = (txt) => { sitHintEl.textContent = txt; sitHintEl.style.display = 'block'; };
    if (sittingSeat) { show('🪑 앉음 — 방향키 또는 Enter로 일어서기'); return; }
    // 선택된 아바타만 있으면 됨(이동 모드가 아니어도, 드래그로 발판에 올려도 동작)
    if (!selectedAvatarId) { sitHintEl.style.display = 'none'; evMenuArmed = true; return; }
    const av = personAvatarMap.get(selectedAvatarId);
    if (!av) { sitHintEl.style.display = 'none'; return; }
    const lp = { x: av.group.position.x, y: av.group.position.y, z: av.group.position.z - envGroup.position.z };   // 월드 → 시설 로컬
    const seat = nearestInRange(lp, seats, SIT_RANGE, 1.5);          // 같은 층 좌석만
    const ev = insideCafe(lp) ? nearestInRange(lp, elevatorZones, EV_RANGE, 1.5) : null;
    const d2 = (o) => (o.x - lp.x) ** 2 + (o.z - lp.z) ** 2;
    const evCloser = ev && (!seat || d2(ev) < d2(seat));   // 좌석이 더 가까우면 엘리베이터 자동팝업 억제
    if (ev && evCloser) {
        if (evMenuArmed && !document.getElementById('elevator-menu')) { evMenuArmed = false; openFloorMenu(); }
        show('🛗 엘리베이터 — 층을 선택하세요');
        return;
    }
    evMenuArmed = true;   // 발판을 벗어나면 자동 오픈 재장전
    if (keyboardMoveEnabled && seat) { show('🪑 Enter로 앉기'); return; }
    sitHintEl.style.display = 'none';
}

/** 3D 씬 좌표 → 서버 position(2D px) 역변환 후 영속화 (드래그·키보드 이동 공용) */
function persistPersonPosition(id) {
    const av = personAvatarMap.get(id);
    if (!av) return;
    const pos = scenePosToPerson(av.group.position.x, av.group.position.z);
    fetch(`/api/people/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: pos }),
    }).catch(() => {});
}

/** 아바타 걷기 자세를 기본(정지) 자세로 되돌린다(상세 캐릭터만). */
function resetAvatarPose(id) {
    const av = personAvatarMap.get(id);
    if (!av) return;
    const po = av.personObj;
    if (!po || !po.armL || !po.legL) return;
    updatePersonAnimation(po, 'standing', 100, 0, 0, false);   // 미처리 phase → 사지 중립 복귀
    if (po.pelvis) po.pelvis.position.y = 0.9;                  // 걷기 중 바뀐 골반 높이 원복
}

/** 선택 링(하이라이트)을 현재 선택·모드 상태에 맞게 부착/표시한다(모드 on + 선택됨일 때만 표시). */
function refreshSelectionRing() {
    if (!selectionRing) return;
    if (selectionRing.parent) selectionRing.parent.remove(selectionRing);
    if (keyboardMoveEnabled && selectedAvatarId) {
        const av = personAvatarMap.get(selectedAvatarId);
        if (av) av.group.add(selectionRing);   // 그룹의 자식 → 아바타를 따라다님
    }
}

/** 아바타 선택 변경 + 마커/버튼 갱신 + 토스트 안내 */
function setSelectedAvatar(id) {
    selectedAvatarId = id;
    refreshSelectionRing();
    updateMoveToggleLabel();
    const av = id && personAvatarMap.get(id);
    if (av) showSelectToast(`▶ ${av.displayName || '아바타'} 선택됨 — 방향키로 이동`);
}

/** 카메라 주시점(controls.target)에서 가장 가까운 아바타 id */
function nearestAvatarId() {
    let best = null, bestD = Infinity;
    for (const [id, av] of personAvatarMap) {
        const d = av.group.position.distanceToSquared(controls.target);
        if (d < bestD) { bestD = d; best = id; }
    }
    return best;
}

/** 화면 상단 중앙 토스트(선택/안내). 1.8초 후 사라짐. */
function showSelectToast(msg) {
    let el = document.getElementById('avatar-sel-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'avatar-sel-toast';
        el.style.cssText = 'position:fixed; top:64px; left:50%; transform:translateX(-50%); z-index:1600;'
            + ' background:rgba(0,190,225,0.95); color:#04222a; font-family:sans-serif; font-weight:700;'
            + ' font-size:14px; padding:9px 18px; border-radius:20px; box-shadow:0 4px 16px rgba(0,0,0,0.35);'
            + ' pointer-events:none; transition:opacity 0.3s; opacity:0;';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

/** 선택 마커 애니메이션(머리 위 핀 바운스·회전 + 바닥 링 펄스) — animate에서 매 프레임 */
function updateSelectionIndicator(elapsed) {
    if (!selectionRing || !selectionRing.parent) return;
    const pin = selectionRing.userData.pin, ring = selectionRing.userData.ring;
    pin.position.y = 2.75 + Math.sin(elapsed * 3) * 0.14;      // 위아래 바운스
    pin.rotation.y = elapsed * 2.0;                            // 회전(반짝이듯)
    const s = 1 + Math.sin(elapsed * 3) * 0.14;               // 링 펄스
    ring.scale.set(s, s, 1);
    ring.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 3));
}

/** 좌하단 토글 버튼 라벨/상태 갱신 */
function updateMoveToggleLabel() {
    const btn = document.getElementById('avatar-move-toggle');
    if (!btn) return;
    const on = keyboardMoveEnabled;
    const sel = selectedAvatarId && personAvatarMap.get(selectedAvatarId);
    const who = sel ? (sel.displayName || '선택됨') : null;
    let sub;
    if (!on) sub = '<span style="color:#aaa">M 키 또는 클릭으로 켜기</span>';
    else if (who) sub = `<span style="color:#00E5FF">● ${who}</span> <span style="color:#aaa">방향키로 이동</span>`;
    else sub = '<span style="color:#ffd600">아바타를 클릭해 선택하세요</span>';
    btn.innerHTML = `🎮 방향키 이동: <b style="color:${on ? '#0f0' : '#f66'}">${on ? 'ON' : 'OFF'}</b>`
        + `<div style="font-size:11px;margin-top:3px">${sub}</div>`;
    btn.style.borderColor = on ? (who ? '#00E5FF' : '#0f0') : '#555';
}

/** 이동 모드 on/off 토글. force(boolean) 지정 시 그 값으로 설정. */
function toggleAvatarMove(force) {
    keyboardMoveEnabled = (typeof force === 'boolean') ? force : !keyboardMoveEnabled;
    if (keyboardMoveEnabled) {
        controls.stopListenToKeyEvents();    // 방향키를 카메라 패닝에서 회수
        // 켜면 (선택이 없을 때) 가까운 아바타를 자동 선택해 즉시 이동 가능하게
        if (!selectedAvatarId) {
            const nid = nearestAvatarId();
            if (nid) setSelectedAvatar(nid);
            else showSelectToast('이동할 사람 아바타가 없습니다');
        } else {
            setSelectedAvatar(selectedAvatarId);   // 현재 선택을 토스트로 재안내
        }
    } else {
        controls.listenToKeyEvents(window);  // 방향키를 카메라 패닝으로 복귀
        pressedMoveKeys.clear();
        if (selectedAvatarId) {
            persistPersonPosition(selectedAvatarId);   // 종료 시 최종 위치 저장
            resetAvatarPose(selectedAvatarId);         // 걷기 → 정지 자세
        }
    }
    refreshSelectionRing();
    updateMoveToggleLabel();
}

/** 프레임 단위 아바타 이동 (animate에서 매 프레임 호출). elapsed: 걷기 모션 위상용 누적 시간 */
function updateAvatarKeyboardMove(delta, elapsed) {
    if (!keyboardMoveEnabled || !selectedAvatarId || pressedMoveKeys.size === 0) return;
    const av = personAvatarMap.get(selectedAvatarId);
    if (!av || av === draggingAvatar) return;   // 드래그 중이면 키 이동 양보
    if (sittingSeat) return;                     // 앉은 상태면 이동 안 함(방향키는 keydown에서 기립 처리)

    // 입력(카메라 기준): ↑ 화면 안쪽(카메라 전방), ↓ 뒤, ← 좌, → 우
    let inF = 0, inR = 0;
    if (pressedMoveKeys.has('ArrowUp'))    inF += 1;
    if (pressedMoveKeys.has('ArrowDown'))  inF -= 1;
    if (pressedMoveKeys.has('ArrowRight')) inR += 1;
    if (pressedMoveKeys.has('ArrowLeft'))  inR -= 1;
    if (inF === 0 && inR === 0) return;

    // 카메라의 지면 전방/우측 벡터(y평면 투영) — 화면에 보이는 방향과 일치
    let fwdX = controls.target.x - camera.position.x;
    let fwdZ = controls.target.z - camera.position.z;
    const fl = Math.hypot(fwdX, fwdZ) || 1;
    fwdX /= fl; fwdZ /= fl;
    const rgtX = -fwdZ, rgtZ = fwdX;   // 전방 × up = 화면 우측

    // 카메라 기준 이동 벡터 → 정규화 → 속도 적용
    let mx = fwdX * inF + rgtX * inR;
    let mz = fwdZ * inF + rgtZ * inR;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;
    const step = AVATAR_MOVE_SPEED * delta;
    const prevY = av.group.position.y;
    const onUpperFloor = prevY > 1.5;   // 2층 이상(슬래브 위)
    let nx = av.group.position.x + mx * step;
    let nz = av.group.position.z + mz * step;
    // 상층에서는 건물 안(footprint)으로 이동 제한 → 밖으로 나가 1층으로 떨어지는 것 방지(건물 내부에서만 이동).
    if (onUpperFloor && cafeBounds) {
        const off = envGroup.position.z;
        const wMinX = cafeBounds.minX + 0.4, wMaxX = cafeBounds.maxX - 0.4;
        const wMinZ = cafeBounds.minZ + off + 0.4, wMaxZ = cafeBounds.maxZ + off - 0.4;
        const px = av.group.position.x, pz = av.group.position.z;
        const prevInside = px >= wMinX - 0.6 && px <= wMaxX + 0.6 && pz >= wMinZ - 0.6 && pz <= wMaxZ + 0.6;
        if (prevInside) {   // 이미 건물 안일 때만 제한(외부 계단 등은 예외)
            nx = Math.min(Math.max(nx, wMinX), wMaxX);
            nz = Math.min(Math.max(nz, wMinZ), wMaxZ);
        }
    }
    av.group.position.x = nx;
    av.group.position.z = nz;

    // 발밑 높이: 걸어다닐 수 있는 면(슬래브·계단·데크·플랫폼) 위로 스냅
    const STEP_UP = 0.55;
    _rayOrigin.set(nx, prevY + STEP_UP, nz);
    _downRay.set(_rayOrigin, _downDir);
    _downRay.far = STEP_UP + 8;
    const hits = _downRay.intersectObjects(walkables, false);
    if (hits.length) av.group.position.y = hits[0].point.y;
    else if (!onUpperFloor) av.group.position.y = PERSON_GROUND_Y;   // 지상=지면 / 상층=이전 y 유지(낙하 방지)

    // 아바타 메시가 이동 방향을 바라보게 부드럽게 회전(+z가 정면)
    const wantRY = Math.atan2(mx, mz);
    let dRY = wantRY - av.group.rotation.y;
    dRY = Math.atan2(Math.sin(dRY), Math.cos(dRY));                        // 최단 회전각
    av.group.rotation.y += dRY * (1 - Math.exp(-12 * delta));

    // 걷기 모션(양팔·다리 흔들기) — 팔·다리 구조가 있는 상세 캐릭터에만 적용
    const po = av.personObj;
    if (po && po.armL && po.legL) {
        updatePersonAnimation(po, 'leisure-walking', 100, elapsed, delta, false);
    }

    // ---- 팔로우 카메라: 시야 각도·줌·높이 유지, 아바타를 따라 평행 이동만 (회전 없음 → 어지럼 없음) ----
    // controls.target을 아바타 눈높이로 부드럽게 옮기고, 카메라도 '타깃 이동량만큼' 함께 옮겨
    // 상대 오프셋(각도·거리·높이)을 그대로 유지한다. (controls.update() 뒤에 호출되어 이번 프레임에 반영)
    // 단, 접근/1인칭 뷰 모드에서는 updateAvatarCamera가 카메라를 전담하므로 여기선 스킵(충돌 방지).
    if (avatarViewMode !== 'tower') return;
    const desired = new THREE.Vector3(av.group.position.x, av.group.position.y + FOLLOW_TARGET_Y, av.group.position.z);
    const a = 1 - Math.exp(-FOLLOW_LERP * delta);   // 프레임레이트 독립 스무딩
    const prevTX = controls.target.x, prevTY = controls.target.y, prevTZ = controls.target.z;
    controls.target.lerp(desired, a);
    camera.position.x += controls.target.x - prevTX;
    camera.position.y += controls.target.y - prevTY;
    camera.position.z += controls.target.z - prevTZ;
}

// 방향키 keydown/keyup — 이동 모드일 때만 방향키를 소비한다.
// capture 단계에서 처리해 OrbitControls보다 먼저 가로챈다(stopListenToKeyEvents로 이미 해제되지만 이중 안전).
window.addEventListener('keydown', (e) => {
    // M 키: 이동 모드 토글 (입력 필드 포커스 중이면 무시)
    if (e.code === 'KeyM') {
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!typing) { toggleAvatarMove(); return; }
    }
    // Enter: 앉기/일어서기 · 엘리베이터 층 선택(수동) — 상태별 안내 포함
    if (e.code === 'Enter') {
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!typing && !document.getElementById('elevator-menu')) {
            e.preventDefault();
            if (!keyboardMoveEnabled) { showSelectToast('먼저 M키(또는 🎮 버튼)로 이동 모드를 켜세요'); return; }
            if (!selectedAvatarId) { showSelectToast('이동할 아바타를 클릭해 선택하세요'); return; }
            avatarInteract();
            return;
        }
    }
    if (keyboardMoveEnabled && MOVE_KEYS.has(e.code) && !_isTyping()) {
        e.preventDefault();
        e.stopPropagation();
        if (sittingSeat) standUp();                    // 앉은 상태에서 방향키 → 먼저 일어섬
        if (selectedAvatarId) pressedMoveKeys.add(e.code);
    }
}, true);

window.addEventListener('keyup', (e) => {
    if (MOVE_KEYS.has(e.code) && pressedMoveKeys.has(e.code)) {
        pressedMoveKeys.delete(e.code);
        if (pressedMoveKeys.size === 0 && selectedAvatarId) {
            persistPersonPosition(selectedAvatarId);   // 이동을 멈추면 위치 저장
            resetAvatarPose(selectedAvatarId);         // 걷기 → 정지 자세
        }
    }
});

// 선택 하이라이트 마커 (머리 위 핀 + 바닥 링) 생성 — 크게 눈에 띄게
(function initSelectionMarker() {
    selectionRing = new THREE.Group();   // 이제 마커 그룹(링 + 핀)
    // 바닥 링(펄스)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 32),
        new THREE.MeshBasicMaterial({ color: 0x00E5FF, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    selectionRing.add(ring);
    // 머리 위 역삼각 핀(아래를 가리킴, 바운스·회전)
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 4), new THREE.MeshBasicMaterial({ color: 0x00E5FF }));
    pin.rotation.x = Math.PI; pin.position.y = 2.75;
    selectionRing.add(pin);
    selectionRing.userData.ring = ring;
    selectionRing.userData.pin = pin;
})();

// 좌하단 토글 버튼 생성
(function initMoveToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'avatar-move-toggle';
    btn.style.cssText = [
        'position:absolute', 'left:10px', 'bottom:10px', 'z-index:20',
        'background:rgba(0,0,0,0.6)', 'color:#fff', 'border:1px solid #555',
        'border-radius:8px', 'padding:8px 12px', 'font-family:monospace',
        'font-size:12px', 'cursor:pointer', 'backdrop-filter:blur(4px)',
        'text-align:left', 'min-width:190px',
    ].join(';');
    btn.addEventListener('click', () => toggleAvatarMove());
    document.body.appendChild(btn);
    updateMoveToggleLabel();
})();

// ---- WebSocket ----
// 에이전트별 직전 상태(working/idle) — working→idle 전이 시 '에이전트 완료' OS 알림용
const _lastAgentStatus = {};

// 알림 클릭 시 특정 인물 아바타로 카메라를 이동(METAOFFICE 기능 연결)
function focusAvatar(personId) {
    const av = personId && personAvatarMap.get(personId);
    if (!av || !controls || !camera) return;
    const p = av.group.position;
    controls.target.set(p.x, p.y + 1.2, p.z);
    camera.position.set(p.x + 6, p.y + 7, p.z + 6);
    controls.update();
}

// P3: WS 세션 신분 모델 — 모듈 변수
let _ws = null;                      // 현재 WS 인스턴스(재접속 시 재등록에 사용)
const onlineEmails = new Set();      // 현재 세션에 접속 중인 사용자 이메일(소문자) 집합
let _sessionTrackingActive = false;  // current-users 최초 수신 후 true(그 전까지는 하위호환으로 전원 표시)

function connectWS() {
    // 같은 origin WebSocket — HTTPS(nginx)면 wss, 로컬 http면 ws. 포트는 location.host가 자동 포함.
    _ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
    _ws.onopen = () => {
        document.getElementById('conn-status').textContent = 'Connected';
        document.getElementById('conn-status').style.color = '#0f0';
        // P3: 재접속 시에도(로그인 상태 유지 중이면) 즉시 세션 신분 재등록
        const acct = getAccount();
        if (acct) _sendUserJoin(acct);
        restoreAgentStates();   // 재접속 시 서버 세션 상태 복원(버튼/패널 유지)
    };
    _ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.type === 'init') {
            Object.entries(d.agents).forEach(([r, s]) => {
                updateAgentState(r, s);
                _lastAgentStatus[r] = s.status;   // 초기 상태는 알림 없이 기록
            });
        } else if (d.type === 'agent-update') {
            // 사용자별(sessionId=이메일) 상태 → 아바타 머리 위 🤖 AI 버튼/패널에 반영
            applyAgentUpdate(d.sessionId, d.agent, d.state);
            // default 세션은 기존 하단 상태 패널 유지(하위호환)
            if (!d.sessionId || d.sessionId === 'default') {
                const prev = _lastAgentStatus[d.agent];
                updateAgentState(d.agent, d.state);
                const now = d.state && d.state.status;
                // working → idle 전이 = 에이전트 작업 완료 → OS 알림
                if (prev === 'working' && now === 'idle') {
                    notify('agent', `ZEPHONI ADK — ${(d.state && d.state.role) || d.agent} 완료`, '에이전트가 작업을 마쳤습니다.', { tag: `agent-${d.agent}` });
                }
                _lastAgentStatus[d.agent] = now;
            }
        } else if (d.type === 'people-update') {
            syncPersonAvatars(d.people);
        } else if (d.type === 'teams-notification') {
            showTeamsNotification3D(d);
            handleTeamsNotification(d);   // CHAT-01: 열린 채팅창 즉시 갱신·닫힌 방 안읽음 배지
            // OS 알림(chat): 해당 채팅을 지금 보고 있지 않을 때만 (in-app 말풍선과 중복 억제)
            const chatId = d.message && d.message.chatId;
            if (!(isChatOpen(chatId) && !document.hidden)) {
                notify('chat', (d.message && d.message.senderName) || '새 메시지',
                    ((d.message && d.message.text) || '').slice(0, 120),
                    { tag: `chat-${chatId || 'x'}`, renotify: true,
                      onClick: () => { if (chatId) openChat(chatId, d.personName || (d.message && d.message.senderName) || '채팅'); } });
            }
        } else if (d.type === 'meeting-status') {
            handleMeetingStatus(d);
            // OS 알림(meeting): 회의 시작 시 (meeting-status는 상태 변화 시에만 broadcast됨)
            if (d.inMeeting) {
                notify('meeting', `${d.personName || '화상회의'}`,
                    d.subject ? `회의: ${d.subject}` : '화상회의가 시작되었습니다.',
                    { tag: `meeting-${d.personId || 'x'}`, onClick: () => focusAvatar(d.personId) });
            }
        } else if (d.type === 'order-reminder') {
            // ORDER-01: 월 09:00 — 음료 고르기 알림(클릭 시 메뉴 오픈)
            notify('system', '텐퍼센트 커피 주문', '오늘 마실 음료를 골라 주문에 담아주세요! (마감 09:18)',
                { tag: 'order-reminder', ttl: 15000, onClick: () => { if (window.__showCafeMenu) window.__showCafeMenu(); } });
        } else if (d.type === 'order-deadline') {
            // ORDER-01: 월 09:18 — 주문 마감 알림창 + OS 알림
            notify('system', '커피 주문 마감', '09:20에 MOM방으로 주문이 공유됩니다.', { tag: 'order-deadline', ttl: 15000 });
            if (window.__orderDeadlineAlert) window.__orderDeadlineAlert();
        } else if (d.type === 'order-cleared') {
            // ORDER-01: 월 10:00 — 주문 목록 clear
            if (window.__clearOrders) window.__clearOrders();
        } else if (d.type === 'mealplan-reminder') {
            // MEALPLAN-01: 평일 12:00 — 점심 전 식단표 알림(클릭 시 오버레이)
            notify('system', '오늘 점심 메뉴', '2층 식당 이번 주 식단표를 확인하세요!',
                { tag: 'mealplan-reminder', ttl: 15000, onClick: () => { if (window.__showMealPlan) window.__showMealPlan(); } });
        } else if (d.type === 'mealplan-updated') {
            // MEALPLAN-01: 식단표 이미지 갱신됨 — 오버레이가 열려 있으면 다시 로드
            if (window.__reloadMealPlan) window.__reloadMealPlan();
        } else if (d.type === 'current-users') {
            // P3: 세션 추적 시작 — 현재 온라인 사용자 목록으로 전체 아바타 가시성 초기화
            _sessionTrackingActive = true;
            onlineEmails.clear();
            (d.users || []).forEach(u => { if (u.email) onlineEmails.add(u.email.toLowerCase()); });
            _applySessionVisibilityAll();
        } else if (d.type === 'user-joined') {
            // P3: 신규 사용자 접속 — 해당 이메일 아바타만 표시
            if (d.user && d.user.email) {
                onlineEmails.add(d.user.email.toLowerCase());
                _applySessionVisibilityForEmail(d.user.email);
            }
        } else if (d.type === 'user-left') {
            // P3: 사용자 퇴장 — 해당 이메일 아바타 비가시(people.json 삭제 아님)
            if (d.email) {
                onlineEmails.delete(d.email.toLowerCase());
                _applySessionVisibilityForEmail(d.email);
            }
        }
    };
    _ws.onclose = () => { document.getElementById('conn-status').textContent = 'Reconnecting...'; document.getElementById('conn-status').style.color = '#f00'; setTimeout(connectWS, 3000); };
}
connectWS();

// ---- P3 세션 신분 헬퍼 ----

/**
 * 본인 MSAL 프로필로 서버에 세션 신분을 등록한다.
 * 보안: oid/email/displayName/color만 전송 — access token은 절대 포함하지 않는다(신분 격리 원칙).
 */
function _sendUserJoin(account) {
    if (!_ws || _ws.readyState !== 1) return;
    _ws.send(JSON.stringify({
        type: 'user-join',
        profile: {
            oid: account.localAccountId || account.homeAccountId || account.username,
            displayName: account.name || account.username || '',
            email: (account.username || '').toLowerCase(),
            color: '#00B7C3',
        },
    }));
}

/** 특정 이메일의 아바타만 현재 onlineEmails 상태에 맞춰 가시성 갱신. */
function _applySessionVisibilityForEmail(email) {
    if (!_sessionTrackingActive || !email) return;
    const lEmail = email.toLowerCase();
    const isOnline = onlineEmails.has(lEmail);
    for (const [, av] of personAvatarMap) {
        if ((av.email || '') === lEmail) {
            av.group.visible = isOnline;
            if (av.labelEl) av.labelEl.style.display = isOnline ? '' : 'none';
        }
    }
}

/** 전체 아바타를 현재 onlineEmails 상태에 맞춰 일괄 가시성 갱신(current-users 수신 시). */
function _applySessionVisibilityAll() {
    if (!_sessionTrackingActive) return;
    for (const [, av] of personAvatarMap) {
        const isOnline = onlineEmails.has(av.email || '');
        av.group.visible = isOnline;
        if (av.labelEl) av.labelEl.style.display = isOnline ? '' : 'none';
    }
}

// ---- 인앱 Teams 채팅 UI 초기화 (CHAT-01) ----
initChatPanel({ apiBase: '' }); // 같은 origin(상대경로)

// ---- Windows(OS) 데스크톱 알림 초기화 (chat/agent/meeting/system, 클릭 시 기능 연결) ----
initNotifications();

// ---- VIEW 선택 UI (타워 / 접근 / 1인칭) — 상단 중앙, #info 바로 아래 ----
(function createViewSwitcher() {
    const wrap = document.createElement('div');
    wrap.id = 'view-switcher';
    wrap.style.cssText = `
        position:fixed; top:48px; left:50%; transform:translateX(-50%); z-index:850;
        display:flex; gap:6px; background:rgba(0,0,0,0.55); backdrop-filter:blur(4px);
        border:1px solid #2a3550; border-radius:10px; padding:5px 6px; font-family:monospace;`;
    const OPTS = [
        { view: 'tower',    label: '🗼 타워',   title: '멀리서 조망 (자유 카메라)' },
        { view: 'approach', label: '🎥 접근',   title: '아바타 뒤에서 따라가는 3인칭' },
        { view: 'fpv',      label: '👤 1인칭',  title: '아바타 시점 (FPV)' },
    ];
    OPTS.forEach(({ view, label, title }) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.title = title;
        b.setAttribute('data-view', view);
        b.style.cssText = `
            background:rgba(255,255,255,0.08); color:#cfe0ff; border:none; border-radius:7px;
            padding:6px 11px; font-family:monospace; font-size:12px; cursor:pointer; white-space:nowrap;`;
        b.onclick = () => setAvatarViewMode(view);
        wrap.appendChild(b);
    });
    // 🏠 위치 초기화 버튼 — 잘못된 곳에 끼었을 때 홈으로 복귀 (단축키 H와 동일)
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🏠 초기화';
    resetBtn.title = '아바타 위치 초기화 (단축키: H)';
    resetBtn.style.cssText = `
        background:rgba(255,255,255,0.08); color:#ffd8a8; border:none; border-radius:7px;
        padding:6px 11px; font-family:monospace; font-size:12px; cursor:pointer; white-space:nowrap;
        margin-left:4px; border-left:1px solid #2a3550;`;
    resetBtn.onclick = () => resetSelfPosition();
    wrap.appendChild(resetBtn);
    document.body.appendChild(wrap);
    updateViewButtons();
})();

// ---- Azure 개인 로그인(MSAL) 게이트 + 로그인 사용자 자동 아바타 ----
// 로그인 완료 시, 본인 MSAL 계정 프로필로 조직 피커 없이 아바타를 자동 등록한다(서버 /api/me 미의존 — 본인 신분).
async function ensureSelfAvatar(account) {
    try {
        const email = (account && account.username) || '';                  // UPN(=이메일 형태)
        const name  = (account && (account.name || account.username)) || '';
        if (!email) return;
        const base = ''; // 같은 origin(상대경로)
        const people = await fetch(`${base}/api/people`).then((r) => r.json()).catch(() => []);
        const existing = Array.isArray(people) && people.find((p) => (p.email || '').toLowerCase() === email.toLowerCase());
        if (existing) {
            myPersonId = existing.id; // 이미 등록된 경우 ID 세팅
        } else {
            const created = await fetch(`${base}/api/people`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, color: '#00B7C3' }),
            }).then((r) => r.json()).catch(() => null);
            if (created && created.id) myPersonId = created.id; // 신규 등록 후 ID 세팅
            // people-update 브로드캐스트로 아바타가 자동 표시됨
        }
    } catch { /* noop */ }
    // P3: people.json 등록 완료 후 WS 세션 신분 등록(본인 접속 사실을 전원에게 broadcast).
    _sendUserJoin(account);
}
initAuthGate({ onAuthenticated: (account) => { ensureSelfAvatar(account); if (window.__renderOrders) window.__renderOrders(); } });

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
fetch('/api/people')
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
// P3(blackwatermelon) '내 아바타 이동'용 키셋 — Gahyun의 MOVE_KEYS(선택아바타·화살표전용)와 이름 분리(중복선언 방지).
const MY_MOVE_KEYS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);

window.addEventListener('keydown', (e) => {
    // 텍스트 입력(채팅·검색 등) 중이면 게임 단축키(Space·G·R·V·숫자뷰·이동키)를 전부 무시.
    // preventDefault도 하지 않으므로 입력창에서 Space/화살표 등 정상 타이핑 보장.
    if (_isTyping()) return;
    // SPACE: 본인 아바타 점프 (지상에서만 발동 → 의자·탁자 위 착지 가능)
    if (e.code === 'Space') {
        e.preventDefault();
        trySelfJump();
        return;
    }
    // 이동 키 — 텍스트 입력 중에는 무시
    if (MY_MOVE_KEYS.has(e.code) && !_isTyping()) {
        e.preventDefault(); // 화살표 키의 페이지 스크롤 방지
        keysDown.add(e.code);
        return;
    }
    // 프리셋 뷰 (1~8) — 접근/1인칭 상태였다면 타워로 복귀해야 프리셋이 적용됨
    if (VIEWS[e.key]) {
        _exitToTower();
        tweenView(VIEWS[e.key]);
        const help = document.getElementById('view-hint');
        if (help) help.textContent = `📷 ${VIEWS[e.key].name}`;
    }
    // R 키로 초기 뷰
    if (e.code === 'KeyR') { _exitToTower(); tweenView(VIEWS['1']); }
    // V 키로 뷰 모드 순환 (타워 → 접근 → 1인칭 → 타워)
    if (e.code === 'KeyV' && !_isTyping()) {
        const order = ['tower', 'approach', 'fpv'];
        const next = order[(order.indexOf(avatarViewMode) + 1) % order.length];
        setAvatarViewMode(next);
    }
    // Ctrl+G(또는 ⌘+G)로 점심 게임 수동 실행 — 단독 G와 분리(오발 방지)
    if (e.code === 'KeyG' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        triggerLunchGame();
    }
    // H 키 — 아바타 위치 초기화(홈 복귀). 잘못된 곳에 끼었을 때 복구용.
    if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        resetSelfPosition();
    }
});

/** 프리셋 뷰(1~8·R) 적용 전, 접근/1인칭 카메라 제어를 해제하고 타워로 되돌린다(자동 조망 tween 없이). */
function _exitToTower() {
    if (avatarViewMode === 'tower') return;
    const av = myPersonId && personAvatarMap.get(myPersonId);
    if (av) av.group.visible = true;
    avatarViewMode = 'tower';
    controls.enabled = true;
    updateViewButtons();
}

window.addEventListener('keyup', (e) => {
    if (MY_MOVE_KEYS.has(e.code)) {
        keysDown.delete(e.code);
        // 마지막 이동 키를 뗄 때 즉시 서버 저장
        if (keysDown.size === 0) _saveMyPosition();
    }
});

// 포커스 잃을 때 이동 키 초기화 (Alt+Tab 등으로 전환 시 키 stuck 방지)
window.addEventListener('blur', () => { keysDown.clear(); });

// ---- 점프 착지면(jumpTargets) 1회 수집 ----
// 이 시점에는 정적 환경(바닥·슬래브·가구)만 envGroup에 있고, 플레이어 아바타는
// 이후 비동기(/api/people·WS)로 추가되므로 자연히 제외된다. → 자기/타인 아바타 머리에 안 올라탐.
(function collectJumpTargets() {
    jumpTargets.length = 0;
    envGroup.traverse((o) => {
        if (o.isMesh && o.visible !== false) jumpTargets.push(o);
    });
    // walkables(슬래브·계단·데크)도 envGroup 소속이라 이미 포함됨.
})();
