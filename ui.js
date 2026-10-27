/**
 * ui.js — 給網站訪客用的介面（GitHub Pages）
 *   首頁：標題、▶ 播放 60 秒導覽、各房間捷徑、自由瀏覽
 *   播放頁：點「開始導覽」才開始（瀏覽器規定要點一下才能出聲），影片時間跟著音軌走
 * 開發用的網址參數（?t=、?room=、?render= …）不顯示這些介面。
 */
import { CAMERA_PATH, VIDEO } from './layout.js';

const css = `
.ui-panel { position: fixed; left: 50%; bottom: 7vh; transform: translateX(-50%); width: min(560px, calc(100vw - 32px));
  background: rgba(36, 26, 18, 0.62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  color: #fff8ee; border-radius: 18px; padding: 22px 24px 18px; box-sizing: border-box;
  font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
.ui-panel h1 { margin: 0; font-weight: 300; letter-spacing: .35em; font-size: 26px; }
.ui-panel p { margin: 6px 0 16px; opacity: .85; font-size: 14px; letter-spacing: .08em; line-height: 1.6; }
.ui-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; cursor: pointer;
  border-radius: 999px; padding: 12px 22px; font: inherit; font-size: 16px; text-decoration: none;
  background: #fff3e2; color: #3a2a1c; transition: transform .15s ease, background .15s ease; }
.ui-btn:hover { background: #fff; transform: translateY(-1px); }
.ui-btn:active { transform: scale(0.97); }
.ui-btn.ghost { background: transparent; color: #fff8ee; box-shadow: inset 0 0 0 1px rgba(255,248,238,.5); }
.ui-rooms { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.ui-chip { font-size: 13px; padding: 7px 12px; border-radius: 999px; color: #fff8ee; text-decoration: none;
  background: rgba(255,248,238,.12); transition: background .15s ease; }
.ui-chip:hover { background: rgba(255,248,238,.26); }
.ui-row { display: flex; gap: 10px; flex-wrap: wrap; }
.ui-back { position: fixed; top: 16px; left: 16px; z-index: 5; }
.ui-center { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(20, 14, 10, .35); z-index: 4; }
.ui-hint { position: fixed; bottom: 14px; right: 16px; color: rgba(255,248,238,.75); font: 12px "Microsoft JhengHei", sans-serif; }
`;

function ensureStyle() {
  if (document.getElementById('ui-style')) return;
  const s = document.createElement('style');
  s.id = 'ui-style';
  s.textContent = css;
  document.head.appendChild(s);
}

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

/** 首頁面板（只在沒有任何網址參數時顯示） */
export function showLanding() {
  ensureStyle();
  const rooms = CAMERA_PATH.filter((s) => s.caption)
    .map((s) => `<a class="ui-chip" href="?play=1&t=${s.start}">${s.caption[1]}</a>`).join('');
  const panel = el(`
    <div class="ui-panel">
      <h1>${VIDEO.title.main}</h1>
      <p>${VIDEO.title.sub}<br>全程式生成：無 3D 模型、無貼圖、無照片，用 three.js 即時渲染。</p>
      <div class="ui-row">
        <a class="ui-btn" href="?play=1">▶ 播放 60 秒導覽</a>
        <button class="ui-btn ghost" type="button">自由瀏覽</button>
      </div>
      <div class="ui-rooms">${rooms}</div>
    </div>`);
  panel.querySelector('button').addEventListener('click', () => {
    panel.remove();
    document.body.appendChild(el('<div class="ui-hint">拖曳旋轉．右鍵平移．滾輪縮放　<a href="./" style="color:inherit">回首頁</a></div>'));
  });
  document.body.appendChild(panel);
}

/**
 * 播放器：回傳 time()，影片時間以音軌為準（音畫同步）；沒有音軌時用時鐘。
 * 點「開始」之前停在 t0。
 */
export function createPlayer(t0, audioUrl) {
  ensureStyle();
  let started = false, clockStart = 0, ended = false;
  const audio = new Audio(audioUrl);
  audio.preload = 'auto';
  const back = el('<a class="ui-btn ghost ui-back" href="./">← 首頁</a>');
  const gate = el('<div class="ui-center"><button class="ui-btn" type="button">▶ 開始導覽（有聲音）</button></div>');
  document.body.append(back, gate);

  const finish = () => {
    if (ended) return;
    ended = true;
    const again = el(`<div class="ui-center"><div class="ui-row">
      <a class="ui-btn" href="?play=1">↻ 重播</a><a class="ui-btn ghost" href="./">回首頁</a></div></div>`);
    document.body.appendChild(again);
  };
  gate.querySelector('button').addEventListener('click', async () => {
    gate.remove();
    started = true;
    clockStart = performance.now();
    try {
      audio.currentTime = t0;
      await audio.play();
    } catch { /* 沒有音軌也照樣播放畫面 */ }
  });
  audio.addEventListener('ended', finish);

  return {
    time() {
      if (!started) return t0;
      const t = !audio.paused && audio.currentTime > 0 ? audio.currentTime : t0 + (performance.now() - clockStart) / 1000;
      if (t >= VIDEO.duration - 0.02) { finish(); return VIDEO.duration - 0.02; }
      return t;
    },
  };
}
