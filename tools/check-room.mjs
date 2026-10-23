// 區域檢查：node tools/check-room.mjs <roomId>
// 檢查項目：
//   1. 不可呼叫 Math.random（固定種子）
//   2. build() 連跑兩次結果完全相同（決定性）
//   3. 所有網格都在 roomInterior(roomId) 內、高度 0 ~ 天花板
//   4. 不擋住開往本房的門的掃掠範圍（2.1m 以下）
//   5. 不擋住窗（窗台高度以上、離窗 0.15m 內）→ 警告
//   6. 額外燈光 ≤ 2 盞、不可開陰影；三角形數量
//   7. 不可自己 new Material（必須用 materials.js 的 M）
import fs from 'node:fs';
import * as THREE from 'three';
import * as L from '../layout.js';
import { M } from '../materials.js';

const roomId = process.argv[2];
if (!L.ROOMS[roomId]) { console.error(`usage: node tools/check-room.mjs <${Object.keys(L.ROOMS).join('|')}>`); process.exit(1); }

const errors = [], warnings = [];
// three.js 內部產生 UUID 會用 Math.random（不影響外觀），只禁止我們自己的程式呼叫
const realRandom = Math.random;
Math.random = () => {
  const caller = new Error().stack.split('\n')[2] ?? '';
  if (!caller.includes('node_modules')) throw new Error('禁止使用 Math.random()，請用 rng.js 的 rngFor()');
  return realRandom();
};
const src = fs.readFileSync(new URL(`../rooms/${roomId}.js`, import.meta.url), 'utf8');
if (/Math\.random/.test(src)) errors.push('原始碼出現 Math.random');
if (/new THREE\.\w*Material/.test(src)) errors.push('原始碼自己 new 了材質，請用 materials.js');
if (/from\s+['"]\.\.\/(?!layout\.js|materials\.js|rng\.js|geo\.js)/.test(src)) errors.push('只能 import three、layout.js、materials.js、rng.js、geo.js');

const sharedMats = new Set(Object.values(M).flat());
const mod = await import(`../rooms/${roomId}.js`);

function snapshot(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    const e = o.matrixWorld.elements.map((v) => v.toFixed(5)).join(',');
    let g = '';
    if (o.geometry) {
      const p = o.geometry.attributes.position;
      let s = 0;
      for (let i = 0; i < p.array.length; i++) s = (s * 31 + Math.round(p.array[i] * 1e4)) % 1e9;
      g = `${p.count}:${s}`;
    }
    parts.push(`${o.type}|${o.name}|${e}|${g}`);
  });
  return parts.join('\n');
}

let a, b;
try {
  a = mod.build();
  b = mod.build();
} catch (e) {
  console.error('❌ build() 失敗：', e.message);
  process.exit(1);
}
if (!(a instanceof THREE.Object3D)) errors.push('build() 必須回傳 THREE.Group');
if (snapshot(a) !== snapshot(b)) errors.push('build() 兩次結果不同 → 有未固定種子的隨機或依賴外部狀態');

const inner = L.roomInterior(roomId);
const TOL = 0.005;
const H = L.CEILING_HEIGHT;
const swingZones = Object.keys(L.DOORS).map((id) => [id, L.doorSwingZone(id)]).filter(([, z]) => z && z.room === roomId);
const windows = L.openingsOfRoom(roomId).filter((o) => o.category === 'window');

let tris = 0, meshes = 0, lights = 0;
const box = new THREE.Box3();
a.updateMatrixWorld(true);
a.traverse((o) => {
  if (o.isLight) {
    lights++;
    if (o.castShadow) errors.push(`燈 ${o.name || o.type} 不可 castShadow`);
  }
  if (!o.isMesh) return;
  meshes++;
  const g = o.geometry;
  tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  for (const m of [o.material].flat()) if (!sharedMats.has(m)) errors.push(`${o.name || '(未命名)'}：使用了不在 materials.js 的材質`);

  box.setFromObject(o);
  const n = o.name || '(未命名 mesh)';
  if (box.min.x < inner.x0 - TOL || box.max.x > inner.x1 + TOL || box.min.z < inner.z0 - TOL || box.max.z > inner.z1 + TOL)
    errors.push(`${n} 超出房間範圍：x ${box.min.x.toFixed(3)}~${box.max.x.toFixed(3)} z ${box.min.z.toFixed(3)}~${box.max.z.toFixed(3)}（允許 x ${inner.x0.toFixed(3)}~${inner.x1.toFixed(3)} z ${inner.z0.toFixed(3)}~${inner.z1.toFixed(3)}）`);
  if (box.min.y < -TOL || box.max.y > H + TOL) errors.push(`${n} 高度超出 0~${H}：${box.min.y.toFixed(3)}~${box.max.y.toFixed(3)}`);

  for (const [id, z] of swingZones) {
    const hit = box.max.x > z.x0 + TOL && box.min.x < z.x1 - TOL && box.max.z > z.z0 + TOL && box.min.z < z.z1 - TOL && box.min.y < L.DOOR_HEIGHT;
    if (hit) errors.push(`${n} 擋到門 ${id} 的開門範圍 x ${z.x0}~${z.x1} z ${z.z0.toFixed(2)}~${z.z1.toFixed(2)}`);
  }
  for (const w of windows) {
    const sill = w.sill ?? L.WINDOW.sill;
    const [cx, cz] = w.center;
    const along = w.side.startsWith('x') ? [box.min.z, box.max.z] : [box.min.x, box.max.x];
    const dist = { x0: box.min.x - cx, x1: cx - box.max.x, z0: box.min.z - cz, z1: cz - box.max.z }[w.side];
    if (dist < 0.15 && along[1] > w.from && along[0] < w.to && box.max.y > sill + 0.05)
      warnings.push(`${n} 可能擋到窗 ${w.id}（窗台 ${sill}m）`);
  }
});

if (lights > 2) errors.push(`額外燈光 ${lights} 盞，上限 2`);
if (tris > 150000) warnings.push(`三角形 ${Math.round(tris)} 偏多（建議 < 150k）`);

console.log(`區域 ${roomId}（${L.ROOMS[roomId].name}）：${meshes} meshes、${Math.round(tris)} 三角形、${lights} 盞燈`);
console.log(`可用範圍 x ${inner.x0.toFixed(3)}~${inner.x1.toFixed(3)}  z ${inner.z0.toFixed(3)}~${inner.z1.toFixed(3)}`);
const uniq = (arr) => [...new Set(arr)];
for (const w of uniq(warnings)) console.log('⚠️ ', w);
for (const e of uniq(errors)) console.log('❌', e);
if (!errors.length) console.log('✅ 通過');
process.exit(errors.length ? 1 : 0);
