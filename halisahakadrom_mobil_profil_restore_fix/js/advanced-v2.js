/* ==========================================================
   ADVANCED-V2.JS — Elite özellikler
   Ücretsiz Firebase dostu: ağırlıklı client-side hesaplama + localStorage.
   Rules değiştirmez, mevcut veri modelini bozmaz.
========================================================= */

const ELITE_CACHE = { at: 0, groupId: null, metrics: null, attendance: null };
const ELITE_CACHE_MS = 90 * 1000;

function eliteEsc(v) {
    return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function eliteNum(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

function eliteAvg(arr) {
    const nums = arr.map(Number).filter(Number.isFinite);
    return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
}

function eliteClamp(n, min=0, max=100) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function elitePlayerStats(p) {
    const stats = p?.stats || {};
    const keys = ["hiz","sut","pas","kondisyon","defans","fizik","oyunGorusu"];
    const base = {};
    keys.forEach(k => base[k] = eliteNum(stats[k] ?? p[k], 50));
    return base;
}

function eliteOVR(p) {
    const s = elitePlayerStats(p);
    return eliteClamp((s.hiz + s.sut + s.pas + s.kondisyon + s.defans + s.fizik + s.oyunGorusu) / 7);
}

function eliteRatings(name) {
    return (CACHE.ratings || []).filter(r => r.to === name || r.player === name || r.name === name);
}

function eliteGoals(name) {
    return (CACHE.ga || []).filter(g => g.name === name || g.player === name).reduce((sum,g)=> sum + eliteNum(g.gol ?? g.goals, 0), 0);
}

function eliteWins(name) {
    return (CACHE.winners || []).filter(w => Array.isArray(w.players) ? w.players.includes(name) : (w.name === name || w.player === name || w.winner === name)).reduce((sum,w)=> sum + eliteNum(w.count ?? w.win ?? w.wins, 1), 0);
}

function eliteRecentTrend(name) {
    const rs = eliteRatings(name).slice().sort((a,b)=> new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    const recent = rs.slice(0, 5).map(r => eliteNum(r.score ?? r.value ?? r.rating ?? r.puan, 0));
    const older = rs.slice(5, 10).map(r => eliteNum(r.score ?? r.value ?? r.rating ?? r.puan, 0));
    const diff = eliteAvg(recent) - eliteAvg(older);
    return eliteClamp(50 + diff * 10);
}

function eliteForm(name) {
    const rs = eliteRatings(name).slice(0, 8).map(r => eliteNum(r.score ?? r.value ?? r.rating ?? r.puan, 0));
    const avgRating = eliteAvg(rs) || 5;
    const goals = eliteGoals(name);
    const wins = eliteWins(name);
    const trend = eliteRecentTrend(name);
    return eliteClamp(avgRating * 8 + Math.min(goals, 10) * 2 + Math.min(wins, 8) * 2 + (trend - 50) * .35);
}

function eliteMarketValue(m) {
    const raw = 0.7 + (m.ovr * 0.12) + (m.form * 0.08) + (m.goals * 0.18) + (m.wins * 0.22) + (m.consistency * 0.04);
    return Math.max(1, Math.round(raw * 10) / 10);
}

function eliteMetrics(force = false) {
    if (!force && ELITE_CACHE.groupId === currentGroupId && ELITE_CACHE.metrics && Date.now() - ELITE_CACHE.at < ELITE_CACHE_MS) return ELITE_CACHE.metrics;
    const players = (CACHE.players || []).filter(p => p && p.name && !p.deleted);
    const data = players.map(p => {
        const s = elitePlayerStats(p);
        const ratings = eliteRatings(p.name);
        const ratingVals = ratings.map(r => eliteNum(r.score ?? r.value ?? r.rating ?? r.puan, 0)).filter(Boolean);
        const avgRating = eliteAvg(ratingVals) || 5;
        const variance = eliteAvg(ratingVals.map(v => Math.pow(v - avgRating, 2)));
        const consistency = eliteClamp(100 - variance * 9);
        const goals = eliteGoals(p.name);
        const wins = eliteWins(p.name);
        const ovr = eliteOVR(p);
        const form = eliteForm(p.name);
        const position = normalizePos(p.mainPos) || "CM";
        const attack = eliteClamp(s.sut * .42 + s.hiz * .18 + s.pas * .18 + s.oyunGorusu * .22);
        const defense = eliteClamp(s.defans * .45 + s.fizik * .25 + s.kondisyon * .2 + s.oyunGorusu * .1);
        const playmaker = eliteClamp(s.pas * .45 + s.oyunGorusu * .35 + s.kondisyon * .2);
        const clutch = eliteClamp(avgRating * 8 + wins * 3 + goals * 1.5 + consistency * .15);
        const xgLike = Math.round(((s.sut * .04) + (s.hiz * .015) + goals * .28 + avgRating * .18) * 10) / 10;
        const pressure = eliteClamp(clutch * .55 + form * .25 + consistency * .2);
        const market = eliteMarketValue({ ovr, form, goals, wins, consistency });
        return { name: p.name, p, stats: s, position, ovr, form, goals, wins, ratings: ratings.length, avgRating, consistency, attack, defense, playmaker, clutch, xgLike, pressure, market };
    }).sort((a,b)=> b.form - a.form || b.ovr - a.ovr);
    ELITE_CACHE.at = Date.now();
    ELITE_CACHE.groupId = currentGroupId;
    ELITE_CACHE.metrics = data;
    return data;
}

async function eliteAttendanceNames() {
    if (ELITE_CACHE.groupId === currentGroupId && ELITE_CACHE.attendance && Date.now() - ELITE_CACHE.at < ELITE_CACHE_MS) return ELITE_CACHE.attendance;
    try {
        if (!currentGroupId) return [];
        const snap = await C("attendance").orderBy("timestamp","asc").limit(40).get();
        const names = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (d.coming && d.user) names.push(d.user);
        });
        ELITE_CACHE.attendance = names;
        return names;
    } catch(e) {
        console.warn("attendance tahmin verisi alınamadı:", e);
        return [];
    }
}

function eliteCard(title, value, note="", icon="") {
    return `<div class="elite-card"><div class="elite-card-top"><span>${icon}</span><b>${eliteEsc(title)}</b></div><div class="elite-big">${eliteEsc(value)}</div><p>${eliteEsc(note)}</p></div>`;
}

function eliteBar(label, value) {
    const v = eliteClamp(value);
    return `<div class="elite-bar-row"><span>${eliteEsc(label)}</span><b>${v}</b><div class="elite-bar"><i style="width:${v}%"></i></div></div>`;
}

function renderEliteCenter() {
    const host = document.getElementById("eliteCenterContent");
    if (!host) return;
    const m = eliteMetrics(true);
    const top = m[0];
    const bestValue = m.slice().sort((a,b)=> b.market - a.market)[0];
    const bestCons = m.slice().sort((a,b)=> b.consistency - a.consistency)[0];
    host.innerHTML = `
      ${eliteCard("Oyuncu Havuzu", m.length, "Analiz edilen aktif oyuncu", "👥")}
      ${eliteCard("En Formda", top?.name || "-", top ? `Form ${top.form}/100` : "Veri yok", "🔥")}
      ${eliteCard("En Değerli", bestValue?.name || "-", bestValue ? `₺ ${bestValue.market}M` : "Veri yok", "💎")}
      ${eliteCard("En İstikrarlı", bestCons?.name || "-", bestCons ? `${bestCons.consistency}/100 consistency` : "Veri yok", "🎯")}
      <div class="elite-wide elite-card">
        <h3>Hızlı Modüller</h3>
        <div class="elite-actions">
          <button class="btn" onclick="showPage('attendanceTahmin')">🧠 Katılım Tahmini</button>
          <button class="btn" onclick="showPage('proLigMotoru')">🏆 Lig Motoru</button>
          <button class="btn" onclick="showPage('sosyalPro')">💬 Sosyal Pro</button>
          <button class="btn" onclick="showPage('pushMerkezi')">🔔 Bildirim</button>
        </div>
      </div>
      <div class="elite-wide elite-card">
        <h3>Ürün Sağlığı</h3>
        ${eliteBar("Form verisi doluluğu", m.length ? (m.filter(x=>x.ratings>0).length / m.length) * 100 : 0)}
        ${eliteBar("Rekabet seviyesi", m.length ? eliteAvg(m.map(x=>x.wins + x.goals)) * 8 : 0)}
        ${eliteBar("Kadro dengesi potansiyeli", m.length ? 100 - Math.abs(eliteAvg(m.map(x=>x.attack)) - eliteAvg(m.map(x=>x.defense))) : 0)}
      </div>
    `;
}

function eliteTeamScore(team) {
    return team.reduce((s,p)=> s + p.ovr + p.form*.35 + p.consistency*.15, 0);
}

function eliteChemistryScore(team) {
    if (!team.length) return 0;
    let score = 0;
    for (let i=0;i<team.length;i++) {
        for (let j=i+1;j<team.length;j++) {
            const a = team[i], b = team[j];
            let pair = 45;
            if (a.position !== b.position) pair += 8;
            if ((a.position === "GK" && ["CB","LB","RB"].includes(b.position)) || (b.position === "GK" && ["CB","LB","RB"].includes(a.position))) pair += 10;
            if (Math.abs(a.form - b.form) < 15) pair += 6;
            if (Math.abs(a.ovr - b.ovr) < 10) pair += 5;
            score += pair;
        }
    }
    const pairs = team.length * (team.length - 1) / 2;
    return eliteClamp(score / Math.max(1, pairs));
}

function eliteCombinations(arr, k, limit=9000) {
    const out = [];
    const comb = [];
    function rec(start) {
        if (out.length >= limit) return;
        if (comb.length === k) { out.push(comb.slice()); return; }
        for (let i=start; i<=arr.length-(k-comb.length); i++) {
            comb.push(arr[i]); rec(i+1); comb.pop();
            if (out.length >= limit) return;
        }
    }
    rec(0);
    return out;
}

async function renderAttendancePrediction() {
    const host = document.getElementById("attendancePredictionContent");
    if (!host) return;
    const coming = await eliteAttendanceNames();
    const comingSet = new Set(coming);
    const dayBoost = [2,4,3,5,7,10,8][new Date().getDay()] || 0;
    const m = eliteMetrics(true).map(p => {
        const activity = eliteClamp(p.ratings * 8 + p.goals * 3 + p.wins * 4);
        const current = comingSet.has(p.name) ? 35 : 0;
        const probability = eliteClamp(28 + activity*.35 + p.consistency*.15 + p.form*.15 + dayBoost + current);
        return { ...p, probability };
    }).sort((a,b)=> b.probability - a.probability);
    host.innerHTML = `
      ${eliteCard("Şu an Katılıyorum", coming.length, "Attendance listesine göre", "✅")}
      ${eliteCard("Tahmini Doluluk", `%${eliteClamp(eliteAvg(m.slice(0, Math.max(1, coming.length || 10)).map(x=>x.probability)))}`, "Aktivite + form bazlı", "🧠")}
      <div class="elite-card elite-wide">
        <h3>Katılım Olasılığı</h3>
        ${m.slice(0, 18).map(p => `<div class="elite-pred-row"><b>${eliteEsc(p.name)}</b><span>%${p.probability}</span><div class="elite-bar"><i style="width:${p.probability}%"></i></div></div>`).join("")}
      </div>
      <div class="elite-card elite-wide"><h3>Not</h3><p>Bu tahmin Cloud Functions kullanmadan, sadece mevcut client verisinden hesaplanır. Gerçek geçmiş attendance arşivi eklendiğinde doğruluk artar.</p></div>
    `;
}

function renderProLeagueEngine(activeTab = "genel") {
    const host = document.getElementById("proLeagueContent");
    if (!host) return;

    const table = eliteMetrics(true).map(p => {
        const pts = p.wins * 3 + Math.round(p.avgRating) + Math.floor(p.goals / 2);
        return { ...p, pts };
    }).sort((a,b)=> b.pts - a.pts || b.form - a.form);

    const topScorers = table.slice().sort((a,b)=> b.goals - a.goals || b.form - a.form);
    const topWinners = table.slice().sort((a,b)=> b.wins - a.wins || b.form - a.form);

    const tabs = [
        ["genel", "Genel Sıralama"],
        ["gol", "Gol Krallığı"],
        ["kazanan", "En Çok Kazananlar"]
    ];

    const renderRows = (rows, mode) => rows.slice(0, 50).map((p,i) => {
        if (mode === "gol") {
            return `<div class="elite-table-row"><span>${i+1}</span><b>${eliteEsc(p.name)}</b><span>${p.goals}</span><span>${p.form}</span><span>${p.ovr}</span></div>`;
        }
        if (mode === "kazanan") {
            return `<div class="elite-table-row"><span>${i+1}</span><b>${eliteEsc(p.name)}</b><span>${p.wins}</span><span>${p.form}</span><span>${p.ovr}</span></div>`;
        }
        return `<div class="elite-table-row"><span>${i+1}</span><b>${eliteEsc(p.name)}</b><span>${p.pts}</span><span>${p.wins}</span><span>${p.goals}</span><span>${p.form}</span><span>${p.ovr}</span></div>`;
    }).join("") || `<div class="elite-notice">Gösterilecek veri yok.</div>`;

    const list = activeTab === "gol" ? topScorers : activeTab === "kazanan" ? topWinners : table;
    const head = activeTab === "gol"
        ? `<div class="elite-table-head"><span>#</span><span>Oyuncu</span><span>Gol</span><span>Form</span><span>OVR</span></div>`
        : activeTab === "kazanan"
        ? `<div class="elite-table-head"><span>#</span><span>Oyuncu</span><span>Galibiyet</span><span>Form</span><span>OVR</span></div>`
        : `<div class="elite-table-head"><span>#</span><span>Oyuncu</span><span>Puan</span><span>G</span><span>Gol</span><span>Form</span><span>OVR</span></div>`;

    host.innerHTML = `
      ${eliteCard("Lider", table[0]?.name || "-", table[0] ? `${table[0].pts} puan` : "Veri yok", "👑")}
      ${eliteCard("Gol Kralı", topScorers[0]?.name || "-", `${topScorers[0]?.goals || 0} gol`, "⚽")}
      ${eliteCard("En Çok Kazanan", topWinners[0]?.name || "-", `${topWinners[0]?.wins || 0} galibiyet`, "🏆")}
      <div class="elite-card elite-wide">
        <h3>Pro Lig Motoru</h3>
        <div class="elite-tabbar">
          ${tabs.map(([key,label]) => `<button class="elite-tab ${activeTab === key ? "active" : ""}" onclick="renderProLeagueEngine('${key}')">${label}</button>`).join("")}
        </div>
        <div class="elite-table elite-table-${activeTab}">
          ${head}
          ${renderRows(list, activeTab)}
        </div>
      </div>
    `;
}

function proSocialKey() {
    return `hsProSocial_${currentGroupId || "local"}`;
}

function addProSocialPost() {
    const input = document.getElementById("socialProInput");
    const typeEl = document.getElementById("socialProType");
    const text = (input?.value || "").trim();
    if (!text) return alert("Bir şey yazmalısın.");
    const list = JSON.parse(localStorage.getItem(proSocialKey()) || "[]");
    list.unshift({ text, type: typeEl?.value || "match", user: currentUser || "Oyuncu", at: new Date().toISOString(), likes: 0, fire: 0 });
    localStorage.setItem(proSocialKey(), JSON.stringify(list.slice(0, 60)));
    input.value = "";
    renderProSocial();
}

function reactProSocial(i, kind) {
    const list = JSON.parse(localStorage.getItem(proSocialKey()) || "[]");
    if (!list[i]) return;
    list[i][kind] = eliteNum(list[i][kind], 0) + 1;
    localStorage.setItem(proSocialKey(), JSON.stringify(list));
    renderProSocial();
}

function renderProSocial() {
    const host = document.getElementById("socialProContent");
    if (!host) return;
    const list = JSON.parse(localStorage.getItem(proSocialKey()) || "[]");
    if (!list.length) {
        host.innerHTML = `<div class="elite-card"><h3>Henüz paylaşım yok</h3><p>Maç anı, duyuru veya MVP adayını ilk sen paylaş.</p></div>`;
        return;
    }
    const labels = { match:"⚽ Maç Anı", announcement:"📣 Duyuru", mvp:"🏅 MVP", banter:"😄 Rekabet" };
    host.innerHTML = list.map((p,i)=>`
      <div class="elite-social-card">
        <div><b>${eliteEsc(p.user)}</b><span>${labels[p.type] || "💬 Paylaşım"} · ${new Date(p.at).toLocaleString("tr-TR")}</span></div>
        <p>${eliteEsc(p.text)}</p>
        <button onclick="reactProSocial(${i}, 'likes')">👏 ${eliteNum(p.likes)}</button>
        <button onclick="reactProSocial(${i}, 'fire')">🔥 ${eliteNum(p.fire)}</button>
      </div>
    `).join("");
}

function enableEliteNotifications() {
    if (!("Notification" in window)) return alert("Bu tarayıcı bildirim desteklemiyor.");
    Notification.requestPermission().then(permission => {
        notify(permission === "granted" ? "Bildirim izni verildi" : "Bildirim izni verilmedi");
        renderPushCenter();
        if (permission === "granted") new Notification("Halı Saha Kadrom", { body: "Bildirim merkezi aktif. Kadro ve form hatırlatmaları hazır.", icon: "./img/icon-192.png" });
    });
}

function renderPushCenter() {
    const host = document.getElementById("pushCenterContent");
    if (!host) return;
    const m = eliteMetrics();
    const me = m.find(x => x.name === currentUser) || m[0];
    const permission = ("Notification" in window) ? Notification.permission : "unsupported";
    host.innerHTML = `
      ${eliteCard("Bildirim Durumu", permission, permission === "granted" ? "Cihaz içi bildirimler açık" : "Butondan izin isteyebilirsin", "🔔")}
      ${eliteCard("Form Uyarısı", me ? `${me.form}/100` : "-", me ? `${me.name} için hesaplandı` : "Oyuncu yok", "📈")}
      ${eliteCard("Maç Hatırlatma", "Hazır", "Server push olmadan local/PWA bilgilendirme", "📅")}
      <div class="elite-card elite-wide">
        <h3>Önerilen Akıllı Bildirimler</h3>
        <div class="elite-notice">🔥 Formun yükseldiğinde otomatik uyarı</div>
        <div class="elite-notice">📋 Kadro açıklandığında uygulama içi bildirim</div>
        <div class="elite-notice">🏆 Haftanın yıldızı olduğunda kutlama mesajı</div>
        <div class="elite-notice">⏰ Maç günü hızlı katılım hatırlatması</div>
      </div>
    `;
}

function injectEliteShortcuts() {
    // Elite ayrı buton/panel olarak gösterilmiyor.
    // Gelişmiş V2 modülleri artık Gelişmiş menüsünün içinde yer alıyor.
}

function renderElitePage(id) {
    injectEliteShortcuts();
    if (id === "attendanceTahmin") renderAttendancePrediction();
    if (id === "proLigMotoru") renderProLeagueEngine();
    if (id === "sosyalPro") renderProSocial();
    if (id === "pushMerkezi") renderPushCenter();
}

window.renderElitePage = renderElitePage;
window.renderAttendancePrediction = renderAttendancePrediction;
window.renderProLeagueEngine = renderProLeagueEngine;
window.renderProSocial = renderProSocial;
window.addProSocialPost = addProSocialPost;
window.reactProSocial = reactProSocial;
window.enableEliteNotifications = enableEliteNotifications;
window.renderPushCenter = renderPushCenter;

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(injectEliteShortcuts, 1200);
});
