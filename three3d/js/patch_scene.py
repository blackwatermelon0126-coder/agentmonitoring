import sys
import re

with open('D:/private/agentmonitoring/three3d/js/scene.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 정규식을 통해 캐릭터 생성 부분(이전 createPerson 함수들)부터 createFixedAgents() 끝까지 찾아서 바꿉니다.
pattern = re.compile(r'// ============================================\n// 캐릭터 생성\n// ============================================.*?createFixedAgents\(\);\n', re.DOTALL)

replacement = """// ============================================
// 캐릭터 생성 (character.js로 분리됨)
// ============================================

function randomTraits() {
    return { gender: pick(GENDERS), skinColor: pick(SKIN_COLORS), hairColor: pick(HAIR_COLORS), hairStyle: pick(HAIR_STYLES), shirtColor: pick(SHIRT_COLORS), pantsColor: pick(PANTS_COLORS), shoeColor: pick(SHOE_COLORS), accessory: Math.random() < 0.4 ? pick(ACCESSORIES.filter(a => a !== 'none')) : 'none' };
}

// ============================================
// 7명 고정 에이전트 (역할별 1:1, 여자3 남자4)
// ============================================
const ENTRANCE_POS = { x: 0, z: 10 };
const SIT_OFFSET_Y = -0.45; // 의자에 앉을 때 그룹 y 보정

const AGENT_DEFS = [
    { role: 'developer', deskIdx: 0, color: 0x4CAF50, name: 'Developer', gender: 'female' },
    { role: 'devops',    deskIdx: 1, color: 0xFF9800, name: 'DevOps', gender: 'male' },
    { role: 'qa',        deskIdx: 2, color: 0x2196F3, name: 'QA', gender: 'female' },
    { role: 'pm',        deskIdx: 3, color: 0x9C27B0, name: 'PM', gender: 'male' },
    { role: 'designer',  deskIdx: 4, color: 0xE91E63, name: 'Designer', gender: 'female' },
    { role: 'marketer',  deskIdx: 5, color: 0x00BCD4, name: 'Marketer', gender: 'male' },
    { role: 'leader',    deskIdx: 6, color: 0xF44336, name: 'Leader', gender: 'male' },
];

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
        ft.sprite.material.opacity = 1.0 - Math.pow(ft.age / ft.life, 2);
        if (ft.age >= ft.life) {
            scene.remove(ft.sprite);
            ft.sprite.material.dispose();
            ft.sprite.material.map.dispose();
            floatingTexts.splice(i, 1);
        }
    }
}

function makeNameLabel(text, color, stamina = 100) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,256,128);
    ctx.fillStyle = '#000000aa'; 
    ctx.beginPath(); ctx.roundRect(32, 10, 192, 40, 8); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 38);
    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.roundRect(40, 56, 176, 12, 6); ctx.fill();
    const stRatio = Math.max(0, Math.min(100, stamina)) / 100;
    ctx.fillStyle = stRatio > 0.5 ? '#4CAF50' : stRatio > 0.2 ? '#FFC107' : '#F44336';
    if (stRatio > 0) {
        ctx.beginPath(); ctx.roundRect(40, 56, 176 * stRatio, 12, 6); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.scale.set(1.2, 0.6, 1);
    return { sprite, ctx, tex, cv };
}

function updateAgentLabel(agentDef, labelObj, stamina) {
    const ctx = labelObj.ctx;
    ctx.clearRect(0,0,256,128);
    ctx.fillStyle = '#000000aa'; 
    ctx.beginPath(); ctx.roundRect(32, 10, 192, 40, 8); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(agentDef.name, 128, 38);
    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.roundRect(40, 56, 176, 12, 6); ctx.fill();
    const stRatio = Math.max(0, Math.min(100, stamina)) / 100;
    ctx.fillStyle = stRatio > 0.5 ? '#4CAF50' : stRatio > 0.2 ? '#FFC107' : '#F44336';
    if (stRatio > 0) {
        ctx.beginPath(); ctx.roundRect(40, 56, 176 * stRatio, 12, 6); ctx.fill();
    }
    labelObj.tex.needsUpdate = true;
}

function createFixedAgents() {
    let usedSkin = [];
    let usedHair = [];
    
    AGENT_DEFS.forEach(def => {
        let sColor = pick(SKIN_COLORS);
        while(usedSkin.includes(sColor) && usedSkin.length < SKIN_COLORS.length) sColor = pick(SKIN_COLORS);
        usedSkin.push(sColor);

        let hColor = pick(HAIR_COLORS);
        while(usedHair.includes(hColor) && usedHair.length < HAIR_COLORS.length) hColor = pick(HAIR_COLORS);
        usedHair.push(hColor);

        const traits = randomTraits();
        traits.gender = def.gender;
        traits.shirtColor = def.color;
        traits.skinColor = sColor;
        traits.hairColor = hColor;
        
        const person = createDetailedPerson(traits);
        
        if (def.role === 'leader') {
            person.group.position.set(POOL.x, 0.05, POOL.z);
            person.group.visible = true;
        } else {
            person.group.position.set(ENTRANCE_POS.x + rand(-0.6, 0.6), 0, ENTRANCE_POS.z);
            person.group.visible = false;
        }
        scene.add(person.group);

        const labelObj = makeNameLabel(def.name, def.color, 100);
        labelObj.sprite.position.set(0, 2.3, 0);
        person.group.add(labelObj.sprite);

        const desk = allSpots[def.deskIdx];
        fixedAgents[def.role] = {
            def, person, desk,
            phase: def.role === 'leader' ? 'swimming' : 'away',
            walkTime: 0, swimT: Math.random() * 10,
            isWorking: false, labelObj: labelObj,
            stamina: 100, exp: 0
        };
    });
}
createFixedAgents();
"""

new_content = pattern.sub(replacement, content)

with open('D:/private/agentmonitoring/three3d/js/scene.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Replaced string. Difference in length: {len(new_content) - len(content)}")
