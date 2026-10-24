/**
 * rooms/bathroom.js — 廁所濕區（依屋主實拍 p07 / p08 重做）
 *
 * 只有淋浴＋馬桶；洗手台在門外的 hall（rooms/hall.js）。
 * 平面（全部由 layout.js 推出）：
 *   北端 z0：淋浴區（深 SHOWER_D）— 西牆鉻色花灑組、角落鐵網籃、玻璃拉門、拉門內側線性排水溝
 *   南段：馬桶靠西牆、面向東邊的門；長度受門掃掠區限制
 *   東牆：廁所門（往內開，shell 做門片）
 *   四面牆：灰褐石紋大磚（橫貼 60×30），淺色磚縫
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import { roundedBox, extrudeRounded, roundedRectShape, drapeOver, lathe, tube, worldUV } from '../geo.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const ROOM = 'bathroom';

const TILE_T = 0.008;
const GROUT_T = 0.004;
const CLAD = TILE_T + GROUT_T;
const TILE_GAP = 0.003;
const SHOWER_D = 0.9;

// ───────────────────────────────────────────────────────
// 小工具
// ───────────────────────────────────────────────────────
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

/** 兩點之間的圓管幾何（世界座標） */
function rodGeo(a, b, r, seg = 10) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  const mid = va.add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}
const rod = (a, b, r, mat, name, seg) => mk(rodGeo(a, b, r, seg), mat, name);

/** 牆面磁磚（溝縫底板＋一塊塊磚合併） */
function tileWall(group, rng, { name, axis, c, dir, a0, a1, y0, y1, tw, th, origin = a0 }) {
  const place = (geo, a, y, depth) => {
    const off = c + dir * depth;
    if (axis === 'x') geo.translate(a, y, off);
    else { geo.rotateY(Math.PI / 2); geo.translate(off, y, a); }
    return geo;
  };
  group.add(mk(place(new THREE.BoxGeometry(a1 - a0, y1 - y0, GROUT_T), (a0 + a1) / 2, (y0 + y1) / 2, GROUT_T / 2), M.groutLight, `${name}:grout`, { cast: false }));
  const geos = [];
  const startA = origin - Math.ceil((origin - a0) / tw - 1e-6) * tw;   // 讓磚縫對齊 origin（各牆一致）
  for (let y = 0; y < y1 - 1e-4; y += th) {
    for (let a = startA; a < a1 - 1e-4; a += tw) {
      const ta0 = Math.max(a, a0) + TILE_GAP / 2, ta1 = Math.min(a + tw, a1) - TILE_GAP / 2;
      const ty0 = Math.max(y, y0) + TILE_GAP / 2, ty1 = Math.min(y + th, y1) - TILE_GAP / 2;
      if (ta1 - ta0 < 0.01 || ty1 - ty0 < 0.01) continue;
      const t = TILE_T * rng.range(0.88, 1.0);
      geos.push(place(roundedBox(ta1 - ta0, ty1 - ty0, t, 0.001, 1), (ta0 + ta1) / 2, (ty0 + ty1) / 2, GROUT_T + t / 2));
    }
  }
  group.add(mk(worldUV(mergeGeometries(geos)), M.stoneTileWall, `${name}:tiles`, { cast: false }));
}

/** 掛在橫桿上的毛巾：U 形斷面，桿在原點、沿 z 方向寬 w（置中） */
function towelGeo(w, barR, hangFront, hangBack) {
  const t = 0.012, R = barR + t + 0.002;
  const s = new THREE.Shape();
  s.moveTo(-R, -hangBack);
  s.lineTo(-R, 0);
  s.absarc(0, 0, R, Math.PI, 0, true);
  s.lineTo(R, -hangFront);
  s.lineTo(R - t, -hangFront);
  s.lineTo(R - t, 0);
  s.absarc(0, 0, R - t, 0, Math.PI, false);
  s.lineTo(-R + t, -hangBack);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -w / 2);
  return g;
}

// ───────────────────────────────────────────────────────
export function build() {
  const rng = rngFor(ROOM);
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;

  const H = L.CEILING_HEIGHT;
  const I = L.roomInterior(ROOM);
  const SZ = L.doorSwingZone(ROOM);
  const door = L.openingsOfRoom(ROOM).find((o) => o.category === 'door' && o.opensInto === ROOM);

  const W0 = I.x0 + CLAD, W1 = I.x1 - CLAD, N = I.z0 + CLAD, S = I.z1 - CLAD;
  const midX = (W0 + W1) / 2;
  const glassZ = I.z0 + SHOWER_D;
  const showerZ = (N + glassZ) / 2;

  // ═════════════════════════ 牆面：灰褐石紋大磚 ═════════════════════════
  const tiles = new THREE.Group();
  tiles.name = `${ROOM}:wallTiles`;
  const tile = { tw: 0.6, th: 0.3, y0: 0, y1: H - 0.002 };
  tileWall(tiles, rng, { name: 'tile:west', axis: 'z', c: I.x0, dir: 1, a0: I.z0, a1: I.z1, origin: I.z0, ...tile });
  tileWall(tiles, rng, { name: 'tile:north', axis: 'x', c: I.z0, dir: 1, a0: W0, a1: W1, origin: I.x0, ...tile });
  tileWall(tiles, rng, { name: 'tile:south', axis: 'x', c: I.z1, dir: -1, a0: W0, a1: W1, origin: I.x0, ...tile });
  // 東牆：避開門洞（門在東牆時才挖；門框兩側各留 5mm）
  if (door.side === 'x1') {
    tileWall(tiles, rng, { name: 'tile:eastN', axis: 'z', c: I.x1, dir: -1, a0: I.z0, a1: door.from - 0.005, origin: I.z0, ...tile });
    tileWall(tiles, rng, { name: 'tile:eastS', axis: 'z', c: I.x1, dir: -1, a0: door.to + 0.005, a1: I.z1, origin: I.z0, ...tile });
    tileWall(tiles, rng, { name: 'tile:eastHead', axis: 'z', c: I.x1, dir: -1, a0: door.from - 0.005, a1: door.to + 0.005, origin: I.z0, ...tile, y0: L.DOOR_HEIGHT + 0.01 });
  } else {
    tileWall(tiles, rng, { name: 'tile:east', axis: 'z', c: I.x1, dir: -1, a0: I.z0, a1: I.z1, origin: I.z0, ...tile });
  }
  root.add(tiles);

  // ═════════════════════════ 淋浴區 ═════════════════════════
  const shower = new THREE.Group();
  shower.name = `${ROOM}:shower`;

  // —— 玻璃拉門：一片固定（內側）＋一片滑門（外側，往西半開），細鉻框、上方鉻色橫桿 ——
  {
    const railY = 2.02, gy0 = 0.018, gy1 = 1.98;
    const pw = (W1 - W0) / 2 + 0.06;               // 每片寬（中間重疊）
    const zIn = glassZ - 0.014, zOut = glassZ + 0.014;
    const openShift = 0.18;                        // 滑門往西拉開一點，東側留入口
    const panels = [
      { id: 'fixed', x0: W0 + 0.004, x1: W0 + 0.004 + pw, z: zIn },
      { id: 'slider', x0: W1 - pw - openShift, x1: W1 - openShift, z: zOut },
    ];
    for (const p of panels) {
      shower.add(boxMM(p.x0, gy0, p.z - 0.004, p.x1, gy1, p.z + 0.004, M.glass, `shower:glass:${p.id}`, { cast: false }));
      // 細鉻邊框（左右直框＋上框）
      shower.add(boxMM(p.x0, gy0, p.z - 0.007, p.x0 + 0.012, gy1, p.z + 0.007, M.metalChrome, `shower:glass:${p.id}:edgeL`));
      shower.add(boxMM(p.x1 - 0.012, gy0, p.z - 0.007, p.x1, gy1, p.z + 0.007, M.metalChrome, `shower:glass:${p.id}:edgeR`));
      shower.add(boxMM(p.x0, gy1 - 0.01, p.z - 0.007, p.x1, gy1 + 0.004, p.z + 0.007, M.metalChrome, `shower:glass:${p.id}:top`));
      // 吊輪：從橫桿掛下來
      for (const fx of [p.x0 + 0.08, p.x1 - 0.08]) {
        shower.add(rod([fx, gy1, p.z], [fx, railY, p.z], 0.005, M.metalChrome, `shower:glass:${p.id}:hanger`));
        const wheel = mk(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 20), M.metalChrome, `shower:glass:${p.id}:roller`);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(fx, railY, p.z);
        shower.add(wheel);
      }
    }
    // 上方橫桿（牆到牆）＋壁座
    shower.add(mk(tube([[W0, railY + 0.02, glassZ], [midX, railY + 0.02, glassZ], [W1, railY + 0.02, glassZ]], 0.011, { segments: 8, radial: 16 }), M.metalChrome, 'shower:rail'));
    for (const [sx, s] of [[W0, 1], [W1, -1]]) {
      const flange = mk(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 20), M.metalChrome, 'shower:railFlange');
      flange.rotation.z = Math.PI / 2;
      flange.position.set(sx + s * 0.006, railY + 0.02, glassZ);
      shower.add(flange);
    }
    // 滑門把手（外側直把）
    const hx = panels[1].x1 - 0.06;
    shower.add(rod([hx, 0.85, zOut + 0.035], [hx, 1.25, zOut + 0.035], 0.009, M.metalChrome, 'shower:handle', 14));
    for (const y of [0.88, 1.22]) shower.add(rod([hx, y, zOut + 0.004], [hx, y, zOut + 0.035], 0.006, M.metalChrome, 'shower:handlePost'));
    // 地面擋水條（低）
    shower.add(boxMM(W0, 0, glassZ - 0.03, W1, 0.012, glassZ + 0.03, M.stoneDark, 'shower:threshold'));
  }

  // —— 線性排水溝（拉門內側，沿玻璃） ——
  {
    const dz0 = glassZ - 0.14, dz1 = glassZ - 0.065;
    shower.add(boxMM(W0 + 0.03, 0, dz0, W1 - 0.03, 0.004, dz1, M.metalBrushed, 'shower:drain'));
    const slots = [];
    for (let x = W0 + 0.06; x < W1 - 0.06; x += 0.025) {
      const g = new THREE.BoxGeometry(0.01, 0.002, dz1 - dz0 - 0.025);
      g.translate(x, 0.0042, (dz0 + dz1) / 2);
      slots.push(g);
    }
    shower.add(mk(mergeGeometries(slots), M.plasticBlack, 'shower:drainSlots', { cast: false }));
  }

  // —— 西牆花灑組（鉻）：混水閥、滑桿＋手持、頂噴大花灑、軟管 ——
  {
    const sz = showerZ + 0.05;
    const valveY = 1.0, topY = 2.12, armLen = 0.4;
    const plate = mk(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 32), M.metalChrome, 'shower:valvePlate');
    plate.rotation.z = Math.PI / 2;
    plate.position.set(W0 + 0.005, valveY, sz);
    shower.add(plate);
    const mixer = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 24), M.metalChrome, 'shower:mixer');
    mixer.rotation.x = Math.PI / 2;
    mixer.position.set(W0 + 0.07, valveY, sz);
    shower.add(mixer);
    shower.add(rod([W0 + 0.01, valveY, sz - 0.08], [W0 + 0.07, valveY, sz - 0.08], 0.014, M.metalChrome, 'shower:mixerLegA'));
    shower.add(rod([W0 + 0.01, valveY, sz + 0.08], [W0 + 0.07, valveY, sz + 0.08], 0.014, M.metalChrome, 'shower:mixerLegB'));
    for (const [i, dz] of [[0, -0.14], [1, 0.14]].values()) {
      const k = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 20), M.metalChrome, `shower:knob${i}`);
      k.rotation.x = Math.PI / 2;
      k.position.set(W0 + 0.07, valveY, sz + dz);
      shower.add(k);
    }
    // 立管（兼滑桿）
    const px = W0 + 0.05;
    shower.add(rod([W0 + 0.07, valveY + 0.03, sz], [px, valveY + 0.12, sz], 0.012, M.metalChrome, 'shower:riserElbow'));
    shower.add(rod([px, valveY + 0.12, sz], [px, topY, sz], 0.012, M.metalChrome, 'shower:riser', 16));
    shower.add(rod([W0, 1.75, sz], [px, 1.75, sz], 0.008, M.metalChrome, 'shower:riserBracket'));
    // 頂噴：手臂往 +x 伸出，下掛圓形大花灑
    shower.add(rod([px, topY, sz], [px + armLen, topY, sz], 0.011, M.metalChrome, 'shower:arm', 16));
    const elbow = mk(new THREE.SphereGeometry(0.015, 16, 10), M.metalChrome, 'shower:elbow');
    elbow.position.set(px, topY, sz);
    shower.add(elbow);
    shower.add(rod([px + armLen, topY, sz], [px + armLen, topY - 0.04, sz], 0.01, M.metalChrome, 'shower:drop'));
    // 頂噴：車削的薄碟（上緣圓弧、下方平面出水面）
    const head = mk(lathe([[0, -0.012], [0.1, -0.012], [0.112, -0.009], [0.116, -0.003], [0.112, 0.004], [0.06, 0.009], [0.014, 0.011], [0, 0.011]], 64), M.metalChrome, 'shower:rainHead');
    head.position.set(px + armLen, topY - 0.052, sz);
    shower.add(head);
    const face = mk(lathe([[0, 0], [0.098, 0], [0.1, 0.001], [0, 0.001]], 64), M.metalBrushed, 'shower:rainFace', { cast: false });
    face.position.set(px + armLen, topY - 0.0655, sz);
    face.rotation.x = Math.PI;
    shower.add(face);
    // 滑座＋手持花灑
    const sy = 1.55;
    shower.add(rbox(0.04, 0.06, 0.04, 0.01, M.metalChrome, 'shower:slider', px + 0.012, sy, sz));
    const hand = new THREE.Group();
    hand.name = `${ROOM}:shower:handShower`;
    const handle = mk(new THREE.CylinderGeometry(0.013, 0.011, 0.2, 16), M.metalChrome, 'shower:handHandle');
    handle.position.y = -0.1;
    hand.add(handle);
    const hh = mk(new THREE.CylinderGeometry(0.045, 0.032, 0.03, 28), M.metalChrome, 'shower:handHead');
    hh.rotation.z = -Math.PI / 2 + 0.3;
    hh.position.set(0.02, 0.012, 0);
    hand.add(hh);
    hand.position.set(px + 0.045, sy + 0.08, sz);
    hand.rotation.z = 0.25;
    shower.add(hand);
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(W0 + 0.07, valveY - 0.03, sz + 0.02),
      new THREE.Vector3(W0 + 0.1, valveY - 0.35, sz + 0.06),
      new THREE.Vector3(W0 + 0.12, valveY - 0.5, sz + 0.1),
      new THREE.Vector3(W0 + 0.12, valveY - 0.2, sz + 0.11),
      new THREE.Vector3(W0 + 0.08, sy - 0.18, sz + 0.06),
      new THREE.Vector3(W0 + 0.07, sy - 0.05, sz + 0.01),
    ]);
    shower.add(mk(new THREE.TubeGeometry(hose, 48, 0.0065, 8, false), M.metalChrome, 'shower:hose'));
  }

  // —— 鉻色鐵網置物籃：東北角三角籃＋西牆長方籃 ——
  const bottleMats = [M.plasticWhite, M.plasticSage, M.plasticBlush, M.plasticWhite];
  const bottle = (name, x, y, z, h, mat) => {
    shower.add(rbox(0.06, h, 0.06, 0.012, mat, name, x, y + h / 2, z));
    shower.add(rod([x, y + h, z], [x, y + h + 0.025, z], 0.009, M.plasticWhite, `${name}:cap`));
  };
  {
    // 角落籃（四分之一圓）
    const R = 0.22, y0 = 1.15, rimH = 0.07;
    const cx = W1, cz = N;
    const geos = [];
    const arc = (y) => {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * (Math.PI / 2);
        pts.push(new THREE.Vector3(cx - Math.sin(a) * R, y, cz + Math.cos(a) * R));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.003, 5, false);
    };
    geos.push(arc(y0), arc(y0 + rimH));
    for (let i = 0; i <= 6; i++) {                             // 底部放射狀鐵線＋立線
      const a = (i / 6) * (Math.PI / 2);
      const ex = cx - Math.sin(a) * R, ez = cz + Math.cos(a) * R;
      geos.push(rodGeo([cx - 0.004, y0, cz + 0.004], [ex, y0, ez], 0.0025, 5));
      geos.push(rodGeo([ex, y0, ez], [ex, y0 + rimH, ez], 0.0025, 5));
    }
    for (const r of [R * 0.4, R * 0.7]) {                       // 底部同心鐵線
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        pts.push(new THREE.Vector3(cx - Math.sin(a) * r, y0, cz + Math.cos(a) * r));
      }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0025, 5, false));
    }
    shower.add(mk(mergeGeometries(geos), M.metalChrome, 'shower:cornerBasket'));
    bottle('shower:cornerBottle0', cx - 0.06, y0 + 0.003, cz + 0.12, 0.2, bottleMats[0]);
    bottle('shower:cornerBottle1', cx - 0.12, y0 + 0.003, cz + 0.06, 0.17, bottleMats[1]);

    // 西牆長方籃（靠玻璃那側，比花灑高）
    const bz0 = glassZ - 0.38, bz1 = glassZ - 0.08, bd = 0.11, by = 1.7;
    const g2 = [];
    const corners = [[W0, bz0], [W0 + bd, bz0], [W0 + bd, bz1], [W0, bz1]];
    for (const y of [by, by + 0.06]) {
      for (let i = 0; i < 3; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[i + 1];
        g2.push(rodGeo([ax, y, az], [bx, y, bz], 0.003, 5));
      }
    }
    for (let z = bz0; z <= bz1 + 1e-6; z += (bz1 - bz0) / 8) g2.push(rodGeo([W0, by, z], [W0 + bd, by, z], 0.0025, 5));
    for (const [x, z] of corners.slice(1, 3)) g2.push(rodGeo([x, by, z], [x, by + 0.06, z], 0.003, 5));
    for (let z = bz0 + 0.04; z < bz1; z += 0.04) g2.push(rodGeo([W0 + bd, by, z], [W0 + bd, by + 0.06, z], 0.0022, 4));
    g2.push(rodGeo([W0, by + 0.06, bz0 + 0.02], [W0, by + 0.16, bz0 + 0.02], 0.003, 5));
    g2.push(rodGeo([W0, by + 0.06, bz1 - 0.02], [W0, by + 0.16, bz1 - 0.02], 0.003, 5));
    shower.add(mk(mergeGeometries(g2), M.metalChrome, 'shower:wallBasket'));
    bottle('shower:wallBottle0', W0 + 0.055, by + 0.003, bz0 + 0.06, 0.18, bottleMats[2]);
    bottle('shower:wallBottle1', W0 + 0.055, by + 0.003, bz0 + 0.14, 0.2, bottleMats[3]);
    shower.add(rbox(0.055, 0.025, 0.08, 0.01, M.paintCream, 'shower:soap', W0 + 0.055, by + 0.016, bz1 - 0.07));
  }

  // —— 淋浴區嵌燈（實拍天花為圓形嵌燈） ——
  {
    const trim = mk(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 32), M.plasticWhite, 'shower:downlightTrim', { cast: false });
    trim.position.set(midX, H - 0.003, showerZ);
    shower.add(trim);
    const lens = mk(new THREE.CylinderGeometry(0.048, 0.048, 0.002, 32), M.lampBulb, 'shower:downlightLens', { cast: false });
    lens.position.set(midX, H - 0.007, showerZ);
    shower.add(lens);
    const pl = new THREE.PointLight(L.LIGHT_COLORS.k3500, 1.6, 2.6, 2);
    pl.name = `${ROOM}:light:shower`;
    pl.position.set(midX, H - 0.15, showerZ);
    pl.castShadow = false;
    shower.add(pl);
  }
  root.add(shower);

  // ═════════════════════════ 馬桶（白色免治，靠西牆面向門） ═════════════════════════
  {
    // 前緣不可進入門掃掠區（若馬桶與掃掠區在 z 上重疊）
    const tz = glassZ + 0.42;
    const overlapsSwing = tz + 0.26 > SZ.z0 && tz - 0.26 < SZ.z1;
    const maxLen = overlapsSwing ? SZ.x0 - W0 - 0.012 : 0.68;
    const len = Math.min(0.68, maxLen);
    const k = len / 0.68;                          // 依可用深度縮放前後向尺寸

    const t = new THREE.Group();
    t.name = `${ROOM}:toilet`;
    // 本地：背靠牆在 z=0、前方 +z；轉 90° 後 +z → 世界 +x
    // 水箱：大圓角
    t.add(rbox(0.38, 0.35, 0.17, 0.035, M.ceramicWhite, 'toilet:tank', 0, 0.6, 0.095, 5));
    t.add(rbox(0.4, 0.032, 0.19, 0.014, M.ceramicWhite, 'toilet:tankLid', 0, 0.79, 0.095, 4));
    t.add(rod([0.19, 0.72, 0.13], [0.205, 0.72, 0.13], 0.012, M.metalChrome, 'toilet:leverBase'));
    t.add(rbox(0.012, 0.016, 0.075, 0.006, M.metalChrome, 'toilet:lever', 0.212, 0.72, 0.16));
    // 本體：車削後壓成蛋形（前窄後寬），底座往後收，整體平滑
    {
      const prof = [
        [0.0, 0.0], [0.105, 0.0], [0.112, 0.008], [0.116, 0.06], [0.12, 0.15], [0.132, 0.23], [0.152, 0.29],
        [0.17, 0.34], [0.18, 0.37], [0.183, 0.385], [0.18, 0.398], [0.168, 0.404], [0.15, 0.402],
        [0.136, 0.392], [0.11, 0.35], [0.07, 0.3], [0.03, 0.275], [0.0, 0.27],
      ];
      let g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 72);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const zn = z / 0.183;                                  // -1 後 … +1 前
        x *= 1 - 0.13 * Math.max(0, zn) ** 2;                   // 前端收窄成蛋形
        z *= 1.38;
        const low = Math.max(0, 1 - y / 0.26);                  // 底座：往後縮、前後變短
        z = z * (1 - 0.3 * low) - 0.05 * low;
        pos.setXYZ(i, x, y, z);
      }
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      g = mergeVertices(g, 1e-5);
      g.computeVertexNormals();
      const bowl = mk(worldUV(g), M.ceramicWhite, 'toilet:bowl');
      bowl.position.set(0, 0, 0.42);
      t.add(bowl);
    }
    // 後段連接體（倒角圓角板疊成）
    {
      const rear = mk(extrudeRounded(roundedRectShape(0.27, 0.24, 0.09), 0.38, 0.03), M.ceramicWhite, 'toilet:rearBody');
      rear.position.set(0, 0.0, 0.2);
      t.add(rear);
    }
    // 免治便座：後方機身、座圈（露出邊）、蓋板（大圓角）、側面板
    const egg = (w, d, seg = 72) => Array.from({ length: seg }, (_, i) => {
      const a = (i / seg) * Math.PI * 2;
      const s = Math.sin(a);
      return [(w / 2) * Math.cos(a) * (1 - 0.14 * Math.max(0, s) ** 2), (d / 2) * s];
    });
    {
      const body = mk(extrudeRounded(roundedRectShape(0.42, 0.15, 0.055), 0.075, 0.022), M.plasticWhite, 'toilet:washletBody');
      body.position.set(0, 0.398, 0.215);
      t.add(body);
      const seat = mk(extrudeRounded(egg(0.37, 0.47), 0.022, 0.009), M.plasticWhite, 'toilet:seat');
      seat.position.set(0, 0.401, 0.45);
      t.add(seat);
      const lid = mk(extrudeRounded(egg(0.36, 0.455), 0.03, 0.013), M.plasticWhite, 'toilet:lid');
      lid.position.set(0, 0.423, 0.448);
      t.add(lid);
      t.add(rbox(0.04, 0.05, 0.14, 0.016, M.plasticWhite, 'toilet:sidePanel', 0.215, 0.43, 0.3, 4));
      for (let i = 0; i < 3; i++) {
        const btn = mk(lathe([[0, 0], [0.007, 0], [0.007, 0.003], [0, 0.004]], 16), i === 0 ? M.plasticBlush : M.stoneDark, `toilet:button${i}`);
        btn.position.set(0.215, 0.455, 0.26 + i * 0.03);
        t.add(btn);
      }
    }
    // 角閥
    t.add(rod([-0.13, 0.17, 0.0], [-0.13, 0.17, 0.06], 0.012, M.metalChrome, 'toilet:valve'));
    t.add(rod([-0.13, 0.17, 0.045], [-0.13, 0.43, 0.045], 0.005, M.metalChrome, 'toilet:supply'));
    t.rotation.y = Math.PI / 2;
    t.scale.z = k;                                  // 依可用深度縮放前後向
    t.position.set(W0 + 0.004, 0, tz);
    root.add(t);

    // 衛生紙架（西牆、馬桶南側）
    const hz = tz + 0.36, hy = 0.72;
    root.add(boxMM(W0, hy - 0.035, hz - 0.075, W0 + 0.01, hy + 0.035, hz + 0.075, M.metalChrome, 'paperHolder:plate'));
    root.add(boxMM(W0, hy + 0.06, hz - 0.075, W0 + 0.125, hy + 0.066, hz + 0.075, M.metalChrome, 'paperHolder:cover'));
    root.add(boxMM(W0 + 0.004, hy + 0.035, hz - 0.075, W0 + 0.01, hy + 0.06, hz + 0.075, M.metalChrome, 'paperHolder:coverBack'));
    root.add(rod([W0 + 0.07, hy, hz - 0.07], [W0 + 0.07, hy, hz + 0.07], 0.007, M.metalChrome, 'paperHolder:rod'));
    const roll = mk(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 28), M.paperWhite, 'paperHolder:roll');
    roll.rotation.x = Math.PI / 2;
    roll.position.set(W0 + 0.07, hy, hz);
    root.add(roll);
    root.add(boxMM(W0 + 0.124, hy - 0.12, hz - 0.05, W0 + 0.126, hy, hz + 0.05, M.paperWhite, 'paperHolder:tail', { cast: false }));
  }

  // ═════════════════════════ 南牆鉻色毛巾桿＋浴巾、排風扇 ═════════════════════════
  {
    const barY = 1.25, barR = 0.011, standoff = 0.065;
    const bx0 = W0 + 0.12, bx1 = Math.min(W0 + 0.72, SZ.x0 - 0.02);
    const bz = S - standoff;
    root.add(rod([bx0, barY, bz], [bx1, barY, bz], barR, M.metalChrome, 'towelBar', 16));
    for (const x of [bx0, bx1]) {
      root.add(rod([x, barY, S], [x, barY, bz], 0.007, M.metalChrome, 'towelBarPost'));
      const rose = mk(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 20), M.metalChrome, 'towelBarRose');
      rose.rotation.x = Math.PI / 2;
      rose.position.set(x, barY, S - 0.004);
      root.add(rose);
    }
    // 浴巾：drapeOver 跨在桿上，前後兩側垂下（前長後短），帶皺褶
    const tg = drapeOver({
      w: bx1 - bx0 - 0.07, d: barR * 2, overhang: { z0: 0.52, z1: 0.42 },
      thickness: 0.009, wrinkle: 0.022, edgeRadius: barR + 0.004, flare: 0.018, res: 0.015, rng: rng.fork('towel'),
    });
    const towel = mk(tg, M.fabricWhite, 'bathTowel');
    towel.position.set((bx0 + bx1) / 2, barY + barR + 0.002, bz);
    root.add(towel);

    // 排風扇（乾區天花，避開 shell 主燈）
    const [, fixZ] = L.rectCenter(L.ROOMS[ROOM].rect);
    const fz = Math.max(fixZ + 0.42, S - 0.3), fx = midX;
    root.add(boxMM(fx - 0.13, H - 0.01, fz - 0.13, fx + 0.13, H - 0.001, fz + 0.13, M.plasticWhite, 'exhaustFan:frame', { cast: false }));
    const slots = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.BoxGeometry(0.2, 0.003, 0.012);
      g.translate(fx, H - 0.0115, fz - 0.09 + i * 0.03);
      slots.push(g);
    }
    root.add(mk(mergeGeometries(slots), M.stoneDark, 'exhaustFan:slots', { cast: false }));
  }

  return root;
}
