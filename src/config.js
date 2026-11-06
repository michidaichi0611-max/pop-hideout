// ポップ・ハイドアウト 調整用データ
// 秒数・得点・ボーナス・難易度はすべてここで変更できる（コードに直接書かない）。
// 仮の値には「仮」と書いてある。決定したら ASSUMPTIONS.md も更新すること。
window.PH_CONFIG = {
  view: { width: 540, height: 960, maxHeight: 1240 }, // 論理解像度。縦長端末では高さを最大 1240 まで伸ばす
  field: { y: 150, height: 606 },           // ステージ画像を描く帯（幅は view.width に合わせる）

  time: {
    initial: 60,          // 仮：全体の初期制限時間（秒）
    areaDuration: 15,     // 各エリアの滞在時間（10〜20秒で調整）
    transition: 0.9,      // 横移動の長さ（0.8〜1.0秒）。この間タイマーと射撃は停止
    max: 99,              // 残り時間の上限
  },

  input: {
    aimOffsetTouch: 70,   // 押した瞬間、指より上に照準を出す距離（論理px）。照準は指と一緒に動き、離すとその位置を撃つ
    aimOffsetMouse: 70,   // マウスでも同じ操作感にする（0 にするとカーソル位置を撃つ）
    pullGain: 1.3,        // 「引いて狙う」：指を引いた量の何倍、照準を反対へ動かすか
    assistRadius: 28,     // エイムアシスト：外れても、この距離（論理px）以内に見えている敵がいれば当てる（大きな弾スキルは 46）
    fireCooldown: 0.12,
  },

  // 敵の動きの遅さ（1.1 = 顔出し・引っ込み・走り・逃げ・ジャンプ・泥棒の動きが 10% ゆっくり）。隠れている時間は変えない
  enemySlow: 1.1,

  score: {
    hit: 100,
    precise: 50,          // 顔の中心付近に当てたときの追加点
    precisionRadius: 0.17, // 精密判定の半径（敵の高さに対する比）
    comboStep: 0.1,       // コンボ1につき得点倍率 +10%
    comboMaxMul: 2.0,
    boss: 1000,
  },

  bonus: {                // 時間ボーナス（秒）
    precise: 0.3,
    comboFrom: 3,         // このコンボ数以上から…
    comboPerHit: 0.3,     // …命中ごとに加算
    boss: 5,
    missResetsCombo: true, // 仮：外したらコンボを切る
  },

  // 主人公の構えポーズで銃口がある位置（画像に対する比率。tools/prepare_assets.py が出力する値）
  heroes: {
    a: { name: 'オレンジ', muzzle: [0.96, 0.38], shootMuzzle: [0.93, 0.37] },  // shoot＝撃つ瞬間のポーズ
    b: { name: 'ブルー', muzzle: [0.93, 0.305], shootMuzzle: [0.84, 0.21] },
  },

  // フィーバー：コンボがこの数に達すると一定時間、得点倍率アップ
  fever: { combo: 8, duration: 6, scoreMul: 2 },

  // コンボの掛け声（この数以上で表示）
  callouts: [
    { combo: 3, text: 'NICE!', color: '#ffffff' },
    { combo: 5, text: 'GREAT!', color: '#7ff0ff' },
    { combo: 12, text: 'UNSTOPPABLE!', color: '#ff8af0' },
  ],

  // 結果ランク（得点のしきい値。仮）
  ranks: [
    { rank: 'S', score: 9000, color: '#ffd23a' },
    { rank: 'A', score: 5500, color: '#ff8a3a' },
    { rank: 'B', score: 2500, color: '#7fd0ff' },
    { rank: 'C', score: 0, color: '#c9b7a0' },
  ],

  penalty: { time: 3 },                 // 町の人を撃ったときに減る秒数
  stars: [3, 6, 9],                      // エリアごとの星：この体数以上で ★1/★2/★3
  medalsPerScore: 100,                   // 100 点ごとにメダル 1 枚
  rankingSize: 5,

  // デイリーミッション（毎日 3 つ。mode:'max' は 1 回の最高値、それ以外はその日の合計）
  missions: {
    perDay: 3,
    pool: [
      { id: 'hits',   text: '敵を合計 {n} 体たおす',        n: 60,   stat: 'hits',       reward: 30 },
      { id: 'crit',   text: '精密射撃を {n} 回',            n: 15,   stat: 'precise',    reward: 30 },
      { id: 'boss',   text: 'ボスを {n} 回たおす',          n: 2,    stat: 'bossKills',  reward: 40 },
      { id: 'combo',  text: '{n} コンボを達成',             n: 12,   stat: 'maxCombo',   reward: 40, mode: 'max' },
      { id: 'score',  text: '1 回で {n} 点とる',            n: 5000, stat: 'score',      reward: 50, mode: 'max' },
      { id: 'fever',  text: 'フィーバーを {n} 回',          n: 3,    stat: 'fevers',     reward: 30 },
      { id: 'water',  text: '水鉄砲で {n} 体たおす',        n: 30,   stat: 'waterHits',  reward: 30 },
      { id: 'clean',  text: '町の人を撃たずに {n} エリア',  n: 3,    stat: 'cleanAreas', reward: 40, mode: 'max' },
      { id: 'stars',  text: '星を合計 {n} 個あつめる',      n: 15,   stat: 'stars',      reward: 30 },
      { id: 'plays',  text: '{n} 回あそぶ',                 n: 3,    stat: 'plays',      reward: 20 },
    ],
  },

  // ショップ：弾道や火花の色が変わる見た目だけのスキン（性能は同じ）
  skins: [
    { id: 'classic', name: 'クラシック', price: 0,   tracer: ['255,150,40', '255,200,90', '255,250,220'], glow: [255, 200, 90],  spark: [255, 226, 150], water: ['#1f7fc8', '#5cc6ff'] },
    { id: 'gold',    name: 'ゴールド',   price: 150, tracer: ['255,160,0', '255,215,60', '255,255,210'],  glow: [255, 210, 40],  spark: [255, 232, 90],  water: ['#b07800', '#ffd23a'] },
    { id: 'ice',     name: 'アイス',     price: 300, tracer: ['40,120,255', '120,210,255', '235,250,255'], glow: [120, 210, 255], spark: [180, 235, 255], water: ['#5a4ad8', '#b9a8ff'] },
    { id: 'rainbow', name: 'レインボー', price: 600, rainbow: true, tracer: ['255,80,80', '255,220,80', '255,255,255'], glow: [255, 140, 220], spark: [255, 180, 240], water: ['#d040a0', '#ff90e0'] },
  ],

  // ---- 演出（パチンコ風の段階演出）------------------------------------
  // 演出の強さ（設定で選べる）。flash は画面全体を光らせる最大の明るさ（光の点滅への配慮）
  fxLevels: {
    low:      { label: '控えめ', k: 0.6,  flash: 0.1,  cutin: 0.75, coins: 0.5 },
    standard: { label: '標準',   k: 1.0,  flash: 0.28, cutin: 1.1,  coins: 1 },
    max:      { label: '派手',   k: 1.35, flash: 0.45, cutin: 1.25, coins: 1.5 },
  },
  defaultFx: 'standard',
  slowmo: { scale: 0.3, crit: 0.09, boss: 0.45, air: 0.15 }, // スローの長さ（実時間の秒）と速さ
  comboMilestones: [5, 10, 15, 20, 30, 40, 50],                // 大きな「◯ COMBO!」とコインの雨
  // ボス予告：出る少し前に画面の縁が光る色で、ボスの報酬倍率がわかる
  premonition: { lead: 1.5, colors: [
    { id: 'blue',    label: '',          rgb: [80, 170, 255],  w: 40, mul: 1 },
    { id: 'green',   label: 'チャンス',   rgb: [90, 230, 120],  w: 28, mul: 1.2 },
    { id: 'red',     label: 'チャンス!!', rgb: [255, 70, 60],   w: 18, mul: 1.5 },
    { id: 'gold',    label: '激アツ!!',   rgb: [255, 200, 40],  w: 10, mul: 2 },
    { id: 'rainbow', label: '超激アツ!!', rgb: [255, 120, 220], w: 4,  mul: 3 },
  ]},
  // 空に投げられる的（撃つとボーナス。外しても減点なし）
  skyTargets: { every: [3.2, 6.0], flight: 2.0, types: [
    { id: 'bottle', w: 5, pts: 150, time: 0.5, size: 46 },
    { id: 'can',    w: 4, pts: 200, time: 0.5, size: 40 },
    { id: 'gold',   w: 1, pts: 600, time: 2,   size: 54 },
  ]},

  // ダイナマイトの樽：撃つと爆発し、周りの敵をまとめて倒す（町の人も巻き込むので注意）
  tnt: { radius: 120, respawn: 8, chainPts: 100, chainTime: 0.5 },

  // スキル（メダルで解放し、2 つまでセットして遊ぶ。命中でゲージがたまり、満タンで発動）
  skills: {
    slots: 2,
    gain: { hit: 0.08, crit: 0.12, boss: 0.3, target: 0.06, tnt: 0.1 },
    list: [
      { id: 'quickdraw', name: '早撃ち', price: 200, dur: 2.4, desc: 'スローになり、見えている敵を自動で撃つ' },
      { id: 'hawkeye',   name: '鷹の目', price: 150, dur: 6,   desc: '隠れている敵の場所が光って見える' },
      { id: 'bigshot',   name: '大きな弾', price: 150, dur: 7, desc: '当たり判定が大きくなる', radius: 46 },
      { id: 'timestop',  name: '時間停止', price: 300, dur: 3.5, desc: '敵もタイマーも止まる' },
    ],
  },

  // ログインボーナス（7 日で一周。7 日目は特別な見た目も）
  login: { rewards: [20, 30, 40, 50, 60, 80, 120], day7Items: ['hat_black', 'hat_white', 'hat_red'] },

  // 主人公の見た目（帽子の色）。ログインボーナスやショップで解放
  hats: [
    { id: 'hat_default', name: 'いつもの', price: 0 },
    { id: 'hat_black',   name: '黒い帽子', price: 250 },
    { id: 'hat_white',   name: '白い帽子', price: 250 },
    { id: 'hat_red',     name: '赤い帽子', price: 250 },
  ],

  juice: {
    hitstop: 0.05, hitstopCrit: 0.08, hitstopBoss: 0.18, // 命中時に一瞬止める（秒）
    shake: 5, shakeBoss: 14,             // 画面の揺れ（論理px）
    flash: 0.09,                         // 敵の白フラッシュ
    coins: 3, coinsBoss: 10,             // 得点欄へ飛ぶコインの数
    vibrate: 12, vibrateBoss: 40,        // 振動（ms、対応端末のみ）
    lastSeconds: 10,                     // 終盤演出の開始
  },

  // 難易度はエリアを進むごとに1段ずつ上がる（最後の段で頭打ち）。
  // 背景物・遮蔽物の数は変えず、敵の人数・顔の出し方・隠れる時間・動きで上げる。
  levels: [
    { maxAlive: 2, spawnGap: [0.9, 1.6], hold: [1.5, 2.0], hide: [1.0, 1.5], peek: 0.62,
      weights: { red: 3, green: 1, blue: 1 }, runSpeed: 120, flee: 0.0, boss: false },
    { maxAlive: 3, spawnGap: [0.7, 1.3], hold: [1.1, 1.6], hide: [0.8, 1.2], peek: 0.55,
      weights: { red: 3, green: 2, blue: 2, lady: 0.8, chicken: 0.6, jumper: 0.8, shield: 0.8, thief: 0.35, gold: 0.35, bomber: 0.6, balloon: 0.3 }, runSpeed: 140, flee: 0.15, boss: true },
    { maxAlive: 3, spawnGap: [0.6, 1.1], hold: [0.9, 1.3], hide: [0.7, 1.1], peek: 0.5,
      weights: { red: 2, green: 3, blue: 2, lady: 1.0, chicken: 0.8, jumper: 1.1, shield: 1.1, thief: 0.45, gold: 0.4, bomber: 0.9, balloon: 0.35 }, runSpeed: 160, flee: 0.3, boss: true },
    { maxAlive: 4, spawnGap: [0.5, 0.9], hold: [0.7, 1.1], hide: [0.6, 1.0], peek: 0.45,
      weights: { red: 2, green: 3, blue: 3, lady: 1.3, chicken: 1.0, jumper: 1.4, shield: 1.4, thief: 0.55, gold: 0.45, bomber: 1.2, balloon: 0.4 }, runSpeed: 185, flee: 0.4, boss: true },
  ],

  enemies: {
    red:   { label: '赤い隠れ屋', mode: 'pop',  cycles: [2, 4], rise: 0.14 },
    green: { label: '緑の走り屋', mode: 'run',  cycles: [2, 3], rise: 0.18 },
    blue:  { label: '青い慎重派', mode: 'lean', cycles: [2, 3], rise: 0.35, delay: [0.4, 0.9], leanOut: 0.62, leanFrames: true },
    boss:  { label: '金色のボス', mode: 'boss', rise: 0.25, hold: 1.3, peek: 0.52,
             firstAt: [4, 7],   // エリア開始から何秒後に最初に出るか
             again: 2.6,        // 隠れてから次に出るまで
             appearances: 3,    // 1エリアで出る回数
             telegraph: 0.6 },  // 出る前に帽子の星がきらっと光る（見つけるための手がかり）
    // 撃ってはいけない的（エリア2から）。撃つと時間が減りコンボが切れる
    lady:    { label: '町の人',   mode: 'pop', civilian: true, cycles: [1, 2], rise: 0.18 },
    // 跳ね屋：物陰から空へ跳び、空中で狙ってくる。撃たれる前に撃てば空中撃ちボーナス、遅れると撃たれて時間が減る
    jumper:  { label: '紫の跳ね屋', mode: 'jump', cycles: [1, 2], rise: 0.2, jump: 0.5, aim: 0.85, fall: 0.45,
               shotPenalty: 1, shotBreaksCombo: true, airBonus: 150, airTime: 0.5 },
    // 盾持ち：鉄のかぶとで 1 発目を弾く（2 発で倒れる）。絵は赤い敵＋かぶと
    shield:  { label: '鉄かぶと', mode: 'pop', cycles: [2, 4], rise: 0.16, hp: 2, base: 'red' },
    // 泥棒：金袋を抱えて画面を横切る。袋を撃つとコインが散らばる。絵は緑の走り＋金袋
    thief:   { label: '泥棒', mode: 'cross', speed: 150, base: 'green', bagPts: 300, bagTime: 1, bagMedals: 5 },
    // 金ピカ：すぐ隠れるが、倒すと大きな得点・時間・メダル
    gold:    { label: '金ピカ', mode: 'pop', cycles: [1, 1], rise: 0.12, holdMul: 0.6, bonusPts: 400, bonusTime: 1, bonusMedals: 5 },
    // 爆弾魔：導火線が燃え尽きる前に倒す。遅れると爆弾を投げられて時間が減る。倒すと爆発して周りの敵も巻き込む
    bomber:  { label: '爆弾魔', mode: 'pop', cycles: [1, 1], rise: 0.18, fuse: 1.6, bombPenalty: 1.5 },
    // 気球乗り：空をゆっくり横切る。落とすと高得点
    balloon: { label: '気球乗り', mode: 'cross', float: true, speed: 85, height: 130, bonusPts: 500, bonusTime: 1.5, bonusMedals: 5 },
    chicken: { label: 'ニワトリ', mode: 'run', civilian: true, cycles: [1, 2], rise: 0.15, scale: 0.45 },
  },

  // 敵の大きさ：遮蔽物の下端（＝地面の奥行き）から決める。値はステージ原画の座標系。
  depthScale: { nearY: 600, nearH: 150, farY: 340, farH: 70 },

  // ステージ（この順に巡回）。遮蔽物の座標は各ステージ画像（約678x760）のピクセル。
  // 6 ステージとも画像生成（art_new/stage_concepts）。酒場・幌馬車通り・牧場は stage_sheet.png の絵に中央の障害物を足したもの。
  // side: 横からのぞける側（L/R/LR）  far: ボス専用の奥の隠れ場所
  stages: [
    { name: '酒場', tnt: [[350, 700]], image: 'assets/stage0.jpg', w: 678, h: 1017, sky: ['#5a7fd6', '#86a2e6'],
      lanterns: [[58, 505], [548, 505], [268, 312], [408, 318], [535, 180]], titlePeek: [1, 6, 8], spots: [
      { x0: 100, x1: 188, top: 545, bot: 618, kind: 'barrel', side: 'LR' },
      { x0: 0,   x1: 122, top: 594, bot: 678, kind: 'crate',  side: 'R' },
      { x0: 0,   x1: 108, top: 680, bot: 810, kind: 'crate',  side: 'R' },
      { x0: 105, x1: 300, top: 605, bot: 712, kind: 'wagon',  side: 'LR' },   // 樽を積んだ手押し車
      { x0: 388, x1: 495, top: 515, bot: 625, kind: 'crate',  side: 'LR' },   // 手配書の看板
      { x0: 552, x1: 660, top: 585, bot: 680, kind: 'crate',  side: 'LR' },
      { x0: 585, x1: 678, top: 655, bot: 725, kind: 'hay',    side: 'L' },
      { x0: 425, x1: 672, top: 695, bot: 830, kind: 'hay',    side: 'LR' },   // 土のうと木箱
      { x0: 262, x1: 380, top: 548, bot: 575, kind: 'fence',  side: 'LR', far: true },
      // 高い所
      { x0: 160, x1: 330, top: 352, bot: 392, kind: 'fence',  side: 'LR' },   // 2階のバルコニー
      { x0: 400, x1: 520, top: 352, bot: 392, kind: 'fence',  side: 'LR' },
      { x0: 245, x1: 430, top: 178, bot: 262, kind: 'crate',  side: 'LR' },   // 屋上の看板
      { x0: 555, x1: 665, top: 62,  bot: 100, kind: 'fence',  side: 'LR' },   // 木の上の小屋
      { x0: 205, x1: 240, wtop: 310, top: 350, bot: 392, kind: 'window', side: 'LR' },
      { x0: 442, x1: 475, wtop: 310, top: 350, bot: 392, kind: 'window', side: 'LR' },
    ]},
    // 町の大通り：建物の窓（窓枠の中だけ見える）とバルコニーにも出る
    // 町の大通り：建物の窓とバルコニー、時計塔、屋上の水タンク、木の上にも出る
    { name: '大通り', tnt: [[320, 722]], image: 'assets/stage3.jpg', w: 678, h: 1017, sky: ['#5a7fd6', '#86a2e6'],
      lanterns: [[93, 380], [285, 210], [398, 210], [516, 272], [588, 293]], spots: [
      { x0: 100, x1: 245, top: 578, bot: 622, kind: 'barrel', side: 'LR' },   // 井戸
      { x0: 135, x1: 255, top: 605, bot: 742, kind: 'crate',  side: 'LR' },   // 木箱の山
      { x0: 0,   x1: 78,  top: 668, bot: 738, kind: 'crate',  side: 'R' },
      { x0: 0,   x1: 128, top: 738, bot: 895, kind: 'crate',  side: 'R' },
      { x0: 435, x1: 570, top: 497, bot: 600, kind: 'wagon',  side: 'LR' },   // 幌馬車
      { x0: 530, x1: 618, top: 572, bot: 620, kind: 'crate',  side: 'LR' },
      { x0: 447, x1: 605, top: 645, bot: 700, kind: 'crate',  side: 'LR' },   // 水飲み桶
      { x0: 388, x1: 490, top: 670, bot: 745, kind: 'crate',  side: 'LR' },   // ベンチ
      { x0: 490, x1: 562, top: 705, bot: 785, kind: 'barrel', side: 'LR' },
      { x0: 572, x1: 678, top: 762, bot: 905, kind: 'crate',  side: 'L' },
      { x0: 312, x1: 370, top: 488, bot: 525, kind: 'fence',  side: 'LR', far: true }, // 酒場の扉（ボス）
      // 高い所
      { x0: 145, x1: 240, top: 318, bot: 345, kind: 'fence',  side: 'LR' },   // 左の建物のバルコニー
      { x0: 285, x1: 400, top: 238, bot: 262, kind: 'fence',  side: 'LR' },   // 時計塔のバルコニー
      { x0: 500, x1: 600, top: 205, bot: 232, kind: 'fence',  side: 'LR' },   // 右の建物のバルコニー
      { x0: 105, x1: 180, top: 75,  bot: 130, kind: 'barrel', side: 'LR' },   // 屋上の水タンク
    ]},
    { name: '幌馬車通り', tnt: [[420, 790]], image: 'assets/stage1.jpg', w: 678, h: 1017, sky: ['#5a7fd6', '#86a2e6'], lanterns: [[183, 492], [477, 492]], spots: [
      { x0: 38,  x1: 258, top: 508, bot: 640, kind: 'wagon',  side: 'R' },
      { x0: 30,  x1: 162, top: 640, bot: 740, kind: 'crate',  side: 'LR' },
      { x0: 0,   x1: 110, top: 705, bot: 832, kind: 'crate',  side: 'R' },
      { x0: 160, x1: 300, top: 700, bot: 836, kind: 'crate',  side: 'LR' },   // ランタンを載せた木箱
      { x0: 285, x1: 395, top: 640, bot: 705, kind: 'barrel', side: 'LR' },   // たき火の鍋
      { x0: 412, x1: 500, top: 555, bot: 648, kind: 'barrel', side: 'LR' },   // 台の上の水樽
      { x0: 545, x1: 658, top: 612, bot: 668, kind: 'crate',  side: 'LR' },
      { x0: 527, x1: 678, top: 668, bot: 785, kind: 'hay',    side: 'L' },
      { x0: 578, x1: 678, top: 735, bot: 865, kind: 'barrel', side: 'L' },
      { x0: 300, x1: 420, top: 590, bot: 615, kind: 'fence',  side: 'LR', far: true },
      // 高い所
      { x0: 90,  x1: 250, top: 242, bot: 275, kind: 'fence',  side: 'LR' },   // 崖の通路
      { x0: 62,  x1: 190, top: 62,  bot: 100, kind: 'fence',  side: 'LR' },   // 見張り台
      { x0: 540, x1: 670, top: 132, bot: 190, kind: 'fence',  side: 'LR' },   // 大木の上の足場
    ]},
    // 鉱山：トロッコ・岩・足場の上・小屋の窓
    // 鉱山：トロッコ・岩・塔の上・崖の通路・上の坑道
    { name: '鉱山', tnt: [[215, 792]], image: 'assets/stage4.jpg', w: 678, h: 1017, sky: ['#5a7fd6', '#86a2e6'],
      lanterns: [[88, 455], [462, 438], [636, 455], [457, 185], [375, 310]], spots: [
      { x0: 255, x1: 428, top: 718, bot: 850, kind: 'crate',  side: 'LR' },   // 手前のトロッコ
      { x0: 72,  x1: 165, top: 660, bot: 750, kind: 'crate',  side: 'LR' },
      { x0: 75,  x1: 200, top: 590, bot: 655, kind: 'barrel', side: 'LR' },   // 岩
      { x0: 430, x1: 500, top: 588, bot: 645, kind: 'crate',  side: 'LR' },
      { x0: 550, x1: 678, top: 555, bot: 640, kind: 'crate',  side: 'L' },    // 金鉱石の箱
      { x0: 522, x1: 600, top: 752, bot: 840, kind: 'barrel', side: 'LR' },
      { x0: 585, x1: 678, top: 785, bot: 920, kind: 'crate',  side: 'L' },
      { x0: 0,   x1: 105, top: 785, bot: 890, kind: 'crate',  side: 'R' },
      { x0: 100, x1: 135, wtop: 450, top: 495, bot: 505, kind: 'window', side: 'LR' }, // 小屋の窓
      { x0: 302, x1: 368, top: 612, bot: 660, kind: 'crate',  side: 'LR', far: true }, // 奥のトロッコ（ボス）
      // 高い所
      { x0: 550, x1: 628, top: 332, bot: 375, kind: 'crate',  side: 'LR' },   // 塔の木箱
      { x0: 570, x1: 632, top: 178, bot: 215, kind: 'crate',  side: 'LR' },   // 塔のてっぺん
      { x0: 160, x1: 330, top: 128, bot: 160, kind: 'fence',  side: 'LR' },   // 崖の上の通路
      { x0: 110, x1: 230, top: 318, bot: 350, kind: 'fence',  side: 'LR' },   // 崖の通路
      { x0: 305, x1: 370, wtop: 288, top: 332, bot: 350, kind: 'window', side: 'LR' }, // 上の坑道
    ]},
    { name: '牧場', tnt: [[385, 800]], image: 'assets/stage2.jpg', w: 678, h: 1017, sky: ['#5a7fd6', '#86a2e6'], lanterns: [[425, 565]], spots: [
      { x0: 55,  x1: 148, top: 625, bot: 712, kind: 'barrel', side: 'LR' },
      { x0: 0,   x1: 88,  top: 685, bot: 760, kind: 'crate',  side: 'R' },
      { x0: 0,   x1: 138, top: 757, bot: 870, kind: 'crate',  side: 'LR' },
      { x0: 145, x1: 330, top: 645, bot: 745, kind: 'wagon',  side: 'LR' },   // 干し草の荷車
      { x0: 300, x1: 488, top: 622, bot: 690, kind: 'crate',  side: 'LR' },   // 水飲み桶
      { x0: 510, x1: 660, top: 615, bot: 700, kind: 'crate',  side: 'LR' },
      { x0: 553, x1: 678, top: 672, bot: 745, kind: 'hay',    side: 'L' },
      { x0: 448, x1: 590, top: 728, bot: 870, kind: 'barrel', side: 'LR' },   // 樽ふたつ
      { x0: 603, x1: 678, top: 720, bot: 810, kind: 'barrel', side: 'L' },
      { x0: 307, x1: 345, wtop: 512, top: 580, bot: 600, kind: 'window', side: 'LR', far: true }, // 納屋の扉（ボス）
      // 高い所
      { x0: 300, x1: 350, wtop: 232, top: 290, bot: 320, kind: 'window', side: 'LR' }, // 干し草の窓
      { x0: 200, x1: 390, top: 382, bot: 415, kind: 'fence',  side: 'LR' },   // 納屋のバルコニー
      { x0: 45,  x1: 225, top: 228, bot: 262, kind: 'fence',  side: 'LR' },   // 風車の足場
      { x0: 480, x1: 645, top: 365, bot: 398, kind: 'fence',  side: 'LR' },   // 給水塔の足場
      { x0: 495, x1: 615, top: 135, bot: 175, kind: 'fence',  side: 'LR' },   // 木の上の足場
    ]},
    // 駅：汽車の窓・切符売り場・荷物
    { name: '駅', tnt: [[330, 765]], image: 'assets/stage5.jpg', w: 678, h: 1017, sky: ['#5a7fd6', '#86a2e6'],
      lanterns: [[18, 535], [82, 490], [320, 262], [482, 270], [516, 385], [552, 270], [615, 535], [318, 527]], spots: [
      { x0: 228, x1: 255, wtop: 502, top: 530, bot: 590, kind: 'window', side: 'LR' }, // 汽車の窓
      { x0: 350, x1: 372, wtop: 525, top: 548, bot: 590, kind: 'window', side: 'LR' },
      { x0: 465, x1: 487, wtop: 525, top: 548, bot: 590, kind: 'window', side: 'LR' },
      { x0: 500, x1: 520, wtop: 525, top: 548, bot: 590, kind: 'window', side: 'LR' },
      { x0: 20,  x1: 160, top: 638, bot: 700, kind: 'fence',  side: 'LR' },   // ベンチ
      { x0: 445, x1: 572, top: 638, bot: 700, kind: 'fence',  side: 'LR' },
      { x0: 55,  x1: 280, top: 700, bot: 840, kind: 'crate',  side: 'LR' },   // 荷物の台車
      { x0: 385, x1: 540, top: 728, bot: 840, kind: 'hay',    side: 'LR' },   // 郵便袋と樽
      { x0: 20,  x1: 110, top: 770, bot: 875, kind: 'barrel', side: 'LR' },
      { x0: 548, x1: 678, top: 705, bot: 860, kind: 'crate',  side: 'L' },    // 積み上げた荷物
      { x0: 262, x1: 302, wtop: 597, top: 638, bot: 690, kind: 'window', side: 'LR', far: true }, // 切符売り場（ボス）
      // 高い所
      { x0: 5,   x1: 170, top: 160, bot: 200, kind: 'fence',  side: 'LR' },   // 給水塔の足場
      { x0: 150, x1: 320, top: 272, bot: 305, kind: 'fence',  side: 'LR' },   // 大木の足場
      { x0: 520, x1: 670, top: 140, bot: 172, kind: 'fence',  side: 'LR' },   // 時計塔のバルコニー
      { x0: 432, x1: 498, top: 285, bot: 300, kind: 'fence',  side: 'LR' },   // 信号塔
    ]},
    { name: '夜の町', tnt: [[310, 800]], image: 'assets/stage6.jpg', w: 678, h: 1017, sky: ['#0e1a5a', '#2a3a9a'],
      lanterns: [[93, 395], [72, 202], [285, 208], [397, 208], [291, 316], [391, 316], [516, 278], [520, 394], [665, 463]], spots: [
      { x0: 626, x1: 655, wtop: 351, top: 390, bot: 420, kind: 'window', side: 'LR' }, // 右の建物の窓
      { x0: 652, x1: 672, wtop: 487, top: 520, bot: 545, kind: 'window', side: 'LR' },
      { x0: 311, x1: 369, wtop: 465, top: 505, bot: 530, kind: 'window', side: 'LR', far: true }, // 酒場の入口（ボス）
      { x0: 40,  x1: 106, top: 573, bot: 636, kind: 'barrel', side: 'LR' },   // 井戸の横の樽
      { x0: 23,  x1: 139, top: 630, bot: 690, kind: 'hay',    side: 'LR' },   // 干し草
      { x0: 132, x1: 255, top: 606, bot: 735, kind: 'crate',  side: 'LR' },   // 積み上げた木箱
      { x0: 0,   x1: 113, top: 738, bot: 890, kind: 'crate',  side: 'R' },    // 手前の赤い箱
      { x0: 424, x1: 566, top: 500, bot: 612, kind: 'wagon',  side: 'LR' },   // 幌馬車
      { x0: 530, x1: 616, top: 575, bot: 626, kind: 'crate',  side: 'LR' },
      { x0: 447, x1: 612, top: 615, bot: 700, kind: 'fence',  side: 'LR' },   // 水桶の柵
      { x0: 390, x1: 500, top: 675, bot: 768, kind: 'fence',  side: 'LR' },   // ベンチ
      { x0: 490, x1: 563, top: 705, bot: 788, kind: 'barrel', side: 'LR' },
      { x0: 596, x1: 678, top: 758, bot: 904, kind: 'crate',  side: 'L' },    // 手前の赤い箱
      // 高い所
      { x0: 285, x1: 397, top: 232, bot: 258, kind: 'fence',  side: 'LR' },   // 時計塔のバルコニー
      { x0: 543, x1: 675, top: 198, bot: 256, kind: 'fence',  side: 'LR' },   // 右のバルコニー
      { x0: 132, x1: 235, top: 305, bot: 350, kind: 'fence',  side: 'LR' },   // 左のバルコニー
    ]},
    { name: '雪の村', tnt: [[215, 760]], image: 'assets/stage7.jpg', w: 678, h: 1017, sky: ['#6fa8e6', '#a8c8f0'],
      lanterns: [[139, 445], [273, 477], [418, 475], [465, 179]], spots: [
      { x0: 89,  x1: 116, wtop: 440, top: 477, bot: 500, kind: 'window', side: 'LR' }, // 小屋の窓
      { x0: 576, x1: 616, wtop: 480, top: 510, bot: 530, kind: 'window', side: 'LR' },
      { x0: 310, x1: 375, wtop: 490, top: 535, bot: 555, kind: 'window', side: 'LR', far: true }, // 坑道の入口（ボス）
      { x0: 0,   x1: 109, top: 695, bot: 811, kind: 'crate',  side: 'R' },    // 手前の木箱
      { x0: 33,  x1: 126, top: 625, bot: 722, kind: 'barrel', side: 'LR' },   // 樽
      { x0: 89,  x1: 199, top: 582, bot: 632, kind: 'hay',    side: 'LR' },   // 干し草
      { x0: 250, x1: 403, top: 600, bot: 672, kind: 'wagon',  side: 'LR' },   // トロッコ
      { x0: 412, x1: 478, top: 560, bot: 606, kind: 'crate',  side: 'LR' },   // 赤い箱
      { x0: 516, x1: 678, top: 572, bot: 622, kind: 'fence',  side: 'LR' },   // 右の柵
      { x0: 546, x1: 669, top: 612, bot: 662, kind: 'hay',    side: 'LR' },
      { x0: 490, x1: 576, top: 668, bot: 781, kind: 'barrel', side: 'LR' },
      { x0: 575, x1: 678, top: 660, bot: 788, kind: 'crate',  side: 'L' },    // 手前の木箱
      // 高い所
      { x0: 506, x1: 652, top: 218, bot: 255, kind: 'fence',  side: 'LR' },   // 見張り台
      { x0: 450, x1: 550, top: 392, bot: 418, kind: 'fence',  side: 'LR' },   // 見張り台の下段
      { x0: 112, x1: 222, top: 280, bot: 312, kind: 'fence',  side: 'LR' },   // 崖の通路
      { x0: 248, x1: 410, top: 315, bot: 348, kind: 'fence',  side: 'LR' },
    ]},
  ],

  quality: {
    low:      { maxDpr: 1, maxEffects: 10, maxParticles: 20, debris: false },  // 既定：低負荷
    standard: { maxDpr: 2, maxEffects: 24, maxParticles: 40, debris: true },
  },
  defaultQuality: 'low',
};
