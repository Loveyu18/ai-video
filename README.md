# WARM HOME · 暖光住宅室內設計 3D 導覽

**線上瀏覽：https://loveyu18.github.io/ai-video/**

用 three.js 做的室內設計導覽。整間屋子、家具、材質紋理、導覽員、配樂都用程式生成：**沒有 3D 模型、沒有貼圖、沒有照片**。

![客廳](docs/hero.jpg)

## 在網站上可以做什麼

- **▶ 播放 60 秒導覽**：鏡頭走過 10 個空間，有台灣口音旁白、配樂、房間字卡，還有一位導覽員在各房間介紹。
- **房間捷徑**：直接從某個房間開始看。
- **自由瀏覽**：鳥瞰整間屋子，拖曳旋轉、右鍵平移、滾輪縮放。

![影片各鏡頭](docs/shots.jpg)

## 專案特色

- **單一座標來源**：牆、門窗、家具、燈光、運鏡、導覽員站位，所有座標都從 [`layout.js`](layout.js) 推出來，單位是公尺。
- **每次都一模一樣**：所有隨機都用固定種子（[`rng.js`](rng.js)），畫面只由時間決定，重新輸出的影片逐格相同。
- **分區施工**：每個空間一個檔案（[`rooms/`](rooms/)），共用材質（[`materials.js`](materials.js)）和造型工具（[`geo.js`](geo.js)）。造型工具包含倒角、會鼓起的抱枕、垂墜布料、車削器物等。
- **暖色光**：2700K～3500K 室內燈，西南方低角度夕陽穿過百葉簾，加上環境遮蔽（GTAO）。
- **導覽員**（[`guide.js`](guide.js)）：風格化人物，有揮手和介紹手勢、呼吸、眨眼，嘴型依旁白音量開合。

## 在自己電腦上執行

```bash
npm install
npm run serve        # 開 http://localhost:5173/
```

| 網址參數 | 用途 |
|---|---|
| （無） | 首頁 |
| `?play=1` | 播放導覽（可加 `&t=秒數` 從某一秒開始） |
| `?t=24` | 停在影片第 24 秒的畫面 |
| `?room=kitchen` | 站在某個房間的角落看，房間名稱見 `layout.js` 的 `ROOMS` |
| `?cam=x,y,z&look=x,y,z` | 自訂鏡頭位置與注視點 |

## 輸出影片

需要 Chrome 或 Edge、[ffmpeg](https://ffmpeg.org/)，旁白另外需要 `python -m pip install edge-tts`。

```bash
npm run render       # 輸出 output/tour.mp4（1920×1080、30fps、60 秒，含旁白與配樂）
```

- **改旁白**：改 `layout.js` 裡 `CAMERA_PATH` 每個鏡頭的 `narration`。
- **改字卡**：改 `VIDEO.title` 和 `VIDEO.ending`。
- **換音樂**：`npm run render -- --music=你的音樂.mp3`。
- **不要旁白**：加 `--novoice`。
- **輸出單張高品質截圖**：加 `--pt=256 --from=格 --to=格+1`，用路徑追蹤渲染。

## 檢查工具

```bash
node tools/check-room.mjs kitchen   # 家具不超出房間、不擋門窗、每次結果相同、只用共用材質
node tools/check-guide.mjs          # 導覽員站位沒有撞到家具
```

## 說明

- 旁白用 Microsoft Edge 的線上神經語音（`zh-TW-HsiaoChenNeural`）產生，適合個人展示；商業用途建議改用 Azure 語音服務的正式授權。
- 格局參考實際屋況調整，平面尺寸為示意，與實際可能有差距。
