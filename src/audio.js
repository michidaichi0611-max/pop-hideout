// 効果音と BGM（すべてプログラムで合成。音声ファイルは使わない）
// 効果音は起動時に OfflineAudioContext で一度だけ波形にしておき、鳴らすときはそれを再生する（軽く、音量もそろう）。
// BGM は撥弦（カープラス・ストロング法）のギター、ベース、口笛のメロディ、蹄の打楽器を 1 サンプルずつ合成したループ。
window.PH_AUDIO = (() => {
  'use strict';
  let ac = null, master = null, sfxBus = null, musicBus = null, revIn = null;
  let sfxOn = true, bgmOn = true;
  const SFX_VOL = 0.8, BGM_VOL = 0.32;
  const BUF = {};
  const stats = {}; // テスト用：各音のピーク

  // ---------------------------------------------------------------- 部品
  const noiseCache = new WeakMap();
  function noiseBuf(c) {
    let b = noiseCache.get(c);
    if (!b) {
      b = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = b.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
      noiseCache.set(c, b);
    }
    return b;
  }
  function envGain(c, t, a, vol, dur, dest) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    g.connect(dest);
    return g;
  }
  function noise(c, dest, t, dur, o) {
    const s = c.createBufferSource(); s.buffer = noiseBuf(c);
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    f.Q.value = o.q || 0.7;
    s.connect(f); f.connect(envGain(c, t, o.attack || 0.002, o.vol, dur, dest));
    s.start(t, o.offset || 0); s.stop(t + dur + 0.02);
  }
  function osc(c, dest, t, dur, o) {
    const s = c.createOscillator(); s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f0, t);
    if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || dur));
    if (o.detune) s.detune.value = o.detune;
    let out = envGain(c, t, o.attack || 0.003, o.vol, dur, dest);
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.connect(out); out = f; }
    if (o.vib) { // ビブラート
      const l = c.createOscillator(); l.frequency.value = o.vib[0];
      const lg = c.createGain(); lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(s.frequency);
      l.start(t); l.stop(t + dur + 0.02);
    }
    s.connect(out); s.start(t); s.stop(t + dur + 0.02);
  }
  function bell(c, d, t, f, dur, vol) { // 金属的な「キン」：倍音をずらした正弦波の重ね
    [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]].forEach(([m, v]) => {
      if (f * m < c.sampleRate * 0.45) osc(c, d, t, dur / m ** 0.3, { f0: f * m, vol: vol * v, attack: 0.001 }); // 聞こえない高さの倍音は省く
    });
  }
  function brass(c, d, t, freqs, dur, vol) { // 金管風：のこぎり波を低域だけ通す
    for (const f of freqs) for (const det of [-6, 6]) osc(c, d, t, dur, { type: 'sawtooth', f0: f, vol: vol / freqs.length, attack: 0.03, lp: 1800, detune: det });
  }
  function gunshot(c, d, t, big = 1) {
    const pre = c.createGain(); pre.connect(d);
    // 屋外の跳ね返り（110ms 後の小さなこだま）
    const dl = c.createDelay(1); dl.delayTime.value = 0.11;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const eg = c.createGain(); eg.gain.value = 0.3;
    pre.connect(lp); lp.connect(dl); dl.connect(eg); eg.connect(d);
    noise(c, pre, t, 0.008, { type: 'highpass', f0: 2500, vol: 1, attack: 0.0004 });           // 破裂の「パ」
    noise(c, pre, t, 0.22 * big, { type: 'lowpass', f0: 7500, f1: 600, q: 0.6, vol: 0.85, attack: 0.001 }); // 胴鳴り
    osc(c, pre, t, 0.18 * big, { f0: 150, f1: 38, vol: 0.9, attack: 0.002 });               // 低い衝撃
  }

  // ---------------------------------------------------------------- 効果音の設計図
  // dur: 長さ(秒)  peak: そろえる音量  fn: 音の作り方
  const pent = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const D = {
    shot: { dur: 0.6, peak: 0.95, fn: (c, d, t) => gunshot(c, d, t) },
    water: { dur: 0.5, peak: 0.7, fn: (c, d, t) => {
      noise(c, d, t, 0.24, { type: 'bandpass', f0: 3200, f1: 900, q: 1.3, vol: 0.8, attack: 0.004 });
      noise(c, d, t, 0.05, { type: 'highpass', f0: 5000, vol: 0.5 });
      osc(c, d, t, 0.15, { f0: 640, f1: 230, vol: 0.35 });
      [1300, 1750, 1500, 2000].forEach((f, i) => osc(c, d, t + 0.06 + i * 0.045, 0.05, { f0: f, f1: f * 1.6, vol: 0.18 }));
    } },
    hit: { dur: 0.3, peak: 0.6, fn: (c, d, t) => {
      osc(c, d, t, 0.09, { f0: 300, f1: 1150, glide: 0.05, vol: 1, attack: 0.002 });
      osc(c, d, t, 0.06, { type: 'triangle', f0: 600, f1: 2300, vol: 0.3 });
      noise(c, d, t, 0.03, { type: 'bandpass', f0: 2200, q: 1, vol: 0.4 });
    } },
    marker: { dur: 0.06, peak: 0.32, fn: (c, d, t) => {
      osc(c, d, t, 0.02, { type: 'square', f0: 3300, f1: 2800, vol: 0.6, attack: 0.0005, lp: 7000 });
      noise(c, d, t, 0.012, { type: 'highpass', f0: 6000, vol: 0.5 });
    } },
    crit: { dur: 0.9, peak: 0.5, fn: (c, d, t) => { bell(c, d, t, 2637, 0.8, 1); osc(c, d, t, 0.15, { f0: 1319, vol: 0.4 }); } },
    coin: { dur: 0.4, peak: 0.42, fn: (c, d, t) => {
      osc(c, d, t, 0.08, { type: 'square', f0: 988, vol: 0.5, lp: 5000, attack: 0.001 });
      osc(c, d, t + 0.07, 0.3, { type: 'square', f0: 1319, vol: 0.5, lp: 5000, attack: 0.001 });
      osc(c, d, t + 0.07, 0.3, { f0: 2638, vol: 0.2 });
    } },
    bonus: { dur: 0.6, peak: 0.45, fn: (c, d, t) => [1047, 1319, 1568, 2093].forEach((f, i) => osc(c, d, t + i * 0.05, 0.22, { f0: f, vol: 0.6, attack: 0.002 })) },
    cover: { dur: 0.25, peak: 0.6, fn: (c, d, t) => {
      noise(c, d, t, 0.08, { type: 'bandpass', f0: 750, q: 5, vol: 1, attack: 0.001 });
      osc(c, d, t, 0.07, { f0: 230, f1: 160, vol: 0.6 });
    } },
    ricochet: { dur: 0.5, peak: 0.32, fn: (c, d, t) => { // 西部劇の「ピューン」
      osc(c, d, t, 0.4, { f0: 3600, f1: 1100, glide: 0.38, vol: 0.5, attack: 0.002, vib: [30, 60] });
      noise(c, d, t, 0.03, { type: 'highpass', f0: 4000, vol: 0.4 });
    } },
    miss: { dur: 0.2, peak: 0.22, fn: (c, d, t) => noise(c, d, t, 0.14, { type: 'bandpass', f0: 1800, f1: 600, q: 0.8, vol: 0.5, attack: 0.01 }) },
    step: { dur: 0.15, peak: 0.45, fn: (c, d, t) => {
      noise(c, d, t, 0.05, { type: 'lowpass', f0: 2400, vol: 1, attack: 0.002 });
      noise(c, d, t + 0.025, 0.07, { type: 'lowpass', f0: 1300, vol: 0.6, offset: 0.3 });
    } },
    ui: { dur: 0.15, peak: 0.32, fn: (c, d, t) => { osc(c, d, t, 0.06, { f0: 720, f1: 1150, vol: 0.8 }); osc(c, d, t + 0.03, 0.06, { f0: 1440, vol: 0.3 }); } },
    tick: { dur: 0.08, peak: 0.38, fn: (c, d, t) => { osc(c, d, t, 0.04, { f0: 1250, vol: 1, attack: 0.001 }); noise(c, d, t, 0.012, { type: 'bandpass', f0: 3000, vol: 0.4 }); } },
    tickU: { dur: 0.1, peak: 0.45, fn: (c, d, t) => { osc(c, d, t, 0.05, { f0: 1700, vol: 1, attack: 0.001 }); noise(c, d, t, 0.012, { type: 'bandpass', f0: 3500, vol: 0.4 }); } },
    ready: { dur: 0.6, peak: 0.5, fn: (c, d, t) => {
      osc(c, d, t, 0.35, { f0: 170, f1: 95, vol: 1 }); noise(c, d, t, 0.2, { type: 'lowpass', f0: 500, vol: 0.4 });
      brass(c, d, t + 0.02, [220, 330], 0.45, 0.35);
    } },
    draw: { dur: 1.1, peak: 0.95, fn: (c, d, t) => {
      gunshot(c, d, t, 1.3);
      osc(c, d, t + 0.09, 0.45, { f0: 3800, f1: 1000, glide: 0.42, vol: 0.25, vib: [28, 70] });
    } },
    callout: { dur: 0.4, peak: 0.4, fn: (c, d, t) => { osc(c, d, t, 0.12, { type: 'square', f0: 784, vol: 0.4, lp: 4000 }); osc(c, d, t + 0.08, 0.25, { type: 'square', f0: 1175, vol: 0.45, lp: 4000 }); } },
    fever: { dur: 1.0, peak: 0.6, fn: (c, d, t) => {
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => osc(c, d, t + i * 0.05, 0.16, { type: 'square', f0: f, vol: 0.4, lp: 3500 }));
      noise(c, d, t, 0.55, { type: 'bandpass', f0: 500, f1: 7000, q: 1.2, vol: 0.35, attack: 0.25 });
      brass(c, d, t + 0.32, [523, 659, 784], 0.6, 0.5);
    } },
    comboBreak: { dur: 0.5, peak: 0.42, fn: (c, d, t) => {
      osc(c, d, t, 0.38, { type: 'sawtooth', f0: 330, f1: 110, vol: 0.6, lp: 1300 });
      osc(c, d, t, 0.38, { type: 'sawtooth', f0: 220, f1: 78, vol: 0.4, lp: 1000 });
    } },
    boss: { dur: 1.6, peak: 0.9, fn: (c, d, t) => {
      gunshot(c, d, t, 1.5); bell(c, d, t + 0.02, 1975, 1.0, 0.7);
      brass(c, d, t + 0.18, [523, 659, 784], 0.3, 0.6); brass(c, d, t + 0.5, [659, 784, 1047], 0.9, 0.7);
    } },
    alert: { dur: 1.1, peak: 0.55, fn: (c, d, t) => { brass(c, d, t, [110, 220], 0.26, 0.8); brass(c, d, t + 0.32, [117, 233], 0.6, 0.8); } },
    tele: { dur: 0.6, peak: 0.32, fn: (c, d, t) => [2637, 3136, 3951].forEach((f, i) => bell(c, d, t + i * 0.05, f, 0.35, 0.5)) },
    timeUp: { dur: 1.5, peak: 0.6, fn: (c, d, t) => {
      [784, 659, 523].forEach((f, i) => osc(c, d, t + i * 0.15, 0.2, { type: 'square', f0: f, vol: 0.45, lp: 3000 }));
      brass(c, d, t + 0.45, [196, 392], 0.9, 0.7); noise(c, d, t + 0.45, 0.3, { type: 'lowpass', f0: 300, vol: 0.5 });
    } },
    stamp: { dur: 0.5, peak: 0.8, fn: (c, d, t) => { noise(c, d, t, 0.22, { type: 'lowpass', f0: 380, vol: 1, attack: 0.001 }); osc(c, d, t, 0.25, { f0: 115, f1: 45, vol: 1 }); } },
    fanfare: { dur: 1.8, peak: 0.6, fn: (c, d, t) => {
      brass(c, d, t, [523, 659, 784], 0.18, 0.6); brass(c, d, t + 0.2, [587, 740, 880], 0.18, 0.6);
      brass(c, d, t + 0.4, [659, 831, 988, 1319], 1.0, 0.75);
      noise(c, d, t + 0.4, 1.2, { type: 'highpass', f0: 6000, vol: 0.18 });
    } },
    civilian: { dur: 0.7, peak: 0.6, fn: (c, d, t) => { // 「ブブー」
      osc(c, d, t, 0.18, { type: 'square', f0: 160, vol: 0.6, lp: 1500 });
      osc(c, d, t + 0.2, 0.32, { type: 'square', f0: 150, vol: 0.6, lp: 1500, vib: [9, 8] });
      osc(c, d, t + 0.05, 0.25, { f0: 760, f1: 300, vol: 0.3 });
    } },
    cluck: { dur: 0.4, peak: 0.42, fn: (c, d, t) => [0, 0.07, 0.15].forEach((o, i) => osc(c, d, t + o, 0.05, { type: 'square', f0: 900 + i * 80, f1: 1350 + i * 80, vol: 0.5, lp: 2500 })) },
    swish: { dur: 0.3, peak: 0.3, fn: (c, d, t) => noise(c, d, t, 0.25, { type: 'bandpass', f0: 600, f1: 2400, q: 1.5, vol: 0.6, attack: 0.08 }) },
    star: { dur: 0.6, peak: 0.45, fn: (c, d, t) => { bell(c, d, t, 1568, 0.5, 0.8); osc(c, d, t, 0.3, { f0: 784, vol: 0.4 }); } },
    buy: { dur: 0.8, peak: 0.5, fn: (c, d, t) => { [1319, 1568, 2093].forEach((f, i) => bell(c, d, t + i * 0.07, f, 0.5, 0.6)); } },
    // ---- v0.6 パチンコ風演出の音
    glass: { dur: 0.6, peak: 0.6, fn: (c, d, t) => { // 瓶が割れる「パリーン」
      noise(c, d, t, 0.35, { type: 'highpass', f0: 3500, vol: 0.8, attack: 0.001 });
      [3100, 4700, 3900, 5600, 4300].forEach((f, i) => osc(c, d, t + i * 0.025, 0.12, { f0: f, vol: 0.25 }));
    } },
    can: { dur: 0.6, peak: 0.6, fn: (c, d, t) => { // 缶の「カーン」
      osc(c, d, t, 0.05, { type: 'square', f0: 950, f1: 700, vol: 0.5, lp: 4000 });
      bell(c, d, t, 1480, 0.45, 0.7); noise(c, d, t, 0.06, { type: 'bandpass', f0: 2200, vol: 0.5 });
    } },
    goldplate: { dur: 1.4, peak: 0.6, fn: (c, d, t) => { // 金の皿「キラーン」
      bell(c, d, t, 2637, 1.2, 1); [1568, 2093, 2637, 3136].forEach((f, i) => osc(c, d, t + 0.08 + i * 0.06, 0.2, { type: 'square', f0: f, vol: 0.18, lp: 6000 }));
      noise(c, d, t, 1.0, { type: 'highpass', f0: 7000, vol: 0.18, attack: 0.05 });
    } },
    jumperAlert: { dur: 0.5, peak: 0.45, fn: (c, d, t) => { // 跳ね屋が狙う「ピピッ」
      osc(c, d, t, 0.06, { type: 'square', f0: 1250, vol: 0.5, lp: 5000 }); osc(c, d, t + 0.09, 0.08, { type: 'square', f0: 1650, vol: 0.5, lp: 5000 });
    } },
    enemyShot: { dur: 0.9, peak: 0.9, fn: (c, d, t) => { // 撃たれた「バン！ボワン」
      gunshot(c, d, t, 1.2); osc(c, d, t + 0.05, 0.5, { type: 'sawtooth', f0: 220, f1: 70, vol: 0.5, lp: 900 });
    } },
    cutin: { dur: 1.4, peak: 0.85, fn: (c, d, t) => { // カットイン「シュバッ・ジャーン」
      noise(c, d, t, 0.28, { type: 'bandpass', f0: 400, f1: 6000, q: 1.2, vol: 0.6, attack: 0.08 });
      brass(c, d, t + 0.22, [262, 330, 392, 523], 0.9, 0.9);
      noise(c, d, t + 0.22, 1.1, { type: 'highpass', f0: 5000, vol: 0.3 });
      osc(c, d, t + 0.22, 0.3, { f0: 110, f1: 55, vol: 0.8 });
    } },
    premo: { dur: 0.7, peak: 0.5, fn: (c, d, t) => { // 予告「キュイン」
      osc(c, d, t, 0.42, { f0: 380, f1: 2600, glide: 0.38, vol: 0.6, vib: [18, 40] });
      osc(c, d, t, 0.42, { type: 'triangle', f0: 760, f1: 5200, glide: 0.38, vol: 0.2 });
    } },
    coinRain: { dur: 1.6, peak: 0.45, fn: (c, d, t) => {
      for (let i = 0; i < 12; i++) { const f = 1568 + ((i * 7) % 5) * 180; osc(c, d, t + i * 0.11, 0.09, { type: 'square', f0: f, f1: f * 1.33, vol: 0.25, lp: 6000 }); }
    } },
    milestone: { dur: 1.0, peak: 0.55, fn: (c, d, t) => {
      [784, 988, 1175, 1568].forEach((f, i) => osc(c, d, t + i * 0.06, 0.16, { type: 'square', f0: f, vol: 0.35, lp: 4500 }));
      bell(c, d, t + 0.26, 2093, 0.6, 0.7);
    } },
    clang: { dur: 0.7, peak: 0.6, fn: (c, d, t) => { // 鉄かぶと「カキーン」
      bell(c, d, t, 1760, 0.6, 1); bell(c, d, t, 2349, 0.5, 0.6); noise(c, d, t, 0.04, { type: 'highpass', f0: 3000, vol: 0.8, attack: 0.001 });
    } },
    tnt: { dur: 1.6, peak: 0.95, fn: (c, d, t) => { // ダイナマイト「ドカーン」
      gunshot(c, d, t, 2.2);
      noise(c, d, t, 1.3, { type: 'lowpass', f0: 900, f1: 120, q: 0.6, vol: 1, attack: 0.005 });
      osc(c, d, t, 0.9, { f0: 90, f1: 28, vol: 1 });
      noise(c, d, t + 0.15, 0.8, { type: 'bandpass', f0: 2500, f1: 600, q: 0.7, vol: 0.25, attack: 0.05 });
    } },
    skillReady: { dur: 0.6, peak: 0.45, fn: (c, d, t) => { [1047, 1319, 1568].forEach((f, i) => bell(c, d, t + i * 0.06, f, 0.4, 0.6)); } },
    skill: { dur: 1.2, peak: 0.8, fn: (c, d, t) => {
      noise(c, d, t, 0.35, { type: 'bandpass', f0: 300, f1: 5000, q: 1, vol: 0.6, attack: 0.1 });
      brass(c, d, t + 0.25, [392, 494, 587, 784], 0.7, 0.8); bell(c, d, t + 0.25, 1568, 0.8, 0.6);
    } },
    timestop: { dur: 1.4, peak: 0.6, fn: (c, d, t) => { bell(c, d, t, 523, 1.3, 1); bell(c, d, t + 0.05, 784, 1.1, 0.6); osc(c, d, t, 1.2, { f0: 220, f1: 110, vol: 0.4 }); } },
    skillEnd: { dur: 0.4, peak: 0.35, fn: (c, d, t) => { osc(c, d, t, 0.3, { f0: 880, f1: 440, vol: 0.5 }); } },
    slow: { dur: 0.6, peak: 0.4, fn: (c, d, t) => { noise(c, d, t, 0.5, { type: 'lowpass', f0: 3000, f1: 200, q: 2, vol: 0.7, attack: 0.02 }); osc(c, d, t, 0.5, { f0: 300, f1: 80, vol: 0.3 }); } },
  };

  // 効果音をまとめて波形にする（数十ms）。終わるまでは同じ設計図をその場で鳴らす
  function renderAll() {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.resolve();
    const sr = 44100;
    return Promise.all(Object.entries(D).map(([name, d]) => {
      const oc = new OAC(1, Math.ceil(sr * d.dur), sr);
      d.fn(oc, oc.destination, 0);
      return oc.startRendering().then((buf) => {
        const ch = buf.getChannelData(0);
        let pk = 0;
        for (let i = 0; i < ch.length; i++) pk = Math.max(pk, Math.abs(ch[i]));
        const k = pk > 0 ? d.peak / pk : 1;
        for (let i = 0; i < ch.length; i++) ch[i] *= k;
        stats[name] = { peak: pk, len: ch.length };
        BUF[name] = buf;
      });
    }));
  }

  function makeReverb(c, sec = 1.6) {
    const len = Math.floor(c.sampleRate * sec);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let s = 777 + ch;
      for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 1073741823.5 - 1) * Math.pow(1 - i / len, 3); }
    }
    const cv = c.createConvolver(); cv.buffer = ir;
    return cv;
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); // 音が重なっても割れにくく
    comp.threshold.value = -10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    master = ac.createGain(); master.gain.value = 0.9;
    comp.connect(master); master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? SFX_VOL : 0; sfxBus.connect(comp);
    musicBus = ac.createGain(); musicBus.gain.value = bgmOn ? BGM_VOL : 0; musicBus.connect(comp);
    const rev = makeReverb(ac);
    revIn = ac.createGain(); revIn.gain.value = 1;
    const revOut = ac.createGain(); revOut.gain.value = 0.5;
    revIn.connect(rev); rev.connect(revOut); revOut.connect(comp);
    renderAll().then(() => { S.loaded = true; });
    setTimeout(() => Music.prepare(), 0);
  }
  function setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.value = on ? SFX_VOL : 0; }
  function setBgm(on) { bgmOn = on; if (musicBus) musicBus.gain.value = on ? BGM_VOL : 0; }

  // 鳴らす：rate=速さ(音程)  pan=左右  rev=残響の量
  function play(name, o = {}) {
    if (!ac || !sfxOn || ac.state !== 'running') return;
    const t = ac.currentTime + (o.when || 0);
    const g = ac.createGain(); g.gain.value = o.vol === undefined ? 1 : o.vol;
    let out = g;
    if (ac.createStereoPanner && o.pan) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    out.connect(sfxBus);
    if (revIn) { const rs = ac.createGain(); rs.gain.value = o.rev === undefined ? 0.12 : o.rev; out.connect(rs); rs.connect(revIn); }
    if (BUF[name]) {
      const s = ac.createBufferSource(); s.buffer = BUF[name];
      s.playbackRate.value = o.rate || 1;
      s.connect(g); s.start(t);
    } else if (D[name]) {
      const tmp = ac.createGain(); tmp.gain.value = D[name].peak * 0.6; tmp.connect(g);
      D[name].fn(ac, tmp, t);
    }
  }
  const jitter = (a) => 1 + (Math.random() * 2 - 1) * a;

  const S = {
    init, setSfx, setBgm, play, stats, loaded: false, // loaded：効果音の波形化が終わった
    get ctx() { return ac; },
    shot(weapon, pan = 0) { play(weapon === 'water' ? 'water' : 'shot', { rate: jitter(0.04), pan: pan * 0.4, rev: 0.18 }); },
    // 連続で当てるほど音程が五音音階で上がっていく
    hit(weapon, combo = 0) { play('hit', { rate: Math.pow(2, pent[Math.min(combo, pent.length - 1)] / 12) * (weapon === 'water' ? 0.92 : 1) }); },
    marker(kind) { play('marker'); if (kind === 'crit' || kind === 'boss') play('crit', { when: 0.01, rev: 0.25 }); },
    cover(weapon) { play('cover', { rate: jitter(0.08) }); if (weapon !== 'water' && Math.random() < 0.45) play('ricochet', { rate: jitter(0.15), rev: 0.3, when: 0.02 }); },
    miss() { play('miss', { rate: jitter(0.1) }); },
    coin(i = 0) { play('coin', { rate: 1 + i * 0.06, vol: 0.7 }); },
    bonus() { play('bonus'); },
    boss() { play('boss', { rev: 0.3 }); },
    alert() { play('alert', { rev: 0.25 }); },
    tele() { play('tele', { rev: 0.3 }); },
    step(i) { play('step', { rate: i % 2 ? 0.88 : 1.06 }); },
    ui() { play('ui'); },
    tick(urgent) { play(urgent ? 'tickU' : 'tick'); },
    ready() { play('ready', { rev: 0.25 }); },
    draw() { play('draw', { rev: 0.35 }); },
    fever() { play('fever', { rev: 0.25 }); },
    comboBreak() { play('comboBreak'); },
    callout(level) { play('callout', { rate: Math.pow(2, (level * 3) / 12) }); },
    timeUp() { play('timeUp', { rev: 0.3 }); },
    stamp() { play('stamp', { rev: 0.2 }); },
    fanfare() { play('fanfare', { rev: 0.35 }); },
    civilian(kind) { play(kind === 'chicken' ? 'cluck' : 'civilian'); },
    swish() { play('swish'); },
    star(i = 0) { play('star', { rate: Math.pow(2, (i * 4) / 12), rev: 0.25 }); },
    buy() { play('buy', { rev: 0.3 }); },
    target(id) { play(id === 'gold' ? 'goldplate' : id === 'can' ? 'can' : 'glass', { rate: jitter(0.06), rev: 0.25 }); },
    jumperAlert() { play('jumperAlert'); },
    enemyShot() { play('enemyShot', { rev: 0.25 }); },
    cutin() { play('cutin', { rev: 0.35 }); },
    premo(level) { for (let i = 0; i <= Math.min(level, 3); i++) play('premo', { when: i * 0.32, rate: 1 + level * 0.06, rev: 0.3 }); },
    coinRain() { play('coinRain', { rev: 0.2 }); },
    milestone(level) { play('milestone', { rate: Math.pow(2, Math.min(level, 6) * 2 / 12), rev: 0.25 }); },
    slow() { play('slow'); },
    clang() { play('clang', { rate: jitter(0.05), rev: 0.3 }); },
    tnt() { play('tnt', { rev: 0.35 }); },
    skillReady() { play('skillReady', { rev: 0.25 }); },
    skill(id) { play(id === 'timestop' ? 'timestop' : 'skill', { rev: 0.35 }); },
    skillEnd() { play('skillEnd'); },
  };

  // ---------------------------------------------------------------- BGM
  const SR = 22050;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // コード進行（8 小節）：Am Am Dm E | Am G F-E Am
  const CH = {
    Am: { b: 45, n: [57, 60, 64] }, Dm: { b: 38, n: [62, 65, 69] }, E: { b: 40, n: [56, 59, 64] },
    G: { b: 43, n: [55, 59, 62] }, F: { b: 41, n: [53, 57, 60] },
  };
  const PROG = [['Am'], ['Am'], ['Dm'], ['E'], ['Am'], ['G'], ['F', 'E'], ['Am']];
  // 口笛のメロディ（8 分音符ごと、null は伸ばす/休み）
  const MEL = [
    76, null, 81, null, 83, 84, 83, 81,
    76, null, null, null, null, null, 74, 76,
    77, null, 81, null, 86, null, 84, 81,
    83, null, 80, null, 76, null, null, null,
    76, null, 81, null, 83, 84, 86, 88,
    86, null, 83, null, 79, null, 81, 83,
    84, null, 81, null, 83, null, 80, null,
    81, null, null, null, null, null, null, null,
  ];
  function pluck(L, R, start, freq, dur, amp, pan, bright) {
    const N = Math.max(2, Math.round(SR / freq));
    const buf = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = prev + bright * (r - prev); buf[i] = prev; }
    const n = Math.floor(dur * SR), len = L.length;
    const gl = amp * (1 - pan) * 0.5, gr = amp * (1 + pan) * 0.5;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[idx];
      const nx = (idx + 1) % N;
      buf[idx] = 0.4985 * (y + buf[nx]);
      idx = nx;
      const k = (start + i) % len; // ループの頭に回り込ませて継ぎ目をなくす
      const fade = i > n - 200 ? (n - i) / 200 : 1;
      L[k] += y * gl * fade; R[k] += y * gr * fade;
    }
  }
  function whistle(L, R, start, f, dur, amp, pan) {
    const n = Math.floor(dur * SR), len = L.length;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const vib = t > 0.09 ? Math.sin(2 * Math.PI * 5.6 * t) * 0.007 : 0;
      ph += 2 * Math.PI * f * (1 + vib) / SR;
      const env = Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.06);
      const v = (Math.sin(ph) + 0.06 * Math.sin(2 * ph)) * env * amp + (Math.random() * 2 - 1) * 0.008 * env;
      const k = (start + i) % len;
      L[k] += v * (1 - pan) * 0.5; R[k] += v * (1 + pan) * 0.5;
    }
  }
  function block(L, R, start, f, amp) { // 蹄の「パカッ」
    const n = Math.floor(0.04 * SR), len = L.length;
    for (let i = 0; i < n; i++) {
      const t = i / SR, e = Math.exp(-t / 0.008);
      const v = (Math.sin(2 * Math.PI * f * t) * 0.8 + (Math.random() * 2 - 1) * 0.3 * Math.exp(-t / 0.002)) * e * amp;
      const k = (start + i) % len; L[k] += v * 0.9; R[k] += v * 1.1;
    }
  }
  function shaker(L, R, start, amp) {
    const n = Math.floor(0.03 * SR), len = L.length;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.random() * 2 - 1, hp = r - prev; prev = r;
      const v = hp * Math.sin(Math.PI * i / n) * amp;
      const k = (start + i) % len; L[k] += v * 1.2; R[k] += v * 0.8;
    }
  }
  function synthLoop(bpm, opts = {}) {
    const beat = 60 / bpm, e8 = beat / 2;
    const len = Math.round(8 * 4 * beat * SR);
    const L = new Float32Array(len), R = new Float32Array(len);
    const at = (sec) => Math.round(sec * SR);
    PROG.forEach((chs, bar) => {
      for (let b = 0; b < 4; b++) {
        const ch = CH[chs.length > 1 ? chs[b < 2 ? 0 : 1] : chs[0]];
        const t0 = (bar * 4 + b) * beat;
        if (b % 2 === 0) pluck(L, R, at(t0), mtof(b === 0 ? ch.b : ch.b + 7), beat * 1.8, 0.55, 0, 0.35); // ベース「ズン」
        else ch.n.forEach((m, i) => pluck(L, R, at(t0 + i * 0.012), mtof(m), beat * 1.2, 0.2, -0.35, 0.7)); // ギター「チャッ」
        if (b === 3) ch.n.forEach((m, i) => pluck(L, R, at(t0 + e8 + (2 - i) * 0.01), mtof(m + 12), beat * 0.6, 0.09, -0.3, 0.8));
        // 蹄：パカ・パカ
        block(L, R, at(t0), b % 2 ? 1150 : 900, opts.drums || 0.32);
        block(L, R, at(t0 + e8 * 0.66), 1300, (opts.drums || 0.32) * 0.6);
        if (opts.shaker) shaker(L, R, at(t0 + e8), opts.shaker);
      }
    });
    if (opts.melody !== false) {
      for (let i = 0; i < MEL.length; i++) {
        if (MEL[i] === null) continue;
        let j = i + 1;
        while (j < MEL.length && MEL[j] === null && j - i < 6) j++;
        whistle(L, R, at(i * e8), mtof(MEL[i]), (j - i) * e8 * 0.92, 0.2, 0.25);
      }
    }
    let pk = 0;
    for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const k = 0.85 / (pk || 1);
    for (let i = 0; i < len; i++) { L[i] = Math.tanh(L[i] * k * 1.1); R[i] = Math.tanh(R[i] * k * 1.1); }
    return { L, R, len };
  }

  const Music = {
    timer: null, loops: {}, cur: null, curKey: null, startedAt: 0, mode: 'game',
    prepare() {
      if (!ac || this.loops.game || this.loops.pending) return;
      const t0 = performance.now();
      const mk = (bpm, o) => {
        const d = synthLoop(bpm, o);
        const b = ac.createBuffer(2, d.len, SR);
        b.getChannelData(0).set(d.L); b.getChannelData(1).set(d.R);
        return b;
      };
      // 1 曲ずつ間をあけて作る（最初のタップで画面が止まらないように）
      const jobs = [['title', 96, { drums: 0.18 }], ['game', 116, { drums: 0.32 }], ['fever', 142, { drums: 0.4, shaker: 0.22 }]];
      if (this.wantKey === 'game') jobs.unshift(jobs.splice(1, 1)[0]);
      this.loops.pending = true;
      const next = () => {
        const j = jobs.shift();
        if (!j) { delete this.loops.pending; this.prepMs = Math.round(performance.now() - t0); return; }
        this.loops[j[0]] = mk(j[1], j[2]);
        if (this.timer && !this.cur && this.loops[this.wantKey]) this._play(this.wantKey);
        setTimeout(next, 250);
      };
      next();
    },
    start(mode = 'game') {
      this.mode = mode;
      this.timer = true;
      this.wantKey = mode === 'title' ? 'title' : 'game';
      if (!ac) return;
      if (!this.loops.game && !this.loops.pending) { this.prepare(); }
      this._play(this.wantKey);
    },
    stop() {
      this.timer = null;
      if (this.cur) { const c = this.cur; const t = ac.currentTime; c.g.gain.setTargetAtTime(0, t, 0.05); c.s.stop(t + 0.3); }
      this.cur = null; this.curKey = null;
    },
    setTempo(bpm) { if (this.timer) this._play(bpm >= 130 ? 'fever' : this.mode === 'title' ? 'title' : 'game'); },
    _play(key) {
      if (!ac || !this.loops[key] || this.curKey === key) return;
      const t = ac.currentTime;
      let offset = 0;
      if (this.cur) { // 曲の同じ位置からテンポ違いへ乗り換える
        const prev = this.loops[this.curKey];
        const pos = ((t - this.startedAt) % prev.duration) / prev.duration;
        offset = pos * this.loops[key].duration;
        const c = this.cur; c.g.gain.setTargetAtTime(0, t, 0.06); c.s.stop(t + 0.4);
      }
      const s = ac.createBufferSource(); s.buffer = this.loops[key]; s.loop = true;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(1, t, 0.05);
      s.connect(g); g.connect(musicBus);
      const rs = ac.createGain(); rs.gain.value = 0.15; g.connect(rs); rs.connect(revIn);
      s.start(t, offset);
      this.startedAt = t - offset;
      this.cur = { s, g }; this.curKey = key;
    },
  };
  S.music = Music;
  S._synthLoop = synthLoop; // テスト用
  return S;
})();
