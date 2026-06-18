// ============================================
// Agent Monitor - 2D Pixel Agent Office
// 귀여운 픽셀 에이전트 + 사무실 모니터링
// ============================================

// 역할 색상은 shared/roles.js SSoT와 동기화 (P1-B 정합)
const AGENT_INFO = {
    developer: { color: '#4A90D9', skinColor: '#FFD5B8', hairColor: '#5D4037', label: 'DEV', icon: '{ }' },
    devops:    { color: '#E67E22', skinColor: '#F5CBA7', hairColor: '#212121', label: 'OPS', icon: '> _' },
    qa:        { color: '#27AE60', skinColor: '#FDEBD0', hairColor: '#6D4C41', label: 'QA',  icon: '?!' },
    pm:        { color: '#8E44AD', skinColor: '#FFE0B2', hairColor: '#3E2723', label: 'PM',  icon: '#' },
    leader:    { color: '#E74C3C', skinColor: '#FFCCBC', hairColor: '#1B1B1B', label: 'LEAD', icon: '*' }
};

const DESK_POSITIONS = {
    developer: { x: 130, y: 300 },
    devops:    { x: 320, y: 300 },
    qa:        { x: 510, y: 300 },
    pm:        { x: 200, y: 440 },
    leader:    { x: 420, y: 440 }
};

// 픽셀 캐릭터 텍스처 생성 (Canvas 기반)
function createCharacterTexture(scene, key, info, size = 3) {
    // 16x24 픽셀 캐릭터를 scale로 확대
    const w = 16 * size, h = 24 * size;
    const canvas = scene.textures.createCanvas(key, w, h);
    const ctx = canvas.context;
    ctx.imageSmoothingEnabled = false;

    const s = size; // 픽셀 크기
    const c = info.color;
    const skin = info.skinColor;
    const hair = info.hairColor;

    function px(x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * s, y * s, s, s);
    }

    function row(y, pixels) {
        pixels.forEach(([x, color]) => px(x, y, color));
    }

    // 머리카락 (상단)
    for (let x = 5; x <= 10; x++) px(x, 0, hair);
    for (let x = 4; x <= 11; x++) px(x, 1, hair);
    for (let x = 4; x <= 11; x++) px(x, 2, hair);

    // 얼굴
    for (let x = 4; x <= 11; x++) px(x, 3, skin);
    for (let x = 4; x <= 11; x++) px(x, 4, skin);
    // 눈
    px(6, 4, '#FFFFFF'); px(7, 4, '#333333');
    px(9, 4, '#FFFFFF'); px(10, 4, '#333333');
    for (let x = 4; x <= 11; x++) px(x, 5, skin);
    // 입 (미소)
    px(7, 6, '#E57373'); px(8, 6, '#E57373');
    for (let x = 5; x <= 10; x++) px(x, 6, skin);
    px(7, 6, '#E57373'); px(8, 6, '#E57373');
    for (let x = 5; x <= 10; x++) px(x, 7, skin);

    // 목
    px(7, 8, skin); px(8, 8, skin);

    // 몸통 (역할 색상 셔츠)
    for (let y = 9; y <= 14; y++) {
        for (let x = 4; x <= 11; x++) px(x, y, c);
    }
    // 셔츠 디테일 (주머니/버튼)
    px(7, 10, '#FFFFFF'); px(8, 10, '#FFFFFF');
    px(7, 12, '#FFFFFF');

    // 팔 (셔츠 색)
    for (let y = 9; y <= 13; y++) {
        px(2, y, c); px(3, y, c);
        px(12, y, c); px(13, y, c);
    }
    // 손 (피부)
    px(2, 14, skin); px(3, 14, skin);
    px(12, 14, skin); px(13, 14, skin);

    // 벨트
    for (let x = 4; x <= 11; x++) px(x, 15, '#795548');
    px(7, 15, '#FFD700'); px(8, 15, '#FFD700'); // 벨트 버클

    // 바지
    for (let y = 16; y <= 20; y++) {
        for (let x = 4; x <= 7; x++) px(x, y, '#37474F');
        for (let x = 8; x <= 11; x++) px(x, y, '#37474F');
    }

    // 신발
    for (let x = 3; x <= 7; x++) px(x, 21, '#5D4037');
    for (let x = 8; x <= 12; x++) px(x, 21, '#5D4037');
    for (let x = 3; x <= 7; x++) px(x, 22, '#4E342E');
    for (let x = 8; x <= 12; x++) px(x, 22, '#4E342E');

    canvas.refresh();
    return key;
}

// 작업 중 캐릭터 (팔 올린 포즈)
function createWorkingTexture(scene, key, info, size = 3) {
    const w = 16 * size, h = 24 * size;
    const canvas = scene.textures.createCanvas(key, w, h);
    const ctx = canvas.context;
    ctx.imageSmoothingEnabled = false;

    const s = size;
    const c = info.color;
    const skin = info.skinColor;
    const hair = info.hairColor;

    function px(x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * s, y * s, s, s);
    }

    // 머리카락
    for (let x = 5; x <= 10; x++) px(x, 0, hair);
    for (let x = 4; x <= 11; x++) px(x, 1, hair);
    for (let x = 4; x <= 11; x++) px(x, 2, hair);

    // 얼굴
    for (let x = 4; x <= 11; x++) px(x, 3, skin);
    for (let x = 4; x <= 11; x++) px(x, 4, skin);
    // 눈 (집중 표정 - 작은 눈)
    px(6, 4, '#333333'); px(7, 4, '#333333');
    px(9, 4, '#333333'); px(10, 4, '#333333');
    for (let x = 4; x <= 11; x++) px(x, 5, skin);
    for (let x = 5; x <= 10; x++) px(x, 6, skin);
    for (let x = 5; x <= 10; x++) px(x, 7, skin);

    // 목
    px(7, 8, skin); px(8, 8, skin);

    // 몸통
    for (let y = 9; y <= 14; y++) {
        for (let x = 4; x <= 11; x++) px(x, y, c);
    }
    px(7, 10, '#FFFFFF'); px(8, 10, '#FFFFFF');

    // 팔 (앞으로 뻗은 포즈 - 타이핑)
    for (let y = 9; y <= 11; y++) {
        px(2, y, c); px(3, y, c);
        px(12, y, c); px(13, y, c);
    }
    // 팔 앞으로
    px(2, 12, c); px(3, 12, c);
    px(12, 12, c); px(13, 12, c);
    px(1, 13, skin); px(2, 13, skin);
    px(13, 13, skin); px(14, 13, skin);

    // 벨트
    for (let x = 4; x <= 11; x++) px(x, 15, '#795548');
    px(7, 15, '#FFD700'); px(8, 15, '#FFD700');

    // 바지
    for (let y = 16; y <= 20; y++) {
        for (let x = 4; x <= 7; x++) px(x, y, '#37474F');
        for (let x = 8; x <= 11; x++) px(x, y, '#37474F');
    }

    // 신발
    for (let x = 3; x <= 7; x++) px(x, 21, '#5D4037');
    for (let x = 8; x <= 12; x++) px(x, 21, '#5D4037');
    for (let x = 3; x <= 7; x++) px(x, 22, '#4E342E');
    for (let x = 8; x <= 12; x++) px(x, 22, '#4E342E');

    canvas.refresh();
    return key;
}

class OfficeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'OfficeScene' });
        this.agents = {};
        this.statusTexts = {};
        this.actionBubbles = {};
        this.screens = {};
        this.ws = null;
    }

    create() {
        // 텍스처 생성
        Object.entries(AGENT_INFO).forEach(([role, info]) => {
            createCharacterTexture(this, `${role}_idle`, info);
            createWorkingTexture(this, `${role}_work`, info);
        });

        // 배경
        this.drawOffice();

        // 에이전트 생성
        Object.entries(DESK_POSITIONS).forEach(([role, pos]) => {
            this.createAgent(role, pos.x, pos.y);
        });

        // 타이틀
        this.add.text(400, 18, 'MOM Agent Monitor', {
            fontSize: '22px', fontFamily: '"Press Start 2P", monospace', color: '#ffffff',
            stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        this.add.text(400, 44, 'Real-time Agent Activity Dashboard', {
            fontSize: '10px', fontFamily: 'monospace', color: '#8888aa'
        }).setOrigin(0.5);

        // 시계
        this.clockText = this.add.text(750, 18, '', {
            fontSize: '10px', fontFamily: 'monospace', color: '#aaaacc'
        }).setOrigin(0.5);

        // 하단 상태바
        this.drawStatusBar();

        // WebSocket
        this.connectWebSocket();

        // 데모
        this.demoText = this.add.text(400, 578, 'SPACE: demo event | Connected: --', {
            fontSize: '9px', fontFamily: 'monospace', color: '#555577'
        }).setOrigin(0.5);

        this.input.keyboard.on('keydown-SPACE', () => {
            fetch(`${location.origin}/demo`, { method: 'POST' }).catch(() => {});
        });

        // 시계 업데이트
        this.time.addEvent({
            delay: 1000, loop: true,
            callback: () => {
                const now = new Date();
                this.clockText.setText(now.toLocaleTimeString('ko-KR'));
            }
        });

        // 파티클 느낌의 떠다니는 점
        this.createAmbientParticles();
    }

    createAmbientParticles() {
        for (let i = 0; i < 15; i++) {
            const dot = this.add.circle(
                Phaser.Math.Between(0, 800),
                Phaser.Math.Between(60, 560),
                1, 0x6666aa, 0.2
            );
            this.tweens.add({
                targets: dot, y: dot.y - 30, alpha: 0,
                duration: Phaser.Math.Between(3000, 6000),
                repeat: -1, yoyo: true
            });
        }
    }

    drawOffice() {
        const g = this.add.graphics();

        // 그라데이션 배경 (벽) - 밝은 파스텔 톤
        for (let y = 0; y < 200; y++) {
            const t = y / 200;
            const r = Math.floor(0x2a + (0x45 - 0x2a) * t);
            const gr = Math.floor(0x2e + (0x4a - 0x2e) * t);
            const b = Math.floor(0x5a + (0x7a - 0x5a) * t);
            g.fillStyle((r << 16) | (gr << 8) | b, 1);
            g.fillRect(0, y, 800, 1);
        }

        // 바닥 (밝은 타일)
        g.fillStyle(0x4a4870, 1);
        g.fillRect(0, 200, 800, 400);

        // 바닥 타일 (아이소메트릭 느낌)
        g.lineStyle(1, 0x3e3e5e, 0.3);
        for (let y = 200; y < 600; y += 32) {
            g.lineBetween(0, y, 800, y);
        }
        for (let x = 0; x < 800; x += 32) {
            g.lineBetween(x, 200, x, 600);
        }

        // 창문 (네온 느낌)
        for (let i = 0; i < 4; i++) {
            const wx = 70 + i * 180;
            // 창 틀
            g.fillStyle(0x444466, 1);
            g.fillRoundedRect(wx, 50, 90, 70, 4);
            // 유리
            g.fillStyle(0x87CEEB, 0.15);
            g.fillRect(wx + 4, 54, 82, 62);
            // 하늘 반사
            g.fillStyle(0xadd8e6, 0.08);
            g.fillRect(wx + 8, 58, 30, 25);
            // 창살
            g.lineStyle(2, 0x555577, 0.5);
            g.lineBetween(wx + 45, 54, wx + 45, 116);
            g.lineBetween(wx + 4, 85, wx + 86, 85);
        }

        // 서버랙 (우측)
        g.fillStyle(0x1a1a30, 1);
        g.fillRoundedRect(670, 220, 100, 140, 6);
        g.lineStyle(1, 0x333355, 1);
        g.strokeRoundedRect(670, 220, 100, 140, 6);

        for (let i = 0; i < 5; i++) {
            // LED
            g.fillStyle(i % 2 === 0 ? 0x00ff00 : 0x00cc00, 0.9);
            g.fillCircle(685, 240 + i * 24, 3);
            // 슬롯
            g.fillStyle(0x222244, 1);
            g.fillRoundedRect(695, 233 + i * 24, 60, 16, 2);
            // 슬롯 LED 바
            g.fillStyle(0x004400, 0.6);
            g.fillRect(700, 237 + i * 24, 20 + Math.random() * 30, 3);
        }

        this.add.text(720, 370, 'KAFKA', {
            fontSize: '8px', fontFamily: 'monospace', color: '#ff6600'
        }).setOrigin(0.5);

        // 화분 장식
        g.fillStyle(0x8B4513, 1);
        g.fillRect(30, 180, 20, 20);
        g.fillStyle(0x228B22, 1);
        g.fillCircle(40, 172, 15);
        g.fillStyle(0x2E8B57, 1);
        g.fillCircle(35, 168, 10);
    }

    drawStatusBar() {
        const g = this.add.graphics();
        g.fillStyle(0x111122, 0.8);
        g.fillRect(0, 550, 800, 50);
        g.lineStyle(1, 0x333355);
        g.lineBetween(0, 550, 800, 550);
    }

    createAgent(role, x, y) {
        const info = AGENT_INFO[role];

        // 책상 (더 디테일)
        const desk = this.add.graphics();
        // 책상 상판
        desk.fillStyle(0xA0784C, 1);
        desk.fillRoundedRect(x - 40, y + 5, 80, 18, 3);
        // 상판 하이라이트
        desk.fillStyle(0xB8956A, 0.5);
        desk.fillRect(x - 36, y + 7, 72, 4);
        // 다리
        desk.fillStyle(0x7A5C3C, 1);
        desk.fillRect(x - 35, y + 23, 6, 18);
        desk.fillRect(x + 29, y + 23, 6, 18);

        // 모니터
        desk.fillStyle(0x1a1a2e, 1);
        desk.fillRoundedRect(x - 18, y - 22, 36, 26, 3);
        // 모니터 스탠드
        desk.fillStyle(0x444455, 1);
        desk.fillRect(x - 4, y + 4, 8, 4);
        desk.fillRect(x - 8, y + 6, 16, 3);

        // 모니터 화면
        const screen = this.add.graphics();
        screen.fillStyle(0x0a0a1a, 1);
        screen.fillRect(x - 14, y - 18, 28, 18);
        this.screens[role] = { graphics: screen, x, y };

        // 키보드
        desk.fillStyle(0x555566, 1);
        desk.fillRoundedRect(x - 14, y + 10, 28, 8, 2);
        desk.fillStyle(0x666677, 0.5);
        for (let kx = 0; kx < 6; kx++) {
            desk.fillRect(x - 12 + kx * 4.5, y + 12, 3, 3);
        }

        // 머그컵
        desk.fillStyle(0xDD5555, 1);
        desk.fillRoundedRect(x + 22, y + 6, 8, 10, 2);
        desk.fillStyle(0xFFFFFF, 0.3);
        desk.fillRect(x + 24, y + 8, 4, 2);

        // 캐릭터 스프라이트
        const sprite = this.add.image(x - 35, y - 18, `${role}_idle`);
        sprite.setOrigin(0.5, 1);
        this.agents[role] = sprite;

        // 그림자
        const shadow = this.add.ellipse(x - 35, y - 1, 24, 6, 0x000000, 0.2);
        this.agents[role + '_shadow'] = shadow;

        // 역할 뱃지
        const badgeBg = this.add.graphics();
        const hexColor = parseInt(info.color.replace('#', ''), 16);
        badgeBg.fillStyle(hexColor, 0.9);
        badgeBg.fillRoundedRect(x - 20, y + 44, 40, 14, 4);
        this.add.text(x, y + 51, info.label, {
            fontSize: '9px', fontFamily: 'monospace', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);

        // 상태 텍스트
        this.statusTexts[role] = this.add.text(x, y + 62, 'idle', {
            fontSize: '8px', fontFamily: 'monospace', color: '#666688'
        }).setOrigin(0.5);

        // 말풍선
        const bubble = this.add.container(x - 10, y - 60);
        const bubbleBg = this.add.graphics();
        bubbleBg.fillStyle(0xffffff, 0.95);
        bubbleBg.fillRoundedRect(-55, -16, 110, 28, 10);
        bubbleBg.fillTriangle(-8, 12, 4, 12, -2, 20);
        bubbleBg.lineStyle(1, 0xccccdd);
        bubbleBg.strokeRoundedRect(-55, -16, 110, 28, 10);

        // 아이콘
        const iconText = this.add.text(-48, -3, info.icon, {
            fontSize: '10px', fontFamily: 'monospace', color: info.color, fontStyle: 'bold'
        }).setOrigin(0, 0.5);

        const bubbleText = this.add.text(4, -3, '', {
            fontSize: '8px', fontFamily: 'monospace', color: '#333344'
        }).setOrigin(0, 0.5);

        bubble.add([bubbleBg, iconText, bubbleText]);
        bubble.setVisible(false);
        bubble.setDepth(10);
        this.actionBubbles[role] = { container: bubble, text: bubbleText };
    }

    updateAgent(role, state) {
        if (!this.agents[role]) return;

        const sprite = this.agents[role];
        const statusText = this.statusTexts[role];
        const bubble = this.actionBubbles[role];
        const screen = this.screens[role];

        if (state.status === 'working') {
            // 작업 중 텍스처로 교체
            sprite.setTexture(`${role}_work`);

            // 상태
            statusText.setText(state.detail || state.action);
            statusText.setColor('#44ff44');

            // 말풍선
            bubble.text.setText(state.detail || state.action);
            bubble.container.setVisible(true);

            // 모니터 화면 (초록 코드)
            if (screen) {
                screen.graphics.clear();
                screen.graphics.fillStyle(0x0a1a0a, 1);
                screen.graphics.fillRect(screen.x - 14, screen.y - 18, 28, 18);
                screen.graphics.fillStyle(0x00ff00, 0.7);
                for (let i = 0; i < 5; i++) {
                    const lw = 4 + Math.random() * 18;
                    screen.graphics.fillRect(screen.x - 12, screen.y - 16 + i * 3.5, lw, 1.5);
                }
            }

            // 캐릭터 바운스 애니메이션
            if (!sprite.tweenActive) {
                sprite.tweenActive = true;
                this.tweens.add({
                    targets: sprite,
                    y: sprite.y - 4,
                    duration: 200,
                    yoyo: true,
                    repeat: 3,
                    ease: 'Sine.easeInOut',
                    onComplete: () => { sprite.tweenActive = false; }
                });
            }

            // 말풍선 페이드인
            bubble.container.setAlpha(0);
            this.tweens.add({
                targets: bubble.container,
                alpha: 1, duration: 200
            });

        } else {
            // Idle 텍스처
            sprite.setTexture(`${role}_idle`);

            statusText.setText('idle');
            statusText.setColor('#666688');

            // 말풍선 페이드아웃
            this.tweens.add({
                targets: bubble.container,
                alpha: 0, duration: 300,
                onComplete: () => bubble.container.setVisible(false)
            });

            // 모니터 꺼짐
            if (screen) {
                screen.graphics.clear();
                screen.graphics.fillStyle(0x0a0a1a, 1);
                screen.graphics.fillRect(screen.x - 14, screen.y - 18, 28, 18);
            }
        }
    }

    connectWebSocket() {
        const wsUrl = `ws://${window.location.hostname}:3300`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.demoText.setText('Connected | SPACE: demo event');
            this.demoText.setColor('#44aa44');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'init') {
                Object.entries(data.agents).forEach(([role, state]) => {
                    this.updateAgent(role, state);
                });
            } else if (data.type === 'agent-update') {
                this.updateAgent(data.agent, data.state);
            }
        };

        this.ws.onclose = () => {
            this.demoText.setText('Disconnected. Reconnecting...');
            this.demoText.setColor('#ff4444');
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.ws.onerror = () => {
            this.demoText.setText('Server offline. Run: cd server && npm start');
            this.demoText.setColor('#ff4444');
        };
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#2a2e5a',
    scene: [OfficeScene],
    pixelArt: true
};

const game = new Phaser.Game(config);
