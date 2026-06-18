const fs = require('fs');

const scenePath = 'D:/private/agentmonitoring/three3d/js/scene.js';
let code = fs.readFileSync(scenePath, 'utf8');

// 1. Fix imports
code = code.replace(
    `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';`,
    ``
);

// 2. Fix Desks
code = code.replace(
    `// 5명 에이전트 전용 책상 (한 줄 배치)\nlet spotIdx = 0;\nconst agentDeskLayout = [-4, -2, 0, 2, 4];`,
    `// 7명 에이전트 전용 책상 (한 줄 배치)\nlet spotIdx = 0;\nconst agentDeskLayout = [-6, -4, -2, 0, 2, 4, 6];`
);

// 3. AGENT_DEFS
code = code.replace(
    /const AGENT_DEFS = \[[\s\S]*?\];/,
    `const AGENT_DEFS = [
    { role: 'developer', deskIdx: 0, color: 0x4CAF50, name: 'Developer' },
    { role: 'devops',    deskIdx: 1, color: 0xFF9800, name: 'DevOps' },
    { role: 'qa',        deskIdx: 2, color: 0x2196F3, name: 'QA' },
    { role: 'pm',        deskIdx: 3, color: 0x9C27B0, name: 'PM' },
    { role: 'designer',  deskIdx: 4, color: 0xE91E63, name: 'Designer' },
    { role: 'marketer',  deskIdx: 5, color: 0x00BCD4, name: 'Marketer' },
    { role: 'leader',    deskIdx: 6, color: 0xF44336, name: 'Leader' },
];`
);

// 4. ROLE colors
code = code.replace(
    /const ROLE_LABEL = \{[\s\S]*?\};/,
    `const ROLE_LABEL = { developer: 'DEV', devops: 'OPS', qa: 'QA', pm: 'PM', designer: 'DES', marketer: 'MKT', leader: 'LEAD' };`
);
code = code.replace(
    /const ROLE_COLOR = \{[\s\S]*?\};/,
    `const ROLE_COLOR = { developer: '#4CAF50', devops: '#FF9800', qa: '#2196F3', pm: '#9C27B0', designer: '#E91E63', marketer: '#00BCD4', leader: '#F44336' };`
);

// 5. Replace Model logic with Procedural Rig
const regexAgentGen = /let baseModel = null;[\s\S]*?function setSitting\(person, sit\) \{/m;
const newAgentGen = `
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
    AGENT_DEFS.forEach(def => {
        const traits = randomTraits();
        traits.shirtColor = def.color;
        const person = createPerson(traits);
        
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
`;
code = code.replace(regexAgentGen, newAgentGen);

// 6. Update loops
code = code.replace(`globalMixers.forEach(m => m.update(delta));`, ``);

const swimRegex = /\/\/ 모델이 물에 떠있도록[\s\S]*?setAnimation\(a, 'Walk'\);/m;
const swimRepl = `c.pelvis.position.y = 0.2;
            c.group.rotation.x = -Math.PI / 3;
            c.armL.rotation.x = Math.sin(t * 6) * 1.4 - 0.2;
            c.armR.rotation.x = Math.sin(t * 6 + Math.PI) * 1.4 - 0.2;
            c.legL.rotation.x = Math.sin(t * 6) * 0.3;
            c.legR.rotation.x = Math.sin(t * 6 + Math.PI) * 0.3;`;
code = code.replace(swimRegex, swimRepl);

const walkRegex = /c\.model\.rotation\.x = 0; \/\/ 초기화[\s\S]*?setAnimation\(a, a\.stamina < 30 \? 'Walk' : 'Run'\); \/\/ 피곤하면 걷고, 아니면 뛰어감/m;
const walkRepl = `resetPose(c);
                const speedMod2 = a.stamina < 30 ? 0.6 : 1.2;
                const time2 = a.walkTime * 12 * speedMod2;
                const stride2 = a.stamina < 30 ? 0.3 : 0.6;
                c.legL.rotation.x = Math.sin(time2) * stride2;
                c.legR.rotation.x = Math.sin(time2 + Math.PI) * stride2;
                c.armL.rotation.x = Math.sin(time2 + Math.PI) * stride2;
                c.armR.rotation.x = Math.sin(time2) * stride2;
                c.torso.rotation.y = Math.sin(time2) * 0.15;
                c.headGroup.rotation.y = -Math.sin(time2) * 0.15;
                c.pelvis.position.y = 0.9 + Math.abs(Math.sin(time2)) * 0.08;`;
code = code.replace(walkRegex, walkRepl);

const sitInitRegex1 = /c\.model\.rotation\.x = 0; \/\/ 초기화/g;
code = code.replace(sitInitRegex1, `resetPose(c);`);
const sitInitRegex2 = /setAnimation\(a, 'Idle'\);/g;
code = code.replace(sitInitRegex2, ``);

const parkRegex = /setAnimation\(a, 'Walk'\);/m;
const parkRepl = `resetPose(c);
                    const timeP = t * 6;
                    c.legL.rotation.x = Math.sin(timeP) * 0.4;
                    c.legR.rotation.x = Math.sin(timeP + Math.PI) * 0.4;
                    c.armL.rotation.x = Math.sin(timeP + Math.PI) * 0.4;
                    c.armR.rotation.x = Math.sin(timeP) * 0.4;
                    c.pelvis.position.y = 0.9 + Math.abs(Math.sin(timeP)) * 0.05;`;
code = code.replace(parkRegex, parkRepl);

const workRegex = /setAnimation\(a, 'Run'\);[\s\S]*?if\(a\.currentAction\) a\.currentAction\.timeScale = workSpeed;/m;
const workRepl = `resetPose(c);
                c.legL.rotation.x = -Math.PI / 2;
                c.legR.rotation.x = -Math.PI / 2;
                c.pelvis.position.y = 0.55; 
                c.armL.rotation.x = -0.4 + Math.sin(a.walkTime * workSpeed * 4) * 0.15;
                c.armR.rotation.x = -0.4 + Math.sin(a.walkTime * workSpeed * 4 + 1) * 0.15;
                c.headGroup.rotation.x = Math.sin(a.walkTime * 2.5) * 0.04;`;
code = code.replace(workRegex, workRepl);

const idleRegex = /\/\/ idle: 살짝 흔들리기만[\s\S]*?updateAgentLabel\(a\.def, a\.labelObj, a\.stamina\);/m;
const idleRepl = `// idle: 살짝 흔들리기만
                a.stamina = Math.min(100, a.stamina + delta * 0.5);
                updateAgentLabel(a.def, a.labelObj, a.stamina);
                resetPose(c);
                c.legL.rotation.x = -Math.PI / 2;
                c.legR.rotation.x = -Math.PI / 2;
                c.pelvis.position.y = 0.55;
                c.armL.rotation.x = -0.2;
                c.armR.rotation.x = -0.2;
                c.headGroup.rotation.y = Math.sin(a.walkTime * 0.6) * 0.08;`;
code = code.replace(idleRegex, idleRepl);

fs.writeFileSync(scenePath, code);

// 7. Update HTML
const indexPath = 'D:/private/agentmonitoring/three3d/index.html';
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace(
    /<div class="agent-detail" id="meta-pm"><\/div>/,
    `<div class="agent-detail" id="meta-pm"></div>
        <div class="agent-row"><span class="dot idle" id="dot-designer"></span><span style="color:#E91E63">DES</span> <span id="txt-designer">idle</span></div>
        <div class="agent-detail" id="meta-designer"></div>
        <div class="agent-row"><span class="dot idle" id="dot-marketer"></span><span style="color:#00BCD4">MKT</span> <span id="txt-marketer">idle</span></div>
        <div class="agent-detail" id="meta-marketer"></div>`
);
fs.writeFileSync(indexPath, html);

// 8. Update Server
const serverPath = 'D:/private/agentmonitoring/server/server.js';
let srv = fs.readFileSync(serverPath, 'utf8');
srv = srv.replace(
    /pm:        \{ role: 'PM',        status: 'idle', action: '', detail: '', lastUpdate: Date\.now\(\) \},/,
    `pm:        { role: 'PM',        status: 'idle', action: '', detail: '', lastUpdate: Date.now() },
    designer:  { role: 'Designer',  status: 'idle', action: '', detail: '', lastUpdate: Date.now() },
    marketer:  { role: 'Marketer',  status: 'idle', action: '', detail: '', lastUpdate: Date.now() },`
);
fs.writeFileSync(serverPath, srv);
