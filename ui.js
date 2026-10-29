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
        <a class="ui-btn" href="?play=1">▶ 播放 ${VIDEO.duration} 秒導覽</a>
        <a class="ui-btn ghost" href="?walk=1">🚶 走走看</a>
        <button class="ui-btn ghost" type="button">鳥瞰</button>
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
 * 自由走動模式的畫面：左上回首頁、操作說明、互動提示
 *   觸控裝置（手機、平板）另外有左下虛擬搖桿、👋 按鈕，互動提示本身就是可以點的按鈕
 *   回傳 { setPrompt(動作文字), joy：搖桿向量 {x 右, y 前}, onAction(cb), onWave(cb), touch }
 */
export function createWalkHud() {
  ensureStyle();
  // &touch=1：在電腦上強制顯示觸控介面（測試用）
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');
  const pill = `background:rgba(36,26,18,.62);color:#fff8ee;font:15px 'Microsoft JhengHei','PingFang TC',sans-serif;
    letter-spacing:.06em;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:999px;border:0`;
  const back = el('<a class="ui-btn ghost ui-back" href="./">← 首頁</a>');
  // 操作說明：電腦版放下方；手機版放上方（下方有搖桿、按鈕），可換行，8 秒後淡出
  const help = el(`<div class="ui-hint" style="left:50%;right:auto;transform:translateX(-50%);text-align:center;line-height:1.8;
    width:max-content;max-width:calc(100vw - 32px);white-space:normal;transition:opacity 1s ease;
    ${touch ? 'top:72px;bottom:auto;padding:6px 14px;border-radius:14px;background:rgba(36,26,18,.45);font-size:13px' : ''}">
    ${touch ? '左下搖桿 走動（推到底跑）・拖曳畫面 轉視角・雙指 遠近'
    : '<b>W A S D</b> 走動　<b>Shift</b> 跑　<b>滑鼠拖曳</b> 轉視角　<b>滾輪</b> 遠近　<b>E</b> 互動　<b>Q</b> 揮手'}</div>`);
  if (touch) setTimeout(() => { help.style.opacity = '0'; }, 8000);
  const prompt = el(`<button type="button" style="position:fixed;left:50%;bottom:${touch ? 150 : 64}px;transform:translateX(-50%);
    padding:${touch ? '14px 26px' : '10px 18px'};${pill};font-size:${touch ? 18 : 15}px;transition:opacity .15s ease;opacity:0;
    pointer-events:none;touch-action:none"></button>`);
  document.body.append(back, help, prompt);
  const handlers = { action: [], wave: [] };
  const fire = (k) => handlers[k].forEach((f) => f());
  prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); fire('action'); });

  // —— 觸控：左下搖桿、右下揮手 ——
  const joy = { x: 0, y: 0 };
  if (touch) {
    document.body.style.touchAction = 'none';
    const R = 52;
    const base = el(`<div style="position:fixed;left:28px;bottom:36px;width:${R * 2 + 24}px;height:${R * 2 + 24}px;border-radius:50%;
      background:rgba(36,26,18,.32);box-shadow:inset 0 0 0 2px rgba(255,248,238,.35);touch-action:none;backdrop-filter:blur(4px)"></div>`);
    const knob = el(`<div style="position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;
      background:rgba(255,248,238,.85);box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none"></div>`);
    base.append(knob);
    let id = null, cx = 0, cy = 0;
    const move = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy.x = dx / R; joy.y = -dy / R;
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      base.setPointerCapture(id);
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      move(e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; joy.x = joy.y = 0;
      knob.style.transform = '';
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
    const waveBtn = el(`<button type="button" aria-label="揮手" style="position:fixed;right:28px;bottom:48px;width:64px;height:64px;
      ${pill};font-size:28px;touch-action:none">👋</button>`);
    waveBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); fire('wave'); });
    document.body.append(base, waveBtn);
  }

  let last = '';
  return {
    touch,
    joy,
    onAction: (f) => handlers.action.push(f),
    onWave: (f) => handlers.wave.push(f),
    /** 顯示可以做的動作（例如「坐下」）；空字串＝隱藏。電腦版顯示「按 E …」，觸控版是可以點的按鈕 */
    setPrompt(action) {
      if (action === last) return;
      last = action;
      if (action) prompt.textContent = touch ? action : `按 E ${action}`;
      prompt.style.opacity = action ? '1' : '0';
      prompt.style.pointerEvents = action && touch ? 'auto' : 'none';
    },
  };
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
