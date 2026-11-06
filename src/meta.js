// やり込み要素：デイリーミッション・ランキング・メダルとショップ（見た目だけのスキン）
// 保存データ（save）を受け取って更新するだけの純粋な処理。描画は game.js。
window.PH_META = (() => {
  'use strict';
  function todayKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // 日付から決まる 3 つのミッション（同じ日は誰でも同じ）
  function daily(save, C, key = todayKey()) {
    if (!save.daily || save.daily.key !== key) {
      const pool = C.missions.pool.slice();
      let h = hash(key);
      const list = [];
      while (list.length < C.missions.perDay && pool.length) {
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        list.push({ id: pool.splice(h % pool.length, 1)[0].id, prog: 0, done: false });
      }
      save.daily = { key, list };
    }
    return save.daily;
  }
  const defOf = (C, id) => C.missions.pool.find((m) => m.id === id);
  function label(C, m) { const d = defOf(C, m.id); return d.text.replace('{n}', d.n); }

  // 1 回のプレイ結果をミッションに反映。達成したものを返す（報酬は自動で受け取り）
  function applyRun(save, C, run) {
    const d = daily(save, C);
    const done = [];
    for (const m of d.list) {
      if (m.done) continue;
      const def = defOf(C, m.id);
      const v = run[def.stat] || 0;
      m.prog = def.mode === 'max' ? Math.max(m.prog, v) : m.prog + v;
      if (m.prog >= def.n) { m.prog = def.n; m.done = true; save.medals = (save.medals || 0) + def.reward; done.push({ text: label(C, m), reward: def.reward }); }
    }
    return done;
  }

  // ランキング（端末内の上位）。今回の順位（圏外は -1）を返す
  function addRanking(save, C, entry) {
    const list = (save.ranking || []).concat([entry]);
    list.sort((a, b) => b.score - a.score);
    save.ranking = list.slice(0, C.rankingSize);
    return save.ranking.indexOf(entry);
  }

  // ショップ：買う／装備する
  function shopTap(save, C, id) {
    const sk = C.skins.find((s) => s.id === id);
    if (!sk) return 'none';
    save.owned = save.owned || ['classic'];
    if (save.owned.includes(id)) { save.skin = id; return 'equip'; }
    if ((save.medals || 0) < sk.price) return 'short';
    save.medals -= sk.price; save.owned.push(id); save.skin = id;
    return 'buy';
  }
  // スキル：持っていなければ買う（空きがあればそのままセット）、持っていれば付け外し
  function skillTap(save, C, id) {
    const sk = C.skills.list.find((k) => k.id === id);
    if (!sk) return 'none';
    save.skillsOwned = save.skillsOwned || []; save.skillSlots = save.skillSlots || [];
    if (!save.skillsOwned.includes(id)) {
      if ((save.medals || 0) < sk.price) return 'short';
      save.medals -= sk.price; save.skillsOwned.push(id);
      if (save.skillSlots.length < C.skills.slots) save.skillSlots.push(id);
      return 'buy';
    }
    const i = save.skillSlots.indexOf(id);
    if (i >= 0) { save.skillSlots.splice(i, 1); return 'unequip'; }
    if (save.skillSlots.length >= C.skills.slots) return 'full';
    save.skillSlots.push(id);
    return 'equip';
  }
  // 帽子
  function hatOwned(save, id) { return id === 'hat_default' || (save.hats || []).includes(id); }
  function hatTap(save, C, id) {
    const ht = C.hats.find((h) => h.id === id);
    if (!ht) return 'none';
    if (hatOwned(save, id)) { save.hat = id; return 'equip'; }
    if ((save.medals || 0) < ht.price) return 'short';
    save.medals -= ht.price; save.hats = (save.hats || []).concat([id]); save.hat = id;
    return 'buy';
  }
  // ログインボーナス：今日まだなら内容を返す（連続日数で 1〜7 日目）
  function loginCheck(save, C, now = new Date()) {
    const key = todayKey(now);
    if (save.lastLogin === key) return null;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const streak = save.lastLogin === todayKey(y) ? (save.streak || 0) + 1 : 1;
    const day = ((streak - 1) % 7) + 1;
    let item = null;
    if (day === 7) item = C.login.day7Items.find((h) => !hatOwned(save, h)) || null;
    return { key, streak, day, reward: C.login.rewards[day - 1], item, claimed: false };
  }
  function claimLogin(save, C, lb) {
    save.lastLogin = lb.key; save.streak = lb.streak;
    save.medals = (save.medals || 0) + lb.reward;
    if (lb.item) save.hats = (save.hats || []).concat([lb.item]);
  }
  return { todayKey, daily, label, defOf, applyRun, addRanking, shopTap, skillTap, hatOwned, hatTap, loginCheck, claimLogin };
})();
