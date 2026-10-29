/**
 * guide-vrm.js — 導覽員角色（VRoid Studio 匯出的 VRM 版本）
 *   角色本體來自 avatar/guide.vrm（VRoid 匯出）；後背包是程式生成、依身形量尺寸，預設不背（&pack=1 才背）。
 *   走位與動作來自 guide-motion.js（和程式公仔共用同一份劇本），這裡只負責用 IK 把 VRM 骨架擺成那個姿勢。
 *   介面：{ root, update(t, camera) → 姿勢, setLipsync, handWorld(i) }。
 *
 * 和公仔版不同的地方：
 *   - 眨眼用 VRM 內建的 blink 表情；眼球用 lookAt 看鏡頭
 *   - 嘴型用 aa/ih/ou/ee/oh 五種，依旁白音量（values）和音色（shape）混合
 *   - 頭髮、衣襬有 VRM 內建的彈簧骨；固定 1/30 秒步長、每個鏡頭從頭模擬，所以每次輸出仍一模一樣
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as G from './geo.js';
import { M } from './materials.js';
import { lipsyncAt } from './guide.js';
import { createMotion, solveTwoBone, quatMap } from './guide-motion.js';

const { mesh } = G;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const SIM_FPS = 30;

/** 從綁定姿勢（T-pose）的頂點量身體：給背包、背帶、手錶貼合用 */
function bodySampler(vrm) {
  const pts = [];
  vrm.scene.traverse((o) => {
    if (!o.isSkinnedMesh || /hair/i.test(o.name)) return;
    const p = o.geometry.attributes.position;
    o.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 2) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).toArray());
  });
  const near = (f) => pts.filter(([x, y, z]) => f(x, y, z));
  return {
    /** y 高度、|x| < halfW 範圍內身體的前後緣 z */
    depthAt(y, halfW, x0 = 0) {
      const s = near((x, yy) => Math.abs(yy - y) < 0.02 && Math.abs(x - x0) < halfW);
      return s.length ? { back: Math.min(...s.map((q) => q[2])), front: Math.max(...s.map((q) => q[2])) } : null;
    },
    /** x 位置附近（z 在 zc±dz）身體的最高點 */
    topAt(x, zc, yMin, yMax) {
      const s = near((xx, y, z) => Math.abs(xx - x) < 0.015 && Math.abs(z - zc) < 0.04 && y > yMin && y < yMax);
      return s.length ? Math.max(...s.map((q) => q[1])) : yMax;
    },
  };
}

/** 後背包＋背帶（尺寸跟著身體量），回傳以世界座標（T-pose）擺好的群組 */
function buildBackpack(body, shoulderY, shoulderW) {
  const pack = new THREE.Group();
  pack.name = 'guide:backpack';
  const k = clamp(shoulderW / 0.33, 0.85, 1.15);
  const W = 0.29 * k, H = 0.40 * k, D = 0.15 * k;
  const top = shoulderY - 0.035;
  const yMid = top - H / 2;
  const back = body.depthAt(yMid, 0.12)?.back ?? -0.12;
  const zc = back - D / 2 + 0.012;
  const bodyMesh = mesh(G.roundedBox(W, H, D, 0.04), M.canvasKhaki, 'guide:packBody');
  bodyMesh.position.set(0, yMid, zc);
  const bottom = mesh(G.roundedBox(W + 0.004, 0.075, D + 0.004, 0.03), M.webbingBlack, 'guide:packBottom');
  bottom.position.set(0, top - H + 0.03, zc);
  const trim = mesh(G.roundedBox(W + 0.004, 0.025, D + 0.004, 0.01), M.webbingBlack, 'guide:packTrim');
  trim.position.set(0, top - 0.012, zc);
  pack.add(bodyMesh, bottom, trim);

  for (const s of [-1, 1]) {
    const pocket = mesh(G.roundedBox(0.03, 0.17 * k, 0.12 * k, 0.012), M.canvasKhaki, 'guide:packPocket');
    pocket.position.set(s * (W / 2 + 0.012), top - H + 0.12 * k, zc);
    pack.add(pocket);
    // 背帶：背包上緣 → 越過肩膀 → 沿胸前往下 → 從腋下繞回背包下緣
    const sx = s * shoulderW * 0.36;
    const at = (y, x = sx) => body.depthAt(y, 0.02, x) ?? { back: back, front: -back };
    const sh = at(shoulderY - 0.02);
    // 肩膀最高點：上限壓在肩高 +8 公分，免得量到脖子和臉
    const crest = body.topAt(sx, (sh.back + sh.front) / 2, shoulderY - 0.1, shoulderY + 0.08);
    const f1 = at(shoulderY - 0.07), f2 = at(shoulderY - 0.2), f3 = at(shoulderY - 0.33, sx * 1.15);
    const pts = [
      [s * 0.075 * k, top - 0.01, zc + D / 2 - 0.01],
      [sx, crest + 0.006, sh.back * 0.55 + sh.front * 0.45 - 0.02],
      [sx, crest - 0.01, sh.front + 0.004],
      [sx * 1.02, shoulderY - 0.07, f1.front + 0.008],
      [sx * 1.06, shoulderY - 0.2, f2.front + 0.008],
      [sx * 1.15, shoulderY - 0.33, f3.front + 0.006],
      [s * shoulderW * 0.47, shoulderY - 0.4, (f3.front + back) / 2],
      [s * (W / 2 - 0.03), top - H + 0.05, zc + D / 2 - 0.01],
    ];
    const strap = mesh(G.tube(pts, 0.011, { segments: 64, radial: 8 }), M.webbingBlack, 'guide:strap');
    pack.add(strap);
    const buckle = mesh(G.roundedBox(0.03, 0.03, 0.012, 0.004), M.plasticBlack, 'guide:buckle');
    buckle.position.set(sx * 1.04, shoulderY - 0.15, f2.front + 0.016);
    pack.add(buckle);
  }
  return pack;
}

export async function createVrmGuide(url) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error(`${url} 不是 VRM 檔`);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);   // VRM 0.x 面向 -z，轉成 +z

  const root = new THREE.Group();
  root.name = 'guide';
  root.add(vrm.scene);
  vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;     // 蒙皮網格的包圍盒是綁定姿勢的，動起來會被誤裁
  });

  const bone = (n) => vrm.humanoid.getNormalizedBoneNode(n);
  const B = {
    hips: bone('hips'), spine: bone('spine'), chest: bone('chest'), upperChest: bone('upperChest') ?? bone('chest'),
    neck: bone('neck'), head: bone('head'),
    upperLeg: [bone('rightUpperLeg'), bone('leftUpperLeg')],
    lowerLeg: [bone('rightLowerLeg'), bone('leftLowerLeg')],
    foot: [bone('rightFoot'), bone('leftFoot')],
    shoulder: [bone('rightShoulder'), bone('leftShoulder')],
    upperArm: [bone('rightUpperArm'), bone('leftUpperArm')],
    lowerArm: [bone('rightLowerArm'), bone('leftLowerArm')],
    hand: [bone('rightHand'), bone('leftHand')],
  };
  const SIDE = [-1, 1];      // 0 = 角色右手（-x），1 = 左手（+x），和 guide.js 一樣

  // —— 量身體、掛配件（在 T-pose、原點量） ——
  vrm.humanoid.resetNormalizedPose();
  vrm.humanoid.update();
  root.updateMatrixWorld(true);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const body = bodySampler(vrm);
  const shL = wp(B.upperArm[1]), shR = wp(B.upperArm[0]);
  const shoulderY = (shL.y + shR.y) / 2, shoulderW = shL.x - shR.x;
  const headTop = body.topAt(0, wp(B.head).z, wp(B.head).y, 3);

  // 後背包：預設不背（&pack=1 才背）。buildBackpack 會依身形量尺寸
  if (new URLSearchParams(globalThis.location?.search ?? '').get('pack') === '1') {
    const pack = buildBackpack(body, shoulderY, shoulderW);
    pack.position.sub(wp(B.upperChest));   // 正規化骨架的骨頭沒有旋轉，世界 → 本地只差平移
    B.upperChest.add(pack);
    // 配件用自己的材質副本（和 guide.js 同理：跟家具共用材質物件時陰影畫格會變很慢）
    const own = new Map();
    pack.traverse((o) => {
      if (!o.isMesh) return;
      if (!own.has(o.material)) own.set(o.material, o.material.clone());
      o.material = own.get(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }
  // （手錶不做：這套 VRoid 服裝是寬袖，手腕被袖口蓋住）

  // —— 骨架尺寸（給 guide-motion.js） ——
  const hipsRest = B.hips.position.clone();
  const dims = {
    hipY: wp(B.hips).y,
    hipHalf: Math.abs(wp(B.upperLeg[1]).x),
    thigh: wp(B.upperLeg[1]).distanceTo(wp(B.lowerLeg[1])),
    shin: wp(B.lowerLeg[1]).distanceTo(wp(B.foot[1])),
    ankleY: wp(B.foot[1]).y,
    shoulder: [shR, shL],
    upper: shL.distanceTo(wp(B.lowerArm[1])),
    fore: wp(B.lowerArm[1]).distanceTo(wp(B.hand[1])),
  };
  const motion = createMotion(dims);

  // —— 把骨頭擺到「身體座標」的方向 ——
  const rootQ = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();
  /** 身體座標的旋轉 → 這根骨頭的 local 旋轉（父骨頭目前的方向要先抵銷） */
  const setBodyQuat = (b, qBody) => {
    b.parent.getWorldQuaternion(tmpQ);
    b.quaternion.copy(tmpQ.premultiply(rootQ.clone().invert()).invert().multiply(qBody));
  };
  const toRoot = (v) => root.worldToLocal(v);
  const LEG_A0 = V(0, -1, 0), LEG_B0 = V(0, 0, -1);          // 腿：往下，膝蓋讓小腿往後折
  const ARM_A0 = [V(-1, 0, 0), V(1, 0, 0)], ARM_B0 = V(0, 0, 1);   // 手：T-pose 往兩側，手肘讓前臂往前折
  const restArm = SIDE.map((s, i) => quatMap(ARM_A0[i], ARM_B0, V(s * 0.16, -1, -0.02), V(0, 0, 1)));

  let lipsync = null;

  /** 依姿勢擺骨架（camera 為 null 時不轉頭，給彈簧骨模擬用） */
  function applyPose(p, t, camera) {
    root.position.set(p.root.x, 0, p.root.z);
    root.rotation.set(0, p.root.yaw, 0);
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(rootQ);

    // 軀幹：髖部位移／旋轉＋呼吸、重心微晃
    const br = Math.sin((2 * Math.PI * t) / 3.8);
    const sway = 0.012 * Math.sin((2 * Math.PI * t) / 5.3);
    B.hips.position.copy(hipsRest).add(p.hips);
    B.hips.rotation.set(p.hipsRot.x, p.hipsRot.y, p.hipsRot.z + sway);
    B.spine.rotation.set(p.spine.x * 0.5 + 0.01 * br, p.spine.y * 0.5, p.spine.z * 0.5 - sway * 0.6);
    B.chest.rotation.set(p.spine.x * 0.5 - 0.012 * br, p.spine.y * 0.5, p.spine.z * 0.5 - sway * 0.3);
    root.updateMatrixWorld(true);

    // 腿：IK 到腳踝目標，腳掌保持水平朝前
    for (let i = 0; i < 2; i++) {
      const J = toRoot(wp(B.upperLeg[i]));
      const sol = solveTwoBone(J, p.feet[i], dims.thigh, dims.shin, V(0, 0, -1));
      setBodyQuat(B.upperLeg[i], quatMap(LEG_A0, LEG_B0, sol.dir, sol.bend));
      B.lowerLeg[i].rotation.set(sol.beta, 0, 0);
      B.upperLeg[i].updateMatrixWorld(true);
      setBodyQuat(B.foot[i], new THREE.Quaternion());
    }

    // 手：rest／aim（方向＋手肘角度）／reach（IK 到目標），用 w 和自然下垂混合
    for (let i = 0; i < 2; i++) {
      const s = SIDE[i], h = p.hands[i];
      let q = restArm[i], beta = 0.15, twist = 0;
      if (h.kind === 'aim') {
        q = quatMap(ARM_A0[i], ARM_B0, h.dir, h.bend);
        beta = h.elbow; twist = h.twist ?? 0;
      } else if (h.kind === 'reach') {
        const J = toRoot(wp(B.upperArm[i]));
        const sol = solveTwoBone(J, h.target, dims.upper, dims.fore, h.hint);
        q = quatMap(ARM_A0[i], ARM_B0, sol.dir, sol.bend);
        beta = sol.beta; twist = h.twist ?? 0;
      }
      const w = h.kind === 'rest' ? 0 : (h.w ?? 1);
      setBodyQuat(B.upperArm[i], restArm[i].clone().slerp(q, w));
      B.lowerArm[i].rotation.set(0, -s * (0.15 + (beta - 0.15) * w), 0);
      B.hand[i].rotation.set(-s * twist * w, 0, s * 0.12 * (1 - w));
    }

    // 頭：看鏡頭或看手上的東西（有角度上限，剩下的由眼球補）
    let look = null;
    if (camera) {
      if (p.look === 'camera') look = camera.position.clone();
      else if (p.look === 'mix') look = p.lookAt.clone().lerp(camera.position, p.lookWeight);
      else look = p.look.clone();
      const local = toRoot(look.clone());
      const hy = clamp(Math.atan2(local.x, local.z) - p.spine.y, -0.8, 0.8);
      const hp = clamp(Math.atan2(local.y - headTop + 0.1 - p.hips.y, Math.hypot(local.x, local.z)), -0.6, 0.3) + p.spine.x * 0.6;
      B.neck.rotation.set(-hp * 0.35, hy * 0.35, 0);
      B.head.rotation.set(-hp * 0.65, hy * 0.65, 0.03 * Math.sin(t * 0.9));
    }
    vrm.humanoid.update();
    root.updateMatrixWorld(true);
    return look;
  }

  // 彈簧骨（頭髮、衣襬）：固定 1/30 秒步長往前模擬；跳時間（拖曳、分段輸出）時從 2 秒前重算
  const springs = vrm.springBoneManager;
  let simN = null;
  function simulate(n) {
    if (!springs) return;
    if (simN === null || n < simN || n - simN > 12) {
      simN = n - 60;
      const p0 = motion.pose(simN / SIM_FPS);
      if (p0) applyPose(p0, simN / SIM_FPS, null);
      springs.reset();
    }
    for (; simN < n; simN++) {
      const ts = (simN + 1) / SIM_FPS;
      const ps = motion.pose(ts);
      if (ps) applyPose(ps, ts, null);
      springs.update(1 / SIM_FPS);
    }
  }

  const VISEMES = [['ou', 0.15], ['oh', 0.32], ['aa', 0.5], ['ee', 0.66], ['ih', 0.82]];
  const em = vrm.expressionManager;

  /**
   * 依時間 t 擺好姿勢，回傳這一格的姿勢（給道具用；不在劇本時間內回傳 null）
   * poseIn：直接給姿勢（自由走動模式）；這時彈簧骨照實際經過的時間模擬，不追求逐格相同
   */
  let lastT = null;
  function update(t, camera, poseIn) {
    const live = poseIn !== undefined;
    const p = live ? poseIn : motion.pose(t);
    root.visible = !!p;
    if (!p) { simN = null; return null; }
    let look;
    if (live) {
      look = applyPose(p, t, camera);
      if (springs) springs.update(lastT === null ? 1 / 60 : clamp(t - lastT, 0, 1 / 20));
      lastT = t;
    } else {
      simulate(Math.floor(t * SIM_FPS + 1e-6));
      look = applyPose(p, t, camera);
    }

    // 眨眼：約 3.3 秒一次，閉眼 0.12 秒
    const ph = ((t / 3.3) % 1 + 1) % 1;
    em?.setValue('blink', ph < 0.036 ? Math.sin((ph / 0.036) * Math.PI) : 0);
    em?.setValue('relaxed', 0.18);      // 一點點微笑

    // 嘴型：音量決定張多大，音色決定哪一種嘴形
    const open = lipsyncAt(lipsync, t);
    const shape = lipsyncAt(lipsync, t, 'shape');
    const wts = VISEMES.map(([, c]) => Math.max(0, 1 - Math.abs(shape - c) / 0.17));
    const sum = wts.reduce((a, b) => a + b, 0) || 1;
    VISEMES.forEach(([name], i) => em?.setValue(name, (open * 0.85 * wts[i]) / sum));
    em?.update();

    if (vrm.lookAt && look) {
      vrm.lookAt.autoUpdate = false;
      vrm.lookAt.lookAt(look);
      vrm.lookAt.update(0);
    }
    return p;
  }

  // 角色出處：模型授權要求標示作者時（creditNotation: required），片尾會顯示
  const meta = vrm.meta ?? {};
  const authors = meta.authors ?? (meta.author ? [meta.author] : []);
  const credit = `角色 ${meta.name ?? meta.title ?? 'VRM'}${authors.length ? ` © ${authors.join('、')}` : ''}`;

  return {
    root,
    update,
    motion,
    setLipsync(data) { lipsync = data; },
    /** 手腕的世界座標（道具用：鍋鏟握在手上） */
    handWorld: (i) => wp(B.hand[i]),
    vrm,
    credit,
  };
}
