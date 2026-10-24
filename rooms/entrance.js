/**
 * rooms/entrance.js — 玄關（依屋主實拍）
 *
 *   R = L.roomInterior('entrance')
 *   東牆 R.x1：整排淺橡木落地鞋櫃（到天花），中間一欄是開放層板，下方懸空＋LED
 *   天花沿東側一條間接燈帶；地上幾雙室內拖鞋
 *   大門掃掠範圍 L.doorSwingZone('front') 內不放任何東西
 */
import * as THREE from 'three';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import * as G from '../geo.js';

const ROOM = 'entrance';
const H = L.CEILING_HEIGHT;
const CAB = { depth: 0.4, float: 0.15, colW: 0.47, gap: 0.005, openCol: 3 };

function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function slab(parent, mat, name, x0, x1, y0, y1, z0, z1, opts, r = 0.003) {
  const m = mesh(G.roundedBox(x1 - x0, y1 - y0, z1 - z0, r), mat, name, opts);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  parent.add(m);
  return m;
}
const rbox = (w, h, d, r) => G.roundedBox(w, h, d, r, 3);

// ═══════════════════════════════════════════════════════
// 落地鞋櫃
// ═══════════════════════════════════════════════════════
function buildShoeCabinet(rng, R) {
  const g = new THREE.Group();
  g.name = `${ROOM}:shoeCabinet`;
  const C = CAB;
  const xf = R.x1 - C.depth;          // 櫃門正面
  const top = H - 0.005;
  const z0 = R.z0, z1 = R.z1;
  const n = Math.max(3, Math.round((z1 - z0) / C.colW));
  const cw = (z1 - z0) / n;
  const openCol = Math.min(n - 2, C.openCol);

  // 櫃體：背板、底板、頂板、兩端側板
  slab(g, M.woodOak, 'cab:back', R.x1 - 0.02, R.x1, C.float, top, z0, z1, { cast: false });
  slab(g, M.woodOak, 'cab:bottom', xf + 0.02, R.x1, C.float, C.float + 0.02, z0, z1);
  slab(g, M.woodOak, 'cab:top', xf, R.x1, top - 0.02, top, z0, z1);
  slab(g, M.woodOak, 'cab:endN', xf, R.x1, C.float, top, z0, z0 + 0.02);
  slab(g, M.woodOak, 'cab:endS', xf, R.x1, C.float, top, z1 - 0.02, z1);
  // 懸空處：退縮的暗色底座＋LED
  slab(g, M.woodOakDark, 'cab:plinth', R.x1 - 0.12, R.x1 - 0.02, 0, C.float, z0 + 0.05, z1 - 0.05, { cast: false });
  slab(g, M.ledStrip, 'cab:underLed', xf + 0.03, xf + 0.05, C.float - 0.008, C.float, z0 + 0.04, z1 - 0.04, { cast: false });

  for (let i = 0; i < n; i++) {
    const a = z0 + i * cw + C.gap / 2, b = z0 + (i + 1) * cw - C.gap / 2;
    if (i !== openCol) {
      // 整片落地門板（推開式，無把手）＋內部填實
      slab(g, M.woodOak, 'cab:door', xf, xf + 0.019, C.float + 0.005, top - 0.025, a, b, undefined, 0.004);
      slab(g, M.woodOak, 'cab:inner', xf + 0.02, R.x1 - 0.02, C.float + 0.02, top - 0.02, a + 0.004, b - 0.004, { cast: false });
      continue;
    }
    // 開放格：白色內襯、層板、收納物
    const ix0 = xf + 0.01;
    slab(g, M.paintWhite, 'open:lining', R.x1 - 0.025, R.x1 - 0.02, C.float + 0.02, top - 0.02, a, b, { cast: false });
    for (const z of [a, b - 0.018]) slab(g, M.woodOak, 'open:side', xf, R.x1 - 0.02, C.float + 0.02, top - 0.02, z, z + 0.018);
    const shelves = [C.float + 0.02, 0.62, 1.05, 1.42, 1.8, 2.25];
    for (const y of shelves.slice(1)) slab(g, M.paintWhite, 'open:shelf', ix0, R.x1 - 0.025, y, y + 0.018, a + 0.018, b - 0.018);
    const cz = (a + b) / 2, cx = (ix0 + R.x1) / 2;
    // 最底層：一雙球鞋
    for (const dz of [-0.06, 0.06]) {
      const shoe = mesh(rbox(0.27, 0.09, 0.1, 0.035, 3), M.paintWhite, 'open:sneaker');
      shoe.position.set(cx + rng.jitter(0, 0.015), C.float + 0.02 + 0.045, cz + dz);
      shoe.rotation.y = rng.jitter(0, 0.08);
      g.add(shoe);
      const sole = mesh(rbox(0.27, 0.02, 0.1, 0.006), M.plasticWhite, 'open:sneakerSole');
      sole.position.set(shoe.position.x, C.float + 0.03, cz + dz);
      sole.rotation.y = shoe.rotation.y;
      g.add(sole);
    }
    // 收納盒（白）、灰色毛巾、托盤＋鑰匙碗
    const boxM = mesh(rbox(0.28, 0.22, cw - 0.08, 0.01), M.plasticWhite, 'open:storageBox');
    boxM.position.set(cx, 1.42 + 0.018 + 0.11, cz);
    g.add(boxM);
    const towel = mesh(rbox(0.26, 0.08, cw - 0.12, 0.03, 3), M.fabricGreyThrow, 'open:towel');
    towel.position.set(cx, 1.05 + 0.018 + 0.04, cz);
    g.add(towel);
    const basket = mesh(rbox(0.3, 0.2, cw - 0.07, 0.02), M.rattan, 'open:basket');
    basket.position.set(cx, 0.62 + 0.018 + 0.1, cz);
    g.add(basket);
    const tray = mesh(G.lathe([[0, 0], [0.095, 0], [0.1, 0.004], [0.102, 0.015], [0.097, 0.015], [0.092, 0.006], [0, 0.006]], 48), M.ceramicMatte, 'open:tray');
    tray.position.set(cx, 1.8 + 0.018, cz);
    g.add(tray);
    const keys = mesh(new THREE.TorusGeometry(0.02, 0.003, 6, 16), M.metalBrass, 'open:keys', { cast: false });
    keys.rotation.x = Math.PI / 2;
    keys.position.set(cx + 0.02, 1.8 + 0.018 + 0.017, cz - 0.02);
    g.add(keys);
    const vase = mesh(G.lathe([[0, 0], [0.038, 0], [0.046, 0.012], [0.052, 0.06], [0.04, 0.11], [0.026, 0.145], [0.03, 0.16], [0.025, 0.16], [0.02, 0.14]], 40), M.ceramicRust, 'open:vase');
    vase.position.set(cx, 2.25 + 0.018, cz);
    g.add(vase);
    // 開放格頂 LED
    slab(g, M.ledStrip, 'open:led', ix0 + 0.01, ix0 + 0.025, top - 0.03, top - 0.022, a + 0.03, b - 0.03, { cast: false });
  }
  return { g, xf };
}

// ═══════════════════════════════════════════════════════
// 室內拖鞋
// ═══════════════════════════════════════════════════════
function slipper(name, mat, x, z, ry, rng) {
  const g = new THREE.Group();
  g.name = `${ROOM}:${name}`;
  // 柔軟鞋底：兩層薄墊（mattress），前寬後窄靠縮放做出鞋型
  const sole = mesh(G.mattress(0.1, 0.022, 0.27, { radius: 0.01, crown: 0.002 }), M.rubber, `${name}:sole`);
  sole.position.y = 0.011;
  const bed = mesh(G.mattress(0.094, 0.016, 0.262, { radius: 0.007, crown: 0.004, wrinkle: 0.001, rng }), mat, `${name}:footbed`);
  bed.position.y = 0.028;
  for (const m of [sole, bed]) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getZ(i) / 0.135;                 // -1 腳尖 → 1 腳跟
      p.setX(i, p.getX(i) * (1 - 0.12 * Math.max(0, t) - 0.18 * Math.max(0, -t - 0.7) / 0.3));
    }
    m.geometry.computeVertexNormals();
  }
  // 鞋面：一條拱形圓管沿腳長方向壓扁成寬帶（柔軟布面）
  const strap = G.tube([[-0.049, 0.03, 0], [-0.043, 0.058, 0], [0, 0.07, 0], [0.043, 0.058, 0], [0.049, 0.03, 0]], 0.012, { segments: 32, radial: 16 });
  strap.scale(1, 1, 3.4);
  strap.translate(0, 0, -0.055);
  g.add(sole, bed, mesh(G.worldUV(strap), mat, `${name}:strap`));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}


export function build() {
  const rng = rngFor(ROOM);
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;
  const R = L.roomInterior(ROOM);
  const swing = L.doorSwingZone('front');

  const cab = buildShoeCabinet(rng.fork('cabinet'), R);
  root.add(cab.g);

  // 天花沿東側的間接燈帶（鞋櫃正面上緣）
  slab(root, M.ledStrip, 'ceilingLed', cab.xf - 0.06, cab.xf - 0.04, H - 0.012, H - 0.004, R.z0 + 0.02, R.z1 - 0.02, { cast: false });

  // 拖鞋：放在開門範圍之後（z > swing.z1）
  const zs = swing.z1 + 0.35;
  const pairs = [
    [R.x0 + 0.25, zs + 0.15, M.fabricGreyThrow],
    [R.x0 + 0.5, zs + 0.18, M.fabricBlush],
    [cab.xf - 0.35, zs + 0.55, M.fabricGreyThrow],
  ];
  pairs.forEach(([x, z, mat], i) => {
    const ry = Math.PI + rng.jitter(0, 0.12);     // 腳尖朝南：進門後直接套上
    root.add(slipper(`slipper${i}L`, mat, x - 0.06, z + rng.jitter(0, 0.02), ry, rng.fork(`s${i}L`)));
    root.add(slipper(`slipper${i}R`, mat, x + 0.06, z + rng.jitter(0, 0.02), ry + rng.jitter(0, 0.08), rng.fork(`s${i}R`)));
  });
  return root;
}
