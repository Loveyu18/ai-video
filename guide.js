/**
 * guide.js — 導覽員角色（全部程式生成，依屋主照片取外型）
 *   黑色蘑菇頭、白 T（胸前淺藍漩渦）、深藍長褲、白球鞋、卡其後背包＋黑背帶、左手淺粉手錶。
 *   風格化公仔比例（頭稍大），不做擬真臉，避免恐怖谷。
 *
 * 角色座標：腳底中心為原點、+z 為正面、y 向上，單位公尺。
 * 動作完全由時間 t 決定（呼吸、眨眼、轉頭、手勢、嘴型），所以每次輸出都一樣。
 * 站位與手勢來自 layout.GUIDE；嘴型來自 tools/voice.mjs 產生的 output/lipsync.json。
 */
import * as THREE from 'three';
import * as G from './geo.js';
import { M } from './materials.js';
import { GUIDE, CAMERA_PATH } from './layout.js';
import { cameraAt } from './camera.js';
import { rngFor } from './rng.js';

const { mesh } = G;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };

/** 沿 -y 方向的圓錐台（四肢、褲管） */
function limb(rTop, rBot, len, mat, name, seg = 20) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 4);
  g.translate(0, -len / 2, 0);
  // 兩端加半球帽，接縫比較圓滑
  const cap1 = new THREE.SphereGeometry(rTop, seg, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const cap2 = new THREE.SphereGeometry(rBot, seg, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  cap2.translate(0, -len, 0);
  const geo = G.mergeGeoms([g, cap1, cap2]);
  geo.computeVertexNormals();
  return mesh(G.worldUV(geo), mat, name);
}

function ellipsoid(sx, sy, sz, mat, name, seg = 20) {
  const m = mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), mat, name);
  m.scale.set(sx, sy, sz);
  return m;
}

// ═══════════════════════════════════════════════════════
// 頭部
// ═══════════════════════════════════════════════════════
const HEAD_C = 0.095;   // 頭中心在 head 群組內的高度

function buildHead(rng) {
  const head = new THREE.Group();
  head.name = 'guide:head';

  // 蛋形頭（下巴略尖）
  const prof = [[0, -0.125], [0.034, -0.119], [0.062, -0.097], [0.084, -0.058], [0.094, -0.012],
    [0.095, 0.03], [0.088, 0.07], [0.068, 0.104], [0.036, 0.124], [0.001, 0.13]];
  const skull = mesh(G.lathe(prof.map(([r, y]) => [r, y + HEAD_C]), 48), M.skin, 'guide:face');
  skull.scale.z = 1.08;
  head.add(skull);

  const FZ = 0.094 * 1.08;   // 臉正面的 z
  // 耳朵
  for (const s of [-1, 1]) {
    const ear = ellipsoid(0.011, 0.026, 0.019, M.skin, 'guide:ear');
    ear.position.set(s * 0.092, HEAD_C - 0.012, -0.006);
    head.add(ear);
  }
  // 鼻子
  const nose = ellipsoid(0.012, 0.011, 0.012, M.skin, 'guide:nose');
  nose.position.set(0, HEAD_C - 0.034, FZ - 0.002);
  head.add(nose);

  // 眼睛（亮面瞳孔＋小反光點），眨眼時縮 eyes 的 y
  const eyes = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.034, HEAD_C - 0.006, FZ - 0.012);
    g.rotation.y = s * 0.28;
    g.add(ellipsoid(0.0145, 0.0175, 0.008, M.eyeDark, 'guide:eye'));
    const spark = ellipsoid(0.0038, 0.0038, 0.003, M.paperWhite, 'guide:eyeSpark', 10);
    spark.position.set(-0.004, 0.006, 0.0065);
    spark.castShadow = false;
    g.add(spark);
    head.add(g);
    eyes.push(g);
    // 眉毛（大部分被瀏海蓋住）
    const brow = mesh(G.roundedBox(0.03, 0.0055, 0.006, 0.0025), M.hairBlack, 'guide:brow');
    brow.position.set(s * 0.035, HEAD_C + 0.024, FZ - 0.008);
    brow.rotation.set(0, s * 0.25, s * 0.05);
    head.add(brow);
  }

  // 嘴巴：微笑的扁橢圓，說話時張開
  const mouth = ellipsoid(0.017, 0.0025, 0.006, M.lip, 'guide:mouth');
  mouth.position.set(0, HEAD_C - 0.066, FZ - 0.014);
  head.add(mouth);

  head.add(buildHair(rng));
  return { head, eyes, mouth };
}

/** 蘑菇頭：比頭大一圈的殼，前低（瀏海到眉）、側中（耳上）、後低（後頸），表面有髮束起伏 */
function buildHair(rng) {
  const g = new THREE.Group();
  g.name = 'guide:hair';
  const noise = G.makeNoise(rng.fork('hair'));
  const geo = new THREE.SphereGeometry(1, 72, 40);
  const p = geo.attributes.position;
  const SX = 0.107, SY = 0.138, SZ = 0.118, OY = 0.014, OZ = -0.006;
  // 髮際線高度（相對頭中心）：hl(θ) = a + b cosθ + c cos2θ；θ=0 前額、±90° 兩側、180° 後頸
  const a = -0.01575, b = 0.0585, c = -0.01075;
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
    const th = Math.atan2(ux, uz);
    // 髮緣帶一點自然起伏（瀏海一撮一撮），不是一條直線
    const hl = a + b * Math.cos(th) + c * Math.cos(2 * th) - 0.005 * Math.abs(noise(th * 9, 3.7)) * smooth(Math.cos(th) + 0.2);
    let x = ux * SX, y = uy * SY + OY, z = uz * SZ + OZ;
    // 兩側飽滿一點（蘑菇頭的圓弧）
    const side = Math.abs(Math.sin(th));
    x *= 1 + 0.05 * side * smooth((y + 0.02) / 0.08);
    if (y < hl) {
      // 低於髮際線：收到髮際線上，並往內貼近頭皮
      y = hl;
      x *= 0.93; z = z * 0.93 + OZ * 0.07;
    }
    // 髮束：沿著頭頂往下的條紋起伏
    const strand = noise(th * 7, y * 9) * 0.5 + noise(th * 15, y * 4) * 0.5;
    const k = 1 + 0.035 * strand * smooth((y - hl) / 0.03);
    p.setXYZ(i, x * k, y, (z - OZ) * k + OZ);
  }
  geo.computeVertexNormals();
  const shell = mesh(G.worldUV(geo), M.hairBlack, 'guide:hairShell');
  shell.position.y = HEAD_C;
  g.add(shell);

  return g;
}

// ═══════════════════════════════════════════════════════
// 身體
// ═══════════════════════════════════════════════════════
function buildArm(side) {
  // side：-1 = 角色的右手（-x），+1 = 左手
  const arm = new THREE.Group();
  arm.name = `guide:arm${side < 0 ? 'R' : 'L'}`;
  const sleeve = limb(0.062, 0.055, 0.12, M.cottonWhite, 'guide:sleeve');
  arm.add(sleeve);
  arm.add(limb(0.045, 0.038, 0.27, M.skin, 'guide:upperArm'));
  const elbow = new THREE.Group();
  elbow.position.y = -0.27;
  arm.add(elbow);
  elbow.add(limb(0.037, 0.029, 0.235, M.skin, 'guide:forearm'));
  const wrist = new THREE.Group();
  wrist.position.y = -0.235;
  elbow.add(wrist);
  const palm = mesh(G.roundedBox(0.03, 0.08, 0.056, 0.013), M.skin, 'guide:hand');
  palm.position.y = -0.045;
  wrist.add(palm);
  const thumb = limb(0.011, 0.009, 0.04, M.skin, 'guide:thumb', 12);
  thumb.position.set(0, -0.02, 0.026);
  thumb.rotation.x = 0.5;
  wrist.add(thumb);
  if (side > 0) {
    // 左手淺粉智慧手錶
    const band = mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.02, 24, 1, true), M.watchPink, 'guide:watchBand');
    band.material = M.watchPink;
    band.position.y = -0.205;
    elbow.add(band);
    const face = mesh(G.roundedBox(0.012, 0.038, 0.032, 0.005), M.screenOff, 'guide:watchFace');
    face.position.set(0.032, -0.205, 0);
    elbow.add(face);
  }
  return { arm, elbow, wrist };
}

function buildLeg(side) {
  const leg = new THREE.Group();
  leg.name = `guide:leg${side < 0 ? 'R' : 'L'}`;
  leg.add(limb(0.084, 0.066, 0.38, M.denimNavy, 'guide:thigh'));
  const knee = new THREE.Group();
  knee.position.y = -0.38;
  leg.add(knee);
  knee.add(limb(0.064, 0.054, 0.36, M.denimNavy, 'guide:shin'));
  const shoe = mesh(G.roundedBox(0.098, 0.085, 0.255, 0.035), M.plasticWhite, 'guide:shoe');
  shoe.position.set(0, -0.375 - 0.0, 0.045);
  knee.add(shoe);
  const sole = mesh(G.roundedBox(0.104, 0.024, 0.262, 0.01), M.rubber, 'guide:sole');
  sole.position.set(0, -0.415, 0.045);
  knee.add(sole);
  return { leg, knee };
}

function buildTorso() {
  const g = new THREE.Group();
  // T 恤：車削再壓扁成橢圓斷面
  const prof = [[0.152, -0.10], [0.156, -0.02], [0.159, 0.10], [0.17, 0.25], [0.178, 0.33],
    [0.166, 0.39], [0.122, 0.425], [0.068, 0.445], [0.058, 0.446]];
  const shirt = mesh(G.lathe(prof, 48), M.cottonWhite, 'guide:shirt');
  shirt.scale.z = 0.62;
  g.add(shirt);

  // 胸前淺藍漩渦（抽象圖形，不是品牌商標）
  const ring = [];
  for (let i = 0; i <= 40; i++) {
    const a = 0.5 + (i / 40) * Math.PI * 1.75;
    const lx = 0.062 * Math.cos(a), ly = 0.03 * Math.sin(a);
    const x = lx * Math.cos(-0.35) - ly * Math.sin(-0.35);
    const y = lx * Math.sin(-0.35) + ly * Math.cos(-0.35) + 0.21;
    const z = Math.sqrt(Math.max(0, 0.166 ** 2 - x * x)) * 0.62 + 0.002;
    ring.push([x, y, z]);
  }
  const logo = mesh(G.tube(ring, 0.0055, { segments: 60, radial: 6 }), M.logoBlue, 'guide:logo');
  logo.scale.z = 1;
  logo.castShadow = false;
  g.add(logo);

  // 後背包：卡其本體＋黑色底、側袋、上緣
  const pack = new THREE.Group();
  pack.name = 'guide:backpack';
  const body = mesh(G.roundedBox(0.29, 0.40, 0.16, 0.04), M.canvasKhaki, 'guide:packBody');
  body.position.set(0, 0.17, -0.185);
  const bottom = mesh(G.roundedBox(0.294, 0.075, 0.164, 0.03), M.webbingBlack, 'guide:packBottom');
  bottom.position.set(0, 0.005, -0.185);
  const top = mesh(G.roundedBox(0.294, 0.025, 0.164, 0.01), M.webbingBlack, 'guide:packTrim');
  top.position.set(0, 0.36, -0.185);
  pack.add(body, bottom, top);
  for (const s of [-1, 1]) {
    const pocket = mesh(G.roundedBox(0.03, 0.17, 0.12, 0.012), M.canvasKhaki, 'guide:packPocket');
    pocket.position.set(s * 0.155, 0.09, -0.185);
    pack.add(pocket);
    // 背帶：從背包上緣跨過肩膀，沿胸前往下，再繞回背包下緣
    const pts = [[s * 0.08, 0.36, -0.12], [s * 0.11, 0.44, -0.03], [s * 0.115, 0.415, 0.085], [s * 0.112, 0.25, 0.104],
      [s * 0.118, 0.08, 0.094], [s * 0.132, -0.005, 0.03], [s * 0.125, -0.005, -0.11]];
    const strap = mesh(G.tube(pts, 0.012, { segments: 48, radial: 8 }), M.webbingBlack, 'guide:strap');
    strap.scale.set(1, 1, 1);
    pack.add(strap);
    const buckle = mesh(G.roundedBox(0.03, 0.03, 0.012, 0.004), M.plasticBlack, 'guide:buckle');
    buckle.position.set(s * 0.112, 0.2, 0.11);
    pack.add(buckle);
  }
  g.add(pack);
  return g;
}

// ═══════════════════════════════════════════════════════
// 組裝＋動作
// ═══════════════════════════════════════════════════════
export function createGuide() {
  const rng = rngFor('guide');
  const root = new THREE.Group();
  root.name = 'guide';

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);
  const pelvis = mesh(G.roundedBox(0.31, 0.18, 0.2, 0.075), M.denimNavy, 'guide:pelvis');
  pelvis.position.y = -0.03;
  hips.add(pelvis);

  const legs = [-1, 1].map((s) => {
    const l = buildLeg(s);
    l.leg.position.set(s * 0.085, -0.06, 0);
    hips.add(l.leg);
    return l;
  });

  const chest = new THREE.Group();
  chest.position.y = 0.08;      // 世界高度約 1.00
  hips.add(chest);
  chest.add(buildTorso());

  const neck = new THREE.Group();
  neck.position.y = 0.43;
  chest.add(neck);
  neck.add(limb(0.041, 0.043, 0.07, M.skin, 'guide:neck').translateY(0.07));
  const headRig = buildHead(rng);
  headRig.head.position.y = 0.055;
  neck.add(headRig.head);

  const arms = [-1, 1].map((s) => {
    const a = buildArm(s);
    a.arm.position.set(s * 0.188, 0.385, 0);
    chest.add(a.arm);
    return { ...a, side: s };
  });

  // 角色用自己的材質副本（定義仍來自 materials.js）。
  // 實測：和家具共用同一個材質物件時，有陰影的畫格會慢約 2.5 倍；各自一份就恢復正常。
  const own = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!own.has(o.material)) own.set(o.material, o.material.clone());
    o.material = own.get(o.material);
    o.castShadow = o.castShadow !== false;
    o.receiveShadow = true;
  });

  // —— 動作 ——
  const DOWN = V(0, -1, 0);
  /**
   * 手臂朝向：手臂沿 dir 伸出，並指定手肘往 bendHint 方向彎（介紹時往前、揮手時往上）。
   * 直接組出座標軸，避免手臂繞自身扭轉造成彎錯方向。
   */
  const aim = (dir, bendHint = V(0, 0, 1)) => {
    const y = dir.clone().normalize().negate();             // 手臂本地 +y：從手指回到肩膀
    const z = bendHint.clone().sub(y.clone().multiplyScalar(bendHint.dot(y))).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  const restQ = arms.map((a) => aim(V(a.side * 0.13, -1, -0.03)));
  let lipsync = null;
  const shotIndex = new Map(CAMERA_PATH.map((s, i) => [s.name, i]));
  const yawCache = new Map();

  /** 某個鏡頭中，角色要面向的方向（鏡頭中段的攝影機位置） */
  function bodyYaw(shot, spot) {
    if (!yawCache.has(shot.name)) {
      const cam = cameraAt((shot.start + shot.end) / 2).position;
      yawCache.set(shot.name, Math.atan2(cam.x - spot.pos[0], cam.z - spot.pos[1]));
    }
    return yawCache.get(shot.name);
  }

  function mouthOpen(t) {
    if (!lipsync) return 0;
    for (const c of lipsync.clips) {
      const i = Math.floor((t - c.at) * lipsync.fps);
      if (i >= 0 && i < c.values.length) return c.values[i];
    }
    return 0;
  }

  /** 依時間 t 擺好姿勢；camera 用來讓頭轉向鏡頭 */
  function update(t, camera) {
    const shot = CAMERA_PATH.find((s) => t >= s.start && t < s.end);
    const spot = shot && GUIDE.spots[shot.name];
    root.visible = !!spot;
    if (!spot) return;
    const u = t - shot.start;
    const idx = shotIndex.get(shot.name);

    root.position.set(spot.pos[0], 0, spot.pos[1]);
    const yaw = bodyYaw(shot, spot);
    root.rotation.y = yaw;
    root.updateMatrixWorld(true);

    // 呼吸、重心微晃
    const br = Math.sin((2 * Math.PI * t) / 3.8);
    chest.scale.set(1 + 0.006 * br, 1 + 0.004 * br, 1 + 0.01 * br);
    hips.rotation.z = 0.018 * Math.sin((2 * Math.PI * t) / 5.3 + idx);
    chest.rotation.z = -0.014 * Math.sin((2 * Math.PI * t) / 5.3 + idx);
    legs[0].leg.rotation.z = -hips.rotation.z;
    legs[1].leg.rotation.z = -hips.rotation.z;

    // 頭轉向攝影機（有角度上限）
    const local = root.worldToLocal(camera.position.clone());
    const hy = clamp(Math.atan2(local.x, local.z), -0.75, 0.75);
    const hp = clamp(Math.atan2(local.y - 1.55, Math.hypot(local.x, local.z)), -0.35, 0.3);
    neck.rotation.set(-hp * 0.35, hy * 0.35, 0);
    headRig.head.rotation.set(-hp * 0.65, hy * 0.65, 0.04 * Math.sin(t * 0.9 + idx));

    // 眨眼
    const ph = ((t / 3.3 + idx * 0.37) % 1 + 1) % 1;
    const blink = ph < 0.035 ? 0.12 : 1;
    for (const e of headRig.eyes) e.scale.y = blink;

    // 說話嘴型
    const open = mouthOpen(t);
    headRig.mouth.scale.y = 0.0025 + open * 0.0075;
    headRig.mouth.scale.x = 0.017 - open * 0.003;

    // 手勢（進場、退場都平滑）
    const env = smooth((u - 0.35) / 0.7) * smooth((shot.end - t - 0.25) / 0.6);
    let gArm = -1, gQ = null, elbowBend = 0, wristTwist = 0;
    if (spot.gesture === 'wave') {
      gArm = 0;                                            // 右手
      gQ = aim(V(-0.6, -0.15, 0.35), V(0, 1, 0.2));
      elbowBend = 1.75 + 0.3 * Math.sin(2 * Math.PI * 1.7 * u);     // 前臂往上舉、左右擺
    } else if (spot.gesture === 'present' && spot.target) {
      const tl = root.worldToLocal(V(...spot.target));
      gArm = tl.x < 0 ? 0 : 1;
      const sh = V(arms[gArm].side * 0.188, 1.385, 0);
      const d = tl.sub(sh);
      const horiz = Math.hypot(d.x, d.z);
      gQ = aim(V(d.x / horiz * 0.5, -0.82, d.z / horiz * 0.5 + 0.3), V(d.x / horiz, 0.6, d.z / horiz + 0.4));
      elbowBend = 0.75;                                    // 手肘彎、前臂往前，像在說「請看這邊」
      wristTwist = arms[gArm].side * 1.2;                  // 掌心朝上
    }
    arms.forEach((a, i) => {
      if (i === gArm && gQ) {
        a.arm.quaternion.copy(restQ[i]).slerp(gQ, env);
        // 手肘彎曲：繞手臂自己的 z 軸（往身體前上方彎）
        a.elbow.rotation.set(-elbowBend * env, 0, 0);
        a.wrist.rotation.set(0, wristTwist * env, 0);
      } else {
        a.arm.quaternion.copy(restQ[i]);
        a.elbow.rotation.set(-0.12, 0, 0);
        a.wrist.rotation.set(0, 0, 0);
      }
    });
  }

  return {
    root,
    update,
    setLipsync(data) { lipsync = data; },
  };
}
