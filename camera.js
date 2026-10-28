/**
 * camera.js — 依 layout.CAMERA_PATH 算出任意時間點的鏡頭狀態。
 * 純函式、只依賴時間 t，所以每一格畫面都可以重現。
 *
 * 鏡頭之間預設淡出淡入；鏡頭寫了 enter 就改成「走過去」：
 *   上一個鏡頭結束前、這個鏡頭開始後各借一段時間，鏡頭從上一個位置移動到這個鏡頭的起點，
 *   via 可以寫門的 id（自動從門洞正中央垂直穿過）、路徑點 [x, y, z]，或 { pos, look }（經過時盯著 look）。
 *   移動中視線：起點方向 → 每個中途點（穿門方向／行進方向／look）→ 終點方向，依序轉過去。
 */
import * as THREE from 'three';
import { CAMERA_PATH, VIDEO, DOORS, WALLS, openingCenter, wallAxis } from './layout.js';

const smooth = (u) => u * u * (3 - 2 * u);            // 緩入緩出
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const V = (p) => new THREE.Vector3(...p);
const curve = (pts) => (pts.length === 1
  ? { getPoint: () => pts[0].clone(), getPointAt: () => pts[0].clone() }
  : new THREE.CatmullRomCurve3(pts, false, 'centripetal'));
/** 方向 ↔ 水平角／俯仰角（轉場時分開內插，不會在相反方向時算出零向量） */
const toAngles = (d) => ({ yaw: Math.atan2(d.x, d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) });
const fromAngles = ({ yaw, pitch }) => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

const DOOR_REACH = 0.4;          // 穿門時在門兩側各取一點，讓鏡頭垂直穿過門洞

const SHOTS = CAMERA_PATH.map((s) => ({ ...s, posCurve: curve(s.pos.map(V)), lookCurve: curve(s.look.map(V)) }));

// —— 每個鏡頭實際用來走自己路徑的時間（扣掉借給轉場的部分） ——
for (const [i, s] of SHOTS.entries()) {
  s.t0 = s.start;
  s.t1 = s.end;
  if (i > 0 && s.enter) {
    const [before, after] = Array.isArray(s.enter.dur) ? s.enter.dur : [s.enter.dur / 2, s.enter.dur / 2];
    SHOTS[i - 1].t1 = s.start - before;
    s.t0 = s.start + after;
  }
}
const ends = (s) => ({                       // 鏡頭起點、終點的位置與視線
  first: { pos: s.posCurve.getPoint(0), look: s.lookCurve.getPoint(0) },
  last: { pos: s.posCurve.getPoint(1), look: s.lookCurve.getPoint(1) },
});

/** 門洞兩側的點，依 from 在哪一側決定先後 */
function doorPoints(id, from, y) {
  const d = DOORS[id];
  if (!d) throw new Error(`camera: 找不到門 ${id}`);
  const [x, z] = openingCenter(d);
  const n = wallAxis(WALLS[d.wall]) === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const c = new THREE.Vector3(x, y, z);
  const side = Math.sign(from.clone().sub(c).dot(n)) || 1;
  return [c.clone().addScaledVector(n, side * DOOR_REACH), c.clone().addScaledVector(n, -side * DOOR_REACH)];
}

// —— 轉場：位置曲線＋沿途的視線關鍵格 ——
for (const [i, s] of SHOTS.entries()) {
  if (i === 0 || !s.enter) continue;
  const a = ends(SHOTS[i - 1]).last, b = ends(s).first;
  const y = (a.pos.y + b.pos.y) / 2;
  const pts = [a.pos];
  const keys = [{ at: 0, dir: a.look.clone().sub(a.pos) }];
  for (const v of s.enter.via ?? []) {
    if (typeof v === 'string') {
      const [p, q] = doorPoints(v, pts[pts.length - 1], y);
      pts.push(p, q);
      keys.push({ pt: q, dir: q.clone().sub(p).setY(-0.1) });     // 穿門時看門的另一邊，略往下
    } else if (v.pos) {
      pts.push(V(v.pos));                                             // { pos, look }：經過時看指定的點（繞著主體轉）
      keys.push({ pt: pts[pts.length - 1], dir: V(v.look).sub(pts[pts.length - 1]) });
    } else {
      pts.push(V(v));
      keys.push({ pt: pts[pts.length - 1], toNext: true });           // 經過路徑點時看行進方向
    }
  }
  pts.push(b.pos);
  for (const key of keys) {
    if (!key.toNext) continue;
    const k = pts.indexOf(key.pt);
    key.dir = pts[k + 1].clone().sub(pts[k - 1]).setY(-0.1);
  }
  keys.push({ at: 1, dir: b.look.clone().sub(b.pos) });
  // 關鍵格放在對應路徑點的弧長比例上
  const lens = [0];
  for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + pts[k].distanceTo(pts[k - 1]));
  for (const key of keys) if (key.pt) key.at = lens[pts.indexOf(key.pt)] / lens[lens.length - 1];
  // 角度逐段累加最短轉向，之後直接內插不用再處理 ±180°
  const ang = keys.map((k) => toAngles(k.dir));
  for (let k = 1; k < ang.length; k++) ang[k].yaw = ang[k - 1].yaw + wrap(ang[k].yaw - ang[k - 1].yaw);
  s.move = {
    t0: SHOTS[i - 1].t1, t1: s.t0, curve: curve(pts),
    keys: keys.map((k, j) => ({ at: k.at, ...ang[j] })),
    fov: [SHOTS[i - 1].fov ?? 68, s.fov ?? 68],
    name: `${SHOTS[i - 1].name}→${s.name}`,
  };
}

function moveAt(m, t) {
  const u = smooth(clamp01((t - m.t0) / (m.t1 - m.t0)));
  const position = m.curve.getPointAt(u);
  const k = m.keys.findIndex((key) => key.at >= u);
  const a = m.keys[Math.max(0, k - 1)], b = m.keys[Math.max(0, k)];
  const w = b.at > a.at ? smooth((u - a.at) / (b.at - a.at)) : 1;
  const dir = fromAngles({ yaw: lerp(a.yaw, b.yaw, w), pitch: lerp(a.pitch, b.pitch, w) });
  return { position, target: position.clone().add(dir), fov: lerp(m.fov[0], m.fov[1], u) };
}

/** 回傳 { shot, transition, position, target, fov, ceilings, fade(0~1 亮度) } */
export function cameraAt(t) {
  const tt = Math.min(Math.max(t, 0), VIDEO.duration - 1e-6);
  const i = Math.max(0, SHOTS.findIndex((s) => tt >= s.start && tt < s.end));
  const shot = SHOTS[i];
  const next = SHOTS[i + 1];
  const first = i === 0, last = i === SHOTS.length - 1;
  // 轉場中：這個鏡頭的開頭，或下一個鏡頭借走的結尾
  const move = (shot.move && tt < shot.t0 && shot.move) || (next?.move && tt >= shot.t1 && next.move);
  const fadeIn = first ? 1.0 : VIDEO.fade;             // 片頭淡入較長
  const fadeOut = last ? 1.2 : VIDEO.fade;             // 片尾淡出較長
  const fade = Math.min(1,
    shot.enter ? 1 : (tt - shot.start) / fadeIn,       // 走過去的不淡
    next?.enter ? 1 : (shot.end - tt) / fadeOut);
  const view = move ? moveAt(move, tt) : (() => {
    const u = smooth(clamp01((tt - shot.t0) / (shot.t1 - shot.t0)));
    return { position: shot.posCurve.getPoint(u), target: shot.lookCurve.getPoint(u), fov: shot.fov ?? 68 };
  })();
  return {
    shot: shot.name,
    transition: move ? move.name : null,
    ...view,
    ceilings: shot.ceilings !== false,
    fade: Math.max(0, fade),
  };
}

/** 套用到 three.js 相機與場景（ceilingObjects：鳥瞰時要隱藏的物件） */
export function applyCamera(state, camera, ceilingObjects, renderer, baseExposure = 1, aerialObjects = []) {
  camera.position.copy(state.position);
  camera.lookAt(state.target);
  if (camera.fov !== state.fov) {
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
  }
  for (const o of ceilingObjects) o.visible = state.ceilings;
  for (const o of aerialObjects) o.visible = !state.ceilings;   // 展示底座只在鳥瞰時出現
  renderer.toneMappingExposure = baseExposure * state.fade;
}
