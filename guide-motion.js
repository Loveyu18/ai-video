/**
 * guide-motion.js — 導覽員的走位與動作（和外型無關）
 *   依 layout.GUIDE.script 算出第 t 秒的「姿勢」：在哪裡、面向哪、髖部位置、兩腳和兩手要放哪裡、道具狀態。
 *   程式公仔（guide.js）和 VRM 角色（guide-vrm.js）吃同一份姿勢，各自用兩段式 IK 擺自己的骨架。
 *   一切只由 t 決定，所以每次輸出都一樣。
 *
 * 座標：「身體座標」原點在腳下地面中心，+z 是正面、+x 是角色的左手邊、y 向上（和 three.js 角色慣例相同）。
 *   0 號＝右手／右腳（-x 側），1 號＝左手／左腳（+x 側）。
 */
import * as THREE from 'three';
import { GUIDE, CAMERA_PATH } from './layout.js';
import { cameraAt } from './camera.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, k) => a + wrap(b - a) * k;
const bump = (x) => Math.sin(Math.PI * clamp(x, 0, 1));          // 0→1→0
const DEG = Math.PI / 180;

// ═══════════════════════════════════════════════════════
// 兩段式 IK 與座標軸對應（兩種骨架共用）
// ═══════════════════════════════════════════════════════
/** 以 a 為主軸、b 為彎曲方向建一組正交座標軸 */
function frame(a, b) {
  const x = a.clone().normalize();
  const z = b.clone().sub(x.clone().multiplyScalar(b.dot(x)));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).sub(x.clone().multiplyScalar(x.z));
  z.normalize();
  return new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(z, x), z);
}
/** 把骨頭靜止時的（主軸 a0、彎曲方向 b0）轉到（a、b）的旋轉 */
export function quatMap(a0, b0, a, b) {
  return new THREE.Quaternion().setFromRotationMatrix(frame(a, b).multiply(frame(a0, b0).invert()));
}
/**
 * 兩段式 IK：根關節 J、目標 T、兩段長 la/lb、彎曲方向 hint（遠端那段要往哪邊折）
 * 回傳 { dir：近端那段的方向, bend：彎曲方向（和 dir 垂直）, beta：中間關節彎幾度（0＝打直） }
 */
export function solveTwoBone(J, T, la, lb, hint) {
  const toT = T.clone().sub(J);
  const d = clamp(toT.length(), Math.abs(la - lb) + 1e-4, la + lb - 1e-4);
  const n = toT.normalize();
  const h = hint.clone().sub(n.clone().multiplyScalar(hint.dot(n)));
  if (h.lengthSq() < 1e-8) h.set(0, 0, 1);
  h.normalize();
  const alpha = Math.acos(clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1));
  const beta = Math.PI - Math.acos(clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  // 近端偏離連線 alpha（往彎曲方向的反側），遠端再往彎曲方向折 beta
  const dir = n.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(h, -Math.sin(alpha)).normalize();
  const bend = h.clone().sub(dir.clone().multiplyScalar(h.dot(dir))).normalize();
  return { dir, bend, beta };
}

// ═══════════════════════════════════════════════════════
// 劇本前處理
// ═══════════════════════════════════════════════════════
const yawToward = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
const shotAt = (t) => CAMERA_PATH.find((s) => t >= s.start && t < s.end);

function compile(script) {
  const out = script.map((e) => ({ ...e, t0: e.t[0], t1: e.t[1] }));
  out.forEach((e, i) => {
    if (e.walk) {
      const a = out[i - 1].at, b = out[i + 1].at;
      const pts = [a, ...e.walk, b].map(([x, z]) => V(x, 0, z));
      e.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      e.length = e.curve.getLength();
    } else {
      // 面向：face 指定角度（0＝+z、90＝+x），否則面向這段時間中段的攝影機
      if (typeof e.face === 'number') e.yaw = e.face * DEG;
      else {
        const shot = shotAt((e.t0 + e.t1) / 2) ?? shotAt(e.t0);
        const cam = cameraAt(shot ? (shot.start + shot.end) / 2 : e.t0).position;
        e.yaw = yawToward(e.at, [cam.x, cam.z]);
      }
    }
  });
  // 走路結束時的方向＝下一個動作開始轉身前的方向
  out.forEach((e, i) => {
    if (e.walk) {
      const tan = e.curve.getTangentAt(1);
      e.yawEnd = Math.atan2(tan.x, tan.z);
      const tan0 = e.curve.getTangentAt(0);
      e.yawStart = Math.atan2(tan0.x, tan0.z);
    }
  });
  out.forEach((e, i) => {
    if (!e.walk) e.yawIn = out[i - 1]?.walk ? out[i - 1].yawEnd : e.yaw;
  });
  return out;
}

/** 浴室拉門：從 slideDoor 動作開始後一路保持打開 */
function doorSlide(acts, t) {
  let off = 0;
  for (const e of acts) {
    if (e.do !== 'slideDoor' || t < e.t0) continue;
    off = e.slide * smooth((t - e.t0 - 0.5) / 0.9);
  }
  return off;
}

// ═══════════════════════════════════════════════════════
// 姿勢
// ═══════════════════════════════════════════════════════
/**
 * dims：骨架尺寸（rig 提供）
 *   hipY 站立時髖關節高、hipHalf 兩腿根部間距一半、thigh/shin 大小腿長、ankleY 站立時腳踝高
 *   shoulder[i] 身體座標的肩關節位置、upper/fore 上臂前臂長（到手腕）
 */
export function createMotion(dims) {
  const acts = compile(GUIDE.script);
  const legLen = dims.thigh + dims.shin;
  const STEP = 0.55 * (legLen / 0.85);          // 一步的長度，依腿長縮放

  const toBody = (root, [x, y, z]) => {
    const dx = x - root.x, dz = z - root.z;
    const c = Math.cos(root.yaw), s = Math.sin(root.yaw);
    // 世界 → 身體：反轉 yaw（身體 +x 在世界是 (cos, 0, -sin)、+z 是 (sin, 0, cos)）
    return V(dx * c - dz * s, y, dx * s + dz * c);
  };

  function standing(at, yaw) {
    return {
      visible: true,
      root: { x: at[0], z: at[1], yaw },
      hips: V(0, 0, 0), hipsRot: V(0, 0, 0),           // 相對站姿的位移、旋轉（弧度）
      spine: V(0, 0, 0),                                // 脊椎前傾 x、轉身 y、側彎 z
      feet: [V(-dims.hipHalf, dims.ankleY, 0.01), V(dims.hipHalf, dims.ankleY, 0.01)],
      hands: [{ kind: 'rest' }, { kind: 'rest' }],
      look: 'camera', lookWeight: 1,
      props: {},
    };
  }

  /** 介紹手勢（和原本公仔版相同的方向設計） */
  function presentHand(p, target, w) {
    const tl = toBody(p.root, target);
    const i = tl.x < 0 ? 0 : 1;
    const d = tl.clone().sub(dims.shoulder[i]);
    const h = Math.hypot(d.x, d.z) || 1;
    p.hands[i] = {
      kind: 'aim', w,
      dir: V(d.x / h * 0.5, -0.82, d.z / h * 0.5 + 0.3),
      bend: V(d.x / h, 0.6, d.z / h + 0.4),
      elbow: 0.75, twist: 1.2,
    };
  }

  function wave(p, u, w) {
    p.hands[0] = { kind: 'aim', w, dir: V(-0.6, -0.15, 0.35), bend: V(0, 1, 0.2), elbow: 1.75 + 0.3 * Math.sin(2 * Math.PI * 1.7 * u), twist: 0 };
  }

  /** 伸手到世界座標 target（IK） */
  function reach(p, i, target, w, hint = V(0, 0.35, 1), twist = 0) {
    p.hands[i] = { kind: 'reach', w, target: toBody(p.root, target), hint, twist };
  }

  // —— 走路 ——
  function walkPose(e, t) {
    const T = e.t1 - e.t0, tau = clamp(t - e.t0, 0, T);
    const a = Math.min(0.55, T / 4);                     // 起步、停步加減速時間
    const vmax = e.length / (T - a);
    const s = tau < a ? 0.5 * vmax / a * tau * tau
      : tau < T - a ? vmax * (tau - a / 2)
        : e.length - 0.5 * vmax / a * (T - tau) ** 2;
    const u = clamp(s / e.length, 0, 1);
    const pt = e.curve.getPointAt(u);
    const tan = e.curve.getTangentAt(clamp(u + 0.04, 0, 1));
    let yaw = Math.atan2(tan.x, tan.z);
    // 起步時從上一個動作的方向轉過來
    const prevYaw = acts[acts.indexOf(e) - 1]?.yaw ?? yaw;
    yaw = lerpAngle(prevYaw, yaw, smooth(tau / 0.5));
    const p = standing([pt.x, pt.z], yaw);
    // 步數取整數，讓整段剛好走完；起步、停步時步伐由小變大、由大變小
    const n = Math.max(1, Math.round(e.length / STEP));
    gait(p, s, smooth(Math.min(tau, T - tau) / 0.35), e.length / n);
    // 走路時看前方
    p.look = V(pt.x + Math.sin(yaw) * 3, 1.5, pt.z + Math.cos(yaw) * 3);
    return p;
  }

  /**
   * 步伐：走了 s 公尺時兩腳、髖部、手臂的擺動（k＝步伐大小 0~1，step＝一步長）
   * 腳在支撐期固定在地上（相對身體往後移），所以不會滑步
   */
  function gait(p, s, k, step = STEP) {
    const phase = s / (2 * step);
    const swingArm = [];
    for (let i = 0; i < 2; i++) {
      const ph = ((phase + (i === 0 ? 0.5 : 0)) % 1 + 1) % 1;
      let f, lift = 0;
      if (ph < 0.5) f = step * (0.5 - 2 * ph);           // 支撐：+step/2 → -step/2（身體往前，腳相對往後）
      else {
        const w = (ph - 0.5) / 0.5;                      // 擺動：-step/2 → +step/2，抬腳
        f = step * (-0.5 + smooth(w));
        lift = 0.07 * bump(w);
      }
      f *= k;
      p.feet[i].z += f;
      p.feet[i].y += lift * k;
      // 支撐後段腳跟離地
      if (ph < 0.5) p.feet[i].y += 0.03 * smooth((ph - 0.32) / 0.18) * k;
      swingArm[i] = -f / (step / 2);                      // 同側手和腳相反
    }
    p.hips.y = -(0.035 + 0.012 * Math.cos(4 * Math.PI * phase)) * k;
    p.hipsRot.y = 0.07 * Math.sin(2 * Math.PI * phase) * k;
    p.spine.x = 0.05 * k;
    p.spine.y = -0.09 * Math.sin(2 * Math.PI * phase) * k;
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? -1 : 1;
      p.hands[i] = { kind: 'aim', w: k, dir: V(sd * 0.16, -1, 0.3 * swingArm[i]), bend: V(0, 0, 1), elbow: 0.25 + 0.12 * Math.max(0, swingArm[i]), twist: 0 };
    }
    return p;
  }

  // —— 站著：揮手、介紹 ——
  function standPose(e, t) {
    const u = t - e.t0;
    const yaw = lerpAngle(e.yawIn, e.yaw, smooth(u / 0.6));
    const p = standing(e.at, yaw);
    const env = smooth((u - 0.4) / 0.7) * smooth((e.t1 - t - 0.25) / 0.6);
    if (e.do === 'wave') wave(p, u, env);
    if (e.do === 'present' && e.target) presentHand(p, e.target, env);
    return p;
  }

  // —— 坐下（沙發、床邊） ——
  function sitPose(e, t) {
    const u = t - e.t0, left = e.t1 - t;
    const yaw = lerpAngle(e.yawIn, e.yaw, smooth(u / 0.5));
    const p = standing(e.at, yaw);
    const seat = toBody({ x: e.at[0], z: e.at[1], yaw: e.yaw }, e.seat);   // 坐下後髖關節的位置（身體座標）
    const DOWN = 1.1, UP = 1.0;
    const down = smooth((u - 0.5) / DOWN), up = smooth((left - 0.05) / UP);
    const k = Math.min(down, up);                      // 0 站、1 坐
    const moving = bump((u - 0.5) / DOWN) * (left > UP ? 1 : 0) + bump(1 - left / UP) * (left <= UP ? 1 : 0);
    p.hips.set(seat.x * k, (seat.y - dims.hipY) * k, seat.z * k);
    p.hipsRot.x = -0.12 * k;                            // 骨盆後傾一點（坐姿）
    p.spine.x = 0.38 * moving + (e.lean ?? -0.04) * k;  // 起身、坐下時身體前傾
    // 坐著時雙腳稍微往前、張開一點
    p.feet[0].x -= 0.04 * k; p.feet[1].x += 0.04 * k;
    p.feet[0].z += 0.05 * k; p.feet[1].z += 0.05 * k;
    // 手：放在大腿上；坐下途中往前平衡
    for (let i = 0; i < 2; i++) {
      const sd = i === 0 ? -1 : 1;
      const knee = V(sd * (dims.hipHalf + 0.05), seat.y + 0.06, seat.z + dims.thigh * 0.7);
      p.hands[i] = { kind: 'reach', w: k, target: knee, hint: V(sd * 0.4, 0.2, 1), twist: 0 };
      if (moving > 0.05 && k < 0.95) p.hands[i] = { kind: 'aim', w: moving * 0.8, dir: V(sd * 0.25, -0.6, 0.8), bend: V(0, 0.5, 1), elbow: 0.5, twist: 0 };
    }
    // 坐著時的手勢：介紹（比向 target）或輕拍床面（pat）
    for (const g of e.gestures ?? []) {
      const gw = smooth((t - g.t[0]) / 0.6) * smooth((g.t[1] - t) / 0.6) * k;
      if (gw <= 0) continue;
      if (g.do === 'present') presentHand(p, g.target, gw);
      if (g.do === 'pat') {
        const tp = [...g.target];
        tp[1] += 0.05 * Math.max(0, Math.sin(2 * Math.PI * 2.2 * (t - g.t[0])));
        reach(p, g.hand ?? 0, tp, gw, V(0, 0.3, 1), 0);
      }
    }
    return p;
  }

  // —— 煮飯：右手鍋鏟翻炒、左手握鍋柄 ——
  function cookPose(e, t) {
    const u = t - e.t0, left = e.t1 - t;
    const yaw = lerpAngle(e.yawIn, e.yaw, smooth(u / 0.6));
    const p = standing(e.at, yaw);
    const w = smooth((u - 0.4) / 0.7) * smooth((left - 0.1) / 0.6);
    p.spine.x = 0.2 * w;
    p.hips.z = 0.03 * w;
    const [px, py, pz] = e.pan;
    // 鍋子偶爾抖一下（甩鍋）
    const toss = 0.025 * Math.max(0, Math.sin(2 * Math.PI * 0.9 * u)) ** 3 * w;
    const pan = [px, py + toss * 0.5, pz + toss];
    // 鍋柄朝角色左前方
    const handle = [pan[0] + e.handle[0], pan[1] + e.handle[1], pan[2] + e.handle[2]];
    reach(p, 1, handle, w, V(0.5, 0.4, 1), 0.3);
    // 鍋鏟：手在鍋上方畫圈
    const a = 2 * Math.PI * 1.1 * u;
    const tip = [pan[0] + 0.07 * Math.cos(a), pan[1] + 0.025, pan[2] + 0.06 * Math.sin(a)];
    const hand = [tip[0] + 0.03, tip[1] + 0.2, tip[2] + 0.17];
    reach(p, 0, hand, w, V(-0.5, 0.4, 1), 0);
    // 看鍋子，中間抬頭看鏡頭講話
    const talk = smooth((u - 2.2) / 0.5) * smooth((4.8 - u) / 0.5);
    p.look = 'mix'; p.lookAt = V(...pan); p.lookWeight = talk;
    p.props = { cook: w, panPos: pan, spatulaTip: w > 0.05 ? tip : null };
    return p;
  }

  // —— 拉開淋浴拉門 ——
  function slideDoorPose(e, t) {
    const u = t - e.t0;
    const yaw = lerpAngle(e.yawIn, e.yaw, smooth(u / 0.5));
    const p = standing(e.at, yaw);
    const off = e.offsetAt ? e.offsetAt(t) : doorSlide(acts, t);   // 自由走動模式由玩家控制拉門
    const w = smooth((u - 0.1) / 0.45) * smooth((e.t1 - t - 0.15) / 0.4);
    reach(p, e.hand ?? 0, [e.handle[0] + off, e.handle[1], e.handle[2]], w, V(0, 0.2, 1), 1.4);
    p.spine.x = 0.06 * w;
    p.look = 'mix'; p.lookAt = V(...e.handle); p.lookWeight = 0.3;
    return p;
  }

  // —— 試水溫：開水 → 手伸到水下 → 甩甩手 → 關水 ——
  function waterPose(e, t) {
    const u = t - e.t0, left = e.t1 - t;
    const yaw = lerpAngle(e.yawIn, e.yaw, smooth(u / 0.5));
    const p = standing(e.at, yaw);
    const i = e.hand ?? 1;
    const mixer = e.mixer, stream = [e.rain[0], 1.25, e.rain[2]];
    const toMixer = smooth((u - 0.4) / 0.6) * smooth((1.9 - u) / 0.5);          // 伸手開水
    const under = smooth((u - 2.0) / 0.6) * smooth((4.4 - u) / 0.5);            // 手伸到水下
    const offReach = left < 0.9 ? bump(1 - (left - 0.15) / 0.75) : 0;           // 最後伸手關水
    if (toMixer > 0.01 || offReach > 0.01) {
      reach(p, i, [mixer[0] + 0.04, mixer[1] + 0.02, mixer[2]], Math.max(toMixer, offReach), V(0, 0.3, 1), 0.3);
      p.spine.x = 0.22 * Math.max(toMixer, offReach);
    }
    if (under > 0.01) {
      const wig = 0.02 * Math.sin(2 * Math.PI * 1.6 * u);
      reach(p, i, [stream[0] + 0.03, stream[1] + wig, stream[2]], under, V(0, 0.2, 1), 1.3);
      p.spine.x = 0.12 * under;
    }
    // 甩手
    const shake = smooth((u - 4.4) / 0.2) * smooth((5.0 - u) / 0.2);
    if (shake > 0.01) p.hands[i] = { kind: 'aim', w: shake, dir: V(0.25, -0.5, 0.8), bend: V(0, 1, 0.3), elbow: 1.3 + 0.35 * Math.sin(2 * Math.PI * 6 * u), twist: 0 };
    p.look = 'mix'; p.lookAt = V(...stream); p.lookWeight = 1 - under * 0.7 - toMixer * 0.5;
    // 出水：碰到開關後開始，最後關水時停
    const on = smooth((u - 1.0) / 0.4) * smooth((left - 0.3) / 0.3);
    p.props = { water: on, handUnder: under };
    return p;
  }

  const POSE = { wave: standPose, present: standPose, stand: standPose, sit: sitPose, cook: cookPose, slideDoor: slideDoorPose, testWater: waterPose };

  return {
    acts,
    /** 第 t 秒的姿勢；不在劇本時間內回傳 null */
    pose(t) {
      if (t < acts[0].t0 || t >= acts[acts.length - 1].t1) return null;
      const e = acts.find((a) => t >= a.t0 && t < a.t1);
      if (!e) return null;
      const p = e.walk ? walkPose(e, t) : POSE[e.do](e, t);
      p.props.doorSlide = doorSlide(acts, t);
      p.act = e;
      return p;
    },
    /** 劇本外（還沒開始、已結束）時道具的狀態，例如拉門保持打開 */
    doorSlide: (t) => doorSlide(acts, t),

    // —— 給自由走動模式（freeroam.js）用的積木 ——
    /** 站姿 */
    standing,
    /** 走了 s 公尺、步伐大小 k 的步態，直接改 p */
    gait,
    /** 一步的長度（依腿長縮放） */
    step: STEP,
    /** 單一動作（劇本格式的物件，需有 t0、t1、yaw、yawIn）在 t 秒的姿勢 */
    actPose: (e, t) => POSE[e.do](e, t),
  };
}
