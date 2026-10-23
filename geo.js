/**
 * geo.js — 共用造型工具（全專案共用，各區只能呼叫、不能改）
 *
 * 目標：讓程式生成的物件「像真的」——
 *   1. 所有硬邊都有倒角（roundedBox）：真實家具 2~5mm 的圓角會接住光線。
 *   2. 軟件會鼓起來（cushion / mattress）：抱枕、坐墊、床墊中間飽滿、邊緣收縫。
 *   3. 布料會垂墜（drapeOver / curtain）：被子、毯子、桌巾沿邊緣自然垂下，帶固定種子的皺褶。
 *   4. 器物用車削（lathe）：花瓶、燈罩、杯子。
 *
 * 所有函式回傳 BufferGeometry，UV 一律是「公尺」單位（worldUV），
 * 所以 materials.js 的紋理在每個物件上比例一致。
 * 需要隨機時傳入 rng（rng.js 的 rngFor / fork），不能用 Math.random。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** 紋理一個 UV 單位代表幾公尺（materials.js 的紋理照此繪製） */
export const UV_METERS = 0.5;

// ═══════════════════════════════════════════════════════
// 基礎：UV、雜訊
// ═══════════════════════════════════════════════════════

/**
 * 依法線主軸做方盒投影 UV（公尺單位）。幾何建好後呼叫，讓紋理不被拉伸。
 * 會覆蓋原本的 uv。
 */
export function worldUV(geo, meters = UV_METERS) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / meters;
    uv[i * 2 + 1] = v / meters;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** 固定種子 3D 值雜訊（-1~1），給皺褶、凹凸用 */
export function makeNoise(rng) {
  const perm = new Uint8Array(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const vals = Float32Array.from({ length: 256 }, () => rng.next() * 2 - 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fade = (t) => t * t * (3 - 2 * t);
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const noise = (x, y = 0, z = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    return lerp(
      lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), xf), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
      zf,
    );
  };
  /** 多層雜訊（fbm） */
  noise.fbm = (x, y = 0, z = 0, oct = 3) => {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f, z * f); a *= 0.5; f *= 2; }
    return s;
  };
  return noise;
}

/** 合併重複頂點並重算平滑法線（細分方塊變形後用） */
function smoothen(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-5);
  merged.computeVertexNormals();
  return merged;
}

// ═══════════════════════════════════════════════════════
// 硬件：倒角方塊、倒角擠出
// ═══════════════════════════════════════════════════════

/**
 * 倒角方塊（家具、櫃體、門板、層板的基本單位）。
 * radius 預設 4mm；中心在原點，跟 BoxGeometry 一樣好替換。
 */
export function roundedBox(w, h, d, radius = 0.004, segments = 2) {
  const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return worldUV(new RoundedBoxGeometry(w, h, d, segments, Math.max(r, 1e-4)));
}

/**
 * 2D 輪廓擠出並倒角（桌面、圓角櫃端、異形板）。
 * shapePts：[[x, z], ...] 逆時針；擠出厚度沿 +y，底面在 y=0。
 */
export function extrudeRounded(shapePts, depth, bevel = 0.004) {
  const shape = new THREE.Shape(shapePts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 32,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return worldUV(geo);
}

/** 圓角矩形輪廓點（給 extrudeRounded 用），中心在原點 */
export function roundedRectShape(w, d, r) {
  const pts = [];
  const seg = 8;
  const cs = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90], [-w / 2 + r, -d / 2 + r, 180], [w / 2 - r, -d / 2 + r, 270]];
  for (const [cx, cz, a0] of cs) {
    for (let i = 0; i <= seg; i++) {
      const a = THREE.MathUtils.degToRad(a0 + (90 * i) / seg);
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  return pts;
}

/** 橢圓 / 圓輪廓點 */
export function ellipseShape(w, d, seg = 64) {
  return Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [(w / 2) * Math.cos(a), (d / 2) * Math.sin(a)];
  });
}

// ═══════════════════════════════════════════════════════
// 軟件：抱枕、坐墊、床墊
// ═══════════════════════════════════════════════════════

/**
 * 抱枕／靠墊：中間飽滿、四邊收成一條縫、角落尖。
 *   w × d 是平放時的長寬，h 是中心最厚處。中心在原點，平放（厚度沿 y）。
 *   要立起來靠在沙發上：mesh.rotation.x = -Math.PI/2 + 傾角。
 *   opts.seam：邊緣厚度比例（0.1~0.3），opts.wrinkle：皺褶強度（公尺），opts.rng：皺褶亂數
 */
export function cushion(w, h, d, { seam = 0.15, wrinkle = 0.004, rng = null, segments = 20 } = {}) {
  let geo = new THREE.BoxGeometry(1, 1, 1, segments, 6, segments);
  geo = smoothen(geo);
  const noise = rng ? makeNoise(rng) : null;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i) * 2, ny = p.getY(i) * 2, nz = p.getZ(i) * 2;
    const e = (1 - nx ** 4) * (1 - nz ** 4);                 // 中心 1、邊緣 0
    const thick = seam + (1 - seam) * Math.sqrt(Math.max(e, 0));
    // 角落往內收一點，讓四角像抱枕一樣尖
    const pinch = 1 - 0.06 * (nx ** 2) * (nz ** 2) * (1 - Math.abs(ny));
    let x = nx * (w / 2) * pinch;
    let z = nz * (d / 2) * pinch;
    let y = ny * (h / 2) * thick;
    if (noise) {
      const n = noise.fbm(x * 9, y * 9, z * 9) * wrinkle * (0.3 + 0.7 * (1 - e));
      y += n * Math.sign(ny || 1);
      x += noise(x * 6 + 7, z * 6) * wrinkle * 0.5;
    }
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return worldUV(geo);
}

/**
 * 床墊／沙發坐墊：方正但邊緣圓潤、頂面微鼓（不像抱枕那麼圓）。
 *   中心在原點。radius：邊緣圓角，crown：頂面中央鼓起高度。
 */
export function mattress(w, h, d, { radius = 0.04, crown = 0.015, wrinkle = 0, rng = null } = {}) {
  // 細分方塊 → 把每個點推到「內縮方塊 + 圓角半徑」上，得到頂面也有細分的圓角盒
  const r = Math.min(radius, h / 2 - 1e-3, w / 2 - 1e-3, d / 2 - 1e-3);
  let geo = new THREE.BoxGeometry(w, h, d, Math.max(8, Math.round(w / 0.05)), 6, Math.max(8, Math.round(d / 0.05)));
  geo = smoothen(geo);
  {
    const p = geo.attributes.position;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    const v = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
      const dir = v.clone().sub(c);
      if (dir.lengthSq() > 1e-12) v.copy(c).addScaledVector(dir.normalize(), r);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  const noise = rng ? makeNoise(rng) : null;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0) {
      const e = (1 - (2 * x / w) ** 2) * (1 - (2 * z / d) ** 2);
      let dy = crown * Math.max(e, 0) * (y / (h / 2));
      if (noise) dy += noise.fbm(x * 8, 0, z * 8) * wrinkle;
      p.setY(i, y + dy);
    }
  }
  geo.computeVertexNormals();
  return worldUV(geo);
}

// ═══════════════════════════════════════════════════════
// 布料：垂墜、窗簾
// ═══════════════════════════════════════════════════════

/**
 * 布料蓋在一個平台上，四邊自然垂下（被子、床旗、毯子、桌巾）。
 *   top：平台頂面範圍 { w, d }（以原點為中心），布料頂面在 y=0。
 *   overhang：四邊垂下的長度 { x0, x1, z0, z1 }（公尺，0 表示不垂）。
 *   thickness：布料厚度；wrinkle：皺褶強度；edgeRadius：越過邊緣時的彎曲半徑。
 *   回傳有厚度的實體（上下兩層＋邊）。
 */
export function drapeOver({ w, d, overhang = {}, thickness = 0.01, wrinkle = 0.012, edgeRadius = 0.03, rng = null, res = 0.03, flare = 0.04 }) {
  const oh = { x0: 0, x1: 0, z0: 0, z1: 0, ...overhang };
  const W = w + oh.x0 + oh.x1, D = d + oh.z0 + oh.z1;
  const sx = Math.max(4, Math.round(W / res)), sz = Math.max(4, Math.round(D / res));
  const noise = rng ? makeNoise(rng) : null;

  // 把「攤平」座標 s（沿布面距離）映射到 3D：在頂面內就平放，越界後繞過圓角往下垂
  const fold = (s, half) => {
    // s：從中心算起的攤平距離；回傳 [水平位置, 垂直位置(負=往下)]
    const a = Math.abs(s), sign = Math.sign(s) || 1;
    if (a <= half) return [s, 0];
    const over = a - half;
    const arc = (Math.PI / 2) * edgeRadius;
    if (over <= arc) {
      const t = over / edgeRadius;
      return [sign * (half - edgeRadius + edgeRadius * Math.sin(t) + edgeRadius), -edgeRadius * (1 - Math.cos(t))];
    }
    const down = over - arc;
    return [sign * (half + edgeRadius + down * (flare / Math.max(0.2, down + 0.2))), -edgeRadius - down];
  };

  const build = (offsetY) => {
    const g = new THREE.PlaneGeometry(W, D, sx, sz);
    g.rotateX(-Math.PI / 2);
    // 平面中心在 (W/2 - oh.x0 ...) 偏移，讓 (0,0) 對準平台中心
    g.translate((oh.x1 - oh.x0) / 2, 0, (oh.z1 - oh.z0) / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getZ(i);
      const [x, yx] = fold(u, w / 2);
      const [z, yz] = fold(v, d / 2);
      let y = Math.min(yx, yz) + offsetY;
      let X = x, Z = z;
      if (noise) {
        const hang = Math.min(1, (-Math.min(yx, yz)) / 0.15);   // 垂下的部分皺褶較大
        const n = noise.fbm(u * 4, 0, v * 4) * wrinkle * (0.35 + hang);
        y += n * (1 - hang);
        // 垂下部分的波浪：朝外推
        if (yx < -edgeRadius) X += Math.sign(x) * Math.abs(noise(v * 5, 3)) * wrinkle * 2 * hang;
        if (yz < -edgeRadius) Z += Math.sign(z) * Math.abs(noise(u * 5, 9)) * wrinkle * 2 * hang;
      }
      p.setXYZ(i, X, y, Z);
    }
    return g;
  };

  const topG = build(0);
  const botG = build(-thickness);
  // 底層翻面
  const idx = botG.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const geo = mergeGeoms([topG, botG]);
  geo.computeVertexNormals();
  return worldUV(geo);
}

/**
 * 窗簾：從桿子（y=0）往下垂 height，寬 width（沿 x），摺子沿 z 起伏。
 *   folds：摺數；depth：摺深；gather：0~1，越大越往一側收攏（0 = 展開）。
 *   opts.open：底部往外微擺；回傳雙面薄片（材質請用 DoubleSide 的 sheerCurtain 或布料）。
 */
export function curtain(width, height, { folds = 10, depth = 0.05, rng = null, sway = 0.02, res = 0.025 } = {}) {
  const sx = Math.max(8, Math.round(width / res) * 2), sy = Math.max(8, Math.round(height / 0.05));
  const g = new THREE.PlaneGeometry(width, height, sx, sy);
  g.translate(0, -height / 2, 0);
  const noise = rng ? makeNoise(rng) : null;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = -y / height;                         // 0 頂端 → 1 底端
    const phase = (x / width) * folds * Math.PI * 2;
    let z = Math.sin(phase) * depth * (0.85 + 0.15 * t);
    if (noise) {
      z += noise.fbm(x * 3, y * 2) * sway * t;
      z += noise(x * 0.5 + 11, y * 1.5) * depth * 0.25;
    }
    p.setZ(i, z);
  }
  g.computeVertexNormals();
  return worldUV(g);
}

// ═══════════════════════════════════════════════════════
// 器物：車削、管線
// ═══════════════════════════════════════════════════════

/**
 * 車削（花瓶、燈罩、杯子、桌腳）。profile：[[半徑, 高度], ...] 由下往上。
 * 自動加一點點平滑；底面在 y = profile[0][1]。
 */
export function lathe(profile, segments = 48) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  return worldUV(new THREE.LatheGeometry(pts, segments));
}

/** 沿點雕出的圓管（龍頭、燈臂、椅架、電線） */
export function tube(points, radius, { segments = 64, radial = 12, closed = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return worldUV(new THREE.TubeGeometry(curve, segments, radius, radial, closed));
}

// ═══════════════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════════════

/** 合併多個（有 index 的）幾何，只保留 position，之後請重算法線與 UV */
export function mergeGeoms(geos) {
  let count = 0;
  const pos = [], idx = [];
  for (const g of geos) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const ind = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
    for (const i of ind) idx.push(i + count);
    count += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

/** 建 mesh 並設好陰影與名稱（各區常用） */
export function mesh(geo, material, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
