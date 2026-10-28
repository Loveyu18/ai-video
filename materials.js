/**
 * materials.js — 共用材質（全專案唯一材質來源）
 *
 * 規則：
 *   - 各區只能用這裡的材質（import { M } from '../materials.js'），不要自己 new Material。
 *   - 不載入任何圖片／貼圖檔。少數地板材質的紋理是用 canvas + 固定種子亂數「畫」出來的。
 *   - 缺材質就回報，由總負責人加進來，不要在自己的檔案裡補。
 *
 * 風格：依屋主實拍照片（image/）調整——淺橡木系統櫃、灰褐色仿麂皮板材牆、暖白牆、
 *       極淺色木地板、毛圈布沙發、大理石桌面、深古銅色鋁窗框、百葉簾。配合 2700K–3500K 暖光。
 */
import * as THREE from 'three';
import { LIGHT_COLORS } from './layout.js';
import { rngFor } from './rng.js';
import { makeNoise, UV_METERS } from './geo.js';

/** 程式生成紋理一張代表幾公尺（shell 依此設定地板 UV） */
export const TEXTURE_METERS = 2;

const HAS_DOM = typeof document !== 'undefined';

// ───────────────────────────────────────────────────────
// 程式生成紋理（只在瀏覽器裡畫；Node 檢查時跳過，材質仍可用）
// ───────────────────────────────────────────────────────
function canvasTexture(size, draw) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const withMap = (tex) => (tex ? { map: tex } : {});
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

/** 木地板：2m × 2m，板寬 0.2m，長度錯落，每片色差＋木紋 */
function woodFloorTexture() {
  return canvasTexture(1024, (g, S) => {
    const rng = rngFor('tex:woodFloor');
    const px = S / TEXTURE_METERS;          // 每公尺幾像素
    const rowH = 0.2 * px;
    for (let row = 0; row * rowH < S; row++) {
      let x = -rng.range(0, 1.2) * px;
      while (x < S) {
        const len = rng.range(0.9, 1.5) * px;
        const l = rng.range(78, 84);
        g.fillStyle = hsl(rng.range(32, 38), rng.range(22, 30), l);
        g.fillRect(x, row * rowH, len, rowH);
        // 木紋
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(150,115,80,${rng.range(0.05, 0.12)})`;
          g.lineWidth = rng.range(0.6, 2);
          const y = row * rowH + rng.range(2, rowH - 2);
          g.beginPath();
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + rng.jitter(0, 4), x + len * 0.7, y + rng.jitter(0, 4), x + len, y + rng.jitter(0, 3));
          g.stroke();
        }
        // 板縫
        g.fillStyle = 'rgba(120,95,70,0.35)';
        g.fillRect(x, row * rowH, 2, rowH);
        x += len;
      }
      g.fillStyle = 'rgba(120,95,70,0.3)';
      g.fillRect(0, row * rowH, S, 2);
    }
  });
}

/** 方磚：tileSize 公尺一塊，含溝縫與輕微色差 */
function tileTexture(name, tileSize, base, grout) {
  return canvasTexture(1024, (g, S) => {
    const rng = rngFor(`tex:${name}`);
    const t = (tileSize / TEXTURE_METERS) * S;
    g.fillStyle = grout;
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += t) {
      for (let x = 0; x < S; x += t) {
        const [h, s, l] = base;
        g.fillStyle = hsl(h + rng.jitter(0, 2), s + rng.jitter(0, 3), l + rng.jitter(0, 2.5));
        g.fillRect(x + 2, y + 2, t - 4, t - 4);
        // 細微斑點
        for (let k = 0; k < 40; k++) {
          g.fillStyle = `rgba(0,0,0,${rng.range(0.01, 0.05)})`;
          g.fillRect(x + rng.range(2, t - 4), y + rng.range(2, t - 4), rng.range(1, 4), rng.range(1, 4));
        }
      }
    }
  });
}

/** 大理石：白底灰色細紋（給桌面、檯面用，UV 0~1 即可） */
function marbleTexture() {
  return canvasTexture(1024, (g, S) => {
    const rng = rngFor('tex:marble');
    g.fillStyle = '#f2f0ec';
    g.fillRect(0, 0, S, S);
    for (let v = 0; v < 9; v++) {
      let x = rng.range(-0.2, 1) * S, y = rng.range(0, 1) * S;
      const thick = rng.range(0.6, 3.2);
      g.strokeStyle = `rgba(120,118,115,${rng.range(0.25, 0.6)})`;
      g.lineWidth = thick;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += rng.range(30, 90);
        y += rng.jitter(0, 60);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

// ───────────────────────────────────────────────────────
// 工廠
// ───────────────────────────────────────────────────────
const std = (color, roughness = 0.8, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

const glow = (color, emissiveIntensity) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity, roughness: 0.6 });

// ───────────────────────────────────────────────────────
// 材質表
// ───────────────────────────────────────────────────────
export const M = {
  // —— 建築外殼（shell.js 用；各區也可用來做踢腳、牆面貼板） ——
  wallPaint:        std(0xf3eee6, 0.92),            // 暖白牆（實拍）
  ceiling:          std(0xf6f1ea, 0.95),
  floorWood:        std(0xffffff, 0.55, 0, { ...withMap(woodFloorTexture()), color: HAS_DOM ? 0xffffff : 0xe2d3bd }), // 極淺橡木（實拍）
  floorTile:        std(0xffffff, 0.45, 0, { ...withMap(tileTexture('floorTile', 0.6, [38, 18, 82], '#b9ae9e')), color: HAS_DOM ? 0xffffff : 0xd8cfc2 }),
  floorStone:       std(0xffffff, 0.5, 0, { ...withMap(tileTexture('floorStone', 0.8, [30, 8, 62], '#7d756c')), color: HAS_DOM ? 0xffffff : 0x9c958c }),
  floorWhiteTile:   std(0xffffff, 0.15, 0, { ...withMap(tileTexture('floorWhite', 0.6, [40, 10, 93], '#d6d1c9')), color: HAS_DOM ? 0xffffff : 0xeeebe6 }), // 玄關亮面白磚
  floorDarkTile:    std(0xffffff, 0.55, 0, { ...withMap(tileTexture('floorDark', 0.6, [220, 3, 36], '#55575a')), color: HAS_DOM ? 0xffffff : 0x5c5e61 }),  // 廚房深灰磚
  floorStoneTile:   std(0xffffff, 0.5, 0, { ...withMap(tileTexture('floorStoneTile', 0.3, [36, 7, 54], '#6b6660')), color: HAS_DOM ? 0xffffff : 0x8f8577 }), // 浴室灰褐石紋磚
  floorOutdoorTile: std(0xffffff, 0.85, 0, { ...withMap(tileTexture('floorOutdoor', 0.3, [32, 10, 64], '#8f877d')), color: HAS_DOM ? 0xffffff : 0xa59d92 }),
  baseboard:        std(0xe9e0d3, 0.6),
  concrete:         std(0x9a948c, 0.95),            // 雨遮、柱子、外牆面
  plinth:           std(0xcfc5b8, 0.9),             // 鳥瞰時的展示底座

  // —— 木作 ——
  woodOak:          std(0xdcbf98, 0.6),             // 淺橡木系統櫃（實拍主色）
  woodOakDark:      std(0xb58e64, 0.62),
  woodWalnut:       std(0x6b4630, 0.6),             // 胡桃木（點綴、大門）
  woodAsh:          std(0xe0c9a6, 0.7),             // 白蠟木（很淺）
  paintWhite:       std(0xf4efe6, 0.55),            // 白色烤漆櫃體
  paintCream:       std(0xe8dcc4, 0.6),
  paintSage:        std(0x9aa68a, 0.6),             // 灰綠色櫃門
  paintCharcoal:    std(0x3b3835, 0.6),

  // —— 布料／軟裝 ——
  fabricLinen:      std(0xd9cdb8, 1.0),             // 亞麻米色（沙發、床包）
  fabricOat:        std(0xc8b597, 1.0),
  fabricTerracotta: std(0xb8674a, 1.0),             // 陶土橘抱枕
  fabricMustard:    std(0xc99a3e, 1.0),
  fabricSage:       std(0x8e9c7c, 1.0),
  fabricCharcoal:   std(0x4a4643, 1.0),
  fabricWhite:      std(0xf2ede4, 1.0),             // 床單、毛巾
  fabricBlush:      std(0xd9a9a0, 1.0),
  rugWool:          std(0xd8c7a8, 1.0),
  rugPattern:       std(0xa77d5c, 1.0),
  leatherCognac:    std(0x8f5530, 0.5),

  // —— 金屬 ——
  metalBrass:       std(0xc9a66b, 0.35, 1.0),       // 黃銅（把手、燈具）
  metalBlack:       std(0x232120, 0.45, 0.6),       // 黑鐵（椅腳、窗框）
  metalChrome:      std(0xd8d8d8, 0.15, 1.0),       // 不鏽鋼（水龍頭、家電面板）
  metalBrushed:     std(0xb5b2ac, 0.35, 1.0),       // 髮絲紋不鏽鋼（流理台、冰箱）
  metalAluminium:   std(0xcfccc6, 0.4, 0.8),        // 鋁窗框、晾衣桿

  // —— 石材／陶瓷 ——
  stoneCountertop:  std(0xe6e0d6, 0.3),             // 淺色人造石檯面
  stoneDark:        std(0x5a5550, 0.4),
  ceramicWhite:     std(0xf5f3ef, 0.15),            // 馬桶、洗手台
  tileWallWhite:    std(0xeeeae2, 0.25),            // 浴室／廚房壁磚（純色）
  tileWallGreen:    std(0x8fa597, 0.3),             // 點綴色壁磚
  terracotta:       std(0xb5653f, 0.85),            // 陶盆

  // —— 玻璃／鏡面 ——
  glass:            new THREE.MeshStandardMaterial({ color: 0xd8e4e8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false }),
  glassFrosted:     new THREE.MeshStandardMaterial({ color: 0xeef2f2, roughness: 0.4, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false }),
  mirror:           std(0xeeeeee, 0.03, 1.0),

  // —— 植物 ——
  leafGreen:        std(0x5f7a4a, 0.75, 0, { side: THREE.DoubleSide }),
  leafDark:         std(0x3f5a35, 0.75, 0, { side: THREE.DoubleSide }),
  leafOlive:        std(0x7d8a55, 0.75, 0, { side: THREE.DoubleSide }),
  stem:             std(0x5a4a30, 0.9),
  soil:             std(0x3e2c20, 1.0),

  // —— 家電／雜項 ——
  plasticWhite:     std(0xf0eeea, 0.4),
  plasticBlack:     std(0x1d1d1d, 0.4),
  rubber:           std(0x222222, 0.9),
  screenOff:        std(0x0c0c0e, 0.15, 0.2),       // 關著的電視螢幕
  paperWhite:       std(0xf3eee2, 0.9),             // 書本、紙張
  bookColors: [                                     // 書背顏色（用 rng.pick 挑）
    std(0x8c4a32, 0.8), std(0x3f5868, 0.8), std(0xc9a14a, 0.8),
    std(0x5e6b4a, 0.8), std(0xe0d6c2, 0.8), std(0x6a3b44, 0.8), std(0x2f2f35, 0.8),
  ],

  // —— 依實拍新增 ——
  panelGreige:      std(0xcdbfb1, 0.95),            // 灰褐仿麂皮系統板材（客廳整面牆）
  fabricBoucle:     std(0xd2c7b8, 1.0),             // 毛圈布（弧形沙發、小凳）
  fabricGreyThrow:  std(0x63666b, 1.0),             // 深灰針織毯
  fabricBrownKnit:  std(0x7f624d, 1.0),             // 焦糖色針織床旗
  fabricTaupe:      std(0x6f6460, 1.0),             // 灰褐抱枕
  // 白紗簾：窗外光透過來，自己微微發亮（實拍照片裡紗簾是畫面最亮的地方之一）
  sheerCurtain:     new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, emissive: 0xfff3e4, emissiveIntensity: 0.5 }),
  marbleWhite:      std(0xffffff, 0.2, 0, { ...withMap(marbleTexture()), color: HAS_DOM ? 0xffffff : 0xf0eeea }), // 白大理石（餐桌、茶几）
  glassBlack:       std(0x141414, 0.06, 0.1),       // 廚房黑玻璃背牆
  marbleTileWall:   std(0xffffff, 0.25, 0, { ...withMap(marbleTexture()), color: HAS_DOM ? 0xffffff : 0xeeece8 }), // 大板白大理石紋壁磚
  stoneTileWall:    std(0x958f86, 0.45),            // 浴室灰褐石紋壁磚
  windowFrame:      std(0x4a4542, 0.5, 0.5),        // 深古銅鋁窗框
  blindSlat:        std(0xe9e4dc, 0.6, 0, { emissive: 0xfff1e0, emissiveIntensity: 0.32 }),   // 百葉簾葉片（背光透亮）
  glassBronze:      new THREE.MeshStandardMaterial({ color: 0xb49a78, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }), // 茶色玻璃拉門
  doorCharcoal:     std(0x3d3937, 0.65),            // 大門深炭灰木紋
  metalGold:        std(0xcfae6a, 0.3, 1.0),        // 金色金屬（餐桌腳）
  rattan:           std(0xb98c58, 0.9),
  ceramicMatte:     std(0xddd3c6, 0.7),             // 霧面陶瓷（燈座、花瓶）
  ceramicRust:      std(0xa95f3f, 0.8),             // 鏽橘陶（造型花瓶）
  cork:             std(0xb08a5c, 1.0),
  teak:             std(0x9a6a3e, 0.6),
  hinoki:           std(0xe3c9a0, 0.7),
  groutLight:       std(0xd8d2c8, 0.9),
  plasticSage:      std(0x9fb39a, 0.45),
  plasticBlush:     std(0xe0b2a8, 0.45),
  plasticBlue:      std(0x4a7fc0, 0.45),
  fruitOrange:      std(0xe08a2c, 0.5),
  fruitRed:         std(0xb83a2a, 0.45),
  fruitYellow:      std(0xe8c547, 0.5),
  veggieGreen:      std(0x6a9a3a, 0.6),
  screenOn:         glow(0xdfe6ec, 0.5),

  // —— 導覽員角色（guide.js）：依屋主提供的照片取外型與配色 ——
  skin:             std(0xedc3a0, 0.55),            // 膚色
  cottonWhite:      std(0xf5f3ef, 0.9),             // 白色棉 T（細緻，不用織紋）
  hairBlack:        std(0x17120f, 0.42),            // 黑髮（有光澤）
  eyeDark:          std(0x1a1210, 0.08),            // 瞳孔（亮面）
  lip:              std(0x8a4a42, 0.6),             // 嘴巴
  denimNavy:        std(0x1d2436, 0.85),            // 深藍長褲
  canvasKhaki:      std(0xcdbb92, 0.9),             // 卡其色後背包
  webbingBlack:     std(0x1c1c1c, 0.75),            // 黑色背帶
  logoBlue:         std(0x8ccbe8, 0.6),             // T 恤胸前的淺藍圖案
  watchPink:        std(0xf1dcd4, 0.4),             // 淺粉錶帶

  // —— 發光（暖色，燈罩與燈泡） ——
  lampShade:        glow(LIGHT_COLORS.k2700, 0.6),   // 燈罩（半透光感）
  lampBulb:         glow(LIGHT_COLORS.k2700, 3.0),   // 燈泡本體
  ledStrip:         glow(LIGHT_COLORS.k3000, 2.0),   // 間接照明燈條
  ceilingFixture:   glow(LIGHT_COLORS.k3000, 1.5),   // 天花燈面板（shell 用）
  downlight:        glow(LIGHT_COLORS.k3000, 4.0),   // 嵌燈發光面（shell 用）
  paperLamp:        glow(0xfff1dc, 0.9),             // 圓筒紙燈（主臥）
};

// ═══════════════════════════════════════════════════════
// 質感升級（第三輪）：程式生成的織紋凹凸、木紋、布料絨光、烤漆亮面
//   紋理一張代表 UV_METERS 公尺（geo.js 的 worldUV 產生的 UV 就是這個比例）
// ═══════════════════════════════════════════════════════

/** 用 draw(x, y) → 0~1 的高度函式產生灰階高度圖，再轉成法線貼圖 */
function normalMapFrom(name, size, heightAt, strength = 2) {
  if (!HAS_DOM) return null;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = heightAt(x, y);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.name = name;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** 平織（亞麻、棉）：經緯紗一上一下 */
function weaveNormal() {
  const n = makeNoise(rngFor('tex:weave'));
  const P = 4; // 每根紗 4px（512px = 0.5m → 約 4mm，近拍看得到紋理）
  return normalMapFrom('weave', 512, (x, y) => {
    const cx = Math.floor(x / P), cy = Math.floor(y / P);
    const over = (cx + cy) % 2 === 0;
    const t = over ? (y % P) / P : (x % P) / P;
    return Math.sin(Math.PI * t) * (over ? 1 : 0.85) + n(x * 0.15, y * 0.15) * 0.15;
  }, 1.6);
}

/** 毛圈布：密集的小圈圈凸起 */
function boucleNormal() {
  if (!HAS_DOM) return null;
  const S = 512;
  const rng = rngFor('tex:boucle');
  const h = new Float32Array(S * S);
  for (let k = 0; k < 9000; k++) {
    const cx = rng.range(0, S), cy = rng.range(0, S), r = rng.range(2.5, 6);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const i = ((y + S) % S) * S + ((x + S) % S);
        h[i] = Math.max(h[i], Math.sqrt(1 - d * d));
      }
    }
  }
  return normalMapFrom('boucle', S, (x, y) => h[y * S + x], 1.2);
}

/** 針織：一排排 V 字針目 */
function knitNormal() {
  const n = makeNoise(rngFor('tex:knit'));
  const W = 10, H = 8;
  return normalMapFrom('knit', 512, (x, y) => {
    const u = (x % W) / W, v = (y % H) / H;
    const lean = 0.3 * (v - 0.5);
    const d = u < 0.5 ? Math.abs(u * 2 - (0.5 + lean)) : Math.abs((1 - u) * 2 - (0.5 + lean));
    return (1 - Math.min(1, d * 2)) * Math.sin(Math.PI * v) + n(x * 0.1, y * 0.1) * 0.1;
  }, 1.4);
}

/** 細微不平（麂皮、皮革、石材） */
function microNormal() {
  const n = makeNoise(rngFor('tex:micro'));
  return normalMapFrom('micro', 256, (x, y) => n.fbm(x * 0.08, y * 0.08, 0, 4), 0.8);
}

/** 木紋（亮度貼圖，乘上各木材的底色）：沿 u 方向的長紋＋年輪波動 */
function woodGrainMap() {
  return canvasTexture(1024, (g, S) => {
    const rng = rngFor('tex:woodGrain');
    const n = makeNoise(rng);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const warp = n.fbm(x * 0.004, y * 0.02) * 30;
        const ring = Math.sin((y + warp) * 0.35) * 0.5 + 0.5;
        const fine = n(x * 0.02, y * 0.6) * 0.5 + 0.5;
        const v = 0.86 + 0.08 * ring + 0.06 * fine;
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

const TEX = {
  weave: weaveNormal(), boucle: boucleNormal(), knit: knitNormal(), micro: microNormal(), grain: woodGrainMap(),
};

/** 把材質表裡的某個材質換成物理材質（保留顏色／粗糙度／金屬度，再加上質感參數） */
function upgrade(key, extra) {
  const old = M[key];
  const m = new THREE.MeshPhysicalMaterial({
    color: old.color.clone(), roughness: old.roughness, metalness: old.metalness,
    transparent: old.transparent, opacity: old.opacity, side: old.side, depthWrite: old.depthWrite,
    map: old.map,
  });
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined) continue;
    if (k === 'normalScale') m.normalScale.set(v, v);
    else if (k === 'sheenColor') m.sheenColor = new THREE.Color(v);
    else m[k] = v;
  }
  old.dispose();
  M[key] = m;
}

/** 布料的絨光顏色：比底色亮一點、偏暖 */
const sheenOf = (key, k = 0.35) => M[key].color.clone().lerp(new THREE.Color(0xfff4e6), k);

// —— 布料：絨光（sheen）＋織紋 ——
for (const key of ['fabricLinen', 'fabricOat', 'fabricWhite', 'fabricSage', 'fabricTerracotta', 'fabricMustard',
  'fabricCharcoal', 'fabricBlush', 'fabricTaupe']) {
  upgrade(key, { sheen: 1, sheenRoughness: 0.6, sheenColor: sheenOf(key), normalMap: TEX.weave, normalScale: 0.5 });
}
for (const key of ['fabricBoucle', 'rugWool', 'rugPattern']) {
  upgrade(key, { sheen: 1, sheenRoughness: 0.8, sheenColor: sheenOf(key, 0.45), normalMap: TEX.boucle, normalScale: 0.9 });
}
for (const key of ['fabricGreyThrow', 'fabricBrownKnit']) {
  upgrade(key, { sheen: 1, sheenRoughness: 0.55, sheenColor: sheenOf(key, 0.4), normalMap: TEX.knit, normalScale: 0.8 });
}
upgrade('panelGreige', { sheen: 0.5, sheenRoughness: 0.8, sheenColor: sheenOf('panelGreige', 0.3), normalMap: TEX.micro, normalScale: 0.25 });
upgrade('leatherCognac', { clearcoat: 0.3, clearcoatRoughness: 0.5, normalMap: TEX.micro, normalScale: 0.4 });

// —— 木材：木紋＋微反光 ——
for (const key of ['woodOak', 'woodOakDark', 'woodWalnut', 'woodAsh', 'teak', 'hinoki']) {
  upgrade(key, { map: TEX.grain, clearcoat: 0.15, clearcoatRoughness: 0.45 });
}

// —— 烤漆、陶瓷、石材：亮面層 ——
for (const key of ['paintWhite', 'paintCream', 'paintSage', 'paintCharcoal', 'doorCharcoal']) {
  upgrade(key, { clearcoat: 0.25, clearcoatRoughness: 0.35 });
}
for (const key of ['ceramicWhite', 'tileWallWhite', 'tileWallGreen']) upgrade(key, { clearcoat: 0.8, clearcoatRoughness: 0.08 });
for (const key of ['stoneCountertop', 'marbleWhite', 'marbleTileWall']) upgrade(key, { clearcoat: 0.5, clearcoatRoughness: 0.12 });
upgrade('ceramicMatte', { normalMap: TEX.micro, normalScale: 0.3 });
upgrade('skin', { sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffc8b0) });   // 皮膚邊緣的柔光
upgrade('hairBlack', { sheen: 0.8, sheenRoughness: 0.4, sheenColor: new THREE.Color(0x3a3734) }); // 髮絲光澤（偏冷灰，不要變咖啡色）
upgrade('cottonWhite', { sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff) });
upgrade('denimNavy', { sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x4a5878), normalMap: TEX.weave, normalScale: 0.6 });
upgrade('canvasKhaki', { sheen: 0.5, sheenRoughness: 0.8, sheenColor: sheenOf('canvasKhaki', 0.3), normalMap: TEX.weave, normalScale: 0.5 });

