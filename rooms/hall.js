/**
 * rooms/hall.js — 洗手台區（依屋主實拍 p07 / p08）
 *
 * 北牆（shaftBottom）：白色懸吊浴櫃（兩門、無把手、上緣溝槽）＋白色方形一體檯盆＋鉻色單把龍頭
 *                      上方無框長方鏡；檯面放給皂瓶、玻璃杯、小托盤、皂盤
 * 東牆（entryLeft）：白色擦手紙盒
 * 西牆是廁所門（往廁所內開），門前保持淨空；南側對餐廳開放。
 */
import * as THREE from 'three';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import { roundedBox, extrudeRounded, roundedRectShape, drapeOver, lathe, tube, worldUV } from '../geo.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const ROOM = 'hall';

// 尺寸常數
const VW = 0.8;        // 浴櫃寬
const VD = 0.47;       // 檯面深
const COUNTER_Y = 0.84;

function mk(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function boxMM(x0, y0, z0, x1, y1, z1, mat, name, opts, r = 0.003) {
  const m = mk(roundedBox(x1 - x0, y1 - y0, z1 - z0, r), mat, name, opts);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}
function rbox(w, h, d, r, mat, name, x, y, z, seg = 3) {
  const m = mk(roundedBox(w, h, d, r, seg), mat, name);
  m.position.set(x, y, z);
  return m;
}
function rod(a, b, r, mat, name, seg = 12) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const m = mk(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg), mat, name);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  return m;
}

/** 方形圓角檯盆：車削後把圓形斷面「撐」成圓角長方形（superellipse） */
function squareBasinGeo(halfW, halfD, profile, n = 7) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 64);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const c = x / r, s = z / r;
    const f = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n);
    p.setXYZ(i, r * f * c * halfW, p.getY(i), r * f * s * halfD);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const out = mergeVertices(g, 1e-5);
  out.computeVertexNormals();
  return worldUV(out);
}

export function build() {
  const rng = rngFor(ROOM);
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;

  const H = L.CEILING_HEIGHT;
  const I = L.roomInterior(ROOM);
  // 北牆面＝I.z0；浴櫃靠東側（實拍：右邊緊鄰擦手紙盒那面牆）
  const vx1 = I.x1 - 0.03, vx0 = vx1 - VW, vxc = (vx0 + vx1) / 2;
  const Z0 = I.z0;

  // ═════════════════════════ 懸吊浴櫃 ═════════════════════════
  const v = new THREE.Group();
  v.name = `${ROOM}:vanity`;
  const cy0 = 0.24, cy1 = COUNTER_Y - 0.055;
  v.add(boxMM(vx0, cy0, Z0, vx1, cy1, Z0 + VD - 0.03, M.paintWhite, 'vanity:carcass'));
  // 上緣內凹取手溝（深色縫＋退縮的上條）
  v.add(boxMM(vx0 + 0.005, cy1 - 0.045, Z0 + VD - 0.04, vx1 - 0.005, cy1 - 0.005, Z0 + VD - 0.025, M.paintWhite, 'vanity:grooveRail'));
  v.add(boxMM(vx0 + 0.01, cy1 - 0.05, Z0 + VD - 0.032, vx1 - 0.01, cy1 - 0.044, Z0 + VD - 0.026, M.stoneDark, 'vanity:grooveShadow', { cast: false }));
  // 兩扇門（無把手）
  const doorZ0 = Z0 + VD - 0.03, doorZ1 = doorZ0 + 0.018;
  const doorTop = cy1 - 0.055, gap = 0.003;
  for (const [i, [a, b]] of [[vx0, vxc], [vxc, vx1]].entries()) {
    v.add(rbox(b - a - gap * 2, doorTop - cy0 - gap, doorZ1 - doorZ0, 0.003, M.paintWhite, `vanity:door${i}`,
      (a + b) / 2, (cy0 + doorTop) / 2, (doorZ0 + doorZ1) / 2, 2));
  }
  // 一體檯面＋方形檯盆
  const cz1 = Z0 + VD;
  {
    const top = mk(extrudeRounded(roundedRectShape(VW - 0.012, VD - 0.012, 0.012), 0.055, 0.006), M.ceramicWhite, 'vanity:counter');
    top.position.set(vxc, COUNTER_Y - 0.055, Z0 + VD / 2);
    v.add(top);
  }
  const bW = 0.27, bD = 0.18;                          // 半寬、半深
  const bzc = cz1 - 0.035 - bD;
  const basin = mk(squareBasinGeo(bW, bD, [
    [0.94, 0.0], [0.98, 0.04], [1.0, 0.105], [0.995, 0.118], [0.97, 0.12], [0.93, 0.112],
    [0.9, 0.05], [0.84, 0.022], [0.4, 0.016], [0.0, 0.016],
  ]), M.ceramicWhite, 'vanity:basin');
  basin.position.set(vxc, COUNTER_Y, bzc);
  v.add(basin);
  // 盆底座：倒角圓角板，讓盆與檯面接合處有一道柔和的收邊
  const plinth = mk(extrudeRounded(roundedRectShape(bW * 2 * 0.95, bD * 2 * 0.95, 0.07), 0.012, 0.004), M.ceramicWhite, 'vanity:basinPlinth');
  plinth.position.set(vxc, COUNTER_Y - 0.002, bzc);
  v.add(plinth);
  const drain = mk(new THREE.CylinderGeometry(0.02, 0.02, 0.003, 20), M.metalChrome, 'vanity:drain');
  drain.position.set(vxc, COUNTER_Y + 0.019, bzc);
  v.add(drain);

  // 鉻色單把龍頭：車削本體＋管件出水口＋倒角把手
  {
    const fz = Z0 + 0.045, fy = COUNTER_Y;
    const body = mk(lathe([
      [0, 0], [0.028, 0], [0.029, 0.004], [0.026, 0.01], [0.019, 0.02], [0.018, 0.17], [0.0185, 0.2], [0.017, 0.215], [0, 0.216],
    ], 40), M.metalChrome, 'faucet:body');
    body.position.set(vxc, fy, fz);
    v.add(body);
    v.add(mk(tube([[vxc, fy + 0.19, fz + 0.01], [vxc, fy + 0.195, fz + 0.06], [vxc, fy + 0.18, fz + 0.11], [vxc, fy + 0.15, fz + 0.13]], 0.009, { segments: 24, radial: 14 }), M.metalChrome, 'faucet:spout'));
    const aer = mk(lathe([[0, 0], [0.0105, 0], [0.0105, 0.012], [0, 0.012]], 20), M.metalBrushed, 'faucet:aerator');
    aer.position.set(vxc, fy + 0.138, fz + 0.13);
    v.add(aer);
    const cart = mk(lathe([[0, 0], [0.017, 0], [0.017, 0.02], [0.012, 0.03], [0, 0.031]], 32), M.metalChrome, 'faucet:cartridge');
    cart.position.set(vxc, fy + 0.214, fz);
    v.add(cart);
    const lever = mk(roundedBox(0.016, 0.012, 0.1, 0.005, 3), M.metalChrome, 'faucet:lever');
    lever.position.set(vxc, fy + 0.25, fz + 0.03);
    lever.rotation.x = -0.35;
    v.add(lever);
  }

  // 檯面小物
  {
    const ty = COUNTER_Y;
    // 右側：給皂瓶（霧玻璃＋鉻壓頭）、玻璃杯
    const sx = vx1 - 0.07, sz = Z0 + 0.09;
    const soap = mk(lathe([[0, 0], [0.031, 0], [0.034, 0.006], [0.034, 0.11], [0.03, 0.128], [0.014, 0.14], [0.012, 0.145], [0, 0.145]], 40), M.glassFrosted, 'counter:soapBottle', { cast: false });
    soap.position.set(sx, ty, sz);
    v.add(soap);
    v.add(rod([sx, ty + 0.14, sz], [sx, ty + 0.165, sz], 0.011, M.metalChrome, 'counter:soapPump'));
    v.add(rod([sx, ty + 0.165, sz], [sx, ty + 0.165, sz + 0.04], 0.005, M.metalChrome, 'counter:soapSpout'));
    const cup = mk(lathe([[0, 0.0], [0.028, 0.0], [0.031, 0.004], [0.035, 0.098], [0.0345, 0.1], [0.032, 0.1], [0.028, 0.012], [0, 0.012]], 40), M.glass, 'counter:glassCup', { cast: false });
    cup.position.set(vx1 - 0.06, ty, Z0 + 0.2);
    v.add(cup);
    // 左側：小托盤（柚木）＋折好的小毛巾、香皂
    const tx = vx0 + 0.07, tz = Z0 + 0.22;
    v.add(rbox(0.1, 0.012, 0.15, 0.004, M.teak, 'counter:tray', tx, ty + 0.006, tz));
    v.add(rbox(0.075, 0.022, 0.09, 0.008, M.fabricOat, 'counter:folded', tx, ty + 0.023, tz - 0.02));
    v.add(rbox(0.05, 0.02, 0.035, 0.008, M.paintCream, 'counter:soapBar', tx, ty + 0.022, tz + 0.05));
    // 檯盆後方：深色皂盤＋香皂（實拍左後方）
    v.add(rbox(0.09, 0.012, 0.06, 0.005, M.stoneDark, 'counter:soapDish', vx0 + 0.09, ty + 0.006, Z0 + 0.05));
    v.add(rbox(0.06, 0.018, 0.04, 0.008, M.plasticWhite, 'counter:soapDishBar', vx0 + 0.09, ty + 0.021, Z0 + 0.05));
  }

  // 櫃體正面鉻色毛巾桿＋擦手巾（drapeOver 前後垂下）
  {
    const barY = cy1 - 0.11, barR = 0.007, bz = doorZ1 + 0.035;
    const bx0 = vx0 + 0.12, bx1 = vx0 + 0.42;
    v.add(rod([bx0, barY, bz], [bx1, barY, bz], barR, M.metalChrome, 'towelBar', 16));
    for (const x of [bx0, bx1]) v.add(rod([x, barY, doorZ1], [x, barY, bz], 0.005, M.metalChrome, 'towelBarPost'));
    const tg = drapeOver({
      w: bx1 - bx0 - 0.06, d: barR * 2, overhang: { z0: 0.17, z1: 0.24 },
      thickness: 0.007, wrinkle: 0.016, edgeRadius: barR + 0.003, flare: 0.012, res: 0.012, rng: rng.fork('handTowel'),
    });
    const towel = mk(tg, M.fabricOat, 'handTowel');
    towel.position.set((bx0 + bx1) / 2, barY + barR + 0.002, bz);
    v.add(towel);
  }

  // 無框長方鏡（略窄於浴櫃）
  {
    const mw = VW - 0.06, my0 = 1.18, my1 = 1.98;
    v.add(boxMM(vxc - mw / 2, my0, Z0, vxc + mw / 2, my1, Z0 + 0.003, M.paintWhite, 'mirror:back', { cast: false }));
    v.add(boxMM(vxc - mw / 2, my0, Z0 + 0.003, vxc + mw / 2, my1, Z0 + 0.008, M.mirror, 'mirror'));
    const pl = new THREE.PointLight(L.LIGHT_COLORS.k3500, 1.2, 2.2, 2);
    pl.name = `${ROOM}:light:mirror`;
    pl.position.set(vxc, 2.25, Z0 + 0.45);
    pl.castShadow = false;
    v.add(pl);
  }
  root.add(v);

  // ═════════════════════════ 東牆擦手紙盒 ═════════════════════════
  {
    const pz = Z0 + VD + 0.18, py = 1.32, d = 0.1;
    const box = rbox(d, 0.32, 0.27, 0.02, M.plasticWhite, 'paperTowel:body', I.x1 - d / 2, py, pz);
    root.add(box);
    root.add(boxMM(I.x1 - d - 0.002, py - 0.02, pz - 0.08, I.x1 - d + 0.004, py + 0.1, pz + 0.08, M.glassFrosted, 'paperTowel:window', { cast: false }));
    root.add(boxMM(I.x1 - d - 0.001, py + 0.115, pz - 0.03, I.x1 - d + 0.004, py + 0.125, pz + 0.03, M.plasticSage, 'paperTowel:lock', { cast: false }));
    // 下方露出的紙巾
    const sheet = boxMM(I.x1 - d * 0.6, py - 0.24, pz - 0.075, I.x1 - d * 0.6 + 0.002, py - 0.155, pz + 0.075, M.paperWhite, 'paperTowel:sheet', { cast: false });
    sheet.rotation.z = rng.jitter(0.12, 0.04);
    root.add(sheet);
  }

  return root;
}
