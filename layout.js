/**
 * layout.js — 場景平面圖（唯一座標來源）
 *
 * 之後所有程式（牆、地板、家具、燈光、攝影機路徑）都只能從這份讀座標，
 * 不要在其他檔案寫死任何數字座標。
 *
 * ── 座標系 ──────────────────────────────────────────────
 *   單位：公尺
 *   原點：平面圖外框左上角（左外牆中心線 × 玄關上外牆中心線）
 *   +x：往右（平面圖右側，客廳那一側）
 *   +z：往下（平面圖下方，雨遮／採光面那一側）
 *   +y：往上（樓板 y=0，天花板 y=CEILING_HEIGHT）
 *   → 與 three.js 預設一致，平面圖直接「平放」在 XZ 平面上。
 *
 * ── 比例 ────────────────────────────────────────────────
 *   原圖為示意圖（未依比例），以 75px ≈ 1m 換算後四捨五入到 0.05m。
 *   主體約 9.8m × 8.55m。
 *
 * ── 慣例 ────────────────────────────────────────────────
 *   牆：以「中心線」線段描述，厚度另給。
 *   房間 rect：以牆中心線圍出的範圍 { x0, z0, x1, z1 }（x0<x1、z0<z1）。
 *   開口（門／窗）：掛在某一道牆上，用沿牆方向的絕對座標 from~to 表示。
 */

// ═══════════════════════════════════════════════════════
// 全域尺寸
// ═══════════════════════════════════════════════════════
export const CEILING_HEIGHT = 2.8;
export const WALL = {
  exteriorThickness: 0.2,
  interiorThickness: 0.12,
};
export const DOOR_HEIGHT = 2.1;
export const WINDOW = { sill: 0.9, head: 2.4 };

/** 主體外框的包圍盒（不含雨遮、柱子） */
export const BOUNDS = { x0: 0, z0: 0, x1: 9.8, z1: 8.55 };

/** 實際外輪廓（順時針，[x, z]）：玄關往上凸出 0.55m，左上那一條不屬於室內 */
export const FOOTPRINT = [
  [0, 0.55], [7.5, 0.55], [7.5, 0], [9.8, 0], [9.8, 8.55], [0, 8.55],
];

// ═══════════════════════════════════════════════════════
// 房間（地板範圍）
// floor：地板材質提示，實際材質一律程式生成
// ═══════════════════════════════════════════════════════
export const ROOMS = {
  entrance:   { name: '玄關',   rect: { x0: 7.5,  z0: 0,    x1: 9.8,  z1: 2.9  }, floor: 'whiteTile' },   // 實拍：亮面白色 60×60 磚
  living:     { name: '客廳',   rect: { x0: 6.75, z0: 2.9,  x1: 9.8,  z1: 8.55 }, floor: 'wood'  },
  dining:     { name: '餐廳',   rect: { x0: 2.8,  z0: 2.9,  x1: 6.75, z1: 5.55 }, floor: 'wood'  },
  hall:       { name: '洗手台區', rect: { x0: 6.3,  z0: 1.3,  x1: 7.5,  z1: 2.9  }, floor: 'wood'  }, // 實拍：洗手台在濕區外
  masterBed:  { name: '主臥',   rect: { x0: 0,    z0: 5.55, x1: 4.05, z1: 8.55 }, floor: 'wood'  },
  secondBed:  { name: '次臥',   rect: { x0: 4.05, z0: 5.55, x1: 6.75, z1: 8.55 }, floor: 'wood'  },
  smallRoom:  { name: '小房',   rect: { x0: 0,    z0: 2.9,  x1: 2.8,  z1: 5.55 }, floor: 'wood'  },
  kitchen:    { name: '廚房',   rect: { x0: 2.2,  z0: 0.55, x1: 4.85, z1: 2.9  }, floor: 'darkTile' },  // 實拍：深灰 60×60 磚
  bathroom:   { name: '廁所',   rect: { x0: 4.85, z0: 0.55, x1: 6.3,  z1: 2.9  }, floor: 'stoneTile' }, // 實拍：灰褐石紋磚
  balcony:    { name: '陽台',   rect: { x0: 0,    z0: 0.55, x1: 2.2,  z1: 2.9  }, floor: 'outdoorTile' },
  shaft:      { name: '管道間', rect: { x0: 6.3,  z0: 0.55, x1: 7.5,  z1: 1.3  }, floor: 'none', walkable: false },
};

// ═══════════════════════════════════════════════════════
// 牆（中心線線段）
// ═══════════════════════════════════════════════════════
const EXT = 'exterior';
const INT = 'interior';

export const WALLS = {
  // 外牆
  extTopMain:    { from: [0, 0.55],    to: [7.5, 0.55],  type: EXT },
  extTopEntry:   { from: [7.5, 0],     to: [9.8, 0],     type: EXT },
  extEntryStep:  { from: [7.5, 0],     to: [7.5, 0.55],  type: EXT },
  extRight:      { from: [9.8, 0],     to: [9.8, 8.55],  type: EXT },
  extBottom:     { from: [0, 8.55],    to: [9.8, 8.55],  type: EXT },
  extLeft:       { from: [0, 0.55],    to: [0, 8.55],    type: EXT },

  // 內牆
  entryLeft:     { from: [7.5, 0.55],  to: [7.5, 2.9],   type: INT }, // 玄關左側短牆，下端自由端
  balconyKitchen:{ from: [2.2, 0.55],  to: [2.2, 2.9],   type: INT },
  kitchenBath:   { from: [4.85, 0.55], to: [4.85, 2.9],  type: INT },
  bathShaft:     { from: [6.3, 0.55],  to: [6.3, 2.9],   type: INT },
  shaftBottom:   { from: [6.3, 1.3],   to: [7.5, 1.3],   type: INT },
  row1Bottom:    { from: [0, 2.9],     to: [6.3, 2.9],   type: INT }, // 陽台/廚房/廁所 的下牆
  smallRoomRight:{ from: [2.8, 2.9],   to: [2.8, 5.55],  type: INT }, // 小房｜餐廳（玻璃拉門）
  row2Bottom:    { from: [0, 5.55],    to: [6.75, 5.55], type: INT }, // 小房/餐廳 與 臥室之間
  bedsDivider:   { from: [4.05, 5.55], to: [4.05, 8.55], type: INT }, // 主臥｜次臥
  secondLiving:  { from: [6.75, 5.55], to: [6.75, 8.55], type: INT }, // 次臥｜客廳
};

// ═══════════════════════════════════════════════════════
// 門
//   from/to：沿牆方向的絕對座標（水平牆＝x，垂直牆＝z）
//   hinge  ：鉸鏈端座標（from 或 to 其中之一）
//   opensInto：門片往哪個房間開
// ═══════════════════════════════════════════════════════
export const DOORS = {
  front:     { name: '大門',     wall: 'extTopEntry',    from: 7.6,  to: 8.5,  kind: 'swing',   hinge: 7.6,  opensInto: 'entrance'  },
  kitchen:   { name: '廚房門',   wall: 'row1Bottom',     from: 3.1,  to: 3.85, kind: 'swing',   hinge: 3.85, opensInto: 'kitchen'   },
  bathroom:  { name: '廁所門',   wall: 'bathShaft',      from: 1.95, to: 2.7,  kind: 'swing',   hinge: 2.7,  opensInto: 'bathroom'  }, // 實拍：門開在洗手台區那面
  balcony:   { name: '陽台門',   wall: 'row1Bottom',     from: 1.4,  to: 2.15, kind: 'swing',   hinge: 2.15, opensInto: 'balcony'   },
  smallRoom: { name: '小房玻璃拉門', wall: 'smallRoomRight', from: 3.3, to: 5.2, kind: 'sliding', panels: 2, glass: true },
  masterBed: { name: '主臥門',   wall: 'row2Bottom',     from: 3.1,  to: 3.9,  kind: 'swing',   hinge: 3.9,  opensInto: 'masterBed' },
  secondBed: { name: '次臥門',   wall: 'row2Bottom',     from: 4.15, to: 4.95, kind: 'swing',   hinge: 4.15, opensInto: 'secondBed' },
};

// ═══════════════════════════════════════════════════════
// 窗 / 開口
//   sill/head 未給時用 WINDOW 預設
// ═══════════════════════════════════════════════════════
export const WINDOWS = {
  // 依實拍：深古銅色鋁窗框、窗下多為木作臥榻（sill 0.45）、多數窗裝百葉簾（blinds）
  masterSouth:  { room: 'masterBed', wall: 'extBottom', from: 0.4,  to: 3.0,  sill: 0.45, head: 2.1 },                // 長窗，上方吊櫃、紗簾＋布簾（由主臥做）
  masterWest:   { room: 'masterBed', wall: 'extLeft',   from: 5.9,  to: 8.35, sill: 0.45, head: 2.3, blinds: true },  // 轉角大窗
  secondSouth:  { room: 'secondBed', wall: 'extBottom', from: 4.65, to: 6.05, blinds: true },
  livingSouth:  { room: 'living',    wall: 'extBottom', from: 7.0,  to: 9.3,  sill: 0.45, head: 2.4, blinds: true },  // 窗下整排臥榻
  smallWest:    { room: 'smallRoom', wall: 'extLeft',   from: 3.05, to: 4.4,  sill: 0.6,  head: 2.3, blinds: true },
  balconyWest:  { room: 'balcony',   wall: 'extLeft',   from: 0.65, to: 2.8, sill: 1.1, head: CEILING_HEIGHT, railing: true }, // 陽台開口＋欄杆
};

// ═══════════════════════════════════════════════════════
// 室外：雨遮與柱子（只做外觀用，不可走動）
// ═══════════════════════════════════════════════════════
export const AWNINGS = {
  smallWest:   { rect: { x0: -0.8,  z0: 2.95, x1: 0,    z1: 4.45 }, y: 2.45 },
  masterWest:  { rect: { x0: -0.75, z0: 5.95, x1: 0,    z1: 8.45 }, y: 2.45 },
  southLeft:   { rect: { x0: 0.7,   z0: 8.65, x1: 3.45, z1: 9.7  }, y: 2.45 },
  southRight:  { rect: { x0: 4.15,  z0: 8.65, x1: 8.95, z1: 9.7  }, y: 2.45 },
};

export const COLUMNS = {
  southWest: { rect: { x0: -0.75, z0: 8.55, x1: 0.5,   z1: 9.85 } },
  southEast: { rect: { x0: 9.15,  z0: 8.55, x1: 10.45, z1: 9.7  } },
};

// ═══════════════════════════════════════════════════════
// 燈光（暖色光）
//   色溫換算好的 hex，所有燈都從這裡取色。
//   每間房一盞天花主燈，位置由房間中心自動推出，不另寫座標。
// ═══════════════════════════════════════════════════════
export const LIGHT_COLORS = {
  k2700: 0xffa957, // 檯燈／氣氛燈
  k3000: 0xffb46b, // 天花主燈
  k3500: 0xffc48a, // 廚房／廁所工作照明（仍偏暖）
  sunset: 0xffb070, // 窗外夕陽
};

const ROOM_LIGHT_COLOR = {
  kitchen: LIGHT_COLORS.k3500,
  bathroom: LIGHT_COLORS.k3500,
};

export const LIGHTING = {
  ambient:    { color: 0xffe2c4, intensity: 0.25 },                 // 暖白環境光
  hemisphere: { sky: 0xffd9b0, ground: 0x6b4a32, intensity: 0.35 }, // 天空暖、地面木色反彈
  sun: {
    // 低角度夕陽，從西南方斜射進陽台、臥室與客廳
    color: LIGHT_COLORS.sunset,
    intensity: 2.0,
    direction: [0.65, -0.42, -0.75], // 光線前進方向：從西南方低角度射入（南窗＋陽台西側開口都照得到）
  },
  ceilingY: CEILING_HEIGHT - 0.15,
};

// ═══════════════════════════════════════════════════════
// 60 秒影片運鏡（camera.js 讀這裡）
//   每個鏡頭：start~end 秒；pos / look 是路徑點 [x, y, z]（Catmull-Rom 平滑＋緩入緩出）
//   ceilings:false 表示鳥瞰（拿掉天花與屋頂）
//   鏡頭點都避開了家具與開著的門片；改家具後請用 ?t=秒數 預覽確認
// ═══════════════════════════════════════════════════════
export const VIDEO = { duration: 60, fps: 30, width: 1920, height: 1080, fade: 0.35 };

export const CAMERA_PATH = [
  { name: '全屋鳥瞰', start: 0, end: 7, fov: 40, ceilings: false,
    pos: [[15, 14, 12], [11, 12, 15], [6, 11, 15.5]],
    look: [[4.9, 0, 4.3], [4.9, 0, 4.5]] },
  { name: '玄關進門', start: 7, end: 13, fov: 68,
    pos: [[8.1, 1.55, 0.6], [8.2, 1.55, 2.2]],
    look: [[8.4, 1.2, 4.0], [8.0, 1.0, 7.5]] },
  { name: '客廳往窗', start: 13, end: 21, fov: 68,
    pos: [[8.3, 1.5, 3.4], [8.2, 1.4, 4.6], [8.15, 1.35, 5.6]],
    look: [[8.2, 1.0, 8.5], [8.1, 0.9, 8.5]] },
  { name: '客廳回望餐廳', start: 21, end: 27, fov: 68,
    pos: [[7.6, 1.45, 8.0], [7.9, 1.5, 7.2]],
    look: [[8.6, 1.1, 2.5], [8.4, 1.1, 1.0]] },
  { name: '廚房', start: 27, end: 32, fov: 72,
    pos: [[3.55, 1.5, 3.4], [3.45, 1.45, 2.6]],
    look: [[2.8, 1.0, 0.7], [2.7, 1.0, 0.7]] },
  { name: '洗手台區', start: 32, end: 38, fov: 68,
    pos: [[6.9, 1.5, 4.5], [6.9, 1.5, 3.3]],
    look: [[6.9, 1.1, 1.3], [6.4, 1.1, 1.4]] },
  { name: '廁所', start: 38, end: 42, fov: 72,
    pos: [[6.45, 1.6, 2.25], [5.95, 1.6, 2.1]],
    look: [[4.95, 1.2, 1.0], [4.95, 1.1, 0.9]] },
  { name: '主臥', start: 42, end: 48, fov: 72,
    pos: [[3.3, 1.55, 5.85], [3.0, 1.5, 6.3]],
    look: [[1.5, 1.0, 8.0], [0.8, 1.0, 7.6]] },
  { name: '小房', start: 48, end: 52, fov: 72,
    pos: [[3.1, 1.5, 4.95], [2.3, 1.5, 4.9]],
    look: [[0.5, 0.9, 3.7], [0.5, 0.9, 3.6]] },
  { name: '次臥', start: 52, end: 55.5, fov: 72,
    pos: [[4.7, 1.55, 5.85], [4.85, 1.5, 6.25]],
    look: [[5.6, 0.8, 8.0], [5.8, 0.8, 8.0]] },
  { name: '陽台夕陽', start: 55.5, end: 60, fov: 70,
    pos: [[1.75, 1.5, 3.15], [1.3, 1.5, 2.2]],
    look: [[0.3, 1.2, 1.2], [0.0, 1.3, 1.4]] },
];

// ═══════════════════════════════════════════════════════
// 工具函式（其他程式透過這些取座標）
// ═══════════════════════════════════════════════════════
export const rectCenter = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
export const rectSize = (r) => [r.x1 - r.x0, r.z1 - r.z0];
export const rectArea = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);

/** 牆是水平（沿 x）還是垂直（沿 z） */
export const wallAxis = (wall) => (wall.from[1] === wall.to[1] ? 'x' : 'z');

/** 牆厚 */
export const wallThickness = (wall) =>
  wall.type === EXT ? WALL.exteriorThickness : WALL.interiorThickness;

/** 開口中心點的 [x, z] */
export function openingCenter(opening) {
  const wall = WALLS[opening.wall];
  const mid = (opening.from + opening.to) / 2;
  return wallAxis(wall) === 'x' ? [mid, wall.from[1]] : [wall.from[0], mid];
}

/** 某道牆上的所有開口（門＋窗），依位置排序，蓋牆時用來挖洞 */
export function openingsOnWall(wallId) {
  const list = [
    ...Object.entries(DOORS).map(([id, d]) => ({ id, category: 'door', sill: 0, head: DOOR_HEIGHT, ...d })),
    ...Object.entries(WINDOWS).map(([id, w]) => ({ id, category: 'window', sill: WINDOW.sill, head: WINDOW.head, ...w })),
  ];
  return list.filter((o) => o.wall === wallId).sort((a, b) => a.from - b.from);
}

/** 每間房的天花主燈（由房間中心推出） */
export function roomCeilingLights() {
  return Object.entries(ROOMS)
    .filter(([, r]) => r.walkable !== false)
    .map(([id, r]) => {
      const [x, z] = rectCenter(r.rect);
      return {
        room: id,
        position: [x, LIGHTING.ceilingY, z],
        color: ROOM_LIGHT_COLOR[id] ?? LIGHT_COLORS.k3000,
        // 依面積給亮度，讓大房間不會比小房間暗
        intensity: 4 + rectArea(r.rect) * 0.6, // three.js 物理光照單位（燭光）
        distance: Math.max(...rectSize(r.rect)) * 1.6,
      };
    });
}

/**
 * 房間「可擺家具」的內側範圍：rect 每一邊往內縮該邊牆厚的一半（沒有牆的開放邊不縮）。
 * 各區施工只能把東西放在這個範圍內。
 */
export function roomInterior(roomId) {
  const { x0, z0, x1, z1 } = ROOMS[roomId].rect;
  const EPS = 1e-6;
  const inset = (axis, c, lo, hi) => {
    let t = 0;
    for (const w of Object.values(WALLS)) {
      if (wallAxis(w) !== axis) continue;
      const k = axis === 'x' ? 0 : 1;          // 沿牆方向的分量
      const line = axis === 'x' ? w.from[1] : w.from[0];
      if (Math.abs(line - c) > EPS) continue;
      const a = Math.min(w.from[k], w.to[k]), b = Math.max(w.from[k], w.to[k]);
      if (Math.min(b, hi) - Math.max(a, lo) > EPS) t = Math.max(t, wallThickness(w) / 2);
    }
    return t;
  };
  return {
    x0: x0 + inset('z', x0, z0, z1),
    x1: x1 - inset('z', x1, z0, z1),
    z0: z0 + inset('x', z0, x0, x1),
    z1: z1 - inset('x', z1, x0, x1),
  };
}

/**
 * 房間邊上的所有門窗。side 表示在房間哪一邊（'x0' 左、'x1' 右、'z0' 上、'z1' 下）。
 * 家具不要擋住這些開口。
 */
export function openingsOfRoom(roomId) {
  const r = ROOMS[roomId].rect;
  const EPS = 1e-6;
  const sides = [
    ['x0', 'z', r.x0, r.z0, r.z1], ['x1', 'z', r.x1, r.z0, r.z1],
    ['z0', 'x', r.z0, r.x0, r.x1], ['z1', 'x', r.z1, r.x0, r.x1],
  ];
  const all = [...openingsOnWallAll()];
  const out = [];
  for (const o of all) {
    const w = WALLS[o.wall];
    const axis = wallAxis(w);
    const line = axis === 'x' ? w.from[1] : w.from[0];
    for (const [side, sAxis, c, lo, hi] of sides) {
      if (sAxis !== axis || Math.abs(line - c) > EPS) continue;
      if (Math.min(o.to, hi) - Math.max(o.from, lo) > EPS) out.push({ ...o, side, center: openingCenter(o) });
    }
  }
  return out;
}

function openingsOnWallAll() {
  return Object.keys(WALLS).flatMap((id) => openingsOnWall(id));
}

/**
 * 平開門的掃掠範圍（門片打開時會經過的正方形區域，xz 平面）。
 * 落在 opensInto 那間房裡，家具不可放在這裡。
 */
export function doorSwingZone(doorId) {
  const d = DOORS[doorId];
  if (d.kind !== 'swing') return null;
  const w = WALLS[d.wall];
  const width = d.to - d.from;
  const [cx, cz] = rectCenter(ROOMS[d.opensInto].rect);
  if (wallAxis(w) === 'x') {
    const z = w.from[1];
    const dir = Math.sign(cz - z);
    return { room: d.opensInto, x0: d.from, x1: d.to, z0: dir > 0 ? z : z - width, z1: dir > 0 ? z + width : z };
  }
  const x = w.from[0];
  const dir = Math.sign(cx - x);
  return { room: d.opensInto, z0: d.from, z1: d.to, x0: dir > 0 ? x : x - width, x1: dir > 0 ? x + width : x };
}

/**
 * 嵌燈位置（實拍：天花為平頂＋圓形嵌燈）。依房間大小排成網格，間距約 1.3m。
 * 只是燈具外觀；實際照明仍是每房一盞 roomCeilingLights()。
 */
export function roomDownlights(roomId) {
  const r = ROOMS[roomId].rect;
  const [w, d] = rectSize(r);
  const nx = Math.max(1, Math.floor((w - 0.6) / 1.3) + 1);
  const nz = Math.max(1, Math.floor((d - 0.6) / 1.3) + 1);
  const pts = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = nx === 1 ? (r.x0 + r.x1) / 2 : r.x0 + 0.5 + ((w - 1.0) * i) / (nx - 1);
      const z = nz === 1 ? (r.z0 + r.z1) / 2 : r.z0 + 0.5 + ((d - 1.0) * j) / (nz - 1);
      pts.push([x, z]);
    }
  }
  return pts;
}

/** 依 [x, z] 找出所在房間 id（攝影機、家具擺放檢查用） */
export function roomAt(x, z) {
  for (const [id, r] of Object.entries(ROOMS)) {
    const { x0, z0, x1, z1 } = r.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return id;
  }
  return null;
}

// ═══════════════════════════════════════════════════════
// 自我檢查：開口必須落在牆段內、房間不可重疊、房間在外框內
// ═══════════════════════════════════════════════════════
export function validateLayout() {
  const errors = [];
  const EPS = 1e-6;

  for (const [id, r] of Object.entries(ROOMS)) {
    const { x0, z0, x1, z1 } = r.rect;
    if (!(x0 < x1 && z0 < z1)) errors.push(`room ${id}: rect 反向`);
    if (x0 < BOUNDS.x0 - EPS || x1 > BOUNDS.x1 + EPS || z0 < BOUNDS.z0 - EPS || z1 > BOUNDS.z1 + EPS)
      errors.push(`room ${id}: 超出外框`);
  }

  const ids = Object.keys(ROOMS);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ROOMS[ids[i]].rect, b = ROOMS[ids[j]].rect;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > EPS && oz > EPS) errors.push(`room ${ids[i]} 與 ${ids[j]} 重疊`);
    }
  }

  const covered = Object.values(ROOMS).reduce((s, r) => s + rectArea(r.rect), 0);
  const total = Math.abs(FOOTPRINT.reduce((s, [x, z], i) => {
    const [nx, nz] = FOOTPRINT[(i + 1) % FOOTPRINT.length];
    return s + x * nz - nx * z;
  }, 0)) / 2;
  if (Math.abs(covered - total) > 1e-3) errors.push(`房間總面積 ${covered.toFixed(2)} ≠ 外框 ${total.toFixed(2)}`);

  for (const [group, items] of [['door', DOORS], ['window', WINDOWS]]) {
    for (const [id, o] of Object.entries(items)) {
      const wall = WALLS[o.wall];
      if (!wall) { errors.push(`${group} ${id}: 找不到牆 ${o.wall}`); continue; }
      const k = wallAxis(wall) === 'x' ? 0 : 1;
      const lo = Math.min(wall.from[k], wall.to[k]), hi = Math.max(wall.from[k], wall.to[k]);
      if (o.from < lo - EPS || o.to > hi + EPS || o.from >= o.to)
        errors.push(`${group} ${id}: ${o.from}~${o.to} 不在牆 ${o.wall} (${lo}~${hi}) 內`);
      if (o.hinge !== undefined && o.hinge !== o.from && o.hinge !== o.to)
        errors.push(`${group} ${id}: hinge 必須等於 from 或 to`);
      if (o.opensInto && !ROOMS[o.opensInto]) errors.push(`${group} ${id}: opensInto ${o.opensInto} 不存在`);
    }
  }
  return errors;
}

export default {
  CEILING_HEIGHT, WALL, DOOR_HEIGHT, WINDOW, BOUNDS, FOOTPRINT,
  ROOMS, WALLS, DOORS, WINDOWS, AWNINGS, COLUMNS,
  LIGHT_COLORS, LIGHTING,
};
