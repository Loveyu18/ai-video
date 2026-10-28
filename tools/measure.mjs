// 量家具實際尺寸：node tools/measure.mjs <房間> [名稱前綴…]
//   在 Node 裡建出房間，列出名稱符合前綴的網格的包圍盒（世界座標，公尺）。
//   用來決定 layout.GUIDE 的互動錨點（坐的高度、爐口位置…），結果寫回 layout.js。
//   例：node tools/measure.mjs living sofa:seat sofa:back
import * as THREE from 'three';

const [, , roomId, ...prefixes] = process.argv;
if (!roomId) { console.error('usage: node tools/measure.mjs <room> [prefix…]'); process.exit(1); }
const mod = await import(`../rooms/${roomId}.js`);
const root = mod.build();
root.updateMatrixWorld(true);

const groups = new Map();
root.traverse((o) => {
  if (!o.isMesh) return;
  const name = o.name || '(no name)';
  if (prefixes.length && !prefixes.some((p) => name.startsWith(p))) return;
  const box = new THREE.Box3().setFromObject(o);
  const g = groups.get(name);
  if (g) { g.box.union(box); g.n++; } else groups.set(name, { box, n: 1 });
});
const f = (v) => v.toFixed(3);
for (const [name, { box, n }] of [...groups].sort()) {
  const { min, max } = box;
  console.log(`${name.padEnd(28)} ×${n}  x ${f(min.x)}~${f(max.x)}  y ${f(min.y)}~${f(max.y)}  z ${f(min.z)}~${f(max.z)}`);
}
