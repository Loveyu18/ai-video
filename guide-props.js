/**
 * guide-props.js — 導覽員互動用的道具（全部程式生成）
 *   平底鍋＋鍋鏟＋鍋裡的菜、爐火、蒸氣：煮飯時用（位置來自 layout.GUIDE.script 的 cook）
 *   花灑出水、地上水花：試水溫時用（位置來自 testWater 的 rain）
 *   淋浴拉門：slideDoor 之後保持打開（移動浴室裡現成的拉門網格，不改 rooms/bathroom.js）
 * 狀態完全由 t 和導覽員姿勢決定。粒子（蒸氣、水滴）用固定種子，每次輸出一樣。
 */
import * as THREE from 'three';
import * as G from './geo.js';
import { M } from './materials.js';
import { GUIDE } from './layout.js';
import { rngFor } from './rng.js';

const { mesh } = G;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const frac = (x) => x - Math.floor(x);

/** 發光、相加混合的材質（火焰、蒸氣、水）：不受燈光影響 */
const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});

export function createProps(scene) {
  const R = rngFor('guide-props');
  const rng = () => R.next();
  const root = new THREE.Group();
  root.name = 'guideProps';
  const cook = GUIDE.script.find((e) => e.do === 'cook');
  const water = GUIDE.script.find((e) => e.do === 'testWater');

  // —— 平底鍋：車削鍋身＋鍋柄 ——
  const pan = new THREE.Group();
  pan.name = 'prop:pan';
  const prof = [[0, 0], [0.1, 0], [0.115, 0.004], [0.125, 0.045], [0.128, 0.05], [0.121, 0.05], [0.112, 0.008], [0.1, 0.006], [0, 0.006]];
  pan.add(mesh(G.lathe(prof, 40), M.metalBlack, 'prop:panBody'));
  const panHandleDir = cook ? V(...cook.handle).setY(0).normalize() : V(0, 0, 1);
  const handle = mesh(G.tube([[0, 0.04, 0], [panHandleDir.x * 0.13, 0.05, panHandleDir.z * 0.13], [panHandleDir.x * 0.27, 0.065, panHandleDir.z * 0.27]], 0.009, { segments: 16, radial: 10 }), M.woodWalnut, 'prop:panHandle');
  pan.add(handle);
  // 鍋裡的菜：青菜、紅蘿蔔、甜椒小塊
  const food = [];
  const foodMats = [M.veggieGreen, M.fruitOrange, M.fruitRed, M.veggieGreen, M.fruitYellow];
  for (let i = 0; i < 14; i++) {
    const m = mesh(G.roundedBox(0.03, 0.012, 0.022, 0.005), foodMats[i % foodMats.length], 'prop:food');
    const a = rng() * Math.PI * 2, r = 0.02 + rng() * 0.07;
    m.userData = { a, r, spin: rng() * 6, ph: rng() * 6 };
    food.push(m);
    pan.add(m);
  }
  root.add(pan);

  // —— 鍋鏟：握把＋鏟面，兩點之間擺放（手 → 鍋裡） ——
  const spatula = new THREE.Group();
  spatula.name = 'prop:spatula';
  const grip = mesh(new THREE.CylinderGeometry(0.009, 0.011, 1, 12), M.woodWalnut, 'prop:spatulaGrip');
  const blade = mesh(G.roundedBox(0.07, 0.004, 0.08, 0.002), M.metalBrushed, 'prop:spatulaBlade');
  spatula.add(grip, blade);
  root.add(spatula);

  // —— 爐火：一圈小火苗＋藍色內焰 ——
  const flame = new THREE.Group();
  flame.name = 'prop:flame';
  const flameOuter = glowMat(0xff8a2a, 0.75), flameInner = glowMat(0x3c7bff, 0.85);
  const tongues = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const outer = mesh(new THREE.ConeGeometry(0.009, 0.035, 8, 1, true), flameOuter, 'prop:flameOuter', { cast: false });
    const inner = mesh(new THREE.ConeGeometry(0.006, 0.018, 8, 1, true), flameInner, 'prop:flameInner', { cast: false });
    for (const m of [outer, inner]) { m.position.set(Math.cos(a) * 0.047, 0, Math.sin(a) * 0.047); m.rotation.z = Math.cos(a) * 0.35; m.rotation.x = -Math.sin(a) * 0.35; }
    outer.userData.ph = rng() * 10;
    tongues.push(outer);
    flame.add(outer, inner);
  }
  root.add(flame);

  // —— 蒸氣：從鍋子往上飄的半透明小團 ——
  const STEAM = 26;
  const steamMat = glowMat(0xfff6ec, 0.16);
  const steam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), steamMat, STEAM);
  steam.name = 'prop:steam';
  steam.castShadow = steam.receiveShadow = false;
  steam.frustumCulled = false;
  const steamSeed = Array.from({ length: STEAM }, () => [rng(), rng(), rng()]);
  root.add(steam);

  // —— 花灑出水：一根根往下落的細長水滴 ——
  const DROPS = 220;
  const waterMat = glowMat(0xbfe2ff, 0.32);
  const drops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 5), waterMat, DROPS);
  drops.name = 'prop:water';
  drops.castShadow = drops.receiveShadow = false;
  drops.frustumCulled = false;
  const dropSeed = Array.from({ length: DROPS }, () => [Math.sqrt(rng()) * 0.085, rng() * Math.PI * 2, rng(), 0.6 + rng() * 0.4]);
  root.add(drops);
  const SPLASH = 40;
  const splash = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), glowMat(0xd8eeff, 0.35), SPLASH);
  splash.name = 'prop:splash';
  splash.castShadow = splash.receiveShadow = false;
  splash.frustumCulled = false;
  const splashSeed = Array.from({ length: SPLASH }, () => [rng(), rng(), rng()]);
  root.add(splash);

  // 道具用自己的材質副本（和導覽員同理：跟家具共用材質物件時陰影畫格會變很慢）
  const own = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.material.blending === THREE.AdditiveBlending) return;
    if (!own.has(o.material)) own.set(o.material, o.material.clone());
    o.material = own.get(o.material);
  });

  // —— 淋浴拉門：找浴室裡現成的拉門網格，記住原位 ——
  const slider = [];
  scene.traverse((o) => { if (o.isMesh && /^bathroom:shower:(glass:slider|handle)/.test(o.name)) slider.push([o, o.position.x]); });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const UP = V(0, 1, 0);

  /** 把一根圓柱（高 1、沿 y）擺在 a→b 之間 */
  const between = (obj, a, b) => {
    const d = b.clone().sub(a);
    obj.position.copy(a).addScaledVector(d, 0.5);
    obj.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    obj.scale.set(1, d.length(), 1);
  };

  /**
   * t：時間；pose：導覽員這一格的姿勢（可能是 null）；guide：要用 handWorld 取手的位置
   */
  function update(t, pose, guide) {
    const pr = pose?.props ?? {};

    // 拉門
    const off = pr.doorSlide ?? 0;
    for (const [o, x0] of slider) o.position.x = x0 + off;

    // 鍋子：煮飯時跟著甩鍋，平常放在爐口上
    const panPos = pr.panPos ? V(...pr.panPos) : cook ? V(...cook.pan) : V(0, -10, 0);
    pan.position.copy(panPos);
    const c = pr.cook ?? 0;
    food.forEach((m) => {
      const { a, r, spin, ph } = m.userData;
      const aa = a + c * (t * 2.4 + ph * 0.3);
      const hop = c * 0.02 * Math.max(0, Math.sin(t * 5.7 + ph)) ** 4;
      m.position.set(Math.cos(aa) * r, 0.012 + hop, Math.sin(aa) * r);
      m.rotation.set(spin + c * t * 2, aa, 0);
    });

    // 鍋鏟：煮飯時從手延伸到鍋裡；平常斜靠在鍋子裡
    let tip, hand;
    if (pr.spatulaTip && guide?.handWorld) {
      tip = V(...pr.spatulaTip);
      hand = guide.handWorld(0);
    } else {
      tip = panPos.clone().add(V(0.03, 0.012, -0.02));
      hand = panPos.clone().add(V(0.2, 0.09, -0.12));
    }
    const dir = hand.clone().sub(tip);
    dir.normalize();
    between(grip, tip.clone().addScaledVector(dir, 0.06), hand.clone().addScaledVector(dir, 0.04));
    blade.position.copy(tip).addScaledVector(dir, 0.03);
    blade.quaternion.setFromUnitVectors(V(0, 0, 1), dir.clone().negate());
    blade.rotateX(-0.5);

    // 爐火
    flame.visible = c > 0.05;
    if (flame.visible) {
      flame.position.set(panPos.x, (cook?.pan[1] ?? 0.94) - 0.04, panPos.z);
      tongues.forEach((m, i) => {
        const f = 0.75 + 0.25 * Math.sin(t * 23 + m.userData.ph) * Math.sin(t * 7.1 + i);
        m.scale.set(1, f * c, 1);
      });
    }

    // 蒸氣：煮了 1.5 秒後開始冒，關火後慢慢散
    const steamOn = c;
    for (let i = 0; i < STEAM; i++) {
      const [a, b, s] = steamSeed[i];
      const life = frac(t * 0.45 + a);
      const k = steamOn * Math.sin(Math.PI * life);
      const r = 0.02 + 0.07 * b + life * 0.06;
      pos.set(panPos.x + Math.cos(b * 9 + t * 0.3) * r, panPos.y + 0.05 + life * 0.55, panPos.z + Math.sin(b * 9 + t * 0.3) * r);
      const size = (0.025 + life * 0.06) * (0.6 + s * 0.6) * (k > 0.01 ? 1 : 0);
      m4.compose(pos, q.identity(), sc.setScalar(Math.max(1e-4, size * Math.sqrt(k))));
      steam.setMatrixAt(i, m4);
    }
    steam.instanceMatrix.needsUpdate = true;
    steam.visible = steamOn > 0.02;

    // 花灑出水
    const w = pr.water ?? 0;
    drops.visible = splash.visible = w > 0.02 && !!water;
    if (drops.visible) {
      const [rx, ry, rz] = water.rain;
      const top = ry - 0.01;
      const handPos = pr.handUnder > 0.3 && guide?.handWorld ? guide.handWorld(water.hand ?? 1) : null;
      for (let i = 0; i < DROPS; i++) {
        const [r, a, ph, sp] = dropSeed[i];
        const x = rx + Math.cos(a) * r, z = rz + Math.sin(a) * r;
        // 手伸到水下時，落在手附近的水滴到手的高度就停（打在手上）
        const stop = handPos && Math.hypot(x - handPos.x, z - handPos.z) < 0.07 ? handPos.y + 0.02 : 0.015;
        const H = top - stop;
        const y = top - frac(t * 2.6 * sp + ph) * H;
        const segLen = Math.min(0.09, y - stop) * w;
        if (segLen <= 0.002) { m4.makeScale(0, 0, 0); drops.setMatrixAt(i, m4); continue; }
        m4.compose(pos.set(x, y - segLen / 2, z), q.identity(), sc.set(1, segLen, 1));
        drops.setMatrixAt(i, m4);
      }
      drops.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < SPLASH; i++) {
        const [a, b, c2] = splashSeed[i];
        const life = frac(t * 3.1 + a);
        const ang = b * Math.PI * 2, rr = Math.sqrt(c2) * 0.1 + life * 0.05;
        pos.set(rx + Math.cos(ang) * rr, 0.015 + 0.04 * Math.sin(Math.PI * life), rz + Math.sin(ang) * rr);
        m4.compose(pos, q.identity(), sc.setScalar(0.006 * (1 - life) * w + 1e-4));
        splash.setMatrixAt(i, m4);
      }
      splash.instanceMatrix.needsUpdate = true;
    }
  }

  return { root, update };
}
