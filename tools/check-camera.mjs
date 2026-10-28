// 鏡頭路徑檢查：node tools/check-camera.mjs [--all]
//   依 camera.js 逐格（30fps）取鏡頭位置，預設只檢查轉場（鏡頭走過去的那幾秒）；
//   --all 連固定鏡頭也檢查（有些鏡頭刻意貼在牆角、衣櫃裡取景，會被列出來）：
//   1. 鏡頭周圍 0.12m 內不能有家具、牆、門片（和 check-guide.mjs 的鏡頭檢查同標準；鳥瞰鏡頭跳過）
//   2. 鏡頭離導覽員（水平距離）至少 0.45m，不然會穿過人或貼著臉
//   3. 鏡頭移動速度（穿門轉場特別要看）：超過 2.5 m/s 會像瞬移
//   有問題時依鏡頭／轉場分組列出時間與位置，結束碼 1。
import * as THREE from 'three';
import * as L from '../layout.js';
import { buildShell } from '../shell.js';
import { createMotion } from '../guide-motion.js';
import { cameraAt } from '../camera.js';

const AREAS = ['living', 'entrance', 'masterBed', 'secondBed', 'smallRoom', 'kitchen', 'bathroom', 'hall', 'balcony'];
const IGNORE = /^(floor|ceiling|sky|slab|roof|plinth|ceilingFixture)/;
const boxes = [];
const collect = (g) => {
  g.updateMatrixWorld(true);
  g.traverse((o) => { if (o.isMesh && !IGNORE.test(o.name)) boxes.push([o.name, new THREE.Box3().setFromObject(o)]); });
};
for (const a of AREAS) collect((await import(`../rooms/${a}.js`)).build());
collect(buildShell());

const motion = createMotion({ hipY: 0.92, hipHalf: 0.09, thigh: 0.42, shin: 0.42, ankleY: 0.08, shoulder: [new THREE.Vector3(-0.18, 1.38, 0), new THREE.Vector3(0.18, 1.38, 0)], upper: 0.25, fore: 0.25 });

const R = 0.12, GUIDE_GAP = 0.45, VMAX = 2.5;
const ALL = process.argv.includes('--all');
const { fps, duration } = L.VIDEO;
const groups = new Map();            // 段落名稱 → 問題
const add = (key, msg) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(msg); };
let prev = null, vTop = { v: 0, t: 0 };

for (let f = 0; f < Math.round(duration * fps); f++) {
  const t = f / fps;
  const s = cameraAt(t);
  const p = s.position;
  const key = s.transition ? `轉場 ${s.transition}` : s.shot;
  // 淡出淡入的硬切不算速度；轉場前後兩格屬於同一段移動
  if (prev && (prev.shot === s.shot || (s.transition && prev.transition === s.transition))) {
    const v = p.distanceTo(prev.position) * fps;
    if (v > vTop.v) vTop = { v, t, key };
    if (v > VMAX) add(key, `${t.toFixed(2)}s 速度 ${v.toFixed(2)} m/s`);
  }
  prev = s;
  if (!s.ceilings || (!ALL && !s.transition)) continue;
  const me = new THREE.Box3(p.clone().subScalar(R), p.clone().addScalar(R));
  const hit = boxes.filter(([, b]) => b.intersectsBox(me)).map(([n]) => n);
  if (hit.length) add(key, `${t.toFixed(2)}s (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) 撞到 ${hit.slice(0, 3).join(', ')}`);
  const g = motion.pose(t)?.root;
  if (g && p.y < 1.9) {
    const d = Math.hypot(p.x - g.x, p.z - g.z);
    if (d < GUIDE_GAP) add(key, `${t.toFixed(2)}s 離導覽員 ${d.toFixed(2)}m`);
  }
}

for (const [key, list] of groups) {
  console.log(`❌ ${key}：${list.length} 格`);
  for (const m of list.length > 6 ? [...list.slice(0, 3), '…', ...list.slice(-2)] : list) console.log(`   ${m}`);
}
console.log(`最高速度 ${vTop.v.toFixed(2)} m/s（${vTop.t.toFixed(2)}s，${vTop.key}）`);
if (!groups.size) console.log('✅ 鏡頭路徑淨空');
process.exit(groups.size ? 1 : 0);
