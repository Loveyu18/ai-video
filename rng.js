/**
 * rng.js — 固定種子亂數（唯一亂數來源）
 *
 * 規則：整個專案禁止使用 Math.random()。
 * 每一區用自己的名字拿一條獨立亂數流：rngFor('kitchen')。
 * 各區互不影響，跟載入順序無關，所以每次打開都長得一模一樣。
 */

export const SEED = 'apartment-v1';

/** 字串 → 32-bit 種子（xmur3） */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 亂數產生器 */
export function createRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** [0, 1) */
    next,
    /** [min, max) 浮點數 */
    range: (min, max) => min + (max - min) * next(),
    /** [min, max] 整數 */
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    /** 陣列中隨機一個 */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** 機率 p 為 true */
    chance: (p) => next() < p,
    /** v ± amount */
    jitter: (v, amount) => v + (next() * 2 - 1) * amount,
    /** 分出一條子亂數流（例如每盆植物一條），不影響母流之後的序列 */
    fork: (name) => createRng(`${seed}/${name}`),
  };
}

/** 取得某一區專用的亂數流。每次呼叫都從頭開始，所以重建結果相同。 */
export const rngFor = (name) => createRng(`${SEED}:${name}`);
