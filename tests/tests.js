// 自動テスト：index.html?test=1 で読み込まれる。結果は画面右上とコンソール、window.PH_TEST_RESULTS に出る。
(() => {
  const P = window.PH_GAME, G = P.G, C = P.C;
  const W = C.view.width;
  const results = [];
  const ok = (name, cond, info = '') => results.push({ name, pass: !!cond, info: String(info) });
  const steps = (sec, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) P.step(dt); };

  const canvas = document.getElementById('game');
  function ptr(type, x, y, kind = 'touch', id = 7) {
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: kind, isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + x * r.width / W, clientY: r.top + y * r.height / P.H,
    }));
  }
  function render() { P.render(); } // ボタン位置は描画時に登録される

  // 実際に見えていて撃てる点（顔に近い順）を探す
  function visiblePoint(e) {
    const hs = P.hitShape(P.computePose(e));
    const pts = [];
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) pts.push([hs.cx + i / 3.5 * hs.rx, hs.cy + j / 3.5 * hs.ry]);
    pts.sort((a, b) => Math.hypot(a[0] - hs.hx, a[1] - hs.hy) - Math.hypot(b[0] - hs.hx, b[1] - hs.hy));
    for (const [x, y] of pts) { const r = P.hitTest(x, y); if (r && r.e === e) return { x, y }; }
    return null;
  }
  function fresh() {
    P.setSeed(12345);
    P.startGame({ intro: false });
    G.spawnT = 999;        // 自動出現を止めて手で置く
    G.boss = null;
    G.skyT = 999;          // 空の的も止める
    P.save.assist = false; // 当たり判定そのものを確かめるため、アシストは個別のテスト以外では切る
  }
  function heldEnemy(type, spotIdx) {
    const spot = P.curStage().spots[spotIdx];
    const e = P.spawnEnemy(type, spot);
    e.cycles = 9;
    let guard = 0;
    while (e.state !== 'hold' && guard++ < 600) P.step(1 / 60);
    G.spawnT = 999;
    return e;
  }

  try {
    G.frozen = true;

    // 1. 開始と時間
    fresh();
    ok('ゲーム開始でプレイ状態・初期時間', G.mode === 'play' && G.time === C.time.initial, G.time);
    steps(1);
    ok('タイマーが減る', Math.abs(G.time - (C.time.initial - 1)) < 0.05, G.time.toFixed(2));

    // 2. 命中（精密）と時間ボーナス
    fresh();
    let e = heldEnemy('red', 1);
    let pose = P.computePose(e), hs = P.hitShape(pose);
    let t0 = G.time;
    let r = P.fire(hs.hx, hs.hy);
    ok('顔の中心を撃つと命中', r && r.hit, JSON.stringify(r));
    ok('精密射撃ボーナス', r && r.precise && Math.abs(G.time - t0 - C.bonus.precise) < 1e-6, (G.time - t0).toFixed(2));
    ok('命中した敵は被弾演出になる', e.state === 'hit');
    steps(0.7);
    ok('被弾演出の後に消える', !G.enemies.includes(e));

    // 3. 隠れている部分（遮蔽物の中）は当たらない
    fresh();
    e = heldEnemy('red', 1);
    const sp = e.spot;
    r = P.fire(sp.cx, (sp.top + sp.bot) / 2 + 5);
    ok('遮蔽物の陰は当たらず遮蔽物に着弾', r && !r.hit && r.cover, JSON.stringify(r));
    // 隠れている敵
    fresh();
    e = P.spawnEnemy('red', P.curStage().spots[3]);
    pose = P.computePose(e); hs = P.hitShape(pose);
    r = P.fire(hs.hx, hs.hy);
    ok('完全に隠れた敵は撃てない', r && !r.hit, e.state);

    // 4. コンボで時間加算、外すとリセット
    fresh();
    let tb = [];
    for (let i = 0; i < 3; i++) {
      e = heldEnemy('red', [1, 3, 0][i]);
      pose = P.computePose(e); hs = P.hitShape(pose);
      G.cooldown = 0;
      // 精密にならないよう胴の下寄りを撃つ（遮蔽物より上）
      const y = Math.min(hs.cy, e.spot.top - 2);
      r = P.fire(hs.cx, y);
      tb.push(r && r.timeBonus);
      steps(0.7);
    }
    ok('3連続命中で時間ボーナス', G.combo === 3 && tb[2] >= C.bonus.comboPerHit, `combo=${G.combo} bonus=${tb}`);
    G.cooldown = 0;
    P.fire(6, P.hudBottom() + 26); // 何もない左上の空
    ok('外すとコンボが切れる', G.combo === 0);

    // 5. ボス
    fresh();
    const far = P.curStage().spots.find((s) => s.far);
    e = heldEnemy('boss', P.curStage().spots.indexOf(far));
    pose = P.computePose(e); hs = P.hitShape(pose);
    t0 = G.time; const s0 = G.score;
    r = P.fire(hs.hx, Math.min(hs.hy, far.top - 2));
    ok('ボス撃破で大きな得点と時間', r && r.hit && r.type === 'boss' && G.time - t0 >= C.bonus.boss && G.score - s0 >= C.score.boss,
      `+${(G.time - t0).toFixed(1)}s +${G.score - s0}`);

    // 6a. 入力（引いて狙う）：押した所の少し上に照準 → 下に引くほど上へ、左に引くほど右へ → 離すと撃つ
    fresh();
    const keepAim = P.save.aimMode;
    P.save.aimMode = 'pull';
    ptr('pointerdown', 270, 700);
    ok('引いて狙う：押した瞬間は押した所の少し上', G.aim && Math.abs(P.aimPoint(G.aim).y - (700 - C.input.aimOffsetTouch)) < 1 && Math.abs(P.aimPoint(G.aim).x - 270) < 1);
    steps(0.2);
    ptr('pointermove', 250, 760);
    steps(0.1);
    const pullShots = G.shots;
    ptr('pointerup', 250, 760);
    const ex = 270 + 20 * C.input.pullGain, ey = 700 - C.input.aimOffsetTouch - 60 * C.input.pullGain;
    ok('引いて狙う：引いた分だけ反対へ撃つ', G.shots === pullShots + 1 && G.lastShot && Math.abs(G.lastShot.x - ex) < 1 && Math.abs(G.lastShot.y - ey) < 1,
      G.lastShot && `${G.lastShot.x},${G.lastShot.y} vs ${ex},${ey}`);
    G.cooldown = 0;
    // 6b. 入力（指の上）：押した瞬間に指より上に照準 → 動かす → 離すとその位置を撃つ
    P.save.aimMode = 'follow';
    ptr('pointerdown', 270, 600);
    steps(0.3);
    ptr('pointermove', 300, 620);
    steps(0.2);
    const shots0 = G.shots;
    ptr('pointerup', 300, 620);
    ok('離すと発射（照準は指より上）', G.shots === shots0 + 1 && G.lastShot && Math.abs(G.lastShot.y - (620 - C.input.aimOffsetTouch)) < 1,
      G.lastShot && `${G.lastShot.x},${G.lastShot.y}`);
    G.cooldown = 0;
    ptr('pointerdown', 200, 500);
    ok('押した瞬間に照準が指より上に出る', G.aim && Math.abs(P.aimPoint(G.aim).y - (500 - C.input.aimOffsetTouch)) < 1);
    steps(0.05);
    ptr('pointerup', 200, 500);
    ok('軽いタップも照準の位置を撃つ', G.lastShot && Math.abs(G.lastShot.x - 200) < 1 && Math.abs(G.lastShot.y - (500 - C.input.aimOffsetTouch)) < 1,
      G.lastShot && `${G.lastShot.x},${G.lastShot.y}`);
    // 6c. 入力（タップ）：指の位置をそのまま撃つ
    G.cooldown = 0;
    P.save.aimMode = 'tap';
    const shotsT = G.shots;
    ptr('pointerdown', 240, 560); steps(0.05); ptr('pointerup', 240, 560);
    ok('タップ：押した位置をそのまま撃つ', G.shots === shotsT + 1 && G.lastShot && Math.abs(G.lastShot.x - 240) < 1 && Math.abs(G.lastShot.y - 560) < 1, G.lastShot && `${G.lastShot.x},${G.lastShot.y}`);
    P.save.aimMode = 'follow';
    G.shots = shots0 + 2;
    ptr('pointerdown', 100, 50); steps(0.3); ptr('pointerup', 100, 50);
    ok('上部 HUD 帯を押しても撃たない', G.shots === shots0 + 2);
    P.save.aimMode = keepAim;

    // 7. HUD ボタンは誤射しない
    fresh();
    render();
    const wb = P.buttons.find((b) => b.key === 'weapon');
    const w0 = G.weapon, sh = G.shots;
    ptr('pointerdown', wb.x, wb.y); steps(0.2); ptr('pointerup', wb.x, wb.y);
    ok('武器ボタンで切替・発射しない', G.weapon !== w0 && G.shots === sh, `${w0}->${G.weapon}`);
    G.cooldown = 0;
    r = P.fire(270, 500);
    ok('水鉄砲/拳銃で演出が変わる', G.fx.some((f) => f.kind === (G.weapon === 'water' ? 'stream' : 'tracer')));
    P.toggleWeapon();
    render();
    const pb = P.buttons.find((b) => b.key === 'pause');
    ptr('pointerdown', pb.x + 20, pb.y + 20); ptr('pointerup', pb.x + 20, pb.y + 20);
    ok('一時停止ボタン', G.mode === 'paused' && G.shots === sh + 1, G.mode);
    t0 = G.time; steps(1);
    ok('一時停止中は時間が止まる', G.time === t0);
    P.togglePause();

    // 8. エリア移動
    fresh();
    steps(C.time.areaDuration + 0.02);
    ok('15秒でエリア移動が始まる', !!G.trans, G.areaT.toFixed(2));
    t0 = G.time;
    ptr('pointerdown', 270, 500);
    G.cooldown = 0;
    r = P.fire(270, 500);
    steps(C.time.transition * 0.5);
    ok('移動中は射撃できない', r === null);
    ok('移動中はタイマーが止まる', G.time === t0, `${t0} -> ${G.time}`);
    steps(C.time.transition * 0.6);
    ptr('pointerup', 270, 500);
    ok('移動中に押した指を離しても撃たない', G.shots === 0, G.shots);
    ok('移動完了で次のエリア', !G.trans && G.areaN === 1 && G.camX === W && P.curStage().name === C.stages[1].name, P.curStage().name);
    const tr = C.time.transition;
    ok('移動時間は0.8〜1.0秒', tr >= 0.8 && tr <= 1.0, tr);
    G.time = 999; // 全ステージを回るまで時間切れにしない
    for (let i = 2; i <= C.stages.length; i++) steps(C.time.areaDuration + tr + 0.05);
    ok(`全${C.stages.length}エリアを巡回して最初に戻る`, G.areaN === C.stages.length && P.curStage().name === C.stages[0].name, `${G.areaN} ${P.curStage().name}`);
    ok('エリアごとの隠れ場所の数（6〜16）', C.stages.every((s) => s.spots.length >= 6 && s.spots.length <= 16), C.stages.map((s) => s.spots.length).join(','));
    {
      // 窓：窓枠の中だけで当たる
      const wi = C.stages.findIndex((st) => st.spots.some((sp) => sp.kind === 'window'));
      if (wi >= 0) {
        P.setSeed(3); P.startGame({ intro: false }); G.spawnT = 999; G.boss = null;
        G.areaN = wi; G.camX = wi * W;
        const spots = P.curStage().spots, si = spots.findIndex((sp) => sp.window);
        const we = P.spawnEnemy('red', spots[si]); we.cycles = 9;
        let g2 = 0; while (we.state !== 'hold' && g2++ < 600) P.step(1 / 60);
        G.spawnT = 999;
        const wv = visiblePoint(we), sp = spots[si];
        G.cooldown = 0;
        const below = P.fire(sp.cx, sp.top + 12);
        G.cooldown = 0;
        const inside = wv ? P.fire(wv.x, wv.y) : null;
        ok('窓の敵は窓枠の中だけ当たる', wv && wv.y >= sp.wtop && wv.y <= sp.top && below && !below.hit && inside && inside.hit,
          JSON.stringify({ wv, below: below && below.hit, inside: inside && inside.hit }));
      }
    }

    // 8b. 開始カウントダウン（READY? → DRAW!）の間は時間が減らず撃てない
    P.setSeed(1);
    P.startGame();
    ok('開始時にカウントダウン', !!G.intro);
    G.cooldown = 0;
    ok('カウントダウン中は撃てない', P.fire(270, 500) === null);
    steps(G.intro.dur + 0.05);
    ok('カウント後にプレイ開始・時間は減っていない', !G.intro && C.time.initial - G.time < 0.06, G.time);

    // 8c. フィーバー
    fresh();
    G.combo = C.fever.combo - 1;
    e = heldEnemy('red', 1);
    let v = visiblePoint(e);
    r = P.fire(v.x, v.y);
    ok('8コンボでフィーバー突入', G.fever > 0 && G.combo === C.fever.combo, `fever=${G.fever}`);
    steps(0.7);
    e = heldEnemy('red', 3);
    v = visiblePoint(e);
    G.cooldown = 0;
    r = P.fire(v.x, v.y);
    const expect = Math.round((C.score.hit + (r.precise ? C.score.precise : 0)) * Math.min(C.score.comboMaxMul, 1 + C.score.comboStep * (G.combo - 1)) * C.fever.scoreMul);
    ok('フィーバー中は得点倍率アップ', r.points === expect, `${r.points} vs ${expect}`);
    steps(C.fever.duration + 0.1);
    ok('フィーバーは時間で終わる', G.fever === 0);

    // 8e. 走り屋の逃走
    fresh();
    const keepFlee = C.levels[0].flee;
    C.levels[0].flee = 1;
    e = P.spawnEnemy('green', P.curStage().spots[1]);
    e.cycles = 1;
    let fled = false;
    for (let i = 0; i < 400 && G.enemies.includes(e); i++) { P.step(1 / 60); if (e.state === 'flee') fled = true; }
    C.levels[0].flee = keepFlee;
    ok('走り屋が画面外へ逃げる', fled && !G.enemies.includes(e));

    // 8d. ランク
    ok('ランク判定', P.rankOf(C.ranks[0].score).rank === 'S' && P.rankOf(0).rank === C.ranks[C.ranks.length - 1].rank);
    ok('縦長でも配置が画面内', P.FY + C.field.height < P.H - 104 && P.FY > 100, `H=${P.H} FY=${Math.round(P.FY)}`);

    // 8f. 撃ってはいけない的（素材があるときだけ）
    if (P.IMG.lady_idle) {
      fresh();
      G.combo = 5;
      e = heldEnemy('lady', 1);
      v = visiblePoint(e);
      t0 = G.time; const sc0 = G.score;
      G.cooldown = 0;
      r = P.fire(v.x, v.y);
      ok('町の人を撃つと時間が減りコンボが切れる', r.civilian && G.combo === 0 && Math.abs(t0 - G.time - C.penalty.time) < 1e-6 && G.score === sc0,
        `t ${t0.toFixed(1)}->${G.time.toFixed(1)} combo=${G.combo}`);
    }

    // 8g. エリアの星
    fresh();
    G.areaHits = C.stars[1];
    P.startTransition();
    ok('エリアの星（倒した数で評価）', G.starBanner && G.starBanner.n === 2 && G.stars === 2, JSON.stringify(G.starBanner));

    // 8h. ミッション・ショップ・ランキング（保存データの複製で確かめる）
    {
      const MM = window.PH_META;
      const sv = { medals: 0, owned: ['classic'], skin: 'classic', ranking: [], daily: null };
      const d = MM.daily(sv, C, '2026-1-1');
      ok('デイリーミッションが3つ', d.list.length === C.missions.perDay && new Set(d.list.map((m) => m.id)).size === 3);
      const big = { hits: 999, precise: 999, bossKills: 99, maxCombo: 99, score: 99999, fevers: 99, waterHits: 999, cleanAreas: 9, stars: 99, plays: 9 };
      sv.daily.key = MM.todayKey();
      const done = MM.applyRun(sv, C, big);
      ok('ミッション達成でメダル', done.length === 3 && sv.medals > 0 && sv.daily.list.every((m) => m.done), `medals=${sv.medals}`);
      sv.medals = 100;
      ok('メダル不足では買えない', MM.shopTap(sv, C, 'gold') === 'short' && sv.skin === 'classic');
      sv.medals = 1000;
      ok('買うと装備される', MM.shopTap(sv, C, 'gold') === 'buy' && sv.skin === 'gold' && sv.medals === 1000 - C.skins[1].price);
      ok('持っているものは装備だけ', MM.shopTap(sv, C, 'classic') === 'equip' && sv.skin === 'classic');
      [500, 9000, 100, 3000, 7000, 50].forEach((sc) => MM.addRanking(sv, C, { score: sc, hero: 'a', date: 'x' }));
      const pos = MM.addRanking(sv, C, { score: 8000, hero: 'b', date: 'x' });
      ok('ランキングは上位5件・順位を返す', sv.ranking.length === 5 && sv.ranking[0].score === 9000 && pos === 1, sv.ranking.map((q) => q.score).join(','));
    }

    // 8i. 効果音・BGM の合成（エラーなく波形ができる）
    {
      window.PH_AUDIO.loaded = true; // 読み込み完了の印が効果音の関数を上書きしないこと（以前の不具合）
      ok('効果音の関数が壊れない', typeof window.PH_AUDIO.ready === 'function' && typeof window.PH_AUDIO.draw === 'function');
      const loop = window.PH_AUDIO._synthLoop(116, { drums: 0.3 });
      let pk = 0, nan = 0;
      for (let i = 0; i < loop.len; i += 7) { const q = loop.L[i]; if (q !== q) nan++; pk = Math.max(pk, Math.abs(q)); }
      ok('BGM ループが合成できる（割れ・欠けなし）', nan === 0 && pk > 0.3 && pk <= 1, `peak=${pk.toFixed(2)} len=${loop.len}`);
    }

    // 8j. 跳ね屋：空中で撃つとボーナス、遅れると撃たれる
    if (P.IMG.enemy_jumper) {
      fresh();
      e = P.spawnEnemy('jumper', P.curStage().spots[1]); e.cycles = 1;
      let g3 = 0; while (e.state !== 'aim' && g3++ < 600) P.step(1 / 60);
      G.spawnT = 999;
      const jp = P.computePose(e), jh = P.hitShape(jp);
      G.cooldown = 0;
      r = P.fire(jh.cx, jh.cy);
      ok('跳ね屋を空中で撃つとボーナス', r && r.hit && r.type === 'jumper' && r.points >= C.enemies.jumper.airBonus, JSON.stringify(r));
      fresh();
      G.combo = 4;
      e = P.spawnEnemy('jumper', P.curStage().spots[1]); e.cycles = 1;
      g3 = 0; while (e.state !== 'aim' && g3++ < 600) P.step(1 / 60);
      t0 = G.time;
      g3 = 0; while (e.state === 'aim' && g3++ < 600) P.step(1 / 60);
      ok('跳ね屋に撃たれると時間が減りコンボが切れる', G.combo === 0 && t0 - G.time >= C.enemies.jumper.shotPenalty - 0.02, `${t0.toFixed(2)}->${G.time.toFixed(2)}`);
    }
    // 8k. 空の的
    if (P.IMG.target_bottle) {
      fresh();
      const ty = C.skyTargets.types[0];
      G.targets.push({ type: ty, x: 270, y: 400, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, t: 0, alive: true });
      t0 = G.time; const s1 = G.score;
      G.cooldown = 0;
      r = P.fire(272, 402);
      ok('空の的を撃つとボーナス', r && r.target === ty.id && G.score - s1 >= ty.pts && G.time - t0 >= ty.time - 1e-6 && G.targets.length === 0, JSON.stringify(r));
    }
    // 8m. 高い所：照準が届き、HUD に隠れる場所には出ない
    {
      fresh();
      const hb = P.hudBottom();
      const keepAim = P.save.aimMode;
      P.save.aimMode = 'follow';
      ptr('pointerdown', 270, P.FY + 120); steps(0.25);
      ptr('pointermove', 270, P.FY - 20); steps(0.25);
      ptr('pointerup', 270, P.FY - 20);
      ok('照準を上げて高い所を撃てる（HUD のすぐ下まで）', G.lastShot && G.lastShot.y <= Math.max(P.FY - 40, hb + 4) + 0.5 && G.lastShot.y >= hb, G.lastShot && Math.round(G.lastShot.y));
      G.cooldown = 0;
      P.save.aimMode = 'pull'; // 画面の画面の真ん中から引いて一番上まで届く
      ptr('pointerdown', 270, P.H * 0.5); steps(0.25);
      ptr('pointermove', 270, P.H * 0.5 + 400); steps(0.25);
      ptr('pointerup', 270, P.H * 0.5 + 400);
      ok('引いて狙う：真ん中から引いて一番上まで届く', G.lastShot && Math.abs(G.lastShot.y - (hb + 4)) < 1, G.lastShot && Math.round(G.lastShot.y));
      P.save.aimMode = keepAim;
      fresh();
      G.spawnT = 0; G.time = 999;
      let bad = 0, n = 0;
      for (let i = 0; i < 60 * 40; i++) {
        P.step(1 / 60);
        for (const en of G.enemies) {
          if (en.counted) continue; en.counted = true; n++;
          const sp = en.spot;
          if ((sp.window ? sp.wtop : sp.top) - en.h * 0.6 < hb) bad++;
        }
      }
      ok('HUD に隠れる高すぎる場所には出ない', n > 10 && bad === 0, `spawned=${n} bad=${bad} H=${P.H}`);
    }
    // 8n. 盾持ち：1 発目は弾かれ、2 発目で倒れる
    fresh();
    e = heldEnemy('shield', 1);
    v = visiblePoint(e);
    G.cooldown = 0;
    let r1 = P.fire(v.x, v.y);
    const alive1 = e.state !== 'hit';
    steps(0.2); G.cooldown = 0;
    if (e.state !== 'hold') { e.state = 'hold'; e.t = 0; e.dur = 9; }
    v = visiblePoint(e) || v;
    let r2 = P.fire(v.x, v.y);
    ok('盾持ちは2発で倒れる', r1 && r1.shield && alive1 && r2 && r2.hit && e.state === 'hit', JSON.stringify({ r1, r2: r2 && r2.type }));

    // 8o. 泥棒：袋を撃つとコインとメダル
    fresh();
    const th = P.spawnThief();
    steps(1.0);
    const tp = P.computePose(th), fl = tp.flip ? -1 : 1;
    const bx = tp.x + fl * tp.w * 0.4, by = tp.top + tp.h * 0.6;
    const s0b = G.score; G.cooldown = 0;
    r = P.fire(bx, by);
    ok('泥棒の袋を撃つとコインとメダル', r && r.bag && !th.hasBag && G.score > s0b && G.bonusMedals === C.enemies.thief.bagMedals, JSON.stringify(r));

    // 8p. ダイナマイト：周りの敵をまとめて倒す
    fresh();
    const tnt = G.tnts[0];
    if (tnt) {
      const near = P.curStage().spots.filter((sp) => !sp.window && !sp.far).sort((a, b) => Math.hypot(a.cx - tnt.x, a.bot - tnt.y) - Math.hypot(b.cx - tnt.x, b.bot - tnt.y)).slice(0, 2);
      const es = near.map((sp) => { const q = P.spawnEnemy('red', sp); q.cycles = 9; return q; });
      steps(0.4); G.spawnT = 999;
      const inR = es.filter((q) => { const ps = P.computePose(q); return Math.hypot(ps.x - tnt.x, ps.top + ps.h * 0.5 - (tnt.y - tnt.h * 0.5)) < C.tnt.radius + ps.h * 0.3; }).length;
      G.cooldown = 0;
      r = P.fire(tnt.x, tnt.y - tnt.h * 0.5);
      ok('ダイナマイトで周りの敵をまとめて倒す', r && r.tnt && r.kills === inR && !tnt.alive, `kills=${r && r.kills} inRange=${inR}`);
      steps(C.tnt.respawn + 0.4); // 爆発のヒットストップの分を足す
      ok('ダイナマイトはしばらくすると戻る', tnt.alive);
    }

    // 8q. スキル：買う・セット・発動
    {
      const MM = window.PH_META;
      const sv = { medals: 1000, skillsOwned: [], skillSlots: [] };
      ok('スキルを買うとセットされる', MM.skillTap(sv, C, 'quickdraw') === 'buy' && sv.skillSlots.includes('quickdraw') && sv.medals === 1000 - C.skills.list[0].price);
      MM.skillTap(sv, C, 'hawkeye'); MM.skillTap(sv, C, 'bigshot');
      ok('セットは2つまで', sv.skillSlots.length === C.skills.slots && sv.skillsOwned.length === 3 && MM.skillTap(sv, C, 'bigshot') === 'full');
      ok('付け外しできる', MM.skillTap(sv, C, 'hawkeye') === 'unequip' && MM.skillTap(sv, C, 'bigshot') === 'equip');
      const keepSlots = P.save.skillSlots, keepOwned = P.save.skillsOwned;
      P.save.skillSlots = ['timestop', 'bigshot']; P.save.skillsOwned = ['timestop', 'bigshot'];
      fresh();
      ok('ゲージが満タンでないと発動しない', P.useSkill('timestop') === false);
      G.gauge = 1;
      ok('時間停止が発動', P.useSkill('timestop') === true && G.skill && G.skill.id === 'timestop');
      t0 = G.time; steps(1);
      ok('時間停止中はタイマーが止まる', G.time === t0, `${t0} -> ${G.time}`);
      steps(C.skills.list[3].dur);
      ok('時間停止は時間で終わる', !G.skill && G.time < t0);
      fresh(); G.gauge = 1; P.useSkill('bigshot');
      e = heldEnemy('red', 1);
      const hs2 = P.hitShape(P.computePose(e));
      G.cooldown = 0;
      r = P.fire(hs2.cx + hs2.rx + 30, Math.min(hs2.cy, e.spot.top - 10));
      ok('大きな弾は少し外れても当たる', r && r.hit, JSON.stringify(r));
      // 新しい敵
      fresh();
      e = heldEnemy('gold', 1);
      let hsN = P.hitShape(P.computePose(e)), mN = G.bonusMedals || 0, sN = G.score;
      G.cooldown = 0;
      r = P.fire(hsN.hx, Math.min(hsN.hy, e.spot.top - 4));
      ok('金ピカは大きな得点とメダル', r && r.hit && G.score - sN >= C.enemies.gold.bonusPts && G.bonusMedals === mN + C.enemies.gold.bonusMedals, JSON.stringify(r));
      fresh();
      e = P.spawnEnemy('bomber', P.curStage().spots.filter((s) => !s.window && !s.far)[1]);
      t0 = G.time; steps(0.5 + C.enemies.bomber.fuse * C.enemySlow + 0.4);
      ok('爆弾魔を放っておくと時間が減る', t0 - G.time >= C.enemies.bomber.bombPenalty, `${t0} -> ${G.time}`);
      fresh();
      e = heldEnemy('bomber', 1);
      hsN = P.hitShape(P.computePose(e));
      G.cooldown = 0;
      r = P.fire(hsN.hx, Math.min(hsN.hy, e.spot.top - 4));
      ok('爆弾魔を撃つと倒せる', r && r.hit && e.state === 'hit', JSON.stringify(r));
      fresh();
      e = P.spawnBalloon();
      steps(3);
      const pB = P.computePose(e); hsN = P.hitShape(pB); sN = G.score;
      G.cooldown = 0;
      r = P.fire(hsN.cx, hsN.cy);
      ok('気球乗りを撃ち落とすと高得点', pB.top > P.hudBottom() && r && r.hit && r.type === 'balloon' && G.score - sN >= C.enemies.balloon.bonusPts, JSON.stringify(r));
      // エイムアシスト：少しの外れは当たる／遠すぎる外れは当たらない
      fresh(); P.save.assist = true;
      e = heldEnemy('red', 1);
      const hs3 = P.hitShape(P.computePose(e)), ay = Math.min(hs3.cy, e.spot.top - 10);
      G.cooldown = 0;
      r = P.fire(hs3.cx + hs3.rx + C.input.assistRadius * 0.6, ay);
      ok('エイムアシスト：少し外れても当たる', r && r.hit, JSON.stringify(r));
      fresh(); P.save.assist = true;
      e = heldEnemy('red', 1);
      const hs4 = P.hitShape(P.computePose(e));
      G.cooldown = 0;
      r = P.fire(hs4.cx + hs4.rx + C.input.assistRadius + 20, Math.min(hs4.cy, e.spot.top - 10));
      ok('エイムアシスト：大きく外れたら当たらない', r && !r.hit, JSON.stringify(r));
      P.save.assist = false;
      P.save.skillSlots = ['quickdraw']; P.save.skillsOwned = ['quickdraw'];
      fresh(); e = heldEnemy('red', 3); G.gauge = 1; P.useSkill('quickdraw');
      steps(0.5);
      ok('早撃ちは見えている敵を自動で撃つ', e.state === 'hit');
      P.save.skillSlots = keepSlots; P.save.skillsOwned = keepOwned;
    }

    // 8r. ログインボーナス・帽子・左手モード・共有画像
    {
      const MM = window.PH_META;
      const sv = { medals: 0, hats: [], lastLogin: null, streak: 0 };
      const d1 = new Date(2026, 9, 1);
      let lb = MM.loginCheck(sv, C, d1); MM.claimLogin(sv, C, lb);
      ok('ログインボーナス1日目', lb.day === 1 && sv.medals === C.login.rewards[0]);
      ok('同じ日は2回もらえない', MM.loginCheck(sv, C, d1) === null);
      for (let i = 2; i <= 7; i++) { lb = MM.loginCheck(sv, C, new Date(2026, 9, i)); MM.claimLogin(sv, C, lb); }
      ok('7日連続で帽子ももらえる', lb.day === 7 && sv.hats.includes(C.login.day7Items[0]), JSON.stringify(sv));
      lb = MM.loginCheck(sv, C, new Date(2026, 9, 10));
      ok('途切れたら1日目から', lb.day === 1 && lb.streak === 1);
      ok('帽子：持っていれば装備', MM.hatTap(sv, C, C.login.day7Items[0]) === 'equip');
      const keepL = P.save.lefty;
      P.save.lefty = true; fresh(); P.render();
      const wbL = P.buttons.find((b) => b.key === 'weapon');
      P.save.lefty = false; P.render();
      const wbR = P.buttons.find((b) => b.key === 'weapon');
      P.save.lefty = keepL;
      ok('左手モードで武器ボタンが左へ', wbL.x < W / 2 && wbR.x > W / 2);
      let cardOk = false; try { const cv = P.makeShareCard(); cardOk = cv.width === 720 && cv.toDataURL().length > 1000; } catch (err) { cardOk = String(err); }
      ok('共有用の画像が作れる', cardOk === true, cardOk);
    }

    // 8l. 演出の強さの設定
    ok('演出の強さは3段階', ['low', 'standard', 'max'].every((k) => C.fxLevels[k] && C.fxLevels[k].flash <= 0.5));

    // 9. 通しプレイ（ランダム射撃）：エラーなく終了し、全種類の敵と動きが出る
    P.setSeed(99);
    P.startGame({ intro: false });
    const seenTypes = new Set(), seenStates = new Set();
    let frames = 0, maxEnemies = 0, aimed = 0, aimedHit = 0;
    while (G.mode === 'play' && frames < 60 * 400) {
      P.step(1 / 60);
      frames++;
      for (const en of G.enemies) { seenTypes.add(en.type); seenStates.add(en.mode + ':' + en.state); }
      maxEnemies = Math.max(maxEnemies, G.enemies.length);
      if (frames % 20 === 0 && frames < 60 * 90) { // 90秒間、見えている敵を狙う「上手いプレイヤー」→その後は放置
        const target = G.enemies.find((en) => en.state !== 'hit' && !en.def.civilian && P.computePose(en).hittable && visiblePoint(en));
        if (target && Math.random() < 0.7 && !G.ending && !G.trans && !G.intro && !G.cutin) {
          const v = visiblePoint(target);
          aimed++;
          const res = P.fire(v.x, v.y);
          if (res && res.hit) aimedHit++;
        } else P.fire(Math.random() * W, 200 + Math.random() * 500);
      }
      if (frames % 30 === 0) P.render();
    }
    ok('通しプレイが時間切れで結果画面に到達', G.mode === 'result', `${G.mode} frames=${frames} area=${G.areaN + 1}`);
    ok('通常敵3種とボスが出現', ['red', 'green', 'blue', 'boss'].every((t) => seenTypes.has(t)), [...seenTypes].join(','));
    ok('隠れる・のぞく・走る・逃げる', ['pop:hold', 'lean:hold', 'run:run'].every((s) => seenStates.has(s)), [...seenStates].sort().join(' '));
    ok('見えている部分を狙えば当たる', aimed > 0 && aimedHit === aimed, `${aimedHit}/${aimed}`);
    ok('得点が入る', G.score > 0 && G.hits > 0, `score=${G.score} hits=${G.hits}/${G.shots} combo=${G.maxCombo} boss=${G.bossKills}`);
    ok('同時出現数は上限内', maxEnemies <= Math.max(...C.levels.map((l) => l.maxAlive)) + 2, maxEnemies);
    P.render();
  } catch (err) {
    ok('例外なし', false, err.stack || err);
  }

  window.PH_TEST_RESULTS = results;
  const pass = results.filter((r) => r.pass).length;
  console.log(`[PH TEST] ${pass}/${results.length} passed`);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${r.info}`);
  const div = document.createElement('pre');
  div.id = 'test-report';
  div.style.cssText = 'position:fixed;left:0;top:0;margin:0;max-height:100%;overflow:auto;background:rgba(0,0,0,.85);color:#fff;font:12px/1.4 monospace;padding:8px;z-index:9';
  div.textContent = `${pass}/${results.length} passed\n` + results.map((r) => `${r.pass ? '✔' : '✘'} ${r.name}  ${r.pass ? '' : r.info}`).join('\n');
  document.body.appendChild(div);
  G.frozen = false;
})();
