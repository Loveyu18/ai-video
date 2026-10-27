/**
 * captions.js — 影片字卡：片頭標題、每個鏡頭的房間名稱、片尾。
 * 文字與時間都來自 layout.VIDEO / layout.CAMERA_PATH；只依時間 t 決定畫面，可重現。
 * 預覽時畫在疊在 3D 畫面上的 2D canvas，輸出影片時合成進每一格。
 */
import { CAMERA_PATH, VIDEO } from './layout.js';

const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
const WARM_WHITE = '255, 248, 238';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - (1 - clamp01(x)) ** 3;              // 緩出

/** 進場／出場透明度：in 秒淡入、out 秒淡出 */
function envelope(t, start, end, fadeIn = 0.7, fadeOut = 0.6) {
  return Math.min(clamp01((t - start) / fadeIn), clamp01((end - t) / fadeOut));
}

/** 字距加寬的英文 */
function spaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return cx - x - spacing;
}
function spacedWidth(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return w - spacing;
}

/** 置中標題卡（片頭、片尾共用） */
function titleCard(ctx, w, h, card, t) {
  const a = envelope(t, card.start, card.end, 1.0, 0.8);
  if (a <= 0) return;
  const s = h / 1080;
  const rise = (1 - ease((t - card.start) / 1.2)) * 14 * s;
  ctx.save();
  // 標題後方的柔和暗底，亮畫面上也讀得清楚
  const cy = h * 0.47 + 20 * s;
  const g = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, 620 * s);
  g.addColorStop(0, `rgba(30, 20, 12, ${0.42 * a})`);
  g.addColorStop(1, 'rgba(30, 20, 12, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = a;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(40, 25, 10, 0.45)';
  ctx.shadowBlur = 18 * s;

  ctx.fillStyle = `rgb(${WARM_WHITE})`;
  ctx.font = `300 ${78 * s}px ${FONT}`;
  const sp = 22 * s;
  const mw = spacedWidth(ctx, card.main, sp);
  spaced(ctx, card.main, (w - mw) / 2, h * 0.47 + rise, sp);

  // 細線
  const lw = 120 * s * ease((t - card.start - 0.3) / 1.0);
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(${WARM_WHITE}, 0.85)`;
  ctx.fillRect((w - lw) / 2, h * 0.47 + 30 * s + rise, lw, 1.5 * s);

  ctx.shadowBlur = 12 * s;
  ctx.font = `400 ${28 * s}px ${FONT}`;
  const sw = spacedWidth(ctx, card.sub, 6 * s);
  spaced(ctx, card.sub, (w - sw) / 2, h * 0.47 + 82 * s + rise, 6 * s);
  ctx.restore();
}

/** 左下角房間字卡 */
function roomCaption(ctx, w, h, shot, t) {
  const [num, zh, en] = shot.caption;
  const start = shot.start + 0.45;
  const end = Math.min(shot.end - 0.35, shot === CAMERA_PATH[CAMERA_PATH.length - 1] ? VIDEO.ending.start - 0.2 : Infinity);
  const a = envelope(t, start, end, 0.6, 0.5);
  if (a <= 0) return;
  const s = h / 1080;
  const x = 96 * s, base = h - 110 * s;
  const slide = (1 - ease((t - start) / 0.8)) * 18 * s;

  ctx.save();
  // 柔和的暗角，讓字在亮背景上也看得清楚
  const g = ctx.createRadialGradient(x + 120 * s, base - 30 * s, 0, x + 120 * s, base - 30 * s, 420 * s);
  g.addColorStop(0, `rgba(30, 20, 12, ${0.28 * a})`);
  g.addColorStop(1, 'rgba(30, 20, 12, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, base - 450 * s, 700 * s, 600 * s);

  ctx.globalAlpha = a;
  ctx.shadowColor = 'rgba(40, 25, 10, 0.5)';
  ctx.shadowBlur = 10 * s;
  ctx.fillStyle = `rgba(${WARM_WHITE}, 0.8)`;
  ctx.font = `400 ${22 * s}px ${FONT}`;
  spaced(ctx, num, x + slide, base - 78 * s, 4 * s);
  ctx.fillRect(x + slide + 44 * s, base - 85 * s, 44 * s * ease((t - start - 0.15) / 0.6), 1.5 * s);

  ctx.fillStyle = `rgb(${WARM_WHITE})`;
  ctx.font = `500 ${56 * s}px ${FONT}`;
  spaced(ctx, zh, x + slide, base - 8 * s, 10 * s);

  ctx.fillStyle = `rgba(${WARM_WHITE}, 0.85)`;
  ctx.font = `400 ${20 * s}px ${FONT}`;
  spaced(ctx, en, x + slide, base + 30 * s, 7 * s);
  ctx.restore();
}

/** 在 2D context 上畫出時間 t 的所有字卡（不清畫布，呼叫端決定底圖） */
export function drawCaptions(ctx, t, w, h) {
  titleCard(ctx, w, h, VIDEO.title, t);
  titleCard(ctx, w, h, VIDEO.ending, t);
  for (const shot of CAMERA_PATH) {
    if (shot.caption && t >= shot.start && t < shot.end) roomCaption(ctx, w, h, shot, t);
  }
}
