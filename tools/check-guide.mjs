// 導覽員站位檢查：node tools/check-guide.mjs ['{"名稱":[x,z],...}']
//   不帶參數時檢查 layout.GUIDE.spots。
//   檢查角色腳下 0.44×0.44m、高 0.05~1.72m 的範圍內，有沒有任何家具、牆、門片。
import * as THREE from 'three';
import * as L from '../layout.js';
import { buildShell } from '../shell.js';

const AREAS = ['living', 'entrance', 'masterBed', 'secondBed', 'smallRoom', 'kitchen', 'bathroom', 'hall', 'balcony'];
const IGNORE = /^(floor|ceiling|sky|slab|roof|plinth|ceilingFixture)/;
const boxes = [];
const collect = (g) => {
  g.updateMatrixWorld(true);
  g.traverse((o) => { if (o.isMesh && !IGNORE.test(o.name)) boxes.push([o.name, new THREE.Box3().setFromObject(o)]); });
};
for (const a of AREAS) collect((await import(`../rooms/${a}.js`)).build());
collect(buildShell());

const spots = process.argv[2]
  ? JSON.parse(process.argv[2])
  : Object.fromEntries(Object.entries(L.GUIDE?.spots ?? {}).map(([k, v]) => [k, v.pos]));

let bad = 0;
for (const [name, [x, z]] of Object.entries(spots)) {
  const me = new THREE.Box3(new THREE.Vector3(x - 0.22, 0.05, z - 0.22), new THREE.Vector3(x + 0.22, 1.72, z + 0.22));
  const hits = [...new Set(boxes.filter(([, b]) => b.intersectsBox(me)).map(([n]) => n))];
  if (hits.length) bad++;
  console.log(`${name.padEnd(8, '　')} (${x}, ${z}) ${L.roomAt(x, z) ?? '房外'}  ${hits.length ? '❌ ' + hits.slice(0, 6).join(', ') : '✅ 淨空'}`);
}
process.exit(bad ? 1 : 0);
