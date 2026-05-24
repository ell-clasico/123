/* ==========================================================
   PRO-KADRO.JS — Profesyonel kadro algoritması + karakteristikler
   Not: Mevcut fonksiyonlara minimum müdahale için kadro motorunu burada override eder.
========================================================== */

const PRO_TRAITS = [
  { id: "playmaker", label: "🎮 Oyun Kurucu", group: "creator", stats: { pas: 10, oyunGorusu: 14 } },
  { id: "finisher", label: "🎯 Bitirici", group: "finisher", stats: { sut: 16, oyunGorusu: 5 } },
  { id: "pace", label: "💨 Sprinter", group: "runner", stats: { hiz: 16, kondisyon: 6 } },
  { id: "press", label: "🔥 Presçi", group: "worker", stats: { kondisyon: 14, fizik: 6, defans: 5 } },
  { id: "destroyer", label: "🛡️ Top Kazanıcı", group: "defender", stats: { defans: 14, fizik: 8 } },
  { id: "leader", label: "👑 Lider", group: "leader", stats: { oyunGorusu: 8, pas: 5, defans: 4 } },
  { id: "boxToBox", label: "🏃 Box-to-Box", group: "engine", stats: { kondisyon: 12, pas: 5, defans: 5 } },
  { id: "targetMan", label: "💪 Pivot Santrafor", group: "target", stats: { fizik: 14, sut: 7 } },
  { id: "dribbler", label: "✨ Driplingci", group: "creator", stats: { hiz: 8, pas: 5, oyunGorusu: 5 } },
  { id: "sweeper", label: "🧱 Süpürücü", group: "defender", stats: { defans: 12, oyunGorusu: 7 } },
  { id: "keeperCommander", label: "🧤 Kale Lideri", group: "goalkeeper", stats: { defans: 10, oyunGorusu: 8 } }
];
window.PRO_TRAITS = PRO_TRAITS;

function proTraitIds(player) {
  const raw = player?.traits || player?.characterTraits || [];
  return Array.isArray(raw) ? raw.slice(0, 3) : [];
}
function proTraitObjects(player) {
  const ids = proTraitIds(player);
  return PRO_TRAITS.filter(t => ids.includes(t.id));
}
function proTraitLabels(player) {
  return proTraitObjects(player).map(t => t.label);
}
function proHasTrait(player, id) { return proTraitIds(player).includes(id); }
function proClamp(n, min=0, max=100) { return Math.max(min, Math.min(max, Number(n)||0)); }
function proAvg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function proPlayerById(id) { return (CACHE.players || []).find(p => (p.id || p.name) === id || p.name === id); }
function proCanonicalPos(pos) { return normalizePos(pos) || "CM"; }
function proRegion(pos) {
  pos = proCanonicalPos(pos);
  if (["GK"].includes(pos)) return "GK";
  if (["CB","LB","RB","CBX"].includes(pos)) return "DEF";
  if (["CM","CMX"].includes(pos)) return "MID";
  return "ATK";
}
function proSlotCanon(pos) {
  if (pos === "CBX") return "CB";
  if (pos === "CMX") return "CM";
  if (pos === "STX") return "ST";
  return pos;
}
function proTraitStatBoost(stats, player) {
  const out = { ...(stats || {}) };
  for (const t of proTraitObjects(player)) {
    for (const [k,v] of Object.entries(t.stats || {})) out[k] = proClamp((out[k] || 0) + v, 0, 99);
  }
  return out;
}
function proStatsFor(player) {
  const base = player?.matchStats || applyMatchBonus(player || {}, player?.stats || {});
  return proTraitStatBoost(base, player);
}
function proMetric(player) {
  const stats = proStatsFor(player);
  const ovr = player?.matchOVR || getOVR_withBonus(player || {});
  const name = player?.name || "";
  const ratings = (CACHE.ratings || []).filter(r => r.to === name || r.player === name || r.name === name);
  const avgRating = ratings.length ? ratings.reduce((s,r)=>s + Number(r.value || r.puan || r.rating || 0),0)/ratings.length : 0;
  const goals = (CACHE.ga || []).filter(g => g.name === name).reduce((s,g)=>s + Number(g.gol || g.goals || 0),0);
  const wins = (CACHE.winners || []).reduce((s,w)=>s + (Array.isArray(w.players) && w.players.includes(name) ? 1 : 0),0);
  const form = proClamp((avgRating * 7) + goals * 4 + wins * 3 + Math.max(0, ovr - 55) * .9, 0, 100);
  return {
    name, ovr, form, goals, wins,
    attack: proClamp((stats.sut||0)*.5 + (stats.hiz||0)*.25 + (stats.pas||0)*.15 + (stats.oyunGorusu||0)*.1),
    defense: proClamp((stats.defans||0)*.55 + (stats.fizik||0)*.25 + (stats.kondisyon||0)*.2),
    midfield: proClamp((stats.pas||0)*.38 + (stats.oyunGorusu||0)*.34 + (stats.kondisyon||0)*.18 + (stats.fizik||0)*.1),
    pace: proClamp((stats.hiz||0)*.7 + (stats.kondisyon||0)*.3),
    physical: proClamp((stats.fizik||0)*.6 + (stats.kondisyon||0)*.4),
    vision: proClamp((stats.oyunGorusu||0)*.6 + (stats.pas||0)*.4),
    finishing: proClamp((stats.sut||0)*.75 + (stats.oyunGorusu||0)*.25),
    traits: proTraitIds(player)
  };
}
function proPositionFit(player, slot) {
  const main = proCanonicalPos(player?.mainPos);
  const sub = proCanonicalPos(player?.subPos);
  const canon = proSlotCanon(slot);
  let score = 0;
  if (main === canon) score += 22;
  else if (sub === canon) score += 13;
  else if (proRegion(main) === proRegion(canon)) score += 6;
  else score -= 8;
  if (canon === "ST" && (proHasTrait(player,"finisher") || proHasTrait(player,"targetMan"))) score += 8;
  if (["LW","RW"].includes(canon) && (proHasTrait(player,"pace") || proHasTrait(player,"dribbler"))) score += 8;
  if (canon === "CM" && (proHasTrait(player,"playmaker") || proHasTrait(player,"boxToBox") || proHasTrait(player,"leader"))) score += 8;
  if (["CB","LB","RB"].includes(canon) && (proHasTrait(player,"destroyer") || proHasTrait(player,"sweeper") || proHasTrait(player,"press"))) score += 8;
  if (canon === "GK" && proHasTrait(player,"keeperCommander")) score += 10;
  return score;
}
function proEffectiveScore(player, slot, mode="balanced") {
  const m = proMetric(player);
  const pos = proSlotCanon(slot);
  const weights = {
    ST: { attack:.42, finishing:.28, pace:.13, physical:.07, vision:.1 },
    LW: { pace:.28, attack:.3, vision:.18, finishing:.14, physical:.1 },
    RW: { pace:.28, attack:.3, vision:.18, finishing:.14, physical:.1 },
    CM: { midfield:.44, vision:.26, defense:.12, attack:.1, physical:.08 },
    CB: { defense:.46, physical:.25, vision:.13, pace:.1, midfield:.06 },
    LB: { defense:.32, pace:.25, physical:.17, midfield:.14, attack:.12 },
    RB: { defense:.32, pace:.25, physical:.17, midfield:.14, attack:.12 },
    GK: { defense:.45, vision:.2, physical:.2, ovr:.15 }
  }[pos] || { ovr: 1 };
  let roleScore = 0;
  for (const [k,w] of Object.entries(weights)) roleScore += (m[k] || 0) * w;
  let score = roleScore * .42 + m.ovr * .28 + m.form * .16 + proPositionFit(player, slot) * .14;
  if (mode === "form") score = roleScore*.32 + m.ovr*.22 + m.form*.34 + proPositionFit(player, slot)*.12;
  if (mode === "position") score = roleScore*.38 + m.ovr*.22 + m.form*.10 + proPositionFit(player, slot)*.30;
  if (mode === "competitive") score = roleScore*.36 + m.ovr*.34 + m.form*.18 + proPositionFit(player, slot)*.12;
  return score;
}
function proTeamProfile(ids, posMap, suffix="") {
  const slots = Object.keys(posMap || {}).filter(k => suffix ? k.endsWith(suffix) : !k.endsWith("2"));
  const players = ids.map(proPlayerById).filter(Boolean);
  const metrics = players.map(proMetric);
  const traitGroups = new Set(players.flatMap(p => proTraitObjects(p).map(t => t.group)));
  const score = proAvg(metrics.map(m => m.ovr*.55 + m.form*.2 + m.attack*.08 + m.defense*.08 + m.midfield*.09)) * players.length;
  return {
    count: players.length, score,
    attack: proAvg(metrics.map(m => m.attack)),
    defense: proAvg(metrics.map(m => m.defense)),
    midfield: proAvg(metrics.map(m => m.midfield)),
    pace: proAvg(metrics.map(m => m.pace)),
    vision: proAvg(metrics.map(m => m.vision)),
    form: proAvg(metrics.map(m => m.form)),
    traitCoverage: traitGroups.size,
    leaders: players.filter(p=>proHasTrait(p,"leader")).length,
    creators: players.filter(p=>proHasTrait(p,"playmaker") || proHasTrait(p,"dribbler")).length,
    finishers: players.filter(p=>proHasTrait(p,"finisher") || proHasTrait(p,"targetMan")).length,
    defenders: players.filter(p=>proHasTrait(p,"destroyer") || proHasTrait(p,"sweeper")).length
  };
}
function proTeamImbalance(teamA, teamB, posMap, mode="balanced") {
  const a = proTeamProfile(teamA, posMap, "");
  const b = proTeamProfile(teamB, posMap, "2");
  let score = 0;
  score += Math.abs(a.score - b.score) * 1.1;
  score += Math.abs(a.attack - b.attack) * 4.5;
  score += Math.abs(a.defense - b.defense) * 4.5;
  score += Math.abs(a.midfield - b.midfield) * 4.0;
  score += Math.abs(a.pace - b.pace) * 2.2;
  score += Math.abs(a.form - b.form) * 3.0;
  score += Math.abs(a.traitCoverage - b.traitCoverage) * 10;
  score += Math.abs(a.creators - b.creators) * 8;
  score += Math.abs(a.finishers - b.finishers) * 8;
  score += Math.abs(a.defenders - b.defenders) * 8;
  score += Math.abs(a.leaders - b.leaders) * 5;
  if (mode === "competitive") score += Math.abs((a.attack + a.form) - (b.attack + b.form)) * 2;
  return score;
}
function proBalanceTeams(teamA, teamB, posMap, mode="balanced") {
  const slots = Object.keys(posMap).filter(k => !k.endsWith("2") && k !== "GK");
  function swapSlots(posA, posB) {
    const keyA = posA, keyB = posB + "2";
    const aId = posMap[keyA], bId = posMap[keyB];
    if (!aId || !bId) return false;
    posMap[keyA] = bId; posMap[keyB] = aId;
    const ai = teamA.indexOf(aId), bi = teamB.indexOf(bId);
    if (ai >= 0) teamA[ai] = bId;
    if (bi >= 0) teamB[bi] = aId;
    return { aId, bId, ai, bi, keyA, keyB };
  }
  function undo(s) {
    posMap[s.keyA] = s.aId; posMap[s.keyB] = s.bId;
    if (s.ai >= 0) teamA[s.ai] = s.aId;
    if (s.bi >= 0) teamB[s.bi] = s.bId;
  }
  for (let iter=0; iter<120; iter++) {
    const before = proTeamImbalance(teamA, teamB, posMap, mode);
    let best = null, bestScore = before;
    for (const a of slots) for (const b of slots) {
      const sw = swapSlots(a,b); if (!sw) continue;
      const pa = proPlayerById(posMap[a]), pb = proPlayerById(posMap[b+"2"]);
      const fitPenalty = (100 - proPositionFit(pa,a)) + (100 - proPositionFit(pb,b));
      const after = proTeamImbalance(teamA, teamB, posMap, mode) + Math.max(0, fitPenalty) * .06;
      undo(sw);
      if (after < bestScore - .8) { bestScore = after; best = { a,b }; }
    }
    if (!best) break;
    swapSlots(best.a,best.b);
  }
  return { teamA, teamB, posMap };
}
function proKadroReport(teamA, teamB, posMap) {
  const a = proTeamProfile(teamA, posMap, "");
  const b = proTeamProfile(teamB, posMap, "2");
  const imbalance = proTeamImbalance(teamA, teamB, posMap);
  const balance = proClamp(Math.round(100 - imbalance / 11), 1, 99);
  return { balance, a, b, imbalance };
}
const PRO_KADRO_MODE_INFO = {
  balanced: {
    title: "Profesyonel Dengeli",
    short: "En adil ve genel kullanım için önerilen mod.",
    detail: "OVR, pozisyon uyumu, son form, karakteristik roller, chemistry, hücum/savunma/orta saha dengesi ve takım rol çeşitliliği birlikte hesaplanır.",
    weights: "Denge ağırlığı: toplam güç + pozisyon + form + rol çeşitliliği."
  },
  position: {
    title: "Pozisyon Odaklı",
    short: "Oyuncuları gerçek mevkilerine ve saha rollerine daha sıkı yerleştirir.",
    detail: "Kaleci, stoper, bek, merkez orta saha, kanat ve santrafor dengesi daha yüksek öncelik alır. Yanlış mevkide oynama cezası daha fazladır.",
    weights: "Denge ağırlığı: pozisyon uygunluğu + rol doğruluğu + minimum güç farkı."
  },
  form: {
    title: "Form Odaklı",
    short: "Son performansı yüksek oyuncuların takımları bozmasını engeller.",
    detail: "Son rating, gol katkısı, galibiyet etkisi ve güncel maç formu daha baskın hesaplanır. Genel OVR ikinci planda kalır.",
    weights: "Denge ağırlığı: son form + maç etkisi + toplam güç."
  },
  competitive: {
    title: "Rekabetçi",
    short: "Maçı 50/50’ye en yakın hale getirmeye çalışır.",
    detail: "İki takımın kazanma ihtimalini birbirine yaklaştırmak için güç, form, hücum ve savunma farklarını agresif şekilde azaltır.",
    weights: "Denge ağırlığı: toplam güç farkı + form farkı + hücum/savunma farkı."
  },
  randomBalanced: {
    title: "Rastgele Dengeli",
    short: "Rastgelelik hissi verir ama aşırı dengesiz kadro kurmaz.",
    detail: "Oyunculara kontrollü rastgelelik eklenir. Eğlenceli ve daha az tahmin edilebilir kadro üretir.",
    weights: "Denge ağırlığı: kontrollü rastgelelik + minimum denge koruması."
  }
};

function proKadroCurrentMode() {
  return document.getElementById("proKadroMode")?.value || "balanced";
}

function proKadroModeInfo(mode = proKadroCurrentMode()) {
  return PRO_KADRO_MODE_INFO[mode] || PRO_KADRO_MODE_INFO.balanced;
}

function proKadroTeamNotes(profile, label) {
  const notes = [];
  if (profile.attack >= profile.defense + 7) notes.push(`${label} hücum gücüyle öne çıkıyor.`);
  if (profile.defense >= profile.attack + 7) notes.push(`${label} savunma güvenliğiyle öne çıkıyor.`);
  if (profile.midfield >= 70) notes.push(`${label} orta saha bağlantısı güçlü.`);
  if (profile.form >= 70) notes.push(`${label} form ortalaması yüksek.`);
  if (profile.traitCoverage >= 5) notes.push(`${label} rol çeşitliliği iyi.`);
  if (!notes.length) notes.push(`${label} daha dengeli ve risksiz bir profil veriyor.`);
  return notes;
}

function proKadroDifferenceText(r) {
  const diffs = [
    { key: "Hücum", v: Math.abs(r.a.attack - r.b.attack) },
    { key: "Savunma", v: Math.abs(r.a.defense - r.b.defense) },
    { key: "Orta saha", v: Math.abs(r.a.midfield - r.b.midfield) },
    { key: "Form", v: Math.abs(r.a.form - r.b.form) },
    { key: "Rol çeşitliliği", v: Math.abs(r.a.traitCoverage - r.b.traitCoverage) * 8 }
  ].sort((x,y)=>y.v-x.v);
  const main = diffs[0];
  if (!main || main.v < 4) return "Takımlar ana metriklerde birbirine yakın.";
  return `En belirgin fark: ${main.key}. Bu fark denge skoruna en çok etki eden alan.`;
}

function updateProKadroModeExplain() {
  const box = document.getElementById("proKadroExplain");
  if (!box) return;
  const info = proKadroModeInfo();
  box.innerHTML = `
    <div class="pro-mode-title">${info.title}</div>
    <div class="pro-mode-short">${info.short}</div>
    <div class="pro-mode-detail">${info.detail}</div>
    <div class="pro-mode-weights">${info.weights}</div>
  `;
}

function renderProKadroExplain(result) {
  const box = document.getElementById("proKadroExplain");
  if (!box) return;
  if (!result) return updateProKadroModeExplain();
  const mode = proKadroCurrentMode();
  const info = proKadroModeInfo(mode);
  const r = proKadroReport(result.teamA, result.teamB, result.posMap);
  const aNotes = proKadroTeamNotes(r.a, "A Takımı");
  const bNotes = proKadroTeamNotes(r.b, "B Takımı");
  const winnerGuess = Math.abs(r.a.score - r.b.score) < 20 ? "Kazanma ihtimali dengeli." : (r.a.score > r.b.score ? "A Takımı kağıt üzerinde az farkla önde." : "B Takımı kağıt üzerinde az farkla önde.");
  box.innerHTML = `
    <div class="pro-mode-title">Profesyonel Kadro Analizi — ${info.title}</div>
    <div class="pro-mode-short">Denge skoru <b>%${r.balance}</b>. ${winnerGuess}</div>
    <div class="pro-mode-detail">${info.detail}</div>
    <div class="pro-kadro-report">
      <div class="pro-kadro-metric"><b>${Math.round(r.a.attack)} / ${Math.round(r.b.attack)}</b><span>Hücum A/B</span></div>
      <div class="pro-kadro-metric"><b>${Math.round(r.a.defense)} / ${Math.round(r.b.defense)}</b><span>Savunma A/B</span></div>
      <div class="pro-kadro-metric"><b>${Math.round(r.a.midfield)} / ${Math.round(r.b.midfield)}</b><span>Orta saha A/B</span></div>
      <div class="pro-kadro-metric"><b>${Math.round(r.a.form)} / ${Math.round(r.b.form)}</b><span>Form A/B</span></div>
      <div class="pro-kadro-metric"><b>${r.a.traitCoverage} / ${r.b.traitCoverage}</b><span>Rol çeşitliliği A/B</span></div>
      <div class="pro-kadro-metric"><b>${r.a.creators + r.a.finishers + r.a.defenders} / ${r.b.creators + r.b.finishers + r.b.defenders}</b><span>Ana rol sayısı A/B</span></div>
    </div>
    <div class="pro-kadro-notes">
      <div><b>A Takımı</b><ul>${aNotes.map(x=>`<li>${x}</li>`).join("")}</ul></div>
      <div><b>B Takımı</b><ul>${bNotes.map(x=>`<li>${x}</li>`).join("")}</ul></div>
    </div>
    <div class="pro-mode-weights">${proKadroDifferenceText(r)} ${info.weights}</div>
  `;
}

// Override: Kadro motoru artık profesyonel skorla çalışır.
function buildBalancedTeams(selectedPlayers, gkA, gkB, matchSize = 8) {
  let POS_ORDER;
  if (matchSize === 6)       POS_ORDER = ["ST", "CM", "CB", "LB", "RB"];
  else if (matchSize === 7)  POS_ORDER = ["ST", "LW", "RW", "CM", "CB", "CBX"];
  else if (matchSize === 8)  POS_ORDER = ["ST", "LW", "RW", "CM", "CB", "LB", "RB"];
  else if (matchSize === 9)  POS_ORDER = ["ST", "LW", "RW", "CM", "CMX", "CB", "LB", "RB"];
  else if (matchSize === 10) POS_ORDER = ["ST", "LW", "RW", "CM", "CMX", "CB", "CBX", "LB", "RB"];
  else if (matchSize === 11) POS_ORDER = ["ST", "STX", "LW", "RW", "CM", "CMX", "CB", "CBX", "LB", "RB"];
  else                       POS_ORDER = ["ST", "LW", "RW", "CM", "CB", "LB", "RB"];

  const mode = document.getElementById("proKadroMode")?.value || "balanced";
  const all = selectedPlayers.map(proPlayerById).filter(Boolean);
  all.forEach(p => preparePlayerForMatch(p));
  const pool = all.filter(p => (p.id || p.name) !== gkA && (p.id || p.name) !== gkB);
  const teamA = [gkA], teamB = [gkB];
  const posMap = { GK: gkA, GK2: gkB };
  const used = new Set([gkA, gkB]);

  function playerId(p) { return p.id || p.name; }
  function candidateScore(p, slot, targetTeam) {
    let score = proEffectiveScore(p, slot, mode);
    const tentativeA = targetTeam === "A" ? [...teamA, playerId(p)] : teamA;
    const tentativeB = targetTeam === "B" ? [...teamB, playerId(p)] : teamB;
    score -= proTeamImbalance(tentativeA, tentativeB, posMap, mode) * .035;
    if (mode === "randomBalanced") score += Math.random() * 8;
    return score;
  }

  for (const slot of POS_ORDER) {
    const candidates = pool.filter(p => !used.has(playerId(p))).sort((a,b)=>candidateScore(b,slot,"A")-candidateScore(a,slot,"A"));
    if (!candidates.length) continue;
    const pA = candidates[0];
    used.add(playerId(pA)); posMap[slot] = playerId(pA); teamA.push(playerId(pA));

    const candidatesB = pool.filter(p => !used.has(playerId(p))).sort((a,b)=>candidateScore(b,slot,"B")-candidateScore(a,slot,"B"));
    if (!candidatesB.length) continue;
    const pB = candidatesB[0];
    used.add(playerId(pB)); posMap[slot + "2"] = playerId(pB); teamB.push(playerId(pB));
  }

  // Artan oyuncu varsa en az bozan takıma yerleştir.
  pool.filter(p => !used.has(playerId(p))).forEach(p => {
    const scoreA = proTeamImbalance([...teamA, playerId(p)], teamB, posMap, mode);
    const scoreB = proTeamImbalance(teamA, [...teamB, playerId(p)], posMap, mode);
    if (scoreA <= scoreB) teamA.push(playerId(p)); else teamB.push(playerId(p));
  });

  const result = proBalanceTeams(teamA, teamB, posMap, mode);
  result.proMeta = proKadroReport(result.teamA, result.teamB, result.posMap);
  setTimeout(()=>renderProKadroExplain(result), 0);
  return result;
}

// Build butonunu pro metadata kaydedecek şekilde yeniden bağla.
function attachProBuildButton() {
  const btn = document.getElementById("buildBtn");
  if (!btn || btn.__proBound) return;
  btn.__proBound = true;
  btn.onclick = async () => {
    const matchSize = getMatchSize();
    const limit = matchSize * 2;
    updateMatchLabelUI();
    if (selectedPlayers.length !== limit) return alert(`${limit} oyuncu seçmelisin! (${matchSize}/${matchSize})`);
    const gkA = document.querySelector("#gkASelect").dataset.value;
    const gkB = document.querySelector("#gkBSelect").dataset.value;
    if (!gkA || !gkB) return alert("Kalecileri seç!");
    const result = buildBalancedTeams(selectedPlayers, gkA, gkB, matchSize);
    printTeamOVRs(result.teamA, result.teamB);
    window.lastResult = result;
    const dataToSave = {
      teamA: clean(result.teamA), teamB: clean(result.teamB), posMap: clean(result.posMap), matchSize, limit,
      proKadroMode: document.getElementById("proKadroMode")?.value || "balanced",
      proKadroMeta: result.proMeta || proKadroReport(result.teamA, result.teamB, result.posMap),
      createdAt: new Date().toISOString()
    };
    const _saha = document.getElementById("matchSahaInput")?.value || "";
    const _tarih = document.getElementById("matchTarihInput")?.value || "";
    const _saat = document.getElementById("matchSaatInput")?.value || "";
    const _konum = document.getElementById("matchKonumInput")?.value || "";
    await C("weekNote").doc("latest").set({ saha: _saha, tarih: _tarih, saat: _saat, konum: _konum, matchSize, timestamp: new Date().toISOString() }, { merge: true });
    await C("haftaninKadro").doc("latest").set(dataToSave);
    localStorage.setItem("hsMatchSize", String(matchSize));
    const attQ = await C("attendance").get();
    await Promise.all(attQ.docs.map(d => d.ref.delete()));
    notify("Profesyonel kadro oluşturuldu!");
  };
}

function renderTraitPicker(containerId, selected = [], onChange) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const selectedSet = new Set((selected || []).slice(0,3));
  box.innerHTML = PRO_TRAITS.map(t => `<button type="button" class="trait-chip ${selectedSet.has(t.id)?"selected":""}" data-trait="${t.id}">${t.label}</button>`).join("");
  box.querySelectorAll(".trait-chip").forEach(chip => {
    chip.onclick = () => {
      const id = chip.dataset.trait;
      if (selectedSet.has(id)) selectedSet.delete(id);
      else {
        if (selectedSet.size >= 3) return notify("En fazla 3 karakteristik seçebilirsin.");
        selectedSet.add(id);
      }
      renderTraitPicker(containerId, Array.from(selectedSet), onChange);
      if (typeof onChange === "function") onChange(Array.from(selectedSet));
    };
  });
  box.dataset.value = JSON.stringify(Array.from(selectedSet));
}
function getTraitPickerValue(containerId) {
  try { return JSON.parse(document.getElementById(containerId)?.dataset.value || "[]").slice(0,3); } catch(_) { return []; }
}
window.renderTraitPicker = renderTraitPicker;
window.getTraitPickerValue = getTraitPickerValue;

function setupGoStep4() {
  const s3 = document.getElementById("setupStep3"), s4 = document.getElementById("setupStep4");
  if (s3) s3.style.display = "none";
  if (s4) s4.style.display = "block";
  renderTraitPicker("setupTraitPicker", []);
}
window.setupGoStep4 = setupGoStep4;

function adminPopulateTraitPlayerSelect() {
  const sel = document.getElementById("adminTraitPlayerSelect");
  if (!sel || !Array.isArray(CACHE.players)) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">Oyuncu seç</option>` + CACHE.players.map(p => `<option value="${p.id || p.name}">${p.name}</option>`).join("");
  if (current) sel.value = current;
}
function adminLoadPlayerTraits() {
  const id = document.getElementById("adminTraitPlayerSelect")?.value;
  const p = proPlayerById(id);
  renderTraitPicker("adminTraitPicker", proTraitIds(p));
}
async function adminSavePlayerTraits() {
  const id = document.getElementById("adminTraitPlayerSelect")?.value;
  if (!id) return notify("Oyuncu seç.");
  const p = proPlayerById(id);
  if (!p) return notify("Oyuncu bulunamadı.");
  const traits = getTraitPickerValue("adminTraitPicker");
  await C("players").doc(p.id || p.name).set({ traits, characterTraits: traits }, { merge: true });
  await refreshCachePartial(["players"]);
  adminPopulateTraitPlayerSelect();
  adminLoadPlayerTraits();
  if (typeof loadPlayers === "function") await loadPlayers();
  notify("Oyuncu karakteristiği güncellendi.");
}
window.adminPopulateTraitPlayerSelect = adminPopulateTraitPlayerSelect;
window.adminLoadPlayerTraits = adminLoadPlayerTraits;
window.adminSavePlayerTraits = adminSavePlayerTraits;

function initProKadroUI() {
  attachProBuildButton();
  const modeSelect = document.getElementById("proKadroMode");
  if (modeSelect && !modeSelect.__proModeBound) {
    modeSelect.__proModeBound = true;
    modeSelect.addEventListener("change", () => {
      updateProKadroModeExplain();
      if (window.lastResult) renderProKadroExplain(window.lastResult);
    });
  }
  updateProKadroModeExplain();
  const me = (CACHE.players || []).find(p => p.name === currentUser);
  renderTraitPicker("profileTraitPicker", proTraitIds(me));
  renderTraitPicker("setupTraitPicker", []);
  adminPopulateTraitPlayerSelect();
  if (document.getElementById("adminTraitPicker")) renderTraitPicker("adminTraitPicker", []);
}
document.addEventListener("DOMContentLoaded", () => setTimeout(initProKadroUI, 300));
setTimeout(initProKadroUI, 1000);
