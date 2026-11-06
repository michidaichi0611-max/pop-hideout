// ポップ・ハイドアウト 試作本体 v0.2（HTML5 Canvas 2D / 依存ライブラリなし）
(() => {
  'use strict';

  const C = window.PH_CONFIG;
  const A = window.PH_AUDIO;
  const W = C.view.width;
  const FH = C.field.height;
  let H = C.view.height;           // 端末の縦横比に合わせて 960〜maxHeight で変わる
  let FY = C.field.y, FB = FY + FH; // ステージ帯の上端・下端
  let SAFE_TOP = 0;                // ノッチ等の安全領域（論理px）
  let HUD_Y = 16;
  const PARAMS = new URLSearchParams(location.search);
  const DEBUG = PARAMS.has('debug');
  const TEST = PARAMS.has('test');

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ------------------------------------------------------------------ 乱数
  let seed = (Number(PARAMS.get('seed')) || (Date.now() & 0xffffffff)) >>> 0;
  function rand() { // mulberry32
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (a, b) => a + rand() * (b - a);
  const rrange = (r) => rr(r[0], r[1]);
  const irange = (r) => r[0] + Math.floor(rand() * (r[1] - r[0] + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  // 演出用の乱数（ゲーム結果に影響させないため別系統）
  const fr = (a, b) => a + Math.random() * (b - a);
  function pickWeighted(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = rand() * total;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return Object.keys(weights)[0];
  }

  // ------------------------------------------------------------------ 保存
  const SAVE_KEY = 'popHideout.v1';
  const save = { best: 0, hero: 'a', weapon: 'revolver', quality: C.defaultQuality, sfx: true, bgm: true, vibe: true, tutorial: false, plays: 0,
    medals: 0, skin: 'classic', owned: ['classic'], ranking: [], daily: null, civTip: false, fx: C.defaultFx,
    skillsOwned: [], skillSlots: [], hat: 'hat_default', hats: [], lastLogin: null, streak: 0, lefty: false, cb: false, aimMode: 'pull', assist: true };
  const M = window.PH_META;
  try {
    const old = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    if (old.muted !== undefined && old.sfx === undefined) { old.sfx = old.bgm = !old.muted; delete old.muted; }
    Object.assign(save, old);
  } catch (e) { /* 保存不可でも遊べる */ }
  function persist() { if (TEST) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* noop */ } }
  A.setSfx(save.sfx); A.setBgm(save.bgm);
  function vibe(ms) { // 振動（対応端末のみ。画面に触れる前は呼ばない）
    const active = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
    if (save.vibe && !TEST && active && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* noop */ } } }

  // ------------------------------------------------------------------ 画像
  const IMG = {};
  const IMAGE_LIST = [
    'enemy_red', 'enemy_red_hit', 'enemy_green', 'enemy_green_hit', 'enemy_blue', 'enemy_blue_hit',
    'enemy_boss', 'enemy_boss_hit', 'hero_a_back', 'hero_a_run', 'hero_b_back', 'hero_b_run',
    'fx_muzzle', 'fx_impact', 'fx_stream', 'fx_splash', 'icon_revolver', 'icon_water',
  ];
  // 無くても動く追加素材（画像生成したアニメ用のコマなど）
  const FRAMES = ['idle', 'look', 'blink', 'surprised', 'taunt', 'run1', 'run2', 'run3'];
  const OPTIONAL = ['hero_a_aim', 'hero_b_aim', 'logo', 'wanted',
    ...['red', 'green', 'blue', 'boss', 'gold', 'bomber'].flatMap((t) => FRAMES.map((f) => `enemy_${t}_${f}`)),
    ...['gold', 'bomber', 'balloon'].flatMap((t) => [`enemy_${t}`, `enemy_${t}_hit`]),
    'lady_idle', 'lady_walk', 'lady_hit', 'chicken_idle', 'chicken_run', 'chicken_hit',
    ...['a', 'b'].flatMap((h) => ['shoot', 'win', 'lose'].map((k) => `hero_${h}_${k}`)),
    'prop_tumble', 'prop_crow1', 'prop_crow2',
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `fx_boom_${i}`), 'word_bang', 'word_jackpot', 'word_fever', 'word_perfect', 'cutin_a', 'cutin_b',
    ...['bottle', 'can', 'gold'].flatMap((k) => [`target_${k}`, `target_${k}_broken`]),
    'enemy_jumper', 'enemy_jumper_hit', ...['crouch', 'jump', 'air', 'fall', 'land'].map((k) => `enemy_jumper_${k}`),
    // 帽子の色違い
    ...['a', 'b'].flatMap((h) => [...['aim', 'shoot', 'run', 'win', 'lose'].map((k) => `hero_${h}_${k}`), `cutin_${h}`]
      .flatMap((n) => ['hat_black', 'hat_white', 'hat_red'].map((c) => `${n}_${c}`)))];
  function loadImage(key, src, optional) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => { IMG[key] = im; resolve(); };
      im.onerror = () => (optional ? resolve() : reject(new Error('画像を読み込めません: ' + src)));
      im.src = src;
    });
  }
  function loadAll() {
    // assets/list.json（素材の一覧）があれば、ある素材だけ読む
    // assets/data.js（script で読み込み済み）を優先。無ければ JSON を読む
    if (window.PH_FRAMES) FRAME_INFO = window.PH_FRAMES;
    const list = window.PH_ASSET_LIST ? Promise.resolve(window.PH_ASSET_LIST) : fetch('assets/list.json').then((r) => r.json()).catch(() => null);
    if (!window.PH_FRAMES) fetch('assets/frames.json').then((r) => r.json()).then((j) => { FRAME_INFO = j; }).catch(() => {});
    return list.then((names) => {
      const have = names ? new Set(names) : null;
      return loadImages(have);
    });
  }
  function loadImages(have) {
    const jobs = IMAGE_LIST.map((k) => loadImage(k, 'assets/' + k + '.png'));
    OPTIONAL.filter((k) => !have || have.has(k + '.png')).forEach((k) => jobs.push(loadImage(k, 'assets/' + k + '.png', true)));
    C.stages.forEach((st, i) => jobs.push(loadImage('stage' + i, st.image)));
    return Promise.all(jobs);
  }
  // 被弾フラッシュ用の白抜き画像（画像ごとに一度だけ作る。毎フレームのフィルタ処理を避ける）
  const FLASH = new Map();
  function flashOf(img) {
    if (!FLASH.has(img)) FLASH.set(img, silhouette(img));
    return FLASH.get(img);
  }
  function silhouette(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  // 帽子の色違いがあればそれを使う
  const hatSfx = () => (save.hat && save.hat !== 'hat_default' ? '_' + save.hat : '');
  const hv = (name) => IMG[name + hatSfx()] || IMG[name];
  const heroImg = (id, kind) => (kind === 'aim' ? hv('hero_' + id + '_aim') || IMG['hero_' + id + '_back'] : hv('hero_' + id + '_' + kind));

  // ------------------------------------------------------------------ ステージ形状
  const SY = FH / 760; // ステージ原画は高さ 760
  const DS = C.depthScale;
  function depthH(botOrig) {
    const t = clamp((botOrig - DS.farY) / (DS.nearY - DS.farY), 0, 1);
    return lerp(DS.farH, DS.nearH, t) * SY;
  }
  const STAGES = C.stages.map((st) => {
    const sx = W / st.w;
    return {
      name: st.name, w: st.w, ih: st.h || 760, imgTop: 0, // ih：画像の高さ（縦長の背景は 760 より大きい）
      spots: st.spots.map((s, i) => {
        const x0 = s.x0 * sx, x1 = s.x1 * sx;
        const sp = {
          id: i, kind: s.kind, side: s.side, far: !!s.far,
          x0, x1, cx: (x0 + x1) / 2, otop: s.top, obot: s.bot, top: 0, bot: 0,
          ox0: s.x0, oy0: s.top, ow: s.x1 - s.x0, oh: s.bot - s.top, busy: null,
          window: s.kind === 'window', owtop: s.wtop, wtop: 0, // 窓：窓枠の中だけに見える
        };
        // 狭い樽の後ろでは体がはみ出さない大きさに。窓は枠より大きくてよい（枠の中だけ見える）
        const db = s.bot - ((st.h || 760) - 760); // 縦長の背景は上に伸びた分を引いて奥行きを測る
        sp.eh = s.kind === 'window' ? Math.max(depthH(db), (x1 - x0) * 1.5) : Math.min(depthH(db), (x1 - x0) / 1.02);
        sp.radius = s.kind === 'barrel' ? (x1 - x0) * 0.3 : s.kind === 'hay' ? 8 : s.kind === 'wagon' ? 40 : 3;
        return sp;
      }),
    };
  });
  // 画面の縦の長さに合わせて配置を決める（空と手前の地面が伸びる）
  function layout() {
    const extra = H - C.view.height;
    HUD_Y = 14 + SAFE_TOP;
    FY = C.field.y + SAFE_TOP + extra * 0.7;
    FB = FY + FH;
    // 背景は下端（地面）を FB にそろえる。縦長の背景は上に伸びて空を埋める
    for (const st of STAGES) {
      st.imgTop = FB - st.ih * SY;
      for (const s of st.spots) { s.top = st.imgTop + s.otop * SY; s.bot = st.imgTop + s.obot * SY; if (s.window) s.wtop = st.imgTop + s.owtop * SY; }
    }
  }

  // ------------------------------------------------------------------ 状態
  const G = {
    mode: 'loading', // loading | title | play | paused | result | error
    hero: save.hero, weapon: save.weapon, quality: save.quality,
    time: 0, score: 0, dispScore: 0, combo: 0, maxCombo: 0, shots: 0, hits: 0, precise: 0, bossKills: 0,
    areaN: 0, areaT: 0, camX: 0, trans: null, spawnT: 0, boss: null,
    enemies: [], fx: [], popups: [], parts: [], overlays: [], targets: [],
    aim: null, recoil: 0, cooldown: 0, now: 0,
    hitstop: 0, shake: 0, timerBump: 0, scoreBump: 0, fever: 0, feverMax: 0,
    intro: null, ending: null, banner: null, callout: null, bossAlert: null, res: null, lastTick: 0,
    frozen: false, // テスト用：true の間は自動で時間が進まない
    lastShot: null, errorText: '', titleT: 0,
  };
  const Q = () => C.quality[G.quality] || C.quality.low;
  const level = () => C.levels[Math.min(G.areaN, C.levels.length - 1)];
  // n 番目のエリアに使うステージ（プレイごとに順番をシャッフル。タイトルとテストは固定順）
  let ORDER = STAGES.map((_, i) => i);
  const stageIdx = (n) => ORDER[((n % ORDER.length) + ORDER.length) % ORDER.length];
  const stageOf = (n) => STAGES[stageIdx(n)];
  const curStage = () => stageOf(G.areaN);
  const playing = () => G.mode === 'play' && !G.trans && !G.intro && !G.ending && !G.cutin;

  // ------------------------------------------------------------------ 敵
  function spriteOf(type, hit) {
    if (C.enemies[type].civilian) return IMG[type + (hit ? '_hit' : '_idle')];
    return IMG['enemy_' + (C.enemies[type].base || type) + (hit ? '_hit' : '')];
  }

  function spawnEnemy(type, spot, opts = {}) {
    const def = C.enemies[type];
    const lv = level();
    const img = spriteOf(type, false);
    const h = spot.eh * (type === 'boss' ? 1.12 : def.scale || 1);
    const w = h * img.width / img.height;
    const e = {
      type, def, mode: def.mode, spot, state: 'wait', t: 0, dur: rr(0.05, 0.3),
      h, w, flip: rand() < 0.5, cycles: def.cycles ? irange(def.cycles) : 1,
      peek: def.peek || clamp(lv.peek + rr(-0.04, 0.1), 0.3, 0.8),
      xoff: rr(-0.18, 0.18) * Math.max(0, (spot.x1 - spot.x0) - w),
      dir: 1, from: null, to: null, alive: true, pose: null, dustT: 0, hp: def.hp || 0,
      taunt: (type === 'red' || type === 'green' || type === 'boss') && rand() < 0.35, spotted: 0,
    };
    if (def.civilian && !save.civTip && !TEST) { save.civTip = true; persist(); callout('町の人は撃たないで！', '#ff6a5a', 1.8, -1, 40); }
    if (type === 'blue') e.dur += rrange(def.delay);
    // 上半身だけのコマは、下の切れ目が遮蔽物より上に出ないよう顔の出し方を抑える
    if (IMG[`enemy_${type}_idle`] && frameTop(`enemy_${type}_idle`)) e.peek = Math.min(e.peek, frameScale(`enemy_${type}_idle`) * 0.92);
    if (e.mode === 'lean') e.dir = chooseSide(spot);
    if (e.mode === 'boss') { e.state = 'tele'; e.dur = def.telegraph; A.tele(); }
    Object.assign(e, opts);
    spot.busy = e;
    G.enemies.push(e);
    return e;
  }
  function chooseSide(spot) {
    if (spot.side === 'L') return -1;
    if (spot.side === 'R') return 1;
    return rand() < 0.5 ? -1 : 1;
  }
  // 空いている隠れ場所。画面の上の HUD に隠れてしまう高すぎる場所は使わない（9:16 の端末など）
  function freeSpots(allowFar) { return curStage().spots.filter((s) => !s.busy && (allowFar || !s.far) && (s.window ? s.wtop : s.top) - s.eh * 0.6 > hudBottom() + 8); }
  function release(e) {
    if (e.spot && e.spot.busy === e) e.spot.busy = null;
    if (e.to && e.to.busy === e) e.to.busy = null;
  }
  function runTarget(e) {
    const a = e.spot;
    const opts = freeSpots(false).filter((b) => {
      if (b === a || b.window || Math.abs(b.bot - a.bot) > 120 * SY) return false;
      const dir = b.cx > a.cx ? 1 : -1;
      return a.side.includes(dir > 0 ? 'R' : 'L') && b.side.includes(dir > 0 ? 'L' : 'R');
    });
    return opts.length ? pick(opts) : null;
  }
  const SLOW_SKIP = { wait: 1, hide: 1, tele: 1 }; // 隠れている間・予兆は C.enemySlow の対象外
  function nextState(e, st, dur) {
    e.state = st; e.t = 0; e.dur = SLOW_SKIP[st] ? dur : dur * C.enemySlow;
    if (st === 'rise' && (e.mode === 'pop' || e.mode === 'boss')) { // 顔を出す瞬間の小さな土煙
      for (let i = 0; i < 2; i++) dust(e.spot.cx + e.xoff + fr(-e.w * 0.3, e.w * 0.3), e.spot.top + 2, 0.6);
    }
  }

  function updateEnemy(e, dt) {
    const lv = level();
    e.t += dt;
    if (e.state === 'hit') { if (e.t >= 0.55) e.alive = false; return; }
    if (e.state === 'cross') { // 泥棒・気球乗り：画面を横切る
      e.dustT -= dt;
      if (e.dustT <= 0 && !e.def.float) { e.dustT = 0.1; const p0 = computePose(e); dust(p0.x, p0.top + p0.h, 0.7); }
      if (e.t >= e.dur) e.alive = false;
      return;
    }
    if (e.state === 'run' || e.state === 'flee') {
      e.dustT -= dt;
      if (e.dustT <= 0) { e.dustT = 0.11; const p = computePose(e); dust(p.x - (p.flip ? -1 : 1) * p.w * 0.2, p.top + p.h, 0.7); }
      if (e.t / e.dur >= 1) {
        if (e.state === 'flee') { e.alive = false; return; }
        if (e.spot.busy === e) e.spot.busy = null;
        e.spot = e.to; e.to = null; e.spot.busy = e;
        e.h = e.spot.eh; e.w = e.h * spriteOf(e.type).width / spriteOf(e.type).height;
        nextState(e, 'enter', e.def.rise);
      }
      return;
    }
    if (e.t < e.dur) return;
    if (e.mode === 'jump' && jumperStep(e)) return;
    const def = e.def;
    switch (e.state) {
      case 'tele': nextState(e, 'rise', def.rise); break;
      case 'wait':
        if (e.mode === 'run') prepRun(e);
        nextState(e, 'rise', def.rise); break;
      case 'rise':
        if (e.mode === 'run' && e.fleeing) { startFlee(e); break; }
        if (e.mode === 'run' && e.to) { startRun(e); break; }
        if (def.fuse) A.jumperAlert();
        nextState(e, 'hold', e.mode === 'boss' ? def.hold : def.fuse || rrange(lv.hold) * (e.mode === 'lean' ? 0.85 : 1) * (def.holdMul || 1));
        break;
      case 'hold':
        if (def.fuse) bomberThrows(e);
        nextState(e, 'sink', def.rise); break;
      case 'sink': nextState(e, 'hide', e.mode === 'boss' ? 0.1 : rrange(lv.hide)); break;
      case 'enter': nextState(e, 'hide', rrange(lv.hide) * 0.7); break;
      case 'hide':
        e.cycles--;
        if (e.cycles <= 0) { e.alive = false; break; }
        if (e.mode === 'lean') e.dir = chooseSide(e.spot);
        if (e.mode === 'run') prepRun(e);
        if (e.mode === 'pop') e.xoff = rr(-0.18, 0.18) * Math.max(0, (e.spot.x1 - e.spot.x0) - e.w);
        nextState(e, 'rise', def.rise);
        break;
    }
  }
  // 走り屋：顔を出す前に行き先（または逃走）を決めておき、出る向きをそろえる
  function prepRun(e) {
    const a = e.spot;
    e.fleeing = false;
    if (e.to && e.to.busy === e) e.to.busy = null;
    e.to = null;
    if (e.cycles <= 1 && rand() < level().flee) {
      let dir = a.cx < W / 2 ? -1 : 1;
      if (!a.side.includes(dir > 0 ? 'R' : 'L')) dir = -dir;
      e.dir = dir; e.fleeing = true; return;
    }
    const b = runTarget(e);
    if (b) { e.to = b; b.busy = e; e.dir = b.cx > a.cx ? 1 : -1; } else e.dir = chooseSide(a);
  }
  function startRun(e) {
    const a = e.spot, b = e.to;
    e.from = exitPose(e, a, e.dir);
    e.dest = { x: (e.dir > 0 ? b.x0 : b.x1) - e.dir * runnerW(e, b) * 0.5, ground: b.bot - 2 };
    const dist = Math.hypot(e.dest.x - e.from.x, e.dest.ground - e.from.ground);
    nextState(e, 'run', Math.max(0.35, dist / level().runSpeed));
    e.flip = e.dir < 0;
  }
  function startFlee(e) {
    const a = e.spot, dir = e.dir;
    e.flip = dir < 0;
    e.from = exitPose(e, a, dir);
    e.dest = { x: dir > 0 ? W + e.w : -e.w, ground: e.from.ground };
    e.to = null;
    if (a.busy === e) a.busy = null;
    nextState(e, 'flee', Math.abs(e.dest.x - e.from.x) / (level().runSpeed * 1.25));
  }
  function runnerW(e, spot) { return spot.eh * spriteOf(e.type).width / spriteOf(e.type).height; }
  function exitPose(e, spot, dir) {
    const w = runnerW(e, spot);
    const edge = dir > 0 ? spot.x1 : spot.x0;
    return { x: edge + dir * w * 0.55, ground: spot.bot - 2 };
  }

  // 現在の見た目と当たり範囲を求める（描画・判定で共用）
  function computePose(e) {
    const s = e.spot;
    let p = 0;
    if (e.state === 'rise' || e.state === 'enter') p = clamp(e.t / e.dur, 0, 1);
    else if (e.state === 'hold') p = 1;
    else if (e.state === 'sink') p = 1 - clamp(e.t / e.dur, 0, 1);
    const pose = { x: 0, top: 0, h: e.h, w: e.w, flip: e.flip, clip: null, depth: s.bot - 0.5, hittable: false, p };
    if (e.mode === 'jump' && (e.state === 'jump' || e.state === 'aim' || e.state === 'fall')) return jumperPose(e, pose);
    if (e.state === 'cross') {
      const q = clamp(e.t / e.dur, 0, 1);
      pose.x = lerp(e.from.x, e.dest.x, q);
      pose.top = e.from.ground - e.h - (e.def.float ? Math.sin(e.t * 2) * 8 : Math.abs(Math.sin(e.t * 12)) * e.h * 0.06);
      pose.depth = e.from.ground; pose.hittable = true; pose.flip = e.dir < 0;
      return pose;
    }

    if (e.state === 'run' || e.state === 'flee') {
      const q = clamp(e.t / e.dur, 0, 1);
      const ground = lerp(e.from.ground, e.dest.ground, q);
      const h = e.state === 'run' ? lerp(e.spot.eh, e.to.eh, q) : e.spot.eh;
      pose.h = h; pose.w = h * e.w / e.h;
      pose.x = lerp(e.from.x, e.dest.x, q);
      pose.top = ground - h - Math.abs(Math.sin(q * Math.PI * 6)) * h * 0.06; // 走りの上下動
      pose.depth = ground; pose.hittable = true;
      return pose;
    }
    if (e.mode === 'pop' || e.mode === 'boss' || e.mode === 'jump') {
      pose.x = s.cx + e.xoff;
      pose.top = s.top + 3 - easeBack(p) * e.peek * e.h; // 少し行き過ぎて戻る「ぴょこっ」
      pose.clip = s.window ? { kind: 'window', x0: s.x0, x1: s.x1, wtop: s.wtop, top: s.top, bot: s.top }
        : { kind: 'pop', x0: s.x0, x1: s.x1, top: s.top, bot: s.bot };
      pose.hittable = p > 0.25;
      return pose;
    }
    if (e.mode === 'lean' || (e.mode === 'run' && e.state !== 'enter')) {
      const dir = e.dir;
      const edge = dir > 0 ? s.x1 : s.x0;
      const out = e.mode === 'run' ? 1.05 : e.def.leanOut;
      pose.x = lerp(edge - dir * e.w * 0.5, edge + dir * e.w * (out - 0.5), ease(p));
      const stand = s.bot - 2 - e.h;
      const crouch = Math.max(stand, s.top + 3); // 隠れているときは遮蔽物の上端より下
      pose.top = e.mode === 'run' ? lerp(crouch, stand, ease(p)) : crouch;
      pose.flip = dir < 0;
      pose.clip = { kind: 'side', side: dir, x0: s.x0, x1: s.x1, bot: s.bot };
      pose.hittable = p > 0.3;
      return pose;
    }
    const dir = e.dir; // 走り屋が次の遮蔽物へ入る
    const edge = dir > 0 ? s.x0 : s.x1;
    pose.x = lerp(edge - dir * e.w * 0.55, edge + dir * e.w * 0.5, ease(p));
    const stand = s.bot - 2 - e.h;
    pose.top = lerp(stand, Math.max(stand, s.top + 3), ease(p));
    pose.flip = dir < 0;
    pose.clip = { kind: 'side', side: -dir, x0: s.x0, x1: s.x1, bot: s.bot };
    pose.hittable = p < 0.7;
    return pose;
  }
  function applyClip(c, ox) {
    if (!c) return;
    ctx.beginPath();
    if (c.kind === 'window') {
      ctx.rect(ox + c.x0, c.wtop, c.x1 - c.x0, c.top - c.wtop);
    } else if (c.kind === 'pop') {
      ctx.rect(ox - 50, -50, W + 100, c.top + 50);
      ctx.rect(ox + c.x0, c.top, c.x1 - c.x0, c.bot - c.top);
    } else if (c.side > 0) ctx.rect(ox + c.x0, -50, W + 100, c.bot + 50);
    else ctx.rect(ox - 100, -50, c.x1 + 100, c.bot + 50);
    ctx.clip();
  }
  function hitShape(pose) {
    const f = pose.flip ? -1 : 1;
    return {
      cx: pose.x - f * pose.w * 0.04, cy: pose.top + pose.h * 0.5, rx: pose.w * 0.4, ry: pose.h * 0.5,
      hx: pose.x + f * pose.w * 0.03, hy: pose.top + pose.h * 0.47,
    };
  }
  function insideClip(c, x, y) {
    if (!c) return true;
    if (y > c.bot) return false;
    if (c.kind === 'window') return x >= c.x0 && x <= c.x1 && y >= c.wtop && y <= c.top;
    if (c.kind === 'pop') return y < c.top || (x >= c.x0 && x <= c.x1);
    return c.side > 0 ? x >= c.x0 : x <= c.x1;
  }
  function inCover(s, x, y) { return !s.window && x >= s.x0 && x <= s.x1 && y >= s.top && y <= s.bot; }
  // ヒットスキャン：照準点に最も手前で見えている敵を返す
  function hitTest(x, y) {
    const spots = curStage().spots;
    let best = null;
    for (const e of G.enemies) {
      if (!e.alive || e.state === 'hit') continue;
      const pose = computePose(e);
      if (!pose.hittable) continue;
      const hs = hitShape(pose);
      const nx = (x - hs.cx) / hs.rx, ny = (y - hs.cy) / hs.ry;
      if (nx * nx + ny * ny > 1) continue;
      if (!insideClip(pose.clip, x, y)) continue;
      if (spots.some((s) => s.bot > pose.depth && inCover(s, x, y))) continue;
      if (!best || pose.depth > best.pose.depth) best = { e, pose, hs };
    }
    if (best) return best;
    const cover = spots.filter((s) => inCover(s, x, y)).sort((a, b) => b.bot - a.bot)[0];
    return cover ? { cover } : null;
  }

  // ------------------------------------------------------------------ ゲーム進行
  function startGame(opts = {}) {
    A.init();
    for (const st of STAGES) for (const s of st.spots) s.busy = null;
    const intro = opts.intro !== false;
    ORDER = STAGES.map((_, i) => i);
    if (!TEST && opts.shuffle !== false) for (let i = ORDER.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ORDER[i], ORDER[j]] = [ORDER[j], ORDER[i]]; }
    Object.assign(G, {
      mode: 'play', time: C.time.initial, score: 0, dispScore: 0, combo: 0, maxCombo: 0, shots: 0, hits: 0, precise: 0,
      bossKills: 0, areaN: 0, areaT: 0, camX: 0, trans: null, spawnT: 0.6, enemies: [], fx: [], popups: [], parts: [],
      aim: null, recoil: 0, cooldown: 0, newBest: false, hitstop: 0, shake: 0, fever: 0, feverMax: 0,
      ending: null, res: null, callout: null, bossAlert: null, lastTick: 0,
      civHits: 0, waterHits: 0, fevers: 0, areaHits: 0, areaCivHit: false, cleanAreas: 0, stars: 0, starBanner: null,
      gauge: 0, skill: null, tnts: [], bonusMedals: 0, tntKills: 0, shareMsg: null,
      shootT: 0, timerBad: 0, marker: null,
      overlays: [], targets: [], skyT: 2.5, cutin: null, pendingCutin: null, slowT: 0, comboBanner: null, targetsHit: 0,
      intro: intro ? { t: 0, dur: save.tutorial ? 1.7 : 3.4, tutorial: !save.tutorial, stage: 0 } : null,
      banner: intro ? null : makeBanner(),
    });
    setupBoss();
    setupTNT();
    A.music.stop(); A.music.start('game');
    if (!intro) A.music.setTempo(116);
  }
  function setupBoss() {
    const d = C.enemies.boss;
    G.boss = level().boss ? { next: rrange(d.firstAt), left: d.appearances, active: null, announced: false } : null;
  }
  function makeBanner() { return { t: 0, area: G.areaN + 1, name: curStage().name }; }

  function step(dt) {
    if (G.slowT > 0) G.slowT -= dt / C.slowmo.scale; // スロー中は dt が縮むので実時間に直して減らす
    G.now += dt;
    G.titleT += dt;
    G.timerBump = Math.max(0, G.timerBump - dt * 4);
    G.timerBad = Math.max(0, (G.timerBad || 0) - dt);
    G.shootT = Math.max(0, (G.shootT || 0) - dt);
    updateProps(dt);
    if (G.starBanner) {
      const sb = G.starBanner; sb.t += dt;
      while (sb.shown < sb.n && sb.t >= 0.25 + sb.shown * 0.18) A.star(sb.shown++);
      if (sb.t > 1.5) G.starBanner = null;
    }
    G.scoreBump = Math.max(0, G.scoreBump - dt * 4);
    G.dispScore = G.dispScore < G.score ? Math.min(G.score, G.dispScore + Math.max(8, (G.score - G.dispScore) * dt * 9)) : G.score;
    if (G.res) G.res.t += dt;
    if (G.mode !== 'play') { updateFx(dt); return; }
    G.shake = Math.max(0, G.shake - dt * 40);
    G.punch = Math.max(0, (G.punch || 0) - dt * 7);
    G.comboBump = Math.max(0, (G.comboBump || 0) - dt * 5);
    if (G.marker) { G.marker.t += dt; if (G.marker.t > G.marker.dur) G.marker = null; }
    if (G.banner) { G.banner.t += dt; if (G.banner.t > 1.8) G.banner = null; }
    if (G.callout) { G.callout.t += dt; if (G.callout.t > G.callout.dur) G.callout = null; }
    if (G.bossAlert) { G.bossAlert.t += dt; if (G.bossAlert.t > 2.4) G.bossAlert = null; }

    G.cooldown = Math.max(0, G.cooldown - dt); // 連射の待ち時間は止めている間も進める
    if (G.hitstop > 0) { G.hitstop -= dt; updateFx(dt * 0.25); return; } // ヒットストップ：一瞬だけ止める
    if (G.pendingCutin && !(G.slowT > 0)) { cutin(G.pendingCutin); G.pendingCutin = null; }
    if (G.cutin) { // カットイン中はゲームを止める
      G.cutin.t += dt; updateFx(dt * 0.3);
      if (G.cutin.t >= G.cutin.dur) G.cutin = null;
      return;
    }

    G.recoil = Math.max(0, G.recoil - dt * 6);
    if (G.aim) G.aim.age += dt;

    if (G.intro) { // READY? → DRAW!
      const it = G.intro;
      it.t += dt;
      const drawAt = it.dur - 0.7;
      if (it.stage === 0 && it.t >= 0.05) { it.stage = 1; A.ready(); }
      if (it.stage === 1 && it.t >= drawAt) { it.stage = 2; A.draw(); G.shake = 6; vibe(20); }
      if (it.t >= it.dur) {
        if (it.tutorial) { save.tutorial = true; persist(); }
        G.intro = null; G.banner = makeBanner(); G.spawnT = 0.5;
        save.plays++; persist();
      }
      updateFx(dt);
      return;
    }
    if (G.ending) { // TIME UP! の余韻
      G.ending.t += dt;
      if (G.ending.t >= 1.4) endGame();
      updateFx(dt);
      return;
    }
    if (G.trans) { // 横移動中：タイマー・射撃・敵の出現を止める
      const tr = G.trans;
      tr.t += dt;
      const p = clamp(tr.t / C.time.transition, 0, 1);
      G.camX = lerp(G.areaN * W, (G.areaN + 1) * W, ease(p));
      while (tr.steps < 3 && tr.t >= C.time.transition * (0.12 + tr.steps * 0.3)) {
        A.step(tr.steps); dust(W / 2 - 30 + tr.steps * 30, H - 40, 1); tr.steps++;
      }
      if (p >= 1) {
        G.areaN++; G.camX = G.areaN * W; G.areaT = 0; G.spawnT = 0.45; G.trans = null;
        setupBoss();
        setupTNT();
        G.banner = makeBanner();
      }
      updateFx(dt);
      return;
    }

    updateSkill(dt);
    const stopped = skillOn('timestop'); // 時間停止：タイマー・敵・的が止まる
    if (!stopped) { G.time -= dt; G.areaT += dt; updateTNT(dt); }
    if (G.fever > 0 && !stopped) { G.fever -= dt; if (G.fever <= 0) { G.fever = 0; A.music.setTempo(116); } }
    // 終盤：秒読み
    const sec = Math.ceil(G.time);
    if (G.time <= C.juice.lastSeconds && sec !== G.lastTick && G.time > 0) {
      G.lastTick = sec; A.tick(sec <= 3);
      if (sec === C.juice.lastSeconds) callout('ラスト10秒！', '#ff6a5a', 1.1, 0);
      if (sec <= 3) G.timerBump = 1;
    }
    if (G.time <= 0) {
      G.time = 0; G.ending = { t: 0 }; G.aim = null;
      A.timeUp(); A.music.stop(); vibe(60);
      return;
    }
    if (G.areaT >= C.time.areaDuration) { startTransition(); return; }

    const lv = level();
    G.spawnT -= dt;
    const alive = G.enemies.filter((e) => e.alive && e.state !== 'hit' && e.type !== 'boss').length; // 町の人も同時に出る数に含める
    if (stopped) G.spawnT += dt; // 時間停止中は出現の待ち時間も止める
    if (G.spawnT <= 0 && alive < lv.maxAlive && !stopped) {
      const spots = freeSpots(false);
      let type = pickWeighted(lv.weights);
      if (!spriteOf(type)) type = 'red'; // 素材が無い種類は出さない
      if (type === 'thief' && G.enemies.some((q) => q.type === 'thief')) type = 'green';
      if (type === 'balloon' && G.enemies.some((q) => q.type === 'balloon')) type = 'red';
      // 窓は「上に顔を出す」敵だけ（横からのぞく・走る敵は使わない）
      const md = C.enemies[type].mode;
      const ok = spots.filter((sp) => !sp.window || md === 'pop');
      if (type === 'thief') spawnThief();
      else if (type === 'balloon') spawnBalloon();
      else if (ok.length) spawnEnemy(type, pick(ok));
      G.spawnT = rrange(lv.spawnGap);
    }
    // ボス：決まった時間帯に、合図のあとで出る（完全ランダムにしない）
    const b = G.boss;
    if (b && !b.pre && b.left === C.enemies.boss.appearances && G.areaT >= b.next - C.premonition.lead) startPremonition(b);
    if (b && b.pre) b.pre.t += dt;
    if (b && !b.active && b.left > 0 && G.areaT >= b.next && !stopped) {
      const far = freeSpots(true).filter((s) => s.far);
      const pool = b.left === C.enemies.boss.appearances && far.length ? far : freeSpots(true);
      if (pool.length) {
        b.active = spawnEnemy('boss', pick(pool)); b.left--;
        if (!b.announced) { b.announced = true; G.bossAlert = { t: 0 }; A.alert(); }
      }
    }
    const ap = G.aim && !G.aim.blocked ? aimPoint(G.aim) : null;
    for (const e of G.enemies) {
      if (!stopped || e.state === 'hit') updateEnemy(e, dt);
      if (e.spotted > 0) e.spotted -= dt;
      if (ap && e.state === 'hold' && !e.def.civilian) {
        const ps = computePose(e), hs = hitShape(ps);
        if (Math.hypot(ap.x - hs.hx, ap.y - hs.hy) < 70) { if (e.spotted <= 0 && !e.wasSpotted) { e.wasSpotted = true; } e.spotted = 0.3; }
      }
    }
    for (const e of G.enemies) {
      if (!e.alive) {
        release(e);
        if (b && b.active === e) { b.active = null; b.next = G.areaT + C.enemies.boss.again; if (e.killed) b.left = 0; }
      }
    }
    G.enemies = G.enemies.filter((e) => e.alive);
    if (!stopped) updateTargets(dt);
    updateFx(dt);
  }

  function startTransition() {
    // エリアの評価：倒した数で星 0〜3
    const n = C.stars.filter((th) => G.areaHits >= th).length;
    G.stars += n;
    G.starBanner = { t: 0, n, shown: 0 };
    if (!G.areaCivHit) G.cleanAreas++;
    G.areaHits = 0; G.areaCivHit = false;
    for (const e of G.enemies) release(e);
    G.enemies = [];
    G.targets = [];
    G.tnts = [];
    G.skill = null;
    G.trans = { t: 0, steps: 0 };
    G.banner = null;
    if (G.aim) G.aim.blocked = true; // 押しっぱなしでも移動後に暴発させない
  }
  function rankOf(score) { return C.ranks.find((r) => score >= r.score) || C.ranks[C.ranks.length - 1]; }
  function endGame() {
    G.mode = 'result';
    G.ending = null; G.bossAlert = null; G.banner = null; G.callout = null; G.fever = 0;
    G.aim = null;
    G.res = { t: 0, rank: rankOf(G.score), stamped: false, ribbon: false, counted: false };
    if (G.score > save.best) { save.best = G.score; G.newBest = true; }
    // メダル・ミッション・ランキング
    const medals = Math.floor(G.score / C.medalsPerScore) + (G.bonusMedals || 0); // 泥棒の金袋の分も
    save.medals = (save.medals || 0) + medals;
    const run = { hits: G.hits, precise: G.precise, bossKills: G.bossKills, maxCombo: G.maxCombo, score: G.score, fevers: G.fevers,
      waterHits: G.waterHits, cleanAreas: G.cleanAreas, stars: G.stars, plays: 1 };
    G.res.medals = medals;
    G.res.missions = M.applyRun(save, C, run);
    G.res.rankPos = M.addRanking(save, C, { score: G.score, hero: G.hero, date: M.todayKey() });
    persist();
    A.music.stop();
  }
  function addTime(sec) { G.time = Math.min(C.time.max, G.time + sec); }
  function callout(text, color, dur = 0.9, sound = -1, size = 54) {
    G.callout = { text, color, t: 0, dur, size };
    if (sound >= 0) A.callout(sound);
  }

  function heroRect() {
    let img = G.trans ? heroImg(G.hero, 'run') : heroImg(G.hero, 'aim');
    const shootImg = hv('hero_' + G.hero + '_shoot');
    if (!G.trans && G.shootT > 0 && shootImg) img = shootImg;
    const aim = !G.trans && IMG['hero_' + G.hero + '_aim'];
    const h = G.trans ? 215 : aim ? 248 : 235;
    const w = h * img.width / img.height;
    return { img, h: img === shootImg ? h * (C.heroes[G.hero].shootScale || 1) : h, w: img === shootImg ? w * (C.heroes[G.hero].shootScale || 1) : w,
      x: W / 2 + (aim ? 18 : 0), bottom: H - 8, aim, shoot: img === shootImg };
  }
  // 銃口の位置（専用の構えポーズがあれば手元、なければ右肩あたり）
  function gunOrigin() {
    const r = heroRect();
    const hc = C.heroes[G.hero] || {};
    const m = r.shoot ? hc.shootMuzzle || hc.muzzle : r.aim ? hc.muzzle || [0.75, 0.3] : [0.86, 0.42];
    return { x: r.x - r.w / 2 + m[0] * r.w, y: r.bottom - r.h + m[1] * r.h + G.recoil * 6 };
  }

  function fire(x, y) {
    if (!playing() || G.cooldown > 0) return null;
    G.cooldown = C.input.fireCooldown;
    G.shots++;
    G.recoil = 1;
    A.shot(G.weapon);
    G.shootT = 0.13; // 撃つ瞬間のポーズに切り替え、その銃口から弾を出す
    const o = gunOrigin();
    const water = G.weapon === 'water';
    const rb = skin().rainbow ? rainbowColors() : null;
    addFx({ kind: water ? 'stream' : 'tracer', x: o.x, y: o.y, x2: x, y2: y, dur: water ? 0.16 : 0.1, tc: rb && rb.tc, glow: rb && rb.glow });
    addFx({ kind: 'muzzle', x: o.x, y: o.y, x2: x, y2: y, dur: water ? 0.08 : 0.07, water });
    if (!water) smoke(o.x + 6, o.y - 4, 0.6);

    let res = hitTest(x, y);
    const result = { x, y, hit: false, precise: false, cover: false, type: null, points: 0, timeBonus: 0 };
    const tq = targetAt(x, y);
    if (tq) { addGauge('target'); return hitTarget(tq, x, y, result); }
    const bagE = bagAt(x, y);
    if (bagE) return hitBag(bagE, x, y, result);
    const tn = tntAt(x, y);
    if (tn && !(res && res.e && computePose(res.e).depth > tn.y)) return explodeTNT(tn, x, y, result);
    if (!(res && res.e) && (skillOn('bigshot') || save.assist)) { // 少し外れても近くの敵に当てる（大きな弾 > エイムアシスト）
      const alt = nearHit(x, y, skillOn('bigshot') ? skillDef('bigshot').radius : C.input.assistRadius);
      if (alt) { res = alt.res; x = alt.x; y = alt.y; result.x = x; result.y = y; }
    }
    if (res && res.e) {
      const e = res.e, boss = e.type === 'boss';
      if (e.def.civilian) return hitCivilian(e, res, x, y, o, result);
      if (e.hp > 1) return hitShield(e, res, x, y, o, result);
      const precise = Math.hypot(x - res.hs.hx, y - res.hs.hy) < C.score.precisionRadius * res.pose.h;
      const wasAir = e.mode === 'jump' && (e.state === 'jump' || e.state === 'aim' || e.state === 'fall');
      e.state = 'hit'; e.t = 0; e.hitPose = res.pose; e.killed = true;
      G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.hits++; G.areaHits++;
      if (water) G.waterHits++;
      const mul = Math.min(C.score.comboMaxMul, 1 + C.score.comboStep * (G.combo - 1)) * (G.fever > 0 ? C.fever.scoreMul : 1);
      let pts = C.score.hit + (precise ? C.score.precise : 0);
      let tb = 0;
      if (precise) { G.precise++; tb += C.bonus.precise; }
      if (G.combo >= C.bonus.comboFrom) tb += C.bonus.comboPerHit;
      const bmul = (G.boss && G.boss.mul) || 1;
      if (boss) { pts += C.score.boss * bmul; tb += C.bonus.boss * bmul; G.bossKills++; }
      if (wasAir) { pts += e.def.airBonus; tb += e.def.airTime; G.airKills = (G.airKills || 0) + 1; }
      if (e.def.bonusPts) { pts += e.def.bonusPts; tb += e.def.bonusTime; G.bonusMedals = (G.bonusMedals || 0) + e.def.bonusMedals; }
      pts = Math.round(pts * mul);
      G.score += pts;
      if (tb > 0) addTime(tb);
      // --- 手応え
      const tier = boss ? 'boss' : precise ? 'crit' : 'hit';
      G.hitstop = boss ? C.juice.hitstopBoss : precise ? C.juice.hitstopCrit : C.juice.hitstop;
      G.shake = Math.max(G.shake, boss ? C.juice.shakeBoss : precise ? C.juice.shake * 1.5 : C.juice.shake);
      G.punch = boss ? 1.6 : precise ? 1.2 : 0.8;
      G.comboBump = 1;
      vibe(boss ? C.juice.vibrateBoss : C.juice.vibrate);
      A.hit(G.weapon, G.combo);
      A.marker(tier);
      G.marker = { x, y, t: 0, dur: 0.36, kind: tier };
      e.kick = x >= o.x ? 1 : -1;
      // 命中の層：光→衝撃波→爆発のコマ→火花（水しぶき）→煙→数字。精密・空中・ボスほど重ねる
      addFx({ kind: water ? 'splash' : 'impact', x, y, dur: 0.3, size: res.pose.h * 0.7, tier });
      if (!water) boom(x, y, res.pose.h * (boss ? 2.4 : precise ? 1.6 : 1.1));
      if (water) drops(x, y, boss ? 16 : precise ? 12 : 9);
      else sparks(x, y, boss ? 18 : precise ? 13 : 9, tier);
      if (precise || boss || wasAir) burst(x, y, boss ? 12 : 6, true);
      smoke(x, y + 6, 1.1);
      coins(x, y, boss ? C.juice.coinsBoss : C.juice.coins);
      if (tb > 0) flyTime(x, y, tb);
      dmgPopup(pts, x, y - 26, tier);
      if (precise || wasAir) {
        slowmo(wasAir ? C.slowmo.air : C.slowmo.crit); A.slow();
        focusLines(x, y, 0.3); rays(x, y, 190, GOLD, 0.45);
        word('word_bang', x - 40, y - 80, wasAir ? 200 : 170);
        if (wasAir) popup('空中撃ち!!', x, y - 124, '#7ff0ff', 26, 0.8, 'aqua');
        screenFlash([255, 240, 200], 0.12, 0.12);
      }
      if (boss) {
        slowmo(C.slowmo.boss); A.slow(); A.boss(); confetti(); coinRain(36);
        rays(x, y, 320, GOLD, 1.0, true); focusLines(x, y, 0.45, 56); screenFlash([255, 255, 255], 0.45, 0.25);
        G.pendingCutin = 'boss';
      }
      if (G.fever > 0) rays(x, y, 140, [255, 150, 220], 0.35);
      if (e.type === 'thief' && e.hasBag) { e.hasBag = false; coins(x, y, 6); coinRain(6); } // 倒すと袋も落ちる
      if (e.def.bonusPts) { // 金ピカ・気球乗り：お宝の演出
        A.coinRain(); coinRain(14); rays(x, y, 240, GOLD, 0.6); burst(x, y, 8, true);
        popup(`+${e.def.bonusMedals} メダル`, x, y - 80, '#ffe46a', 24, 0.9, 'gold');
      }
      if (e.def.fuse) explodeTNT({ x: res.pose.x, y: res.pose.top + res.pose.h, h: res.pose.h, alive: true, respawn: 0 }, x, y, {}); // 爆弾魔：誘爆で周りも巻き込む
      addGauge(boss ? 'boss' : precise ? 'crit' : 'hit');
      comboEvents();
      Object.assign(result, { hit: true, precise, type: e.type, points: pts, timeBonus: tb });
    } else {
      if (G.combo >= C.bonus.comboFrom) { popup('COMBO BREAK', x, y - 30, '#d9d0c4', 18, 0.6); A.comboBreak(); }
      if (C.bonus.missResetsCombo) G.combo = 0;
      if (res && res.cover) { result.cover = true; A.cover(G.weapon); } else A.miss();
      addFx({ kind: water ? 'splash' : 'dust', x, y, dur: 0.25, size: water ? 26 : 18, small: true, wood: !!(res && res.cover) });
      if (res && res.cover && !water) sparks(x, y, 4, 'wood');
      G.marker = { x, y, t: 0, dur: 0.25, kind: 'miss' };
    }
    G.lastShot = result;
    return result;
  }
  function hitCivilian(e, res, x, y, o, result) {
    e.state = 'hit'; e.t = 0; e.hitPose = res.pose; e.killed = true; e.kick = x >= o.x ? 1 : -1;
    if (G.combo >= C.bonus.comboFrom) { A.comboBreak(); popup('COMBO BREAK', x, y - 70, '#d9d0c4', 18, 0.7); }
    G.combo = 0; G.civHits++; G.areaCivHit = true;
    G.time = Math.max(0.5, G.time - C.penalty.time);
    G.timerBump = 1; G.timerBad = 0.8;
    G.shake = Math.max(G.shake, 9); G.hitstop = 0.07; vibe(80);
    A.civilian(e.type);
    G.marker = { x, y, t: 0, dur: 0.5, kind: 'bad' };
    burst(x, y - 20, 4, false);
    popup(e.type === 'chicken' ? 'ニワトリ！' : '町の人！', x, y - 34, '#ff6a5a', 28, 0.9, 'red');
    popup(`-${C.penalty.time}秒`, 110, HUD_Y + 160, '#ff6a5a', 30, 0.9, 'red');
    Object.assign(result, { hit: true, civilian: true, type: e.type });
    G.lastShot = result;
    return result;
  }
  function comboEvents() {
    const c = G.combo;
    if (c === C.fever.combo) {
      G.fever = C.fever.duration; G.feverMax = C.fever.duration; G.fevers++;
      A.fever(); A.music.setTempo(140); G.shake = 10;
      cutin('fever'); coinRain(16);
      return;
    }
    if (C.comboMilestones.includes(c)) comboMilestone(c);
    const co = C.callouts.slice().reverse().find((k) => c === k.combo || (k.combo >= 12 && c > 12 && c % 4 === 0));
    if (co) callout(co.text, co.color, 0.8, C.callouts.indexOf(co));
  }

  // ------------------------------------------------------------------ 演出（エフェクト・粒子）
  function addFx(f) {
    f.t = 0;
    G.fx.push(f);
    const max = Q().maxEffects;
    if (G.fx.length > max) G.fx.splice(0, G.fx.length - max);
  }
  function addPart(p) {
    p.t = 0;
    G.parts.push(p);
    const max = Q().maxParticles;
    if (G.parts.length > max) {
      const i = G.parts.findIndex((q) => q.kind !== 'coin' && q.kind !== 'time');
      G.parts.splice(i >= 0 ? i : 0, 1);
    }
  }
  function popup(text, x, y, color, size, dur = 0.7, grad = null) { G.popups.push({ text, x, y, color, size, dur, t: 0, grad, rot: 0 }); }
  function dust(x, y, s = 1) {
    addPart({ kind: 'dust', x, y, vx: fr(-20, 20), vy: fr(-30, -10), g: 0, life: 0.45, size: 7 * s });
  }
  // 火花：速度の向きに伸びる光の線（加算合成）
  function sparks(x, y, n, tier) {
    const col = tier === 'wood' ? [255, 190, 120] : tier === 'hit' ? skin().spark : [255, 214, 80];
    for (let i = 0; i < n; i++) {
      const a = fr(0, Math.PI * 2), sp = fr(260, tier === 'boss' ? 700 : 520);
      addPart({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 900, drag: 5,
        life: fr(0.16, 0.3), size: fr(2, 3.5), col });
    }
  }
  function drops(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = fr(-Math.PI, 0), sp = fr(140, 340);
      addPart({ kind: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1100, life: fr(0.3, 0.5), size: fr(3, 6) });
    }
  }
  function smoke(x, y, s) {
    addPart({ kind: 'smoke', x, y, vx: fr(-15, 15), vy: fr(-50, -30), g: 0, life: 0.45, size: 10 * s });
  }
  // ダメージ数字：段階で色と大きさを変える
  function dmgPopup(pts, x, y, tier) {
    const size = tier === 'boss' ? 46 : tier === 'crit' ? 38 : 30;
    const grad = tier === 'hit' ? (G.fever > 0 ? 'gold' : 'white') : tier === 'crit' ? 'gold' : 'red';
    G.popups.push({ text: '+' + pts, x, y, size, dur: 0.75, t: 0, grad, rot: fr(-0.12, 0.12) });
  }
  function burst(x, y, n, gold) {
    for (let i = 0; i < n; i++) {
      const a = fr(0, Math.PI * 2), sp = fr(120, 260);
      addPart({ kind: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, g: 600, life: fr(0.35, 0.6),
        size: fr(6, 10), rot: fr(0, 6), vr: fr(-10, 10), color: gold ? '#ffd23a' : pick(['#ffd23a', '#fff4a8', '#ffffff']) });
    }
  }
  function coins(x, y, n) {
    for (let i = 0; i < n; i++) {
      addPart({ kind: 'coin', x0: x + fr(-12, 12), y0: y + fr(-12, 12), cx: x + fr(-80, 80), cy: y - fr(60, 160),
        life: 0.5 + i * 0.05, size: 9, idx: i });
    }
  }
  function flyTime(x, y, tb) { addPart({ kind: 'time', x0: x, y0: y - 10, cx: x - 60, cy: y - 140, life: 0.6, text: '+' + tb.toFixed(1) + '秒' }); }
  function confetti() {
    const cols = ['#ffd23a', '#ff6a5a', '#5ad0ff', '#7dff7a', '#ff9af0'];
    for (let i = 0; i < 26; i++) {
      addPart({ kind: 'conf', x: fr(0, W), y: FY - fr(0, 60), vx: fr(-40, 40), vy: fr(60, 200), g: 120, life: fr(1.2, 1.8),
        size: fr(5, 9), rot: fr(0, 6), vr: fr(-8, 8), color: pick(cols) });
    }
  }
  const SCORE_POS = () => ({ x: 360, y: HUD_Y + 31 });
  const TIME_POS = () => ({ x: 110, y: HUD_Y + 31 });
  function updateFx(dt) {
    for (const o of G.overlays) o.t += dt;
    G.overlays = G.overlays.filter((o) => o.t < o.dur);
    if (G.comboBanner) { G.comboBanner.t += dt; if (G.comboBanner.t > 1.0) G.comboBanner = null; }
    for (const f of G.fx) f.t += dt;
    G.fx = G.fx.filter((f) => f.t < f.dur);
    for (const p of G.popups) p.t += dt;
    G.popups = G.popups.filter((p) => p.t < p.dur);
    for (const p of G.parts) {
      p.t += dt;
      if (p.kind === 'coin' || p.kind === 'time') {
        if (p.t >= p.life && !p.done) {
          p.done = true;
          if (p.kind === 'coin') { G.scoreBump = 1; if (p.idx < 3) A.coin(p.idx); } else { G.timerBump = 1; A.bonus(); }
        }
        continue;
      }
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.vr) p.rot += p.vr * dt;
      if (p.kind === 'rain' && !p.bounced && p.y > FB - 8) { p.y = FB - 8; p.vy *= -0.35; p.vx *= 0.6; p.bounced = true; }
    }
    G.parts = G.parts.filter((p) => p.t < p.life);
  }

  // ------------------------------------------------------------------ 入力
  let buttons = [];
  const pointer = { id: null, button: null };
  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
  }
  function buttonAt(x, y) {
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (b.r ? Math.hypot(x - b.x, y - b.y) <= b.r : x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }
  const hudBottom = () => HUD_Y + 98; // これより上は HUD 帯：照準を始めない

  function onDown(ev) {
    ev.preventDefault();
    A.init();
    if (G.mode === 'title' && !A.music.timer) A.music.start('title');
    if (pointer.id !== null) return; // 片手操作：最初の指だけ扱う
    const p = toLogical(ev);
    pointer.id = ev.pointerId;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    render(); // ボタンの位置は描画時に決まるので、画面が切り替わった直後でも今の画面のボタンで判定する
    const b = buttonAt(p.x, p.y);
    if (b) { pointer.button = b; return; }
    if (G.mode === 'play' && p.y > hudBottom()) {
      G.aim = {
        sx: p.x, sy: p.y, fx: p.x, fy: p.y, age: 0, moved: 0,
        offset: ev.pointerType === 'mouse' ? C.input.aimOffsetMouse : C.input.aimOffsetTouch, blocked: !!G.trans || !!G.intro,
      };
    }
  }
  function onMove(ev) {
    if (ev.pointerId !== pointer.id) return;
    const p = toLogical(ev);
    if (G.aim) {
      G.aim.moved = Math.max(G.aim.moved, Math.hypot(p.x - G.aim.sx, p.y - G.aim.sy));
      G.aim.fx = p.x; G.aim.fy = p.y;
    }
  }
  function onUp(ev) {
    if (ev.pointerId !== pointer.id) return;
    const p = toLogical(ev);
    if (pointer.button) render();
    pointer.id = null;
    const b = pointer.button;
    pointer.button = null;
    if (b) {
      const now = buttonAt(p.x, p.y);
      if (now && now.key === b.key) { A.ui(); now.onTap(); }
      return;
    }
    const a = G.aim;
    G.aim = null;
    if (!a || a.blocked || !playing()) return;
    const t = aimPoint(a); // 離した瞬間の照準の位置を撃つ（タップでも同じ）
    fire(t.x, t.y);
  }
  function onCancel(ev) {
    if (ev.pointerId !== pointer.id) return;
    pointer.id = null; pointer.button = null; G.aim = null;
  }
  // 照準の位置。pull＝弓のように引いた分だけ反対へ（押した所の少し上から）、follow＝指の少し上、tap＝指の位置
  function aimPoint(a) {
    if (save.aimMode === 'tap') return { x: clamp(a.fx, 0, W), y: clamp(a.fy, hudBottom() + 4, H) }; // タップ：指の位置をそのまま撃つ
    const pull = save.aimMode !== 'follow', g = C.input.pullGain;
    const x = pull ? a.sx + (a.sx - a.fx) * g : a.fx;
    const y = pull ? a.sy - a.offset + (a.sy - a.fy) * g : a.fy - a.offset;
    return { x: clamp(x, 0, W), y: clamp(y, hudBottom() + 4, H) }; // 高い所まで狙える（HUD の下まで）
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'q' || e.key === 'Q') toggleWeapon();
    if (e.key === 'Escape' || e.key === 'p') togglePause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (G.mode === 'play' && !G.ending) togglePause(); A.music.stop(); }
    else if (G.mode === 'title') A.music.start('title');
  });

  function toggleWeapon() { G.weapon = G.weapon === 'revolver' ? 'water' : 'revolver'; save.weapon = G.weapon; persist(); }
  function togglePause() {
    if (G.mode === 'play') { G.mode = 'paused'; G.aim = null; A.music.stop(); }
    else if (G.mode === 'paused') { G.mode = 'play'; A.music.start('game'); if (G.fever > 0) A.music.setTempo(140); }
  }
  function toTitle() { ORDER = STAGES.map((_, i) => i); G.mode = 'title'; G.settingsOpen = false; if (!TEST) G.loginBonus = G.loginBonus || M.loginCheck(save, C); G.res = null; G.fx = []; G.popups = []; G.parts = []; G.marker = null; A.music.stop(); A.music.start('title'); }
  function toggleSfx() { save.sfx = !save.sfx; A.setSfx(save.sfx); persist(); }
  function toggleBgm() { save.bgm = !save.bgm; A.setBgm(save.bgm); persist(); }
  function toggleVibe() { save.vibe = !save.vibe; persist(); vibe(20); }
  function toggleFx() { const order = ['low', 'standard', 'max']; save.fx = order[(order.indexOf(save.fx) + 1) % 3]; persist(); }
  function toggleQuality() { G.quality = save.quality = G.quality === 'low' ? 'standard' : 'low'; persist(); resize(); }

  // ------------------------------------------------------------------ 画面サイズ
  let pixelRatio = 1;
  function readSafeTop() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--sat');
    return parseFloat(v) || 0;
  }
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return; // 画面の大きさが 0（非表示中など）のときは前の配置のまま
    // 縦長の端末では論理高さを伸ばして黒帯を出さない
    H = Math.round(clamp(W * vh / vw, C.view.height, C.view.maxHeight));
    const s = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * s), ch = Math.floor(H * s);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    SAFE_TOP = readSafeTop() / s;
    const dpr = Math.min(window.devicePixelRatio || 1, Q().maxDpr);
    pixelRatio = G.quality === 'low' ? 1 : clamp(s * dpr, 1, 2);
    canvas.width = Math.round(W * pixelRatio);
    canvas.height = Math.round(H * pixelRatio);
    layout();
  }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------------ 描画ヘルパ
  const FONT = '"Hiragino Maru Gothic ProN","Hiragino Sans","Yu Gothic UI","Meiryo",sans-serif';
  function text(str, x, y, size, color = '#fff', align = 'center', stroke = 'rgba(60,30,10,0.9)', weight = 900) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = Math.max(3, size * 0.18); ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // 木の看板風パネル
  function woodPanel(x, y, w, h, r = 18, tone = 0) {
    rrect(x, y + 4, w, h, r); ctx.fillStyle = 'rgba(30,12,4,0.45)'; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, tone ? '#8a2f1e' : '#7a4424'); g.addColorStop(1, tone ? '#5e1c12' : '#4e2812');
    rrect(x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#d99a52'; ctx.stroke();
    rrect(x + 4, y + 4, w - 8, Math.min(h * 0.42, 30), Math.min(r - 4, 14)); ctx.fillStyle = 'rgba(255,230,190,0.10)'; ctx.fill();
  }
  function button(label, x, y, w, h, onTap, opt = {}) {
    const b = { x, y, w, h, onTap, key: opt.key || label };
    b.pressed = !!(pointer.button && pointer.button.key === b.key);
    buttons.push(b);
    const dy = b.pressed ? 4 : 0;
    const pulse = opt.pulse ? 1 + Math.sin(G.titleT * 5) * 0.03 : 1;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(pulse, pulse); ctx.translate(-(x + w / 2), -(y + h / 2));
    rrect(x, y + 6, w, h, 20); ctx.fillStyle = opt.shade || '#8a3a12'; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, opt.fill2 || '#ffc94a'); g.addColorStop(1, opt.fill || '#f08a1c');
    rrect(x, y + dy, w, h, 20); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
    rrect(x + 8, y + dy + 5, w - 16, h * 0.32, 12); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    text(label, x + w / 2, y + h / 2 + dy + 1, opt.size || 30, '#fff', 'center', opt.stroke || '#8a3a12');
    ctx.restore();
    return b;
  }
  const BLUE = { fill: '#3f63b8', fill2: '#7aa0f0', shade: '#22356b', stroke: '#22356b' };
  function star(x, y, r, color, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + rot + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  // 画面の縁を色づける（フィーバー・終盤）。グラデーション4枚だけで軽い
  function edgeGlow(color, alpha, size = 70) {
    ctx.save(); ctx.globalAlpha = alpha;
    const sides = [[0, 0, W, size, 0, 0, 0, size], [0, H - size, W, size, 0, H, 0, H - size],
      [0, 0, size, H, 0, 0, size, 0], [W - size, 0, size, H, W, 0, W - size, 0]];
    for (const [x, y, w, h, x0, y0, x1, y1] of sides) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ フィールド描画
  const PEBBLES = [[40, 30, 4], [120, 55, 3], [205, 18, 2.5], [300, 40, 3.5], [395, 25, 2.5], [470, 62, 4], [520, 30, 3]];
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, FY + 2);
    g.addColorStop(0, '#3a5fc4'); g.addColorStop(1, 'rgb(113,153,228)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, FY + 2);
    const g2 = ctx.createLinearGradient(0, FB - 2, 0, H);
    g2.addColorStop(0, 'rgb(232,135,70)'); g2.addColorStop(1, '#a8582a');
    ctx.fillStyle = g2; ctx.fillRect(0, FB - 2, W, H - FB + 2);
    ctx.fillStyle = 'rgba(120,70,40,0.35)';
    const po = ((G.camX * 1.2) % W + W) % W; // 手前の地面は速く流れる
    for (const [x, y, r] of PEBBLES) for (const k of [0, W]) { ctx.beginPath(); ctx.ellipse(x - po + k, FB + y, r * 1.4, r, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  function drawSkySeam() {
    const top = stageOf(G.areaN).imgTop;
    const g = ctx.createLinearGradient(0, top, 0, top + 60);
    g.addColorStop(0, 'rgb(113,153,228)'); g.addColorStop(1, 'rgba(113,153,228,0)');
    ctx.fillStyle = g; ctx.fillRect(0, top, W, 60);
    // 空の雲（一度だけ描いた画像をゆっくり流す）
    if (!cloudCache) cloudCache = makeClouds();
    const off = (((G.now * 6 + G.camX * 0.3) % W) + W) % W; // 横移動では遠くの雲がゆっくり流れる
    ctx.drawImage(cloudCache, -off, top - 150);
    ctx.drawImage(cloudCache, W - off, top - 150);
  }
  let cloudCache = null;
  function makeClouds() {
    const c = document.createElement('canvas');
    c.width = W; c.height = 200;
    const g = c.getContext('2d');
    const puffs = [[70, 120, 1], [250, 70, 0.8], [420, 140, 1.15], [520, 40, 0.6], [160, 175, 0.7]];
    for (const [x, y, s] of puffs) {
      for (const [dx, dy, r, col] of [[0, 6, 26, 'rgba(240,170,170,0.55)'], [0, 0, 26, '#fff'], [-28, 8, 18, '#fff'], [30, 6, 20, '#fff'], [12, -12, 18, '#fff']]) {
        g.fillStyle = col; g.globalAlpha = 0.85;
        g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill();
      }
    }
    return c;
  }
  function drawStageAt(n, ox) {
    if (ox <= -W || ox >= W) return;
    const st = STAGES[stageIdx(n)];
    ctx.drawImage(IMG['stage' + stageIdx(n)], ox, st.imgTop, W, st.ih * SY);
  }
  function drawCover(st, s, ox) {
    const img = IMG['stage' + STAGES.indexOf(st)];
    ctx.save();
    rrect(ox + s.x0, s.top, s.x1 - s.x0, s.bot - s.top + 1, s.radius);
    ctx.clip();
    const sx = st.w / W, pad = 2;
    ctx.drawImage(img, s.ox0 - pad, s.oy0 - pad, s.ow + pad * 2, s.oh + pad * 2,
      ox + s.x0 - pad / sx, s.top - pad * SY, (s.ow + pad * 2) / sx, (s.oh + pad * 2) * SY);
    ctx.restore();
  }
  function drawEnemy(e, ox) {
    const pose = e.state === 'hit' ? e.hitPose : computePose(e);
    e.pose = pose;
    const hit = e.state === 'hit';
    const fr0 = frameImg(e);
    const img = fr0.img;
    ctx.save();
    applyClip(pose.clip, ox);
    let { x, top, h } = pose;
    h *= fr0.scale;
    if (!fr0.top || e.mode === 'lean') top += pose.h - h; // 全身のコマ・横のぞきは足元、上半身のコマは帽子の上端でそろえる
    const w = h * img.width / img.height;
    let sx = 1, sy = 1, alpha = 1;
    if (hit) { // 白く光る→へこむ→跳ねる→薄れる
      const p = e.t / 0.55;
      if (p < 0.15) { sx = 1 + p * 1.8; sy = 1 - p * 1.8; } else if (p < 0.35) { const q = (p - 0.15) / 0.2; sx = 1.27 - q * 0.37; sy = 0.73 + q * 0.4; }
      top -= Math.sin(Math.min(1, p * 1.4) * Math.PI) * h * 0.38;
      x += (e.kick || 1) * easeOut(Math.min(1, p * 1.6)) * h * 0.22; // 撃たれた方向へ吹っ飛ぶ
      alpha = p > 0.55 ? 1 - (p - 0.55) / 0.45 : 1;
    } else if (e.state === 'hold' && e.mode !== 'run') {
      sy = 1 + Math.sin((G.now + e.spot.id) * 9) * 0.02; // のぞいている間の小さな揺れ
    }
    ctx.globalAlpha = alpha;
    ctx.translate(ox + x, top + h);
    if (hit) { ctx.translate(0, -h / 2); ctx.rotate((e.kick || 1) * easeOut(Math.min(1, e.t / 0.4)) * 0.45); ctx.translate(0, h / 2); }
    ctx.scale((pose.flip !== fr0.flipNative ? -1 : 1) * sx, sy);
    ctx.drawImage(img, -w / 2, -h, w, h);
    if (hit && e.t < C.juice.flash) {
      ctx.globalAlpha = 1 - e.t / C.juice.flash;
      ctx.drawImage(flashOf(img), -w / 2, -h, w, h);
    }
    ctx.restore();
    if (e.mode === 'jump') drawJumperAim(e, ox);
    if (e.def.fuse && e.state === 'hold') drawFuse(e, pose, ox);
    if (e.hp > 1 && !hit) { ctx.save(); applyClip(pose.clip, ox); drawHelmet(pose, ox); ctx.restore(); }
    if (e.type === 'thief') drawBag(e, pose, ox);
    if (save.cb && e.def.civilian && !hit && pose.hittable) { // 色の見分けやすさ：撃たない印
      const bx = ox + pose.x, by = pose.top - 14;
      ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.fillStyle = 'rgba(40,40,60,0.75)';
      ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 7, by - 7); ctx.lineTo(bx + 7, by + 7); ctx.stroke(); ctx.restore();
    }
    if (e.spotted > 0 && e.state === 'hold') { // ギクッ！の汗マーク
      const k = 1 - e.spotted / 0.3;
      text('!', ox + pose.x + pose.w * 0.32, pose.top - 6 - k * 4, 24, '#ffef7a', 'center', '#7a2a0a');
    }
    if (e.state === 'tele') { // ボスの合図：帽子の星がきらっと光る
      const k = e.t / e.dur;
      ctx.save(); ctx.globalAlpha = Math.sin(k * Math.PI);
      star(ox + pose.x, e.spot.top - 6, 8 + 7 * Math.sin(k * Math.PI), '#fff6b0', k * 3);
      ctx.restore();
    }
    if (DEBUG && !hit) {
      const hs = hitShape(pose);
      ctx.save(); ctx.strokeStyle = pose.hittable ? '#0f0' : '#f00'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(ox + hs.cx, hs.cy, hs.rx, hs.ry, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(ox + hs.hx, hs.hy, C.score.precisionRadius * pose.h, 0, Math.PI * 2); ctx.strokeStyle = '#0ff'; ctx.stroke();
      ctx.restore();
    }
  }
  // 敵の状態に合わせてコマを選ぶ（コマが無ければ従来の 1 枚絵）
  let FRAME_INFO = {}; // tools/prepare_assets.py が書き出すコマごとの大きさ
  const frameScale = (name) => (FRAME_INFO[name] && FRAME_INFO[name].scale) || 1;
  const frameTop = (name) => !!(FRAME_INFO[name] && FRAME_INFO[name].align === 'top');
  function frameImg(e) {
    const t = e.def.base || e.type, hit = e.state === 'hit';
    const base = { img: spriteOf(t, hit), scale: 1, flipNative: false };
    if (hit) return base;
    const civ = e.def.civilian;
    const fx = (name) => (IMG[name] ? { img: IMG[name], scale: frameScale(name), top: frameTop(name), flipNative: false } : base);
    if (t === 'jumper') {
      const n = e.state === 'jump' ? 'jump' : e.state === 'aim' ? 'air' : e.state === 'fall' ? 'fall' : 'crouch';
      return fx(`enemy_jumper_${n}`);
    }
    if (e.state === 'run' || e.state === 'flee' || e.state === 'cross') {
      if (civ) return fx(t === 'chicken' ? 'chicken_run' : 'lady_walk');
      const seq = ['run1', 'run2', 'run3', 'run2'];
      return fx(`enemy_${t}_${seq[Math.floor((G.now + e.spot.id * 0.1) / 0.075) % 4]}`);
    }
    if (civ) return base;
    if (e.mode === 'run') return fx(`enemy_${t}_run1`);
    if (e.mode === 'lean' && !e.def.leanFrames) return base; // 上半身だけのコマは横のぞきに使わない
    if (!IMG[`enemy_${t}_idle`]) return base;
    if (e.spotted > 0) return fx(`enemy_${t}_surprised`);          // 照準が近づくと「ギクッ」
    if (e.state === 'hold') {
      if (e.taunt && e.t > e.dur - 0.5) return fx(`enemy_${t}_taunt`); // 隠れる直前にあっかんべー
      const ph = (G.now + e.spot.id * 0.53) % 2.6;
      if (ph < 0.13) return fx(`enemy_${t}_blink`);
      if (Math.floor((G.now + e.spot.id * 0.7) / 0.9) % 3 === 1) return fx(`enemy_${t}_look`);
    }
    return fx(`enemy_${t}_idle`);
  }

  // 背景の生き物（転がる回転草・カラス）。画面の雰囲気だけで、ゲームには影響しない
  const PROPS = { tumble: null, crows: [], next: 3 };
  function updateProps(dt) {
    PROPS.next -= dt;
    if (PROPS.next <= 0) {
      PROPS.next = fr(5, 11);
      const dir = Math.random() < 0.5 ? 1 : -1;
      if (Math.random() < 0.55 && !PROPS.tumble && IMG.prop_tumble) {
        PROPS.tumble = { x: dir > 0 ? -60 : W + 60, dir, y: FY + fr(520, 575) * SY, t: 0, sp: fr(90, 150), r: fr(20, 28) };
      } else if (PROPS.crows.length < 2 && IMG.prop_crow1) {
        PROPS.crows.push({ x: dir > 0 ? -40 : W + 40, y: FY - fr(-30, 80), dir, sp: fr(55, 95), t: 0, s: fr(0.75, 1) });
      }
    }
    const tb = PROPS.tumble;
    if (tb) { tb.t += dt; tb.x += tb.dir * tb.sp * dt; if (tb.x < -90 || tb.x > W + 90) PROPS.tumble = null; }
    for (const c of PROPS.crows) { c.t += dt; c.x += c.dir * c.sp * dt; c.y += Math.sin(c.t * 2.2) * 8 * dt; }
    PROPS.crows = PROPS.crows.filter((c) => c.x > -70 && c.x < W + 70);
  }
  function drawTumble() {
    const tb = PROPS.tumble;
    if (!tb) return;
    const bounce = Math.abs(Math.sin(tb.t * 4.5)) * 16;
    ctx.fillStyle = 'rgba(90,40,10,0.22)';
    ctx.beginPath(); ctx.ellipse(tb.x, tb.y, tb.r * (1 - bounce / 40), tb.r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(tb.x, tb.y - tb.r - bounce); ctx.rotate(tb.t * tb.dir * 5);
    ctx.drawImage(IMG.prop_tumble, -tb.r, -tb.r, tb.r * 2, tb.r * 2);
    ctx.restore();
  }
  function drawCrows() {
    for (const c of PROPS.crows) {
      const im = IMG[Math.floor(c.t * 6) % 2 ? 'prop_crow1' : 'prop_crow2'];
      if (!im) continue;
      const h = 30 * c.s, w = h * im.width / im.height;
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.dir < 0 ? -1 : 1, 1);
      ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
    }
  }
  // ランタンの灯り（ゆらぐ光を重ねるだけ）
  function drawLanterns(n, ox) {
    const st = C.stages[stageIdx(n)];
    if (!st.lanterns || ox <= -W || ox >= W) return;
    const sx = W / st.w;
    for (const [lx, ly] of st.lanterns) {
      const f = 0.78 + 0.22 * Math.sin(G.now * 9 + lx) * Math.sin(G.now * 5.3 + ly);
      glow([255, 185, 80], ox + lx * sx, STAGES[stageIdx(n)].imgTop + ly * SY, 74, 0.6 * f);
    }
  }
  // エリア評価の星
  function drawStarBanner() {
    const sb = G.starBanner;
    if (!sb) return;
    const t = sb.t, a = t < 1.2 ? 1 : 1 - (t - 1.2) / 0.3;
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    const s = t < 0.2 ? easeBack(t / 0.2) : 1;
    ctx.translate(W / 2, FY + 170); ctx.scale(s, s);
    if (sb.n === 3 && IMG.word_perfect) { const ww = 300, wh = ww * IMG.word_perfect.height / IMG.word_perfect.width; drawRays(0, -50, 220, GOLD, G.now, 0.3, true); ctx.drawImage(IMG.word_perfect, -ww / 2, -50 - wh / 2, ww, wh); }
    else fancyText(sb.n === 3 ? 'PERFECT!' : 'AREA CLEAR', 0, -50, 40, sb.n === 3 ? 'gold' : 'white');
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 66;
      star(x, 14, 31, 'rgba(40,20,10,0.65)', 0);
      star(x, 14, 25, 'rgba(255,255,255,0.22)', 0);
      if (i < sb.shown) {
        const k = clamp((t - 0.25 - i * 0.18) / 0.15, 0, 1), ss = 0.4 + easeBack(k) * 0.6;
        ctx.save(); ctx.translate(x, 14); ctx.scale(ss, ss);
        star(0, 0, 27, '#ffd23a', 0); star(-4, -5, 9, '#fff6b0', 0);
        ctx.restore();
        if (k < 1) glow(GOLD, x, 14, 100, 1 - k);
      }
    }
    ctx.restore();
  }
  function medalIcon(x, y, r) {
    ctx.fillStyle = '#9a6a10'; ctx.beginPath(); ctx.arc(x, y + 1.5, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, Math.PI * 2); ctx.stroke();
    star(x, y, r * 0.55, '#c88a10', 0);
  }
  // ================================================================== v0.6 パチンコ風の段階演出
  const FXL = () => C.fxLevels[save.fx] || C.fxLevels.standard;
  function slowmo(sec) { G.slowT = Math.max(G.slowT || 0, sec * FXL().k); }
  function overlay(o) { o.t = 0; G.overlays.push(o); }
  // 集中線：画面の外から命中点へ向かう白い線
  function focusLines(x, y, dur = 0.3, n = 40) {
    const lines = [];
    for (let i = 0; i < n; i++) lines.push([i / n * Math.PI * 2 + fr(-0.05, 0.05), fr(0.25, 0.55), fr(0.6, 1.4)]);
    overlay({ kind: 'focus', x, y, dur, lines });
  }
  // 画面全体の一瞬の光（強さは設定の上限まで）
  function screenFlash(rgb, a, dur = 0.18) { overlay({ kind: 'flash', rgb, a: Math.min(a, FXL().flash), dur }); }
  function rays(x, y, size, rgb, dur = 0.5, rainbow = false) { addFx({ kind: 'rays', x, y, size, rgb, dur, rainbow, rot: fr(0, 6) }); }
  function boom(x, y, size, dur = 0.34) { if (IMG.fx_boom_1) addFx({ kind: 'boom', x, y, size, dur }); }
  function word(img, x, y, w, dur = 0.75) { if (IMG[img]) addFx({ kind: 'word', img, x: clamp(x, w * 0.62, W - w * 0.62), y: Math.max(y, hudBottom() + 50), w, dur, rot: fr(-0.18, 0.1) }); } // 画面からはみ出さない位置に
  // コインの雨：画面の上から降ってきて地面で跳ねる
  function coinRain(n) {
    n = Math.round(n * FXL().coins);
    for (let i = 0; i < n; i++) {
      addPart({ kind: 'rain', x: fr(10, W - 10), y: FY - fr(20, 260), vx: fr(-40, 40), vy: fr(60, 260), g: 1100,
        life: fr(1.4, 2.0), size: fr(8, 12), spin: fr(10, 18), bounced: false });
    }
    if (n > 0) A.coinRain();
  }
  function comboMilestone(c) {
    const lv = C.comboMilestones.indexOf(c);
    G.comboBanner = { n: c, t: 0, lv };
    A.milestone(lv);
    coinRain(6 + lv * 3);
    focusLines(W / 2, FB - 90, 0.35, 30);
    screenFlash([255, 230, 150], 0.18, 0.15);
  }
  // カットイン：画面を斜めの帯で横切る決めの一枚（フィーバー突入・ボス撃破）
  function cutin(kind) {
    G.cutin = { kind, t: 0, dur: FXL().cutin, word: kind === 'fever' ? 'word_fever' : 'word_jackpot' };
    G.aim = null;
    A.cutin();
    screenFlash([255, 255, 255], 0.5, 0.2);
  }

  // ---- 空に投げられる的
  function updateTargets(dt) {
    const T = C.skyTargets;
    G.skyT -= dt;
    if (G.skyT <= 0 && !G.trans) {
      G.skyT = rrange(T.every);
      const id = pickWeighted(Object.fromEntries(T.types.map((q) => [q.id, q.w])));
      const type = T.types.find((k) => k.id === id);
      if (IMG['target_' + type.id]) {
        const spots = curStage().spots.filter((s) => !s.window && !s.far);
        const s = pick(spots);
        const apex = clamp(rr(hudBottom() + 70, FY + 160), hudBottom() + 50, FB - 200);
        const g = 900, vy = -Math.sqrt(2 * g * Math.max(60, s.top - apex));
        const tx = clamp(s.cx + rr(-160, 160), 60, W - 60), tUp = -vy / g;
        G.targets.push({ type, x: s.cx, y: s.top - 6, vx: (tx - s.cx) / tUp * 0.8, vy, g, rot: 0, vr: fr(-6, 6), t: 0, alive: true });
        A.swish();
      }
    }
    for (const q of G.targets) {
      q.t += dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      if (q.y > FB + 60 || q.x < -80 || q.x > W + 80) q.alive = false;
    }
    G.targets = G.targets.filter((q) => q.alive);
  }
  function targetAt(x, y) {
    for (let i = G.targets.length - 1; i >= 0; i--) {
      const q = G.targets[i];
      if (Math.hypot(x - q.x, y - q.y) < q.type.size * 0.75) return q;
    }
    return null;
  }
  function drawTargets() {
    for (const q of G.targets) {
      const im = IMG['target_' + q.type.id];
      if (!im) continue;
      const h = q.type.size, w = h * im.width / im.height;
      if (q.type.id === 'gold') glow(GOLD, q.x, q.y, h * 3, 0.45 + 0.25 * Math.sin(G.now * 12));
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
    }
  }
  function hitTarget(q, x, y, result) {
    q.alive = false;
    G.targets = G.targets.filter((k) => k !== q);
    const T = q.type;
    G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.targetsHit++;
    const mul = Math.min(C.score.comboMaxMul, 1 + C.score.comboStep * (G.combo - 1)) * (G.fever > 0 ? C.fever.scoreMul : 1);
    const pts = Math.round(T.pts * mul);
    G.score += pts; addTime(T.time);
    A.target(T.id); A.marker(T.id === 'gold' ? 'crit' : 'hit');
    G.marker = { x, y, t: 0, dur: 0.36, kind: T.id === 'gold' ? 'crit' : 'hit' };
    G.hitstop = T.id === 'gold' ? 0.1 : 0.04; G.shake = Math.max(G.shake, T.id === 'gold' ? 9 : 5); G.punch = 1;
    // 割れた絵を回しながら飛ばす
    if (IMG['target_' + T.id + '_broken']) addPart({ kind: 'shard', img: 'target_' + T.id + '_broken', x, y, vx: q.vx * 0.3, vy: -120, g: 700, life: 0.6, size: T.size * 1.4, rot: q.rot, vr: q.vr * 2 });
    boom(x, y, T.size * 2, 0.3);
    sparks(x, y, 8, T.id === 'gold' ? 'crit' : 'hit');
    coins(x, y, T.id === 'gold' ? 8 : 3);
    flyTime(x, y, T.time);
    dmgPopup(pts, x, y - 30, T.id === 'gold' ? 'crit' : 'hit');
    if (T.id === 'gold') { rays(x, y, 260, GOLD, 0.7); word('word_jackpot', x, y - 80, 220); coinRain(18); focusLines(x, y); screenFlash([255, 220, 120], 0.3); }
    else popup(T.id === 'can' ? 'カーン！' : 'パリーン！', x, y - 70, '#fff', 22, 0.6, 'white');
    comboEvents();
    Object.assign(result, { hit: true, target: T.id, points: pts, timeBonus: T.time });
    G.lastShot = result;
    return result;
  }

  // ---- 跳ね屋（mode: 'jump'）
  function jumperPose(e, pose) {
    const s = e.spot, h = e.h * 1.08;
    pose.h = h; pose.w = h * e.w / e.h; pose.clip = null; pose.depth = 9999; pose.hittable = true; pose.flip = e.flip;
    const startTop = s.top - e.h * 0.35;
    if (e.state === 'jump') {
      const q = clamp(e.t / e.dur, 0, 1);
      pose.x = lerp(e.jx0, e.ax, q); pose.top = lerp(startTop, e.apexTop, easeOut(q));
    } else if (e.state === 'aim' || e.state === 'shoot') {
      pose.x = e.ax + Math.sin(e.t * 3) * 6; pose.top = e.apexTop + Math.sin(e.t * 5) * 3;
    } else { // fall
      const q = clamp(e.t / e.dur, 0, 1);
      pose.x = lerp(e.ax, s.cx, q); pose.top = lerp(e.apexTop, startTop, q * q);
    }
    return pose;
  }
  function jumperStep(e) { // 状態の切り替え（updateEnemy から）
    const def = e.def;
    if (e.state === 'rise') {
      e.jx0 = e.spot.cx; e.ax = clamp(e.spot.cx + rr(-90, 90), 50, W - 50);
      const apexC = clamp(rr(hudBottom() + 90, FY + 150), hudBottom() + 70, e.spot.top - 140);
      e.apexTop = apexC - e.h * 0.55;
      nextState(e, 'jump', def.jump); dust(e.spot.cx, e.spot.top, 1.2); A.swish(); return true;
    }
    if (e.state === 'jump') { nextState(e, 'aim', def.aim); A.jumperAlert(); return true; }
    if (e.state === 'aim') { jumperShoots(e); nextState(e, 'fall', def.fall); return true; }
    if (e.state === 'fall') { nextState(e, 'sink', def.rise); return true; }
    return false;
  }
  function bomberThrows(e) { // 導火線が燃え尽きた：爆弾を投げられて時間が減る
    const d = e.def;
    A.tnt(); vibe(70);
    G.time = Math.max(0.5, G.time - d.bombPenalty);
    G.timerBump = 1; G.timerBad = 0.8; G.shake = Math.max(G.shake, 14);
    if (G.combo >= C.bonus.comboFrom) A.comboBreak();
    G.combo = 0;
    boom(W / 2 + fr(-60, 60), H * 0.62, 320, 0.5);
    screenFlash([255, 120, 30], 0.35, 0.25);
    popup(`爆弾が来た！ -${d.bombPenalty}秒`, W / 2, H * 0.55, '#ff6a5a', 30, 1.0, 'red');
  }
  // 導火線の残り：敵のまわりで縮む赤い輪と「！」
  function drawFuse(e, ps, ox) {
    const k = clamp(e.t / e.dur, 0, 1), x = ox + ps.x, y = ps.top + ps.h * 0.35;
    const blink = k > 0.6 && Math.floor(G.now * 12) % 2 === 0;
    ctx.save();
    ctx.lineWidth = 4; ctx.strokeStyle = blink ? '#fff' : '#ff4a2a';
    ctx.globalAlpha = 0.5 + k * 0.5;
    ctx.beginPath(); ctx.arc(x, y, lerp(ps.h * 0.85, ps.h * 0.4, k), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    text('！', x, ps.top - 16, 28, blink ? '#fff' : '#ff4a2a', 'center', '#3a0a08');
    ctx.restore();
  }
  function jumperShoots(e) { // 撃たれる前に撃てなかった
    const def = e.def;
    A.enemyShot(); vibe(60);
    G.time = Math.max(0.5, G.time - def.shotPenalty);
    G.timerBump = 1; G.timerBad = 0.8; G.shake = Math.max(G.shake, 12);
    if (def.shotBreaksCombo && G.combo >= C.bonus.comboFrom) { A.comboBreak(); }
    if (def.shotBreaksCombo) G.combo = 0;
    screenFlash([255, 40, 30], 0.35, 0.25);
    overlay({ kind: 'crack', dur: 0.6, x: W / 2 + fr(-60, 60), y: H * 0.55 });
    const ps = computePose(e);
    addFx({ kind: 'muzzle', x: e.ax, y: ps.top + ps.h * 0.45, x2: W / 2, y2: H, dur: 0.1 });
    popup(`撃たれた！ -${def.shotPenalty}秒`, W / 2, H * 0.55, '#ff6a5a', 30, 1.0, 'red');
  }
  // 狙われている間：赤い照準線と縮む円
  function drawJumperAim(e, ox) {
    if (e.state !== 'aim') return;
    const ps = computePose(e), k = clamp(e.t / e.dur, 0, 1);
    const gx = ox + ps.x, gy = ps.top + ps.h * 0.45;
    ctx.save();
    ctx.strokeStyle = `rgba(255,40,30,${0.35 + 0.4 * k})`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -G.now * 160;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(W / 2, H - 150); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#ff3a2a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(gx, ps.top + ps.h * 0.5, ps.h * (1.1 - k * 0.55), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (Math.floor(G.now * 10) % 2) text('!!', gx, ps.top - 14, 30, '#ff4a3a', 'center', '#3a0a08');
  }

  // ---- ボス予告（縁の色で報酬倍率がわかる）
  function startPremonition(b) {
    const P = C.premonition;
    const id = pickWeighted(Object.fromEntries(P.colors.map((q) => [q.id, q.w])));
    const col = P.colors.find((q) => q.id === id);
    b.pre = { t: 0, col, lv: P.colors.indexOf(col) };
    b.mul = col.mul;
    A.premo(b.pre.lv);
  }
  function drawPremonition() {
    const b = G.boss;
    if (!b || !b.pre || b.pre.t > C.premonition.lead + 0.6 || G.trans) return;
    const pr = b.pre, k = pr.t, col = pr.col;
    const pulse = Math.max(0, Math.sin(k * Math.PI * 4));
    const rgb = col.id === 'rainbow' ? hsl2rgb((G.now * 240) % 360) : col.rgb;
    edgeGlow(`rgba(${rgb.join(',')},0.95)`, (0.35 + 0.45 * pulse) * FXL().k, 90);
    if (col.label || save.cb) {
      const s = 1 + pulse * 0.12;
      ctx.save(); ctx.translate(W / 2, hudBottom() + 70); ctx.scale(s, s);
      glow(rgb, 0, 0, 260, 0.35 * pulse);
      fancyText(save.cb ? `${col.label || '予告'} ×${col.mul}` : col.label, 0, 0, pr.lv >= 3 ? 46 : 38, col.id === 'rainbow' ? 'rainbow' : pr.lv >= 3 ? 'gold' : pr.lv === 2 ? 'red' : 'white');
      ctx.restore();
    }
  }
  function hsl2rgb(h, s = 1, l = 0.6) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }

  // ---- 画面に重ねる演出（集中線・全体の光・ひび）
  function drawOverlays() {
    for (const o of G.overlays) {
      const p = o.t / o.dur;
      ctx.save();
      if (o.kind === 'focus') {
        ctx.globalAlpha = (1 - p) * 0.6 * Math.min(1, FXL().k);
        ctx.fillStyle = '#fff';
        const R = Math.hypot(W, H);
        for (const [a, inner, wdt] of o.lines) {
          const r0 = R * (inner + p * 0.15), da = 0.012 * wdt;
          ctx.beginPath();
          ctx.moveTo(o.x + Math.cos(a) * r0, o.y + Math.sin(a) * r0);
          ctx.lineTo(o.x + Math.cos(a - da) * R, o.y + Math.sin(a - da) * R);
          ctx.lineTo(o.x + Math.cos(a + da) * R, o.y + Math.sin(a + da) * R);
          ctx.closePath(); ctx.fill();
        }
      } else if (o.kind === 'flash') {
        ctx.globalAlpha = o.a * (1 - p);
        ctx.fillStyle = `rgb(${o.rgb.join(',')})`; ctx.fillRect(0, 0, W, H);
      } else if (o.kind === 'crack') { // 撃たれた時の赤いひび
        ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * Math.PI * 2 + 0.3; let x = o.x, y = o.y;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let j = 1; j <= 4; j++) { x += Math.cos(a + Math.sin(i * 7 + j) * 0.4) * 34; y += Math.sin(a + Math.cos(i * 5 + j) * 0.4) * 34; ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  // 大きな「◯ COMBO!」
  function drawComboBanner() {
    const cb = G.comboBanner;
    if (!cb) return;
    const p = cb.t / 1.0;
    const s = p < 0.15 ? 0.3 + easeBack(p / 0.15) * 0.9 : p < 0.3 ? lerp(1.2, 1, (p - 0.15) / 0.15) : 1;
    ctx.save();
    ctx.globalAlpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
    ctx.translate(W / 2, FB - 70); ctx.scale(s, s); ctx.rotate(-0.06);
    drawRays(0, 0, 230, GOLD, G.now * 1.5, 0.35, cb.lv >= 2);
    fancyText(`${cb.n} COMBO!`, 0, 0, 60 + Math.min(cb.lv, 4) * 6, 'rainbow');
    ctx.restore();
  }
  // 放射状の光（色ごとに一度だけ画像にして、回して描く）
  const RAYS = {};
  function raysImg(rgb, rainbow) {
    const key = rainbow ? 'rainbow' : rgb.join(',');
    if (RAYS[key]) return RAYS[key];
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); g.translate(S / 2, S / 2);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const col = rainbow ? hsl2rgb(i * 360 / n) : rgb;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
      gr.addColorStop(0, `rgba(${col.join(',')},1)`); gr.addColorStop(1, `rgba(${col.join(',')},0)`);
      g.fillStyle = gr;
      const a0 = i / n * Math.PI * 2;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, S / 2, a0, a0 + Math.PI / n); g.closePath(); g.fill();
    }
    return (RAYS[key] = c);
  }
  function drawRays(x, y, R, rgb, rot, a, rainbow = false) {
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.drawImage(raysImg(rgb, rainbow), -R, -R, R * 2, R * 2);
    ctx.restore();
  }
  // カットインの描画
  function drawCutin() {
    const c = G.cutin;
    if (!c) return;
    const p = c.t / c.dur;
    const inK = easeOut(clamp(p / 0.2, 0, 1)), outK = clamp((p - 0.8) / 0.2, 0, 1);
    const vis = inK * (1 - outK);
    ctx.save();
    ctx.fillStyle = `rgba(10,5,20,${0.55 * vis})`; ctx.fillRect(0, 0, W, H);
    const cy = H * 0.42;
    drawRays(W / 2, cy, H * 0.75, c.kind === 'fever' ? [255, 120, 180] : GOLD, G.now * 0.9, 0.32 * vis, c.kind !== 'fever');
    // 斜めの帯
    const bandH = 250, off = (1 - inK) * -W * 1.2 + outK * W * 1.2;
    ctx.save(); ctx.translate(W / 2 + off, cy); ctx.rotate(-0.12);
    const g = ctx.createLinearGradient(-W, 0, W, 0);
    if (c.kind === 'fever') { g.addColorStop(0, '#ff3a8a'); g.addColorStop(0.5, '#ff8a2a'); g.addColorStop(1, '#ffd23a'); }
    else { g.addColorStop(0, '#b8860b'); g.addColorStop(0.5, '#ffd23a'); g.addColorStop(1, '#ff6a2a'); }
    ctx.fillStyle = g; ctx.fillRect(-W, -bandH / 2, W * 2, bandH);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-W, -bandH / 2, W * 2, 6); ctx.fillRect(-W, bandH / 2 - 6, W * 2, 6);
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; // 帯の中の流れる線
    for (let i = 0; i < 14; i++) {
      const yy = -bandH / 2 + 14 + (i * 37) % (bandH - 28), len = 80 + (i * 53) % 160;
      const xx = ((i * 211 - c.t * 1400) % (W * 2 + 400)) + W;
      ctx.fillRect(xx - W, yy, len, 3);
    }
    ctx.restore();
    // 主人公の顔
    const im = hv('cutin_' + G.hero);
    if (im) {
      const ph = 330, pw = ph * im.width / im.height;
      const px = lerp(W + pw, W * 0.7, inK) + outK * W;
      ctx.drawImage(im, px - pw / 2, cy - ph / 2 - 10, pw, ph);
    }
    // 大きな文字
    const wp = clamp((p - 0.1) / 0.2, 0, 1);
    if (wp > 0) {
      const ws = (0.3 + easeBack(wp) * 0.7) * (1 + Math.sin(c.t * 18) * 0.02);
      ctx.save(); ctx.translate(W * 0.36, cy + 6); ctx.scale(ws, ws); ctx.rotate(-0.12);
      ctx.globalAlpha = 1 - outK;
      const wi = IMG[c.word];
      if (wi) { const ww = 330, wh = ww * wi.height / wi.width; ctx.drawImage(wi, -ww / 2, -wh / 2, ww, wh); }
      else fancyText(c.kind === 'fever' ? 'FEVER!!' : 'JACKPOT!', 0, 0, 64, 'rainbow');
      ctx.restore();
    }
    ctx.restore();
  }
  // 弾道予測線：構えている間だけ、銃口から照準まで光の点線が流れる
  function drawAimLine(a, r) {
    const o = gunOrigin();
    const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy);
    if (d < r + 20) return;
    const ex = a.x - dx / d * (r + 6), ey = a.y - dy / d * (r + 6);
    const k = clamp(G.aim.age / 0.12, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,190,80,${0.22 * k})`; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(255,248,225,${0.85 * k})`; ctx.lineWidth = 2.5;
    ctx.setLineDash([12, 9]); ctx.lineDashOffset = -G.now * 140;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.restore();
  }

  // ================================================================== v0.7 盾持ち・泥棒・ダイナマイト・スキル
  // ---- ダイナマイトの樽（エリアごとに置き直す）
  function setupTNT() {
    const st = curStage(), cfg = C.stages[stageIdx(G.areaN)];
    G.tnts = (cfg.tnt || []).map(([x, y]) => ({ x: x * (W / st.w), y: st.imgTop + y * SY, alive: true, respawn: 0, h: depthH(y - ((cfg.h || 760) - 760)) * 0.62 }));
  }
  function updateTNT(dt) {
    for (const t of G.tnts || []) if (!t.alive) { t.respawn -= dt; if (t.respawn <= 0) { t.alive = true; dust(t.x, t.y, 1.2); } }
  }
  function tntAt(x, y) {
    for (const t of G.tnts || []) {
      if (!t.alive) continue;
      const w = t.h * 0.75;
      if (x >= t.x - w / 2 && x <= t.x + w / 2 && y >= t.y - t.h && y <= t.y) return t;
    }
    return null;
  }
  function drawTNT(t) {
    if (!t.alive) return;
    const h = t.h, w = h * 0.75, x = t.x - w / 2, y = t.y - h;
    ctx.save();
    ctx.fillStyle = 'rgba(60,25,10,0.3)'; ctx.beginPath(); ctx.ellipse(t.x, t.y, w * 0.6, h * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#8a1a12'); g.addColorStop(0.45, '#e0402a'); g.addColorStop(1, '#7a140e');
    rrect(x, y, w, h, w * 0.18); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(x, y + h * 0.16, w, h * 0.08); ctx.fillRect(x, y + h * 0.76, w, h * 0.08);
    ctx.fillStyle = '#f4e3c3'; rrect(x + w * 0.12, y + h * 0.36, w * 0.76, h * 0.3, 3); ctx.fill();
    text('TNT', t.x, y + h * 0.51, Math.max(9, h * 0.22), '#c0201a', 'center', null);
    // 導火線と火花
    ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t.x, y); ctx.quadraticCurveTo(t.x + w * 0.3, y - h * 0.2, t.x + w * 0.15, y - h * 0.32); ctx.stroke();
    ctx.restore();
    glow([255, 200, 80], t.x + w * 0.15, y - h * 0.32, 18 + Math.sin(G.now * 20) * 5, 0.9);
  }
  function explodeTNT(t, x, y, result) {
    t.alive = false; t.respawn = C.tnt.respawn;
    const R = C.tnt.radius, cx = t.x, cy = t.y - t.h * 0.5;
    A.tnt(); vibe(90);
    G.shake = Math.max(G.shake, 18); G.punch = 1.8; G.hitstop = 0.12;
    boom(cx, cy, R * 2.6, 0.5); boom(cx + 30, cy - 20, R * 1.6, 0.45);
    rays(cx, cy, R * 2.4, [255, 150, 60], 0.7); focusLines(cx, cy, 0.4, 56);
    screenFlash([255, 220, 160], 0.4, 0.25);
    for (let i = 0; i < 3; i++) smoke(cx + fr(-40, 40), cy + fr(-20, 20), 2.2);
    sparks(cx, cy, 18, 'crit');
    let kills = 0, civ = null;
    for (const e of G.enemies) {
      if (!e.alive || e.state === 'hit') continue;
      const ps = computePose(e), ex = ps.x, ey = ps.top + ps.h * 0.5;
      if (Math.hypot(ex - cx, ey - cy) > R + ps.h * 0.3) continue;
      if (e.def.civilian) { civ = civ || { e, ps }; continue; }
      e.state = 'hit'; e.t = 0; e.hitPose = ps; e.killed = true; e.kick = ex >= cx ? 1 : -1; e.hp = 0;
      kills++; G.combo++; G.hits++; G.areaHits++; G.tntKills = (G.tntKills || 0) + 1;
      const mul = Math.min(C.score.comboMaxMul, 1 + C.score.comboStep * (G.combo - 1)) * (G.fever > 0 ? C.fever.scoreMul : 1);
      const pts = Math.round((C.score.hit + C.tnt.chainPts * kills + (e.type === 'boss' ? C.score.boss * ((G.boss && G.boss.mul) || 1) : 0)) * mul);
      G.score += pts; addTime(C.tnt.chainTime + (e.type === 'boss' ? C.bonus.boss : 0));
      if (e.type === 'boss') { G.bossKills++; G.pendingCutin = 'boss'; }
      dmgPopup(pts, ex, ps.top - 10, 'crit');
      coins(ex, ey, 3);
      addGauge('tnt');
    }
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    if (civ) hitCivilian(civ.e, { pose: civ.ps }, civ.ps.x, civ.ps.top + civ.ps.h * 0.5, { x: cx }, { hit: true });
    word('word_bang', cx, cy - 70, 230);
    if (kills >= 2) { callout(kills >= 4 ? 'MEGA BLAST!' : kills === 3 ? 'TRIPLE!' : 'DOUBLE!', '#ff8a3a', 1.1, Math.min(kills, 4), 60 + kills * 4); coinRain(6 + kills * 4); }
    if (kills > 0) flyTime(cx, cy, C.tnt.chainTime * kills);
    comboEvents();
    Object.assign(result, { hit: kills > 0, tnt: true, kills });
    G.lastShot = result;
    return result;
  }

  // ---- 盾持ち（鉄かぶとが 1 発目を弾く）
  function hitShield(e, res, x, y, o, result) {
    e.hp--;
    e.helmetT = 0.001;
    A.clang(); vibe(15);
    G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
    G.shake = Math.max(G.shake, 6); G.hitstop = 0.05;
    sparks(x, y, 10, 'crit');
    const ps = res.pose;
    addPart({ kind: 'helmet', x: ps.x, y: ps.top + ps.h * 0.12, vx: (x >= o.x ? 1 : -1) * 180, vy: -420, g: 1400, life: 0.9, size: ps.h * 0.5, rot: 0, vr: (x >= o.x ? 1 : -1) * 12 });
    popup('カキーン！', x, y - 40, '#e8f0ff', 26, 0.7, 'aqua');
    G.marker = { x, y, t: 0, dur: 0.3, kind: 'hit' };
    if (e.state === 'sink' || e.state === 'hide') nextState(e, 'hold', 0.5); // 弾かれたあと少しだけ顔を出したまま
    comboEvents();
    Object.assign(result, { hit: true, shield: true, type: e.type });
    G.lastShot = result;
    return result;
  }
  function drawHelmet(ps, ox, rot = 0, alpha = 1) {
    const w = ps.w * 0.78, h = ps.h * 0.3, x = ox + ps.x, y = ps.top + h * 0.75;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot);
    const g = ctx.createLinearGradient(0, -h, 0, h * 0.4);
    g.addColorStop(0, '#f2f6fa'); g.addColorStop(0.45, '#9aa6b4'); g.addColorStop(1, '#4e5866');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5e6876'; ctx.fillRect(-w * 0.62, -2, w * 1.24, h * 0.22);
    ctx.fillStyle = '#e8eef4';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * w * 0.2, -h * 0.35 + Math.abs(i) * h * 0.12, Math.max(1.5, w * 0.03), 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(30,35,45,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h, 0, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }

  // ---- 気球乗り（空を横切る）
  function spawnBalloon() {
    const d = C.enemies.balloon, base = IMG.enemy_balloon;
    if (!base) return null;
    const h = d.height, w = h * base.width / base.height, dir = rand() < 0.5 ? 1 : -1;
    const gy = hudBottom() + 14 + h + rr(0, 90);
    const fake = { busy: null, cx: W / 2, top: gy - h, bot: gy, eh: h, id: 78, x0: 0, x1: 0, side: 'LR', far: false };
    const e = {
      type: 'balloon', def: d, mode: 'cross', spot: fake, state: 'cross', t: 0, h, w, flip: dir < 0,
      cycles: 1, peek: 0, xoff: 0, dir, alive: true, dustT: 0,
      from: { x: dir > 0 ? -w : W + w, ground: gy }, dest: { x: dir > 0 ? W + w : -w, ground: gy },
    };
    e.dur = (W + w * 2) / d.speed * C.enemySlow;
    G.enemies.push(e);
    return e;
  }
  // ---- 泥棒（金袋を抱えて横切る）
  function spawnThief() {
    const st = curStage();
    const ground = st.spots.filter((s) => !s.window && !s.far).map((s) => s.bot).sort((a, b) => a - b);
    const gy = ground[Math.floor(ground.length * 0.5)] + 12;
    const dir = rand() < 0.5 ? 1 : -1;
    const base = IMG.enemy_green;
    const h = depthH((gy - st.imgTop) / SY - (st.ih - 760)) * 1.0;
    const w = h * base.width / base.height;
    const fake = { busy: null, cx: W / 2, top: gy - h, bot: gy, eh: h, id: 77, x0: 0, x1: 0, side: 'LR', far: false };
    const e = {
      type: 'thief', def: C.enemies.thief, mode: 'cross', spot: fake, state: 'cross', t: 0, h, w, flip: dir < 0,
      cycles: 1, peek: 0, xoff: 0, dir, alive: true, hasBag: true, dustT: 0,
      from: { x: dir > 0 ? -w : W + w, ground: gy }, dest: { x: dir > 0 ? W + w : -w, ground: gy },
    };
    e.dur = (W + w * 2) / C.enemies.thief.speed * C.enemySlow;
    G.enemies.push(e);
    A.alert();
    return e;
  }
  function bagOf(e, ps) {
    const f = ps.flip ? -1 : 1;
    return { x: ps.x + f * ps.w * 0.4, y: ps.top + ps.h * 0.6, r: ps.h * 0.22 };
  }
  function bagAt(x, y) {
    for (const e of G.enemies) {
      if (e.type !== 'thief' || !e.hasBag || e.state === 'hit') continue;
      const b = bagOf(e, computePose(e));
      if (Math.hypot(x - b.x, y - b.y) < b.r * 1.15) return e;
    }
    return null;
  }
  function hitBag(e, x, y, result) {
    const d = e.def;
    e.hasBag = false;
    e.dur = e.t + (e.dur - e.t) / 1.8; // あわてて逃げる
    G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
    const mul = Math.min(C.score.comboMaxMul, 1 + C.score.comboStep * (G.combo - 1)) * (G.fever > 0 ? C.fever.scoreMul : 1);
    const pts = Math.round(d.bagPts * mul);
    G.score += pts; addTime(d.bagTime); G.bonusMedals = (G.bonusMedals || 0) + d.bagMedals;
    A.coinRain(); A.marker('crit'); vibe(25);
    G.marker = { x, y, t: 0, dur: 0.36, kind: 'crit' };
    G.hitstop = 0.06; G.shake = Math.max(G.shake, 7); G.punch = 1.2;
    coins(x, y, 10); coinRain(14); rays(x, y, 200, GOLD, 0.5); burst(x, y, 8, true);
    for (let i = 0; i < 10; i++) addPart({ kind: 'rain', x, y, vx: fr(-260, 260), vy: fr(-520, -200), g: 1100, life: fr(0.9, 1.3), size: fr(7, 10), spin: fr(10, 18), bounced: false });
    flyTime(x, y, d.bagTime);
    dmgPopup(pts, x, y - 30, 'crit');
    popup(`+${d.bagMedals} メダル`, x, y - 80, '#ffe46a', 24, 0.9, 'gold');
    addGauge('crit');
    comboEvents();
    Object.assign(result, { hit: true, bag: true, type: 'thief', points: pts });
    G.lastShot = result;
    return result;
  }
  function drawBag(e, ps, ox) {
    if (!e.hasBag || e.state === 'hit') return;
    const b = bagOf(e, ps), x = ox + b.x, y = b.y + Math.sin(G.now * 18) * 2, r = b.r;
    ctx.save();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, '#e2b070'); g.addColorStop(1, '#8a5a28');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y + r * 0.1, r, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a4018'; ctx.beginPath(); ctx.moveTo(x - r * 0.35, y - r * 0.85); ctx.lineTo(x + r * 0.35, y - r * 0.85); ctx.lineTo(x + r * 0.15, y - r * 0.6); ctx.lineTo(x - r * 0.15, y - r * 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + r * 0.1, r, r * 0.95, 0, 0, Math.PI * 2); ctx.stroke();
    text('$', x, y + r * 0.15, r * 1.1, '#ffd23a', 'center', '#6a3a10');
    ctx.restore();
    glow(GOLD, x, y, r * 3.5, 0.35 + 0.2 * Math.sin(G.now * 10));
  }

  // ---- スキル
  const skillDef = (id) => C.skills.list.find((k) => k.id === id);
  const skillOn = (id) => !!(G.skill && G.skill.id === id);
  function addGauge(kind) {
    if (G.skill || !(save.skillSlots || []).length) return;
    const was = G.gauge >= 1;
    G.gauge = Math.min(1, (G.gauge || 0) + (C.skills.gain[kind] || 0));
    if (!was && G.gauge >= 1) { A.skillReady(); G.gaugeFullT = 0; }
  }
  function useSkill(id) {
    if (!playing() || G.skill || G.gauge < 1 || !skillDef(id)) return false;
    const d = skillDef(id);
    G.gauge = 0;
    G.skill = { id, t: 0, dur: d.dur, acc: 0 };
    A.skill(id); vibe(30);
    screenFlash([255, 255, 255], 0.3, 0.2);
    focusLines(W / 2, H * 0.45, 0.35, 48);
    callout(d.name + '!!', '#ffd23a', 1.0, 3, 56);
    if (id === 'quickdraw') slowmo(d.dur * 0.6);
    return true;
  }
  function updateSkill(dt) {
    const s = G.skill;
    if (!s) return;
    s.t += dt;
    if (s.id === 'quickdraw') { // 見えている敵を順番に自動で撃つ
      s.acc += dt;
      if (s.acc >= 0.14) {
        s.acc = 0;
        const tq = G.targets[0];
        const e = G.enemies.find((q) => q.alive && q.state !== 'hit' && !q.def.civilian && computePose(q).hittable && visiblePt(q));
        let pt = e ? visiblePt(e) : tq ? { x: tq.x, y: tq.y } : null;
        if (!pt && G.tnts) { const t = G.tnts.find((k) => k.alive && G.enemies.some((q) => q.alive && q.state !== 'hit' && !q.def.civilian && Math.hypot(computePose(q).x - k.x, computePose(q).top - k.y) < C.tnt.radius)); if (t) pt = { x: t.x, y: t.y - t.h * 0.5 }; }
        if (pt) { G.cooldown = 0; fire(pt.x, pt.y, true); }
      }
    }
    if (s.id === 'timestop' && Math.floor(s.t * 2) !== Math.floor((s.t - dt) * 2)) A.tick(false);
    if (s.t >= s.dur) { G.skill = null; A.skillEnd(); }
  }
  // 敵の見えている点（顔に近い順）
  function visiblePt(e) {
    const hs = hitShape(computePose(e));
    const offs = [[0, 0], [0, -0.3], [0.25, 0], [-0.25, 0], [0, 0.3], [0.4, -0.4], [-0.4, -0.4], [0, -0.6]];
    for (const [dx, dy] of offs) {
      const x = hs.hx + dx * hs.rx, y = hs.hy + dy * hs.ry;
      const r = hitTest(x, y);
      if (r && r.e === e) return { x, y };
    }
    return null;
  }
  // 大きな弾：外れた時は近くの当たる点を探す
  function nearHit(x, y, R) {
    for (let ring = 1; ring <= 3; ring++) {
      const r = R * ring / 3;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        const res = hitTest(px, py);
        if (res && res.e && !res.e.def.civilian) return { res, x: px, y: py };
      }
    }
    return null;
  }
  // 鷹の目：隠れている敵の場所を光らせる
  function drawHawkeye() {
    if (!skillOn('hawkeye')) return;
    const k = 0.6 + 0.4 * Math.sin(G.now * 8);
    for (const e of G.enemies) {
      if (!e.alive || e.state === 'hit' || e.def.civilian) continue;
      const ps = computePose(e);
      if (ps.hittable) continue;
      const s = e.spot, x = s.window ? s.cx : (e.mode === 'pop' || e.mode === 'boss' || e.mode === 'jump' ? s.cx + e.xoff : s.cx), y = (s.window ? s.wtop : s.top) - 6;
      ctx.save();
      ctx.strokeStyle = `rgba(255,80,60,${0.8 * k})`; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.ellipse(x, y, e.w * 0.45, e.h * 0.28, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      glow([255, 80, 60], x, y, e.h * 1.4, 0.35 * k);
      text(e.type === 'boss' ? '★' : '!', x, y - e.h * 0.32, 22, e.type === 'boss' ? '#ffd23a' : '#ff6a5a', 'center', '#3a0a08');
    }
  }
  function skillIcon(id, x, y, r) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (id === 'quickdraw') { // 稲妻
      ctx.beginPath(); ctx.moveTo(r * 0.15, -r * 0.7); ctx.lineTo(-r * 0.35, r * 0.05); ctx.lineTo(r * 0.05, r * 0.05); ctx.lineTo(-r * 0.15, r * 0.7); ctx.lineTo(r * 0.4, -r * 0.1); ctx.lineTo(0, -r * 0.1); ctx.closePath(); ctx.fill();
    } else if (id === 'hawkeye') { // 目
      ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.quadraticCurveTo(0, -r * 0.65, r * 0.7, 0); ctx.quadraticCurveTo(0, r * 0.65, -r * 0.7, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'bigshot') { // 大きな的
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2); ctx.fill();
    } else { // 時計
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.4); ctx.moveTo(0, 0); ctx.lineTo(r * 0.3, r * 0.12); ctx.stroke();
    }
    ctx.restore();
  }
  // HUD のスキルボタン（左手モードでは右側）
  function skillButtons() {
    const slots = (save.skillSlots || []).filter(skillDef);
    const side = save.lefty ? W - 56 : 56;
    return slots.map((id, i) => ({ id, x: side, y: H - 150 - i * 92, r: 38 }));
  }
  function drawSkillHud() {
    const full = (G.gauge || 0) >= 1;
    for (const b of skillButtons()) {
      buttons.push({ x: b.x, y: b.y, r: b.r + 6, key: 'skill_' + b.id, onTap: () => useSkill(b.id) });
      const on = skillOn(b.id), pressed = pointer.button && pointer.button.key === 'skill_' + b.id;
      ctx.save(); ctx.translate(b.x, b.y); const sc = pressed ? 0.9 : full && !G.skill ? 1 + Math.sin(G.now * 8) * 0.05 : 1; ctx.scale(sc, sc);
      if (full && !G.skill) glow(GOLD, 0, 0, b.r * 4, 0.6);
      ctx.beginPath(); ctx.arc(0, 4, b.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      const g = ctx.createLinearGradient(0, -b.r, 0, b.r);
      g.addColorStop(0, on ? '#ffd23a' : full && !G.skill ? '#ff9a2a' : '#5a6a9a'); g.addColorStop(1, on ? '#c88a10' : full && !G.skill ? '#c8461a' : '#2a3456');
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      // ゲージの輪
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(0, 0, b.r + 2, 0, Math.PI * 2); ctx.stroke();
      const k = on ? 1 - G.skill.t / G.skill.dur : G.skill ? 0 : (G.gauge || 0);
      ctx.strokeStyle = on ? '#fff' : full ? '#ffd23a' : '#7fd0ff'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, b.r + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      skillIcon(b.id, 0, 0, b.r * 0.85);
      ctx.restore();
      text(skillDef(b.id).name, b.x, b.y + b.r + 14, 13, full && !G.skill ? '#ffd23a' : '#fff');
    }
    if (G.skill) { // 発動中の画面の色
      const s = G.skill, k = 1 - s.t / s.dur;
      if (s.id === 'timestop') { ctx.fillStyle = `rgba(90,110,180,${0.22 * Math.min(1, k * 4)})`; ctx.fillRect(0, 0, W, H); }
      edgeGlow(s.id === 'timestop' ? 'rgba(140,170,255,0.9)' : s.id === 'hawkeye' ? 'rgba(255,90,60,0.8)' : 'rgba(255,210,60,0.9)', 0.45, 80);
      const d = skillDef(s.id);
      ctx.save(); ctx.translate(W / 2, hudBottom() + 70);
      fancyText(`${d.name} ${Math.ceil(s.dur - s.t)}`, 0, 0, 26, s.id === 'timestop' ? 'aqua' : 'gold');
      ctx.restore();
    }
  }

  // ---- 共有用の画像（結果の手配書）
  function makeShareCard() {
    const c = document.createElement('canvas'); c.width = 720; c.height = 960;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 960); bg.addColorStop(0, '#3a5fc4'); bg.addColorStop(1, '#f08a3a');
    g.fillStyle = bg; g.fillRect(0, 0, 720, 960);
    const st = IMG.stage0; if (st) { g.globalAlpha = 0.5; g.drawImage(st, 0, 960 - 720 * st.height / st.width, 720, 720 * st.height / st.width); g.globalAlpha = 1; }
    g.fillStyle = '#f3dfb4'; g.strokeStyle = '#a8653a'; g.lineWidth = 10;
    g.beginPath(); g.roundRect ? g.roundRect(60, 200, 600, 640, 18) : g.rect(60, 200, 600, 640); g.fill(); g.stroke();
    if (IMG.logo) { const lw = 480, lh = lw * IMG.logo.height / IMG.logo.width; g.drawImage(IMG.logo, 360 - lw / 2, 20, lw, lh); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 46px ${FONT}`; g.fillStyle = '#7a2a10'; g.fillText('WANTED', 360, 260);
    g.font = `900 110px ${FONT}`; g.fillStyle = '#e8641e'; g.fillText(String(G.score), 360, 380);
    const rk = rankOf(G.score);
    g.font = `900 40px ${FONT}`; g.fillStyle = '#3a2412'; g.fillText(`RANK ${rk.rank}　最大 ${G.maxCombo} コンボ`, 360, 470);
    const pose = heroImg(G.hero, rk.rank === 'C' ? 'lose' : 'win');
    if (pose) { const ph = 300, pw = ph * pose.width / pose.height; g.drawImage(pose, 360 - pw / 2, 500, pw, ph); }
    g.font = `800 28px ${FONT}`; g.fillStyle = '#6b4a2a'; g.fillText('ポップ・ハイドアウトで遊んだよ！', 360, 900);
    return c;
  }
  function shareResult() {
    let card;
    try { card = makeShareCard(); card.toDataURL(); } catch (e) { G.shareMsg = { text: 'この開き方では画像を作れません（アプリ版・サーバー経由で使えます）', t0: G.now }; return; }
    card.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'pop-hideout.png', { type: 'image/png' });
      const textMsg = `ポップ・ハイドアウトで ${G.score} 点！ ランク ${rankOf(G.score).rank}`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: textMsg }).catch(() => {});
      } else { // 共有できない環境では画像を保存
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pop-hideout.png';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        G.shareMsg = { text: '画像を保存しました', t0: G.now };
      }
    });
  }

  function drawField() {
    drawSky();
    const n = G.areaN;
    const ox = n * W - G.camX;
    drawStageAt(n, ox);
    if (G.trans) drawStageAt(n + 1, ox + W);
    drawSkySeam();
    drawLanterns(n, ox);
    if (G.trans) drawLanterns(n + 1, ox + W);
    drawCrows();
    const st = curStage();
    const tnts = G.trans ? [] : (G.tnts || []);
    if (G.enemies.length || tnts.length) {
      const items = G.enemies.map((e) => ({ d: (e.state === 'hit' ? e.hitPose : computePose(e)).depth, e }));
      for (const t of tnts) items.push({ d: t.y, t });
      const minD = G.enemies.length ? Math.min(...items.filter((i) => i.e).map((i) => i.d)) : Infinity;
      for (const s of st.spots) if (s.bot > minD && !s.window) items.push({ d: s.bot, s });
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.e ? drawEnemy(it.e, ox) : it.t ? drawTNT(it.t) : drawCover(st, it.s, ox);
    }
    drawTumble();
    if (DEBUG) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,0,255,0.8)';
      for (const s of st.spots) ctx.strokeRect(ox + s.x0, s.top, s.x1 - s.x0, s.bot - s.top);
      ctx.restore();
    }
  }

  function drawPlayer() {
    const r = heroRect();
    let { x, bottom } = r;
    let rot = 0, sy = 1;
    if (G.trans) {
      const k = G.trans.t / C.time.transition;
      bottom -= Math.abs(Math.sin(k * Math.PI * 3)) * 14;
      x += Math.sin(k * Math.PI) * 30;
    } else {
      const ax = G.aim ? aimPoint(G.aim).x : W / 2;
      rot = clamp((ax - W / 2) / W, -0.5, 0.5) * 0.16 - G.recoil * 0.05;
      bottom += G.recoil * 9;
      sy = 1 + Math.sin(G.now * 3) * 0.012; // 呼吸
    }
    // 足元の影
    ctx.fillStyle = 'rgba(70,30,10,0.25)';
    ctx.beginPath(); ctx.ellipse(x, H - 112, r.w * 0.38, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, bottom);
    ctx.rotate(rot);
    ctx.scale(1, sy);
    ctx.drawImage(r.img, -r.w / 2, -r.h, r.w, r.h);
    ctx.restore();
    drawCounter();
  }
  // 手前の木の柵（プレイヤーの足元を隠す）
  function drawCounter() {
    const y = H - 104;
    ctx.fillStyle = '#6b3b1f'; ctx.fillRect(0, y, W, H - y);
    for (let i = 0; i < 6; i++) {
      const x = i * 92 - 10;
      ctx.fillStyle = i % 2 ? '#8a4f2a' : '#94572e'; ctx.fillRect(x + 3, y + 30, 86, H - y);
      ctx.fillStyle = 'rgba(255,220,170,0.12)'; ctx.fillRect(x + 3, y + 30, 86, 4);
    }
    ctx.fillStyle = '#a8653a'; ctx.fillRect(0, y, W, 30);
    ctx.fillStyle = '#c47c49'; ctx.fillRect(0, y, W, 6);
    ctx.fillStyle = '#5a2f17'; ctx.fillRect(0, y + 28, W, 4);
    ctx.fillStyle = '#d9b48a';
    for (let x = 40; x < W; x += 140) { ctx.beginPath(); ctx.arc(x, y + 16, 3.5, 0, Math.PI * 2); ctx.fill(); }
    const cx = 150, cw = 64; // 赤いチェックの布
    ctx.fillStyle = '#e9d9c0'; ctx.fillRect(cx, y - 6, cw, 96);
    ctx.fillStyle = 'rgba(200,40,40,0.75)';
    for (let k = 0; k < 4; k++) { ctx.fillRect(cx + 5 + k * 16, y - 6, 7, 96); ctx.fillRect(cx, y + 2 + k * 22, cw, 8); }
  }

  // 光の素材（放射グラデーション）を色ごとに一度だけ作る
  const GLOW = {};
  function glowImg(rgb) {
    const key = rgb.join(',');
    if (GLOW[key]) return GLOW[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, `rgba(${key},1)`); r.addColorStop(0.18, `rgba(${key},0.75)`);
    r.addColorStop(0.45, `rgba(${key},0.22)`); r.addColorStop(1, `rgba(${key},0)`);
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return (GLOW[key] = c);
  }
  function glow(rgb, x, y, size, alpha) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(glowImg(rgb), x - size / 2, y - size / 2, size, size);
    ctx.restore();
  }
  const skin = () => C.skins.find((k) => k.id === save.skin) || C.skins[0];
  let rbHue = 0;
  function rainbowColors() { // レインボー：撃つたびに色相が回る
    rbHue = (rbHue + 47) % 360;
    const c = (h, l) => { const a = l * Math.min(1, 1 - l) * 1; const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };
    const m = c(rbHue, 0.6), h2 = c(rbHue, 0.85);
    return { tc: [m.join(','), m.join(','), h2.join(',')], glow: m };
  }
  const WARM = [255, 200, 90], WHITE = [255, 250, 235], GOLD = [255, 205, 60], RED = [255, 90, 50], AQUA = [120, 220, 255];

  function drawFx() {
    for (const f of G.fx) {
      const p = f.t / f.dur;
      const dx = (f.x2 || 0) - f.x, dy = (f.y2 || 0) - f.y;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      switch (f.kind) {
        case 'tracer': { // 先が太く光り、尾が細く消える弾道
          const head = easeOut(clamp(p / 0.3, 0, 1)), tail = clamp((p - 0.1) / 0.7, 0, 1) ** 1.5;
          const hx = f.x + dx * head, hy = f.y + dy * head, tx = f.x + dx * tail, ty = f.y + dy * tail;
          const len = Math.hypot(hx - tx, hy - ty);
          if (len > 1) {
            const nx = -(hy - ty) / len, ny = (hx - tx) / len, w = 5 * (1 - p * 0.6);
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createLinearGradient(tx, ty, hx, hy);
            const tc = f.tc || skin().tracer;
            g.addColorStop(0, `rgba(${tc[0]},0)`); g.addColorStop(0.6, `rgba(${tc[1]},0.75)`); g.addColorStop(1, `rgba(${tc[2]},1)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx + nx * w, hy + ny * w);
            ctx.lineTo(hx + (hx - tx) / len * 6, hy + (hy - ty) / len * 6); ctx.lineTo(hx - nx * w, hy - ny * w); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(lerp(tx, hx, 0.5), lerp(ty, hy, 0.5)); ctx.lineTo(hx, hy); ctx.stroke();
          }
          ctx.restore(); ctx.save();
          glow(f.glow || skin().glow, hx, hy, 34 * (1 - p * 0.5), 1 - p);
          break;
        }
        case 'muzzle': {
          const a = 1 - p;
          glow(f.water ? AQUA : f.glow || skin().glow, f.x, f.y, (f.water ? 60 : 110) * (0.7 + p * 0.6), a);
          if (!f.water) {
            const im = IMG.fx_muzzle, h = 58 * (1 + p * 0.3), w = h * im.width / im.height;
            ctx.translate(f.x, f.y); ctx.rotate(ang); ctx.globalAlpha = a;
            ctx.drawImage(im, -w * 0.62, -h / 2, w, h);
          }
          break;
        }
        case 'stream': { // ひと続きの水流：先端が太く、根元へ細くなる
          const head = easeOut(clamp(p / 0.4, 0, 1));
          const tail = p < 0.4 ? Math.max(0, head - 0.3) : lerp(head - 0.3, head, clamp((p - 0.4) / 0.6, 0, 1));
          const N = 10, pts = [], dist = Math.hypot(dx, dy);
          for (let i = 0; i <= N; i++) {
            const k = lerp(Math.max(0, tail), head, i / N);
            const wob = Math.sin(k * 18 - f.t * 40) * 3 * (1 - i / N);
            const sag = Math.sin(Math.PI * k) * dist * 0.07; // 水らしく少し下へたわむ
            pts.push([f.x + dx * k - Math.sin(ang) * wob, f.y + dy * k + Math.cos(ang) * wob + sag, 2.5 + 7.5 * (i / N)]);
          }
          const wc = skin().water;
          for (const [col, add] of [[wc[0], 3], [wc[1], 0]]) {
            ctx.strokeStyle = col; ctx.lineCap = 'round';
            for (let i = 1; i < pts.length; i++) {
              ctx.lineWidth = (pts[i][2] + add) * 2;
              ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
            }
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(pts[3][0] - 2, pts[3][1] - 2);
          for (let i = 4; i < pts.length; i++) ctx.lineTo(pts[i][0] - 2, pts[i][1] - 3);
          ctx.stroke();
          const hp = pts[pts.length - 1]; // 先端の水玉
          ctx.fillStyle = wc[1]; ctx.beginPath(); ctx.arc(hp[0], hp[1], 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hp[0] - 3, hp[1] - 3, 3.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'impact': case 'splash': {
          const water = f.kind === 'splash';
          const big = f.tier === 'boss' ? 1.5 : f.tier === 'crit' ? 1.2 : 1;
          if (!f.small) {
            // 1) 一瞬の白い閃光
            if (p < 0.25) glow(water ? AQUA : WHITE, f.x, f.y, 150 * big * (0.6 + p), 1 - p / 0.25);
            // 2) 衝撃波の輪
            const rp = easeOut(Math.min(1, p / 0.7));
            ctx.globalAlpha = 1 - rp;
            ctx.strokeStyle = water ? '#bff0ff' : f.tier === 'hit' ? '#fff3d0' : '#ffd23a';
            ctx.lineWidth = 7 * (1 - rp) + 1;
            ctx.beginPath(); ctx.arc(f.x, f.y, 8 + rp * 64 * big, 0, Math.PI * 2); ctx.stroke();
            if (f.tier !== 'hit') { ctx.lineWidth = 3 * (1 - rp); ctx.beginPath(); ctx.arc(f.x, f.y, 4 + rp * 38 * big, 0, Math.PI * 2); ctx.stroke(); }
            ctx.globalAlpha = 1;
          }
          // 3) 着弾の絵
          const im = water ? IMG.fx_splash : IMG.fx_impact;
          const s = (f.size || 60) * (f.small ? 0.5 : 0.75) * (0.5 + 0.7 * easeOut(Math.min(1, p * 3.5)));
          ctx.globalAlpha = p > 0.45 ? Math.max(0, 1 - (p - 0.45) / 0.55) : 1;
          ctx.translate(f.x, f.y); ctx.rotate(p * 0.6);
          ctx.drawImage(im, -s / 2, -s / 2 * im.height / im.width, s, s * im.height / im.width);
          break;
        }
        case 'boom': { // 爆発のコマ割りアニメ
          const i = Math.min(8, 1 + Math.floor(p * 8)), im = IMG['fx_boom_' + i];
          if (!im) break;
          const sz = f.size * (im.width / IMG.fx_boom_4.width) * (0.85 + p * 0.3); // コマごとの大きさの差を保つ
          if (i <= 4) glow(WARM, f.x, f.y, sz * 1.6, (1 - p) * 0.8);
          ctx.globalAlpha = i >= 7 ? 1 - (p - 0.75) / 0.25 : 1;
          ctx.drawImage(im, f.x - sz / 2, f.y - sz / 2 * im.height / im.width, sz, sz * im.height / im.width);
          break;
        }
        case 'rays': {
          const a = (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8) * 0.45 * FXL().k;
          drawRays(f.x, f.y, f.size * (0.7 + p * 0.5), f.rgb, f.rot + p * 1.5, a, f.rainbow);
          break;
        }
        case 'word': { // 漫画文字のステッカー
          const im = IMG[f.img];
          const s = p < 0.14 ? 0.2 + easeBack(p / 0.14) * 1.05 : p < 0.26 ? lerp(1.25, 1, (p - 0.14) / 0.12) : 1;
          ctx.globalAlpha = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
          ctx.translate(f.x, f.y - p * 16); ctx.rotate(f.rot); ctx.scale(s, s);
          const h = f.w * im.height / im.width;
          ctx.drawImage(im, -f.w / 2, -h / 2, f.w, h);
          break;
        }
        case 'dust': {
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = f.wood ? '#8a5530' : '#e8c79a';
          const n = Q().debris ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + 0.6;
            ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * p * 18, f.y + Math.sin(a) * p * 12 - p * 8, 4.5 * (1 - p) + 2, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
      }
      ctx.restore();
    }
    for (const p of G.parts) {
      const k = p.t / p.life;
      if (p.kind === 'dust' || p.kind === 'smoke') {
        ctx.globalAlpha = (1 - k) * (p.kind === 'smoke' ? 0.45 : 0.7);
        ctx.fillStyle = p.kind === 'smoke' ? '#f4eee6' : '#f2d2a2';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + k * 1.2), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'spark') {
        const sp = Math.hypot(p.vx, p.vy) || 1, l = Math.min(26, sp * 0.035) + 2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = `rgb(${p.col.join(',')})`; ctx.lineWidth = p.size * (1 - k * 0.5); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * l, p.y - p.vy / sp * l); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = p.size * 0.4; ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'drop') {
        ctx.globalAlpha = 1 - k * 0.6;
        ctx.fillStyle = '#62ccff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'star') {
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        star(p.x, p.y, p.size, p.color, p.rot);
      } else if (p.kind === 'rain') { // 降ってくるコイン
        ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        const sq = Math.abs(Math.cos(p.t * p.spin));
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 1.5, p.size * sq + 1, p.size, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * sq + 0.5, p.size, 0, 0, Math.PI * 2); ctx.fill();
        if (sq > 0.6) { ctx.fillStyle = '#fff6c0'; ctx.fillRect(p.x - p.size * 0.15, p.y - p.size * 0.6, p.size * 0.3, p.size * 0.5); }
      } else if (p.kind === 'shard') {
        const im = IMG[p.img];
        if (im) {
          ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          const sz = p.size * (1 + k * 0.4); ctx.drawImage(im, -sz / 2, -sz / 2 * im.height / im.width, sz, sz * im.height / im.width);
          ctx.restore();
        }
      } else if (p.kind === 'helmet') {
        drawHelmet({ x: p.x, top: p.y, w: p.size * 1.25, h: p.size * 3.3 }, 0, p.rot, 1 - k * 0.6);
      } else if (p.kind === 'conf') {
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    for (const pp of G.popups) {
      const p = pp.t / pp.dur;
      ctx.save();
      ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      // ポンと大きく出て少し戻り、ふわっと上がる
      const s = p < 0.12 ? 0.3 + easeBack(p / 0.12) * 0.95 : p < 0.25 ? lerp(1.25, 1, (p - 0.12) / 0.13) : 1 - (p - 0.25) * 0.15;
      ctx.translate(pp.x, pp.y - easeOut(p) * 44);
      ctx.rotate(pp.rot || 0);
      ctx.scale(s, s);
      if (pp.grad) fancyText(pp.text, 0, 0, pp.size, pp.grad);
      else text(pp.text, 0, 0, pp.size, pp.color);
      ctx.restore();
    }
  }
  // 縦グラデーションの文字（ゲームらしい金・白・赤）
  const GRADS = {
    gold: ['#fff7c2', '#ffd23a', '#f08a1c', '#6a2a00'],
    rainbow: ['#fff', '#fff', '#fff', '#3a0a3a'],
    white: ['#ffffff', '#ffffff', '#ffe2a8', '#3a1a08'],
    red: ['#fff0a0', '#ffb020', '#ff4a2a', '#4a0a00'],
    aqua: ['#ffffff', '#9ff0ff', '#2aa8e8', '#0a2a4a'],
  };
  function fancyText(str, x, y, size, kind, align = 'center') {
    const c = GRADS[kind] || GRADS.gold;
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.26; ctx.strokeStyle = c[3];
    ctx.strokeText(str, x, y + size * 0.06); ctx.strokeText(str, x, y);
    let g;
    if (kind === 'rainbow') { // 虹色：色が流れる
      const wd = ctx.measureText(str).width;
      g = ctx.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
      for (let i = 0; i <= 6; i++) { const c2 = hsl2rgb((i * 60 + G.now * 220) % 360, 1, 0.62); g.addColorStop(i / 6, `rgb(${c2.join(',')})`); }
    } else {
      g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      g.addColorStop(0, c[0]); g.addColorStop(0.45, c[1]); g.addColorStop(1, c[2]);
    }
    ctx.fillStyle = g; ctx.fillText(str, x, y);
    ctx.lineWidth = Math.max(1, size * 0.04); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.strokeText(str, x, y - size * 0.02);
  }
  // HUD へ飛ぶもの（コイン・時間）は HUD の上に描く
  function drawFlyers() {
    const sp = SCORE_POS(), tp = TIME_POS();
    for (const p of G.parts) {
      if (p.kind !== 'coin' && p.kind !== 'time') continue;
      const k = easeOut(clamp(p.t / p.life, 0, 1)) ** 1.4;
      const to = p.kind === 'coin' ? sp : tp;
      const x = (1 - k) * (1 - k) * p.x0 + 2 * (1 - k) * k * p.cx + k * k * to.x;
      const y = (1 - k) * (1 - k) * p.y0 + 2 * (1 - k) * k * p.cy + k * k * to.y;
      if (p.kind === 'coin') {
        const sq = Math.abs(Math.cos(p.t * 14));
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(x, y + 1.5, p.size * sq + 1, p.size, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(x, y, p.size * sq + 0.5, p.size, 0, 0, Math.PI * 2); ctx.fill();
        if (sq > 0.5) star(x, y, p.size * 0.5, '#fff3a0');
      } else {
        text(p.text, x, y, 26 - k * 6, '#8cff7a', 'center', '#14501a');
      }
    }
  }

  function drawReticle() {
    const aiming = G.aim && !G.trans && !G.intro && !G.ending;
    if (aiming) {
      const a = aimPoint(G.aim);
      const hold = easeOut(clamp(G.aim.age / 0.25, 0, 1));
      const r = 22 - hold * 4; // 構えると少し絞られる（色は変えない）
      drawAimLine(a, r);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.strokeStyle = 'rgba(20,12,6,0.55)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) { // 外側の刻み
        ctx.rotate(Math.PI / 2);
        ctx.strokeStyle = 'rgba(20,12,6,0.55)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(r + 3, 0); ctx.lineTo(r + 11, 0); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20,12,6,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (save.aimMode === 'pull') drawPullBand(G.aim);
      else if (save.aimMode === 'follow' && G.aim.offset > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(G.aim.fx, G.aim.fy, 14, 0, Math.PI * 2); ctx.fill();
      }
    }
    drawMarker();
  }
  // 「引いて狙う」のゴム：押した所（支点）から指まで。引くほど張って明るくなる
  function drawPullBand(a) {
    const d = Math.hypot(a.fx - a.sx, a.fy - a.sy), k = clamp(d / 160, 0, 1);
    ctx.save();
    ctx.lineCap = 'round';
    if (d > 4) {
      for (const [col, lw] of [['rgba(20,12,6,0.45)', 7 - k * 2], [`rgba(255,${200 - k * 80},${120 - k * 70},0.85)`, 4 - k * 1.5]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(a.fx, a.fy); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(20,12,6,0.5)'; ctx.beginPath(); ctx.arc(a.sx, a.sy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.85)'; ctx.beginPath(); ctx.arc(a.sx, a.sy, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.16 + k * 0.14})`; ctx.beginPath(); ctx.arc(a.fx, a.fy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // ヒットマーカー：当たった瞬間だけ、撃った位置に×印が出る
  function drawMarker() {
    const m = G.marker;
    if (!m) return;
    const p = m.t / m.dur;
    const col = m.kind === 'boss' ? '#ff5a3a' : m.kind === 'crit' ? '#ffd23a' : '#ffffff';
    ctx.save();
    ctx.translate(m.x, m.y);
    // 撃った瞬間の照準の残像（広がって消える。外れは縮んで消える）
    ctx.globalAlpha = (1 - p) * 0.8;
    ctx.strokeStyle = m.kind === 'miss' ? 'rgba(255,255,255,0.7)' : col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, lerp(18, m.kind === 'miss' ? 10 : 26, easeOut(p)), 0, Math.PI * 2); ctx.stroke();
    if (m.kind === 'bad') { // 赤い禁止マーク
      const pop = p < 0.1 ? 1.5 - easeOut(p / 0.1) * 0.5 : 1;
      ctx.globalAlpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      ctx.scale(pop, pop);
      for (const [c2, lw] of [['rgba(40,0,0,0.8)', 8], ['#ff3a2a', 4.5]]) {
        ctx.strokeStyle = c2; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(14, 14); ctx.stroke();
      }
    } else if (m.kind !== 'miss') {
      const pop = p < 0.1 ? 1.6 - easeOut(p / 0.1) * 0.6 : 1;
      const r0 = 7 * pop, r1 = (m.kind === 'hit' ? 17 : 22) * pop;
      ctx.globalAlpha = p > 0.55 ? 1 - (p - 0.55) / 0.45 : 1;
      ctx.rotate(Math.PI / 4);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.strokeStyle = 'rgba(20,10,4,0.75)'; ctx.lineWidth = 6.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(r0, 0); ctx.lineTo(r1, 0); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.stroke();
      }
    }
    ctx.restore();
    if ((m.kind === 'crit' || m.kind === 'boss') && p < 0.3) glow(m.kind === 'boss' ? RED : GOLD, m.x, m.y, 70, (0.3 - p) / 0.3 * 0.9);
  }

  function fmtTime(t) {
    if (t < 10) return t.toFixed(1);
    const s = Math.ceil(t);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function drawHud() {
    const y = HUD_Y;
    const low = G.time <= C.juice.lastSeconds;
    // 残り時間
    ctx.save();
    const tb = 1 + G.timerBump * 0.12 + (low ? Math.max(0, Math.sin(G.now * 10)) * 0.04 : 0);
    ctx.translate(110, y + 31); ctx.scale(tb, tb); ctx.translate(-110, -(y + 31));
    woodPanel(14, y, 192, 62, 31, low || G.timerBad > 0 ? 1 : 0);
    ctx.fillStyle = '#f4e3c3'; ctx.beginPath(); ctx.arc(46, y + 31, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5e321a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(46, y + 31); ctx.lineTo(46, y + 20); ctx.moveTo(46, y + 31); ctx.lineTo(54, y + 35); ctx.stroke();
    text(fmtTime(G.time), 132, y + 32, 34, low ? '#ffd0c8' : '#fff', 'center', '#3a1a08');
    ctx.restore();
    // 得点
    ctx.save();
    const sb = 1 + G.scoreBump * 0.08;
    ctx.translate(342, y + 31); ctx.scale(sb, sb); ctx.translate(-342, -(y + 31));
    woodPanel(218, y, 248, 62, 31);
    if (G.scoreBump > 0) glow(GOLD, 406, y + 31, 150, G.scoreBump * 0.7);
    star(250, y + 31, 18, '#ffd23a', 0);
    text(String(Math.round(G.dispScore)), 446, y + 32, 32, '#ffe9a8', 'right', '#3a1a08');
    ctx.restore();
    // 一時停止
    buttons.push({ x: 472, y, w: 58, h: 62, onTap: togglePause, key: 'pause' });
    woodPanel(476, y, 52, 62, 22);
    ctx.fillStyle = '#ffe9a8'; ctx.fillRect(492, y + 19, 7, 25); ctx.fillRect(505, y + 19, 7, 25);
    // エリア表示：ステージ数の丸＋残り時間バー
    const k = G.trans ? 1 : clamp(G.areaT / C.time.areaDuration, 0, 1);
    rrect(16, y + 72, W - 32, 10, 5); ctx.fillStyle = 'rgba(40,20,10,0.45)'; ctx.fill();
    rrect(16, y + 72, Math.max(10, (W - 32) * (1 - k)), 10, 5); ctx.fillStyle = k > 0.8 ? '#ff9a3a' : '#ffd23a'; ctx.fill();
    text(`AREA ${G.areaN + 1}`, 18, y + 100, 17, '#fff', 'left');
    for (let i = 0; i < STAGES.length; i++) {
      ctx.beginPath(); ctx.arc(108 + i * 16, y + 100, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = i === G.areaN % STAGES.length ? '#ffd23a' : 'rgba(255,255,255,0.35)'; ctx.fill();
    }
    // コンボ・フィーバー
    if (G.combo >= 2) {
      const big = G.combo >= C.bonus.comboFrom;
      const cb = 1 + (G.comboBump || 0) * 0.45;
      ctx.save(); ctx.translate(W - 20, y + 102); ctx.scale(cb, cb);
      fancyText(`${G.combo} COMBO`, 0, 0, big ? 26 : 20, G.fever > 0 ? 'red' : big ? 'gold' : 'white', 'right');
      ctx.restore();
    }
    if (G.fever > 0) {
      const fx = W / 2, fy = y + 136;
      rrect(fx - 90, fy - 16, 180, 32, 16); ctx.fillStyle = 'rgba(120,60,0,0.6)'; ctx.fill();
      rrect(fx - 86, fy - 12, 172 * (G.fever / G.feverMax), 24, 12); ctx.fillStyle = '#ffd23a'; ctx.fill();
      text(`FEVER ×${C.fever.scoreMul}`, fx, fy + 1, 20, '#fff', 'center', '#a04a00');
    }
    // ボスがいるエリアの手配書アイコン
    const b = G.boss;
    if (b && b.announced && b.left + (b.active ? 1 : 0) > 0 && !G.trans) {
      const bx = W - 46, by = y + 150, blink = b.active ? 0.6 + 0.4 * Math.sin(G.now * 12) : 1;
      ctx.save(); ctx.globalAlpha = blink;
      ctx.fillStyle = '#efd9a8'; ctx.fillRect(bx - 26, by - 30, 52, 62);
      ctx.strokeStyle = '#7a4424'; ctx.lineWidth = 2; ctx.strokeRect(bx - 26, by - 30, 52, 62);
      const bi = IMG.enemy_boss, bh = 40; ctx.drawImage(bi, bx - bh * bi.width / bi.height / 2, by - 22, bh * bi.width / bi.height, bh);
      text('WANTED', bx, by + 24, 10, '#7a2a10', 'center', null);
      ctx.restore();
    }
    // 下部：武器切替・音
    const wb = { x: save.lefty ? 66 : W - 66, y: H - 132, r: 48, onTap: toggleWeapon, key: 'weapon' };
    buttons.push(wb);
    ctx.save();
    const pr = pointer.button && pointer.button.key === 'weapon' ? 0.92 : 1;
    ctx.translate(wb.x, wb.y); ctx.scale(pr, pr);
    ctx.beginPath(); ctx.arc(0, 5, wb.r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.drawImage(IMG[G.weapon === 'water' ? 'icon_water' : 'icon_revolver'], -46, -46, 92, 92);
    ctx.beginPath(); ctx.arc(0, 0, wb.r, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23a'; ctx.stroke();
    // 切替の矢印バッジ
    ctx.beginPath(); ctx.arc(32, -32, 15, 0, Math.PI * 2); ctx.fillStyle = '#3f63b8'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(32, -32, 7, 0.3, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
    text(G.weapon === 'water' ? '水鉄砲' : '拳銃', wb.x, wb.y + 62, 16, '#fff');
  }

  // エリア開始の看板（上から下りてくる）
  function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const t = b.t;
    let y;
    if (t < 0.4) y = lerp(-120, FY + 40, easeBack(t / 0.4));
    else if (t < 1.4) y = FY + 40;
    else y = lerp(FY + 40, -120, easeOut((t - 1.4) / 0.4));
    const w = 300, h = 96, x = W / 2 - w / 2;
    ctx.strokeStyle = '#5a3218'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 40, y - 300); ctx.lineTo(x + 40, y); ctx.moveTo(x + w - 40, y - 300); ctx.lineTo(x + w - 40, y); ctx.stroke();
    woodPanel(x, y, w, h, 14);
    text(`AREA ${b.area}`, W / 2, y + 28, 20, '#ffd23a', 'center', '#3a1a08');
    text(b.name, W / 2, y + 64, 36, '#fff', 'center', '#3a1a08');
  }
  function drawBossAlert() {
    const a = G.bossAlert;
    if (!a) return;
    const t = a.t;
    const k = t < 0.3 ? easeBack(t / 0.3) : t > 2.0 ? 1 - easeOut((t - 2.0) / 0.4) : 1;
    const x = lerp(W + 10, W - 190, k), y = HUD_Y + 120;
    ctx.save();
    ctx.translate(x + 85, y + 60); ctx.rotate(0.05); ctx.translate(-(x + 85), -(y + 60));
    if (IMG.wanted) {
      const im = IMG.wanted, ww = 170, wh = ww * im.height / im.width;
      ctx.drawImage(im, x, y, ww, wh);
      const bi = IMG.enemy_boss, bh = wh * 0.36;
      ctx.drawImage(bi, x + ww / 2 - bh * bi.width / bi.height / 2, y + wh * 0.3, bh * bi.width / bi.height, bh);
      text(bossReward(), x + ww / 2, y + wh * 0.8, 18, '#7a2a10', 'center', null);
    } else {
      ctx.fillStyle = '#efd9a8'; ctx.fillRect(x, y, 170, 210);
      text('WANTED', x + 85, y + 26, 28, '#7a2a10', 'center', null);
      const bi = IMG.enemy_boss; ctx.drawImage(bi, x + 40, y + 50, 90, 90 * bi.height / bi.width);
      text(bossReward(), x + 85, y + 186, 18, '#7a2a10', 'center', null);
    }
    ctx.restore();
    text('ボス出現！', x + 85, y - 6, 24, '#ffd23a');
  }
  function bossReward() { const m = (G.boss && G.boss.mul) || 1; return `+${Math.round(C.score.boss * m)} +${+(C.bonus.boss * m).toFixed(1)}秒${m > 1 ? `（×${m}）` : ''}`; }
  function drawCallout() {
    const c = G.callout;
    if (!c) return;
    const p = c.t / c.dur;
    const s = p < 0.18 ? 0.3 + easeBack(p / 0.18) * 0.7 : 1 + (p - 0.18) * 0.08;
    ctx.save();
    ctx.globalAlpha = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
    ctx.translate(W / 2, FY + 120); ctx.scale(s, s); ctx.rotate(-0.05);
    if (p < 0.3) glow(GOLD, 0, 0, c.size * 5, (0.3 - p) * 1.2);
    fancyText(c.text, 0, 0, c.size, c.color === '#7ff0ff' ? 'aqua' : c.color === '#ff6a5a' ? 'red' : c.color === '#ffffff' ? 'white' : 'gold');
    ctx.restore();
  }
  function drawIntro() {
    const it = G.intro;
    if (!it) return;
    ctx.fillStyle = 'rgba(20,10,20,0.35)'; ctx.fillRect(0, 0, W, H);
    const drawAt = it.dur - 0.7;
    if (it.t < drawAt) {
      const p = Math.min(1, it.t / 0.3);
      ctx.save(); ctx.translate(W / 2, FY + 150); ctx.scale(0.5 + easeBack(p) * 0.5, 0.5 + easeBack(p) * 0.5);
      text('READY?', 0, 0, 70, '#fff', 'center', '#3a1a08');
      ctx.restore();
    } else {
      const p = (it.t - drawAt) / 0.7;
      ctx.save(); ctx.globalAlpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      ctx.translate(W / 2, FY + 150); ctx.scale(1.6 - easeOut(Math.min(1, p * 3)) * 0.6, 1.6 - easeOut(Math.min(1, p * 3)) * 0.6); ctx.rotate(-0.06);
      text('DRAW!', 0, 0, 96, '#ffd23a', 'center', '#7a2a0a');
      ctx.restore();
      if (p < 0.15) { ctx.fillStyle = `rgba(255,255,230,${0.5 * (1 - p / 0.15)})`; ctx.fillRect(0, 0, W, H); }
    }
    if (it.tutorial && it.t < drawAt) drawTutorial(it.t);
  }
  // 初回だけ：指のアニメで操作を見せる
  function drawTutorial(t) {
    const cyc = (t % 2.2) / 2.2, pull = save.aimMode === 'pull', tap = save.aimMode === 'tap', g = C.input.pullGain;
    // pull：押した所から左下へ引く → 照準は右上へ／follow：指ごと右上へ動かす
    const x0 = pull ? 270 : 200, y0 = pull ? FB - 120 : FB - 40, x1 = pull ? 235 : 330, y1 = pull ? FB - 40 : FB - 110;
    let fx = x0, fy = y0, pressed = false, fired = false;
    if (cyc < 0.15) { /* 待機 */ } else if (cyc < 0.25) pressed = true;
    else if (cyc < 0.7) { pressed = true; const k = ease((cyc - 0.25) / 0.45); fx = lerp(x0, x1, k); fy = lerp(y0, y1, k); }
    else { fx = x1; fy = y1; fired = cyc < 0.85; }
    const rx = pull ? x0 + (x0 - fx) * g : fx, ry = pull ? y0 - 70 + (y0 - fy) * g : tap ? fy : fy - 70;
    const py = FB + 10 > H - 230 ? H - 230 : FB - 230;
    woodPanel(40, py, 460, 70, 16);
    text(pull ? '押して後ろに引いて狙う → 離して撃つ！' : tap ? '狙う所をタップして撃つ！' : '押して狙って → 離して撃つ！', W / 2, py + 35, pull ? 22 : 26, '#fff', 'center', '#3a1a08');
    if (pressed && pull) drawPullBand({ sx: x0, sy: y0, fx, fy });
    if (pressed || fired) { // 照準
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(rx, ry, 18, 0, Math.PI * 2); ctx.stroke();
    }
    if (fired) { ctx.globalAlpha = 1 - (cyc - 0.7) / 0.15; star(rx, ry, 22, '#ffd23a'); ctx.globalAlpha = 1; }
    // 指
    ctx.save(); ctx.translate(fx, fy + (pressed ? 4 : 0));
    ctx.fillStyle = '#ffe0c0'; ctx.strokeStyle = '#7a4424'; ctx.lineWidth = 3;
    rrect(-14, -6, 28, 54, 14); ctx.fill(); ctx.stroke();
    if (pressed) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(0, -4, 22, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  function drawEnding() {
    if (!G.ending) return;
    const p = Math.min(1, G.ending.t / 0.35);
    ctx.fillStyle = `rgba(20,10,20,${0.35 * p})`; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.scale(0.4 + easeBack(p) * 0.6, 0.4 + easeBack(p) * 0.6); ctx.rotate(-0.05);
    text('TIME UP!', 0, 0, 84, '#ff6a5a', 'center', '#3a0a08');
    ctx.restore();
  }

  // ------------------------------------------------------------------ タイトル
  function drawTitle() {
    const t = G.titleT;
    drawSky();
    drawStageAt(0, 0);
    drawSkySeam();
    drawLanterns(0, 0);
    drawCrows();
    // 背景の敵がのぞく（飾り）
    const sp = STAGES[0].spots;
    const tp = C.stages[0].titlePeek || [1, 4, 5]; // タイトルで顔を出す場所（赤・青・ボス）
    const peekers = [['red', sp[tp[0]], 0], ['blue', sp[tp[1]], 1.7], ['boss', sp[tp[2]], 3.1]];
    for (const [type, s, off] of peekers) {
      const ph = ((t + off) % 4.5) / 4.5;
      const ex = ph < 0.1 ? easeBack(ph / 0.1) : ph < 0.4 ? 1 : ph < 0.5 ? 1 - (ph - 0.4) / 0.1 : 0;
      if (ex <= 0) continue;
      const fr1 = IMG[`enemy_${type}_${ph > 0.25 && ph < 0.32 ? 'blink' : 'idle'}`] || IMG['enemy_' + type];
      const h = s.eh * (type === 'boss' ? 1.12 : 1) * frameScale(`enemy_${type}_idle`), w = h * fr1.width / fr1.height;
      ctx.save();
      applyClip({ kind: 'pop', x0: s.x0, x1: s.x1, top: s.top, bot: s.bot }, 0);
      ctx.drawImage(fr1, s.cx - w / 2, s.top + 3 - ex * 0.55 * h, w, h);
      ctx.restore();
      drawCover(STAGES[0], s, 0);
    }
    drawTumble();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(30,15,40,0.55)'); g.addColorStop(0.45, 'rgba(30,15,40,0.05)'); g.addColorStop(1, 'rgba(30,15,40,0.82)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // メダル（右上）
    const my = HUD_Y + 4;
    woodPanel(W - 148, my, 134, 44, 22);
    medalIcon(W - 122, my + 22, 13);
    text(String(save.medals || 0), W - 30, my + 23, 22, '#ffe9a8', 'right', '#3a1a08');

    // ロゴ
    const big = H >= 1080;
    const ly = HUD_Y + (big ? 44 : 30) + Math.sin(t * 2) * 4;
    let y;
    if (IMG.logo) {
      const im = IMG.logo, lw = big ? 450 : 360, lh = lw * im.height / im.width;
      const s = t < 0.5 ? easeBack(Math.min(1, t / 0.5)) : 1;
      ctx.save(); ctx.translate(W / 2, ly + lh / 2); ctx.scale(s, s);
      ctx.drawImage(im, -lw / 2, -lh / 2, lw, lh); ctx.restore();
      text('ポップ・ハイドアウト', W / 2, ly + lh + 2, big ? 24 : 21, '#fff', 'center', '#3a1a08');
      y = ly + lh + (big ? 32 : 24);
    } else {
      text('ポップ・', W / 2, ly + 50, 56, '#ffd23a', 'center', '#6a2a0a');
      text('ハイドアウト', W / 2, ly + 114, 62, '#ffd23a', 'center', '#6a2a0a');
      y = ly + 160;
    }

    // キャラクター選択
    const ch = big ? 240 : 190;
    [['a', 'オレンジ', '陽気なカウボーイ'], ['b', 'ブルー', 'クールな斥候']].forEach(([id, label, sub], i) => {
      const x = 60 + i * 220, w = 200;
      const sel = G.hero === id;
      woodPanel(x, y, w, ch, 22, 0);
      if (sel) { rrect(x - 3, y - 3, w + 6, ch + 6, 24); ctx.lineWidth = 6; ctx.strokeStyle = '#ffd23a'; ctx.stroke(); }
      const im = hv('hero_' + id + '_run'), ih = ch - 82, iw = ih * im.width / im.height;
      const bob = sel ? Math.abs(Math.sin(t * 5)) * 10 : 0;
      ctx.drawImage(im, x + w / 2 - iw / 2, y + 12 - bob, iw, ih);
      text(label, x + w / 2, y + ch - 50, 25, sel ? '#ffd23a' : '#fff', 'center', '#3a1a08');
      text(sub, x + w / 2, y + ch - 22, 15, '#f2dcc0', 'center', null, 700);
      buttons.push({ x, y, w, h: ch, key: 'hero' + id, onTap: () => { G.hero = save.hero = id; persist(); } });
    });
    // 武器選択
    const wy = y + ch + (big ? 70 : 56);
    [['revolver', '拳銃', 'icon_revolver'], ['water', '水鉄砲', 'icon_water']].forEach(([id, label, icon], i) => {
      const cx = 160 + i * 220;
      const sel = G.weapon === id;
      const s = (sel ? 1 + Math.sin(t * 4) * 0.03 : 0.85) * (big ? 1 : 0.9);
      ctx.save(); ctx.translate(cx, wy); ctx.scale(s, s);
      ctx.drawImage(IMG[icon], -46, -46, 92, 92);
      ctx.beginPath(); ctx.arc(0, 0, 47, 0, Math.PI * 2); ctx.lineWidth = sel ? 6 : 2;
      ctx.strokeStyle = sel ? '#ffd23a' : 'rgba(255,255,255,0.5)'; ctx.stroke();
      ctx.restore();
      text(label, cx + 74, wy, 20, sel ? '#ffd23a' : '#fff', 'left');
      buttons.push({ x: cx, y: wy, r: 50, key: 'w' + id, onTap: () => { G.weapon = save.weapon = id; persist(); } });
    });
    // 下の操作
    const by = H - 322;
    button('スタート', 110, by, 320, 90, () => startGame(), { size: 42, pulse: true });
    text(`★ ベスト ${save.best}`, W / 2, by + 108, 20, '#ffe9a8', 'center', '#3a1a08');
    const d = M.daily(save, C), left = d.list.filter((m) => !m.done).length;
    button('ミッション', 30, by + 128, 154, 58, () => { G.mode = 'missions'; }, { ...BLUE, size: 20 });
    if (left > 0) { ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(176, by + 132, 13, 0, Math.PI * 2); ctx.fill(); text(String(left), 176, by + 133, 16, '#fff', 'center', null); }
    button('ショップ', 193, by + 128, 154, 58, () => { G.mode = 'shop'; G.shopMsg = null; }, { fill: '#2f9a4a', fill2: '#7ee08a', shade: '#1a5a2a', stroke: '#1a5a2a', size: 20 });
    button('設定', 356, by + 128, 154, 58, () => { G.settingsOpen = true; }, { fill: '#6a6a7a', fill2: '#a8a8b8', shade: '#3a3a4a', stroke: '#3a3a4a', size: 20 });
  }

  function overlayPanel(title) {
    ctx.fillStyle = 'rgba(20,10,30,0.72)'; ctx.fillRect(0, 0, W, H);
    const top = HUD_Y + 60;
    woodPanel(30, top, W - 60, H - top - 50, 24);
    fancyText(title, W / 2, top + 44, 34, 'gold');
    button('もどる', W / 2 - 110, H - 136, 220, 62, () => { G.mode = 'title'; }, { ...BLUE, size: 26 });
    return top;
  }
  function drawMissions() {
    const top = overlayPanel('今日のミッション');
    const d = M.daily(save, C);
    d.list.forEach((m, i) => {
      const def = M.defOf(C, m.id), y = top + 86 + i * 90;
      rrect(52, y, W - 104, 78, 14); ctx.fillStyle = m.done ? 'rgba(90,170,60,0.45)' : 'rgba(255,240,210,0.12)'; ctx.fill();
      text(M.label(C, m), 70, y + 25, 20, '#fff', 'left', '#3a1a08');
      rrect(70, y + 48, 260, 14, 7); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      rrect(70, y + 48, Math.max(14, 260 * m.prog / def.n), 14, 7); ctx.fillStyle = m.done ? '#8cff7a' : '#ffd23a'; ctx.fill();
      text(`${m.prog} / ${def.n}`, 342, y + 56, 15, '#fff', 'left', null, 800);
      medalIcon(W - 128, y + 39, 14);
      text(`+${def.reward}`, W - 70, y + 40, 21, '#ffe9a8', 'right', '#3a1a08');
      if (m.done) { ctx.save(); ctx.translate(W - 170, y + 22); ctx.rotate(-0.2); text('達成！', 0, 0, 20, '#8cff7a', 'center', '#14501a'); ctx.restore(); }
    });
    const ry = top + 86 + 3 * 90 + 24;
    fancyText('ランキング', W / 2, ry, 28, 'white');
    const list = save.ranking || [];
    for (let i = 0; i < C.rankingSize; i++) {
      const e = list[i], y = ry + 42 + i * 40;
      text(`${i + 1}位`, 74, y, 22, i === 0 ? '#ffd23a' : '#fff', 'left');
      if (e) {
        const im = IMG['hero_' + e.hero + '_run'];
        if (im) ctx.drawImage(im, 140, y - 16, 32 * im.width / im.height, 32);
        text(e.date, 190, y, 15, '#f2dcc0', 'left', null, 700);
        text(String(e.score), W - 76, y, 24, '#fff', 'right');
      } else text('---', W - 76, y, 22, 'rgba(255,255,255,0.4)', 'right', null);
    }
  }
  function drawShopTrails(y0) {
    text('弾道・火花・水の色が変わります（性能は同じ）', W / 2, y0, 15, '#f2dcc0', 'center', null, 700);
    const cardH = Math.min(236, (H - y0 - 230) / 2);
    C.skins.forEach((sk, i) => {
      const x = 52 + (i % 2) * 222, y = y0 + 22 + Math.floor(i / 2) * (cardH + 14), w = 214, h = cardH;
      const owned = (save.owned || []).includes(sk.id), eq = save.skin === sk.id;
      rrect(x, y, w, h, 16); ctx.fillStyle = eq ? 'rgba(255,210,58,0.25)' : 'rgba(255,240,210,0.12)'; ctx.fill();
      if (eq) { ctx.lineWidth = 4; ctx.strokeStyle = '#ffd23a'; ctx.stroke(); }
      // 見本：弾道が流れる
      const ph = (G.titleT * 1.4 + i * 0.27) % 1;
      rrect(x + 12, y + 12, w - 24, h - 96, 12); ctx.fillStyle = '#2a1820'; ctx.fill();
      const x0 = x + 28, y0 = y + h - 100, x1 = x + w - 30, y1 = y + 34;
      const head = easeOut(Math.min(1, ph / 0.45)), tail = clamp((ph - 0.12) / 0.6, 0, 1);
      let tc = sk.tracer, gl = sk.glow;
      if (sk.rainbow) { const hh = (G.titleT * 120) % 360; const c = `hsl(${hh},100%,60%)`; ctx.fillStyle = c; gl = [255, 150, 220]; tc = null; }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const hx = lerp(x0, x1, head), hy = lerp(y0, y1, head), tx = lerp(x0, x1, tail), ty = lerp(y0, y1, tail);
      const gr = ctx.createLinearGradient(tx, ty, hx, hy);
      if (tc) { gr.addColorStop(0, `rgba(${tc[0]},0)`); gr.addColorStop(0.6, `rgba(${tc[1]},0.8)`); gr.addColorStop(1, `rgba(${tc[2]},1)`); }
      else { gr.addColorStop(0, 'rgba(255,0,0,0)'); gr.addColorStop(0.33, 'rgba(255,220,0,0.8)'); gr.addColorStop(0.66, 'rgba(0,220,255,0.9)'); gr.addColorStop(1, 'rgba(255,120,255,1)'); }
      ctx.strokeStyle = gr; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.restore();
      glow(gl, hx, hy, 46, 1 - ph);
      if (ph > 0.45) glow(sk.spark, x1, y1, 90 * (ph - 0.45), (1 - ph) * 1.6);
      text(sk.name, x + w / 2, y + h - 62, 22, '#fff', 'center', '#3a1a08');
      if (eq) text('装備中', x + w / 2, y + h - 28, 18, '#ffd23a', 'center', '#3a1a08');
      else if (owned) text('タップで装備', x + w / 2, y + h - 28, 16, '#fff', 'center', null, 800);
      else { medalIcon(x + w / 2 - 36, y + h - 28, 12); text(String(sk.price), x + w / 2 + 12, y + h - 27, 20, (save.medals || 0) >= sk.price ? '#ffe9a8' : '#ff9a8a', 'center', '#3a1a08'); }
      buttons.push({ x, y, w, h, key: 'skin' + sk.id, onTap: () => {
        const r = M.shopTap(save, C, sk.id);
        if (r === 'buy') { A.buy(); confetti(); G.shopMsg = { text: `${sk.name}を手に入れた！`, t0: G.titleT }; }
        else if (r === 'short') { A.comboBreak(); G.shopMsg = { text: 'メダルが足りません', t0: G.titleT, bad: true }; }
        persist();
      } });
    });
  }
  // ---- ショップ（スキル／帽子／弾道のタブ）
  function drawShop() {
    const top = overlayPanel('ショップ');
    medalIcon(W - 150, top + 84, 13);
    text(String(save.medals || 0), W - 60, top + 85, 22, '#ffe9a8', 'right', '#3a1a08');
    const tabs = [['skill', 'スキル'], ['hat', '帽子'], ['trail', '弾道']];
    const cur = G.shopTab || 'skill';
    tabs.forEach(([id, label], i) => {
      const x = 52 + i * 112, y = top + 66, w = 104, h = 40, on = cur === id;
      rrect(x, y, w, h, 12); ctx.fillStyle = on ? '#ffd23a' : 'rgba(255,240,210,0.15)'; ctx.fill();
      text(label, x + w / 2, y + h / 2 + 1, 18, on ? '#5a2a08' : '#fff', 'center', on ? null : '#3a1a08');
      buttons.push({ x, y, w, h, key: 'tab' + id, onTap: () => { G.shopTab = id; } });
    });
    const y0 = top + 124;
    if (cur === 'skill') drawShopSkills(y0);
    else if (cur === 'hat') drawShopHats(y0);
    else drawShopTrails(y0);
    const m = G.shopMsg;
    if (m && G.titleT - m.t0 < 1.6) {
      const k = G.titleT - m.t0;
      ctx.save(); ctx.globalAlpha = k > 1.2 ? (1.6 - k) / 0.4 : 1;
      fancyText(m.text, W / 2, H - 172, 22, m.bad ? 'red' : 'gold');
      ctx.restore();
    }
  }
  function shopToast(text, bad) { G.shopMsg = { text, t0: G.titleT, bad }; }
  function drawShopSkills(y0) {
    const slots = save.skillSlots || [];
    text(`セット中 ${slots.length}/${C.skills.slots}（タップで付け外し）`, W / 2, y0, 15, '#f2dcc0', 'center', null, 700);
    C.skills.list.forEach((sk, i) => {
      const x = 52, y = y0 + 22 + i * 96, w = W - 104, h = 86;
      const owned = (save.skillsOwned || []).includes(sk.id), set = slots.includes(sk.id);
      rrect(x, y, w, h, 14); ctx.fillStyle = set ? 'rgba(255,210,58,0.28)' : 'rgba(255,240,210,0.12)'; ctx.fill();
      if (set) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffd23a'; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x + 44, y + h / 2, 30, 0, Math.PI * 2); ctx.fillStyle = owned ? '#c8461a' : '#4a4a5a'; ctx.fill();
      skillIcon(sk.id, x + 44, y + h / 2, 26);
      text(sk.name, x + 88, y + 26, 22, '#fff', 'left', '#3a1a08');
      text(sk.desc, x + 88, y + 56, 14, '#f2dcc0', 'left', null, 700);
      if (set) text('セット中', x + w - 14, y + 26, 16, '#ffd23a', 'right', '#3a1a08');
      else if (owned) text('タップでセット', x + w - 14, y + 26, 14, '#fff', 'right', null, 800);
      else { medalIcon(x + w - 70, y + 26, 11); text(String(sk.price), x + w - 14, y + 27, 19, (save.medals || 0) >= sk.price ? '#ffe9a8' : '#ff9a8a', 'right', '#3a1a08'); }
      buttons.push({ x, y, w, h, key: 'sk' + sk.id, onTap: () => {
        const r = M.skillTap(save, C, sk.id);
        if (r === 'buy') { A.buy(); confetti(); shopToast(`${sk.name}を手に入れた！`); }
        else if (r === 'short') { A.comboBreak(); shopToast('メダルが足りません', true); }
        else if (r === 'full') shopToast(`セットは${C.skills.slots}つまで（外してから）`, true);
        persist();
      } });
    });
  }
  function drawShopHats(y0) {
    text('どのキャラにも使える帽子の色（性能は同じ）', W / 2, y0, 15, '#f2dcc0', 'center', null, 700);
    C.hats.forEach((ht, i) => {
      const x = 52 + (i % 2) * 222, y = y0 + 22 + Math.floor(i / 2) * 210, w = 214, h = 196;
      const owned = M.hatOwned(save, ht.id), eq = (save.hat || 'hat_default') === ht.id;
      rrect(x, y, w, h, 16); ctx.fillStyle = eq ? 'rgba(255,210,58,0.25)' : 'rgba(255,240,210,0.12)'; ctx.fill();
      if (eq) { ctx.lineWidth = 4; ctx.strokeStyle = '#ffd23a'; ctx.stroke(); }
      const im = IMG[`hero_${G.hero}_run${ht.id === 'hat_default' ? '' : '_' + ht.id}`] || IMG[`hero_${G.hero}_run`];
      if (im) { const ih = 118, iw = ih * im.width / im.height; ctx.drawImage(im, x + w / 2 - iw / 2, y + 10, iw, ih); }
      text(ht.name, x + w / 2, y + 148, 20, '#fff', 'center', '#3a1a08');
      if (eq) text('装備中', x + w / 2, y + 176, 16, '#ffd23a', 'center', '#3a1a08');
      else if (owned) text('タップで装備', x + w / 2, y + 176, 14, '#fff', 'center', null, 800);
      else { medalIcon(x + w / 2 - 34, y + 176, 11); text(String(ht.price), x + w / 2 + 10, y + 177, 18, (save.medals || 0) >= ht.price ? '#ffe9a8' : '#ff9a8a', 'center', '#3a1a08'); }
      buttons.push({ x, y, w, h, key: 'hat' + ht.id, onTap: () => {
        const r = M.hatTap(save, C, ht.id);
        if (r === 'buy') { A.buy(); confetti(); shopToast(`${ht.name}を手に入れた！`); }
        else if (r === 'short') { A.comboBreak(); shopToast('メダルが足りません', true); }
        persist();
      } });
    });
  }

  // ---- ログインボーナス（タイトルの上に出す）
  function drawLogin() {
    const lb = G.loginBonus;
    if (!lb) return;
    buttons = [];
    lb.t = (lb.t || 0) + 1 / 60;
    ctx.fillStyle = 'rgba(20,10,30,0.72)'; ctx.fillRect(0, 0, W, H);
    const top = H * 0.5 - 260;
    woodPanel(34, top, W - 68, 500, 24);
    fancyText('ログインボーナス', W / 2, top + 44, 34, 'gold');
    text(`${lb.streak}日連続ログイン！`, W / 2, top + 88, 20, '#fff', 'center', '#3a1a08');
    for (let i = 0; i < 7; i++) {
      const x = 58 + (i % 4) * 108, y = top + 120 + Math.floor(i / 4) * 128, w = 96, h = 116;
      const day = i + 1, got = day < lb.day || (day === lb.day && lb.claimed), today = day === lb.day;
      rrect(x, y, w, h, 12); ctx.fillStyle = today ? 'rgba(255,210,58,0.35)' : 'rgba(255,240,210,0.12)'; ctx.fill();
      if (today) { ctx.lineWidth = 4; ctx.strokeStyle = '#ffd23a'; ctx.stroke(); }
      text(`${day}日目`, x + w / 2, y + 18, 15, '#fff', 'center', '#3a1a08');
      medalIcon(x + w / 2, y + 56, 18);
      text(`+${C.login.rewards[i]}`, x + w / 2, y + 92, 18, '#ffe9a8', 'center', '#3a1a08');
      if (day === 7) text('＋帽子', x + w / 2, y + 108, 12, '#ff9af0', 'center', null, 800);
      if (got) { ctx.save(); ctx.translate(x + w / 2, y + 58); ctx.rotate(-0.3); ctx.strokeStyle = '#e8441e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke(); text('済', 0, 2, 26, '#e8441e', 'center', null); ctx.restore(); }
    }
    if (lb.claimed) {
      fancyText(`+${lb.reward} メダル${lb.item ? '＋' + C.hats.find((h) => h.id === lb.item).name : ''}`, W / 2, top + 400, 26, 'gold');
      button('OK', W / 2 - 100, top + 428, 200, 58, () => { G.loginBonus = null; }, { size: 26, key: 'loginok' });
    } else {
      button('受け取る', W / 2 - 120, top + 410, 240, 70, () => {
        M.claimLogin(save, C, lb); persist(); lb.claimed = true; A.fanfare(); confetti(); coinRain(16);
      }, { size: 30, pulse: true, key: 'loginget' });
    }
  }

  // ---- 設定（タイトル・一時停止から）
  function drawSettings() {
    buttons = [];
    ctx.fillStyle = 'rgba(20,10,30,0.72)'; ctx.fillRect(0, 0, W, H);
    const top = H * 0.5 - 360;
    woodPanel(34, top, W - 68, 720, 24);
    fancyText('設定', W / 2, top + 44, 34, 'gold');
    const rows = [
      ['画質', G.quality === 'low' ? '低負荷' : '標準', toggleQuality],
      ['演出の強さ', FXL().label, toggleFx],
      ['BGM', save.bgm ? 'オン' : 'オフ', toggleBgm],
      ['効果音', save.sfx ? 'オン' : 'オフ', toggleSfx],
      ['振動', save.vibe ? 'オン' : 'オフ', toggleVibe],
      ['左手モード（ボタンを左右反転）', save.lefty ? 'オン' : 'オフ', () => { save.lefty = !save.lefty; persist(); }],
      ['色の見分けやすさ', save.cb ? 'オン' : 'オフ', () => { save.cb = !save.cb; persist(); }],
      ['エイムアシスト（少しの外れを当てる）', save.assist ? 'オン' : 'オフ', () => { save.assist = !save.assist; persist(); }],
      ['撃ち方', { pull: '引いて', follow: 'なぞって', tap: 'タップ' }[save.aimMode], () => { save.aimMode = { pull: 'follow', follow: 'tap', tap: 'pull' }[save.aimMode]; persist(); }],
    ];
    rows.forEach(([label, val, fn], i) => {
      const y = top + 90 + i * 62;
      text(label, 64, y + 24, 18, '#fff', 'left', '#3a1a08');
      button(val, W - 64 - 130, y, 130, 48, fn, { ...BLUE, size: 18, key: 'set' + i });
    });
    button('とじる', W / 2 - 100, top + 650, 200, 56, () => { G.settingsOpen = false; }, { size: 24, key: 'setclose' });
  }

  function settingsRow(y) {
    const items = [
      [G.quality === 'low' ? '画質:低負荷' : '画質:標準', toggleQuality, 'q'],
      [`演出:${FXL().label}`, toggleFx, 'fx'],
      [save.bgm ? 'BGM:オン' : 'BGM:オフ', toggleBgm, 'bgm'],
      [save.sfx ? '効果音:オン' : '効果音:オフ', toggleSfx, 'sfx'],
      [save.vibe ? '振動:オン' : '振動:オフ', toggleVibe, 'vibe'],
    ];
    items.forEach(([label, fn, key], i) => button(label, 10 + i * 104, y, 100, 54, fn, { ...BLUE, size: 15, key }));
  }

  // ------------------------------------------------------------------ 結果・一時停止
  function drawResult() {
    const r = G.res, t = r.t;
    ctx.fillStyle = `rgba(20,10,30,${Math.min(0.65, t * 2)})`; ctx.fillRect(0, 0, W, H);
    const py = lerp(H, H / 2 - 360, easeBack(Math.min(1, t / 0.45)));
    // 手配書風の紙
    ctx.save();
    ctx.translate(W / 2, py + 340); ctx.rotate(-0.015); ctx.translate(-W / 2, -(py + 340));
    rrect(46, py + 6, W - 92, 700, 10); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    rrect(40, py, W - 80, 700, 10); ctx.fillStyle = '#f3dfb4'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#a8653a'; ctx.stroke();
    rrect(54, py + 14, W - 108, 672, 6); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(122,68,36,0.5)'; ctx.stroke();
    for (const [nx, ny] of [[64, py + 22], [W - 64, py + 22]]) { ctx.fillStyle = '#7a4424'; ctx.beginPath(); ctx.arc(nx, ny, 7, 0, Math.PI * 2); ctx.fill(); }
    text('RESULT', W / 2, py + 60, 46, '#7a2a10', 'center', null);
    // 得点のカウントアップ
    const k = clamp((t - 0.4) / 1.0, 0, 1);
    const shown = Math.round(G.score * easeOut(k));
    if (k > 0 && k < 1 && Math.floor(t * 30) % 2 === 0) A.coin(0);
    text(String(shown), W / 2, py + 140, 72, '#e8641e', 'center', '#fff');
    text(`ベスト ${save.best}`, W / 2, py + 200, 22, '#6b4a2a', 'center', null);
    const acc = G.shots ? Math.round(G.hits / G.shots * 100) : 0;
    const rows = [['命中', `${G.hits} / ${G.shots}（${acc}%）`], ['精密射撃', String(G.precise)], ['最大コンボ', String(G.maxCombo)],
      ['ボス撃破', String(G.bossKills)], ['星', `★ ${G.stars}`]];
    rows.forEach(([kk, v], i) => {
      const a = clamp((t - 0.6 - i * 0.12) / 0.2, 0, 1);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      text(kk, 90, py + 246 + i * 36, 21, '#6b4a2a', 'left', null);
      text(v, W - 214, py + 246 + i * 36, 21, '#3a2412', 'right', null);
      ctx.globalAlpha = 1;
    });
    ctx.restore();
    // ランクのハンコ
    if (t >= 1.6) {
      if (!r.stamped) { r.stamped = true; A.stamp(); G.shake = 10; vibe(30); }
      const p = clamp((t - 1.6) / 0.2, 0, 1);
      const s = lerp(3, 1, easeOut(p));
      ctx.save(); ctx.translate(W - 116, py + 350); ctx.rotate(-0.25); ctx.scale(s, s); ctx.globalAlpha = p;
      ctx.strokeStyle = r.rank.color; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.stroke();
      text(r.rank.rank, 0, 4, 84, r.rank.color, 'center', '#3a1a08');
      text('RANK', 0, -44, 14, '#3a1a08', 'center', null);
      ctx.restore();
    }
    if (G.newBest && t >= 2.0) { // ベスト更新リボン
      if (!r.ribbon) { r.ribbon = true; A.fanfare(); confetti(); }
      const p = clamp((t - 2.0) / 0.3, 0, 1);
      ctx.save(); ctx.translate(W / 2, py + 2); ctx.scale(easeBack(p), easeBack(p)); ctx.rotate(-0.04);
      woodPanel(-150, -26, 300, 52, 26, 1);
      text('NEW RECORD!', 0, 1, 30, '#ffd23a', 'center', '#3a0a08');
      ctx.restore();
    }
    // メダル・ランキング・ミッション
    if (t >= 1.3) {
      const a = clamp((t - 1.3) / 0.25, 0, 1);
      ctx.globalAlpha = a;
      medalIcon(96, py + 452, 13);
      text(`+${r.medals}`, 116, py + 453, 22, '#7a4a10', 'left', null);
      if (r.rankPos >= 0) text(`ランキング ${r.rankPos + 1}位！`, W - 74, py + 453, 22, r.rankPos === 0 ? '#e8641e' : '#6b4a2a', 'right', null);
      (r.missions || []).slice(0, 3).forEach((m, i) => {
        text(`✔ ${m.text}`, 90, py + 492 + i * 28, 17, '#2a7a2a', 'left', null, 800);
        text(`+${m.reward}`, W - 74, py + 492 + i * 28, 17, '#7a4a10', 'right', null, 800);
      });
      ctx.globalAlpha = 1;
    }
    // 主人公の勝ち・負けポーズ（手配書の左上に立つ）
    const pose = hv('hero_' + G.hero + (r.rank.rank === 'C' ? '_lose' : '_win'));
    if (pose && t >= 1.7) {
      const p = clamp((t - 1.7) / 0.3, 0, 1);
      const ph = 150, pw = ph * pose.width / pose.height;
      ctx.save(); ctx.translate(98, py + 96 - easeBack(p) * 8 + (r.rank.rank === 'C' ? 0 : -Math.abs(Math.sin(t * 4)) * 6));
      ctx.scale(easeBack(p), easeBack(p));
      ctx.drawImage(pose, -pw / 2, -ph, pw, ph);
      ctx.restore();
    }
    if (t >= 0.9) {
      button('もう一度', 70, py + 598, 190, 72, () => startGame(), { size: 28, pulse: true });
      button('タイトルへ', 280, py + 598, 190, 72, toTitle, { ...BLUE, size: 26 });
      button('シェア', W - 150, py + 18, 96, 44, shareResult, { fill: '#2f9a4a', fill2: '#7ee08a', shade: '#1a5a2a', stroke: '#1a5a2a', size: 18, key: 'share' });
      const sm = G.shareMsg;
      if (sm && G.now - sm.t0 < 2) text(sm.text, W / 2, py + 690, 15, '#3a2412', 'center', null, 800);
    }
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(20,10,30,0.6)'; ctx.fillRect(0, 0, W, H);
    woodPanel(50, H / 2 - 260, W - 100, 470, 28);
    text('一時停止', W / 2, H / 2 - 200, 44, '#ffd23a', 'center', '#3a1a08');
    button('再開', 120, H / 2 - 130, 300, 84, togglePause, { size: 34, pulse: true });
    button('タイトルへ', 120, H / 2 - 20, 300, 76, toTitle, { ...BLUE, size: 28 });
    button('設定', 120, H / 2 + 80, 300, 70, () => { G.settingsOpen = true; }, { fill: '#6a6a7a', fill2: '#a8a8b8', shade: '#3a3a4a', stroke: '#3a3a4a', size: 26 });
  }

  // ------------------------------------------------------------------ 描画のまとめ
  let fps = 0, fpsAcc = 0, fpsN = 0;
  function render() {
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = G.quality === 'low' ? 'low' : 'high';
    buttons = [];
    if (G.mode === 'loading' || G.mode === 'error') {
      ctx.fillStyle = '#2a1a2e'; ctx.fillRect(0, 0, W, H);
      text(G.mode === 'error' ? G.errorText : '読み込み中…', W / 2, H / 2, 22, '#fff');
    } else if (G.mode === 'title' || G.mode === 'missions' || G.mode === 'shop') {
      drawTitle();
      if (G.mode === 'missions') { buttons = []; drawMissions(); }
      if (G.mode === 'shop') { buttons = []; drawShop(); }
      drawFx();
      if (G.mode === 'title' && G.loginBonus) drawLogin();
      if (G.settingsOpen) drawSettings();
    } else {
      ctx.save();
      if (G.shake > 0) ctx.translate(fr(-G.shake, G.shake), fr(-G.shake, G.shake) * 0.6);
      if (G.punch > 0) { const z = 1 + 0.018 * G.punch; ctx.translate(W / 2, H * 0.45); ctx.scale(z, z); ctx.translate(-W / 2, -H * 0.45); }
      drawField();
      if (G.fever > 0) drawRays(W / 2, FY - 40, H * 0.9, [255, 200, 80], G.now * 0.4, 0.1 * FXL().k, true); // フィーバー中の後光
      drawTargets();
      drawHawkeye();
      drawPlayer();
      drawFx();
      ctx.restore();
      drawOverlays();
      if (G.fever > 0) edgeGlow('rgba(255,200,40,0.9)', 0.55 + 0.25 * Math.sin(G.now * 8));
      else if (G.mode === 'play' && G.time <= C.juice.lastSeconds && !G.ending) edgeGlow('rgba(230,40,30,0.8)', 0.25 + 0.2 * Math.max(0, Math.sin(G.now * 6)));
      drawReticle();
      drawBanner();
      drawCallout();
      drawComboBanner();
      drawPremonition();
      drawHud();
      if (G.mode === 'play' || G.mode === 'paused') drawSkillHud();
      drawBossAlert();
      drawFlyers();
      drawCutin();
      drawIntro();
      drawEnding();
      drawStarBanner();
      if (G.mode === 'result') { drawResult(); drawFx(); }
      if (G.mode === 'paused') { drawPause(); if (G.settingsOpen) drawSettings(); }
    }
    if (DEBUG) text(`${fps} fps  敵${G.enemies.length}  粒${G.parts.length}  H${H}  seed ${seed}`, 8, H - 14, 14, '#fff', 'left');
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (!G.frozen) step(G.slowT > 0 ? dt * C.slowmo.scale : dt); // スロー演出
    render();
    requestAnimationFrame(frame);
  }

  // テスト・デバッグ用の窓口
  window.PH_GAME = {
    G, C, STAGES, step, fire, hitTest, startGame, spawnEnemy, computePose, hitShape, startTransition,
    toggleWeapon, togglePause, curStage, render, rankOf, resize, gunOrigin, save, frameImg, IMG, targetAt,
    useSkill, spawnThief, spawnBalloon, tntAt, makeShareCard, skillButtons,
    get buttons() { return buttons; }, get H() { return H; }, get FY() { return FY; }, hudBottom,
    setSeed(s) { seed = s >>> 0; },
    aimPoint,
  };

  resize();
  requestAnimationFrame(frame);
  loadAll().then(() => {
    G.mode = 'title';
    if (!TEST) G.loginBonus = M.loginCheck(save, C);
    if (TEST) { const s = document.createElement('script'); s.src = 'tests/tests.js?v=' + Date.now(); document.body.appendChild(s); }
  }).catch((err) => {
    G.mode = 'error';
    G.errorText = err.message;
    console.error(err);
  });
})();
