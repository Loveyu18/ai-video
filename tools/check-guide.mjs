// 導覽員走位檢查：node tools/check-guide.mjs
//   依 layout.GUIDE.script：
//   1. 每個動作的站位、每條走路路線（每 5 公分取一點）：身體範圍內不能有家具、牆、門片
//      （站著 0.40×0.40m、走路 0.34×0.34m、坐下／煮飯／淋浴這類貼近家具的動作 0.28×0.28m，高 0.05~1.6m）
//   2. 走路最高速度要在 0.4~1.5 m/s（太快像滑過去、太慢像卡住）
//   3. 坐下的髖部高度要在座面上方 6~12 公分（座面用家具實際包圍盒量）
//   淋浴拉門打開後，拉門的位置跟著劇本移動再檢查。
import * as THREE from 'three';
import * as L from '../layout.js';
import { buildShell } from '../shell.js';
import { createMotion } from '../guide-motion.js';

const AREAS = ['living', 'entrance', 'masterBed', 'secondBed', 'smallRoom', 'kitchen', 'bathroom', 'hall', 'balcony'];
const IGNORE = /^(floor|ceiling|sky|slab|roof|plinth|ceilingFixture)/;
const SLIDER = /^bathroom:shower:(glass:slider|handle)/;
const boxes = [];
const collect = (g) => {
  g.updateMatrixWorld(true);
  g.traverse((o) => { if (o.isMesh && !IGNORE.test(o.name)) boxes.push([o.name, new THREE.Box3().setFromObject(o)]); });
};
for (const a of AREAS) collect((await import(`../rooms/${a}.js`)).build());
collect(buildShell());

// 尺寸只影響姿勢，這裡只需要劇本與拉門狀態
const motion = createMotion({ hipY: 0.92, hipHalf: 0.09, thigh: 0.42, shin: 0.42, ankleY: 0.08, shoulder: [new THREE.Vector3(-0.18, 1.38, 0), new THREE.Vector3(0.18, 1.38, 0)], upper: 0.25, fore: 0.25 });

function hits(x, z, half, t, ignore = null, top = 1.6) {
  const me = new THREE.Box3(new THREE.Vector3(x - half, 0.05, z - half), new THREE.Vector3(x + half, top, z + half));
  const slide = motion.doorSlide(t);
  const out = new Set();
  for (const [n, b] of boxes) {
    if (ignore && ignore.test(n)) continue;
    const bb = SLIDER.test(n) && slide ? b.clone().translate(new THREE.Vector3(slide, 0, 0)) : b;
    if (bb.intersectsBox(me)) out.add(n);
  }
  return [...out];
}

let bad = 0;
const label = (e) => e.walk ? `走路 ${e.t0}~${e.t1}s` : `${e.do.padEnd(9)} ${e.t0}~${e.t1}s`;
for (const e of motion.acts) {
  if (e.walk) {
    const T = e.t1 - e.t0, a = Math.min(0.55, T / 4);
    const vmax = e.length / (T - a);
    const problems = [];
    // 起點、終點接「貼近家具的動作」時，頭尾 0.3m 放寬（例如從沙發前起身就是貼著沙發）
    const i = motion.acts.indexOf(e);
    const isClose = (a) => a && ['sit', 'cook', 'slideDoor', 'testWater'].includes(a.do);
    const s0 = isClose(motion.acts[i - 1]) ? 0.3 : 0, s1 = e.length - (isClose(motion.acts[i + 1]) ? 0.3 : 0);
    for (let s = s0; s <= s1; s += 0.05) {
      const p = e.curve.getPointAt(Math.min(1, s / e.length));
      const tt = e.t0 + (s / e.length) * T;
      const h = hits(p.x, p.z, 0.17, tt);
      if (h.length) problems.push(`(${p.x.toFixed(2)}, ${p.z.toFixed(2)}) ${h.slice(0, 3).join(', ')}`);
    }
    const speedBad = vmax > 1.5 || vmax < 0.4;
    if (problems.length || speedBad) bad++;
    console.log(`${label(e)}  ${e.length.toFixed(2)}m  最高 ${vmax.toFixed(2)} m/s ${speedBad ? '❌ 速度' : ''}  ${problems.length ? `❌ 撞到 ${problems.length} 處：${[...new Set(problems)].slice(0, 4).join(' ｜ ')}` : '✅ 淨空'}`);
  } else {
    const close = ['sit', 'cook', 'slideDoor', 'testWater'].includes(e.do);
    // 坐下時只看腳的位置（腳踝以下 0.12m 見方、高 0.25m）：腿本來就會靠著床沿、沙發
    const h = e.do === 'sit'
      ? hits(e.at[0], e.at[1], 0.06, e.t0 + 0.01, null, 0.25)
      : hits(e.at[0], e.at[1], close ? 0.14 : 0.2, e.t0 + 0.01, e.do === 'testWater' ? /^bathroom:shower:(rain|arm|drop)/ : null);
    let extra = '';
    if (e.do === 'sit') {
      // 座面：髖部正下方最高的家具表面
      const [sx, sy, sz] = e.seat;
      const under = boxes.filter(([, b]) => sx >= b.min.x && sx <= b.max.x && sz >= b.min.z && sz <= b.max.z && b.max.y < sy + 0.02);
      const top = Math.max(...under.map(([, b]) => b.max.y));
      const gap = sy - top;
      const ok = gap >= 0.06 && gap <= 0.12;
      if (!ok) bad++;
      extra = `  座面 ${top.toFixed(3)}m，髖部高出 ${(gap * 100).toFixed(0)}cm ${ok ? '✅' : '❌'}`;
    }
    if (h.length) bad++;
    console.log(`${label(e)}  (${e.at[0]}, ${e.at[1]}) ${L.roomAt(...e.at) ?? '房外'}  ${h.length ? '❌ ' + h.slice(0, 5).join(', ') : '✅ 淨空'}${extra}`);
  }
}
// 鏡頭：每 0.2 秒取一點，鏡頭周圍 0.12m 內不能有家具、牆、門片（鳥瞰鏡頭不檢查）
const { cameraAt } = await import('../camera.js');
for (const shot of L.CAMERA_PATH) {
  if (shot.ceilings === false) continue;
  const hitsCam = new Set();
  for (let t = shot.start; t < shot.end; t += 0.2) {
    const c = cameraAt(t).position;
    const me = new THREE.Box3(c.clone().subScalar(0.12), c.clone().addScalar(0.12));
    const slide = motion.doorSlide(t);
    for (const [n, b] of boxes) {
      const bb = SLIDER.test(n) && slide ? b.clone().translate(new THREE.Vector3(slide, 0, 0)) : b;
      if (bb.intersectsBox(me)) hitsCam.add(n);
    }
  }
  if (hitsCam.size) bad++;
  console.log(`鏡頭 ${shot.name.padEnd(6, '　')} ${shot.start}~${shot.end}s  ${hitsCam.size ? '❌ 鏡頭在 ' + [...hitsCam].slice(0, 4).join(', ') + ' 裡' : '✅'}`);
}
process.exit(bad ? 1 : 0);
