/* ==========================================================
   ADVANCED.JS — Gelişmiş halısaha özellikleri
   Rules'a dokunmadan, mevcut koleksiyonlarla ve local fallback ile çalışır.
========================================================= */

const ADV_FORM_CACHE = { at: 0, groupId: null, data: null };
const ADV_CACHE_MS = 60 * 1000;

function advEsc(v) {
    return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function advNowFresh() {
    return ADV_FORM_CACHE.groupId === currentGroupId && ADV_FORM_CACHE.data && (Date.now() - ADV_FORM_CACHE.at < ADV_CACHE_MS);
}

function advPlayerBase(name) {
    return CACHE.players.find(p => p.name === name) || {};
}

function advRatingsFor(name) {
    return (CACHE.ratings || []).filter(r => r.to === name);
}

function advGoalsFor(name) {
    return (CACHE.ga || []).filter(g => g.name === name).reduce((s,g) => s + Number(g.gol || 0), 0);
}

function advWinsFor(name) {
    return (CACHE.winners || []).filter(w => Array.isArray(w.players) && w.players.includes(name)).length;
}

function advAvgRating(name) {
    const arr = advRatingsFor(name);
    if (!arr.length) return 0;
    return arr.reduce((s,r) => s + Number((r.score ?? r.value ?? r.rating ?? r.puan) || 0), 0) / arr.length;
}

function advAttendanceComingNames() {
    // Attendance cache ayrı tutulmadığı için sadece haftalık sayfada mevcutsa DOM'dan okumadan hesap yapmıyoruz.
    return [];
}

function computeAdvancedMetrics() {
    const players = (CACHE.players || []).map(p => {
        const name = p.name;
        const goals = advGoalsFor(name);
        const wins = advWinsFor(name);
        const ratings = advRatingsFor(name);
        const avgRating = advAvgRating(name);
        const ovr = getOVR_withBonus(p);
        const ratingCount = ratings.length;

        const consistency = Math.min(100, Math.round((ratingCount * 7) + (wins * 4) + (goals * 3)));
        const formScore = Math.min(100, Math.round((avgRating * 8) + (goals * 7) + (wins * 9) + Math.min(ratingCount, 12) * 2 + Math.max(0, ovr - 50) * .8));
        const market = Math.max(1, Math.round((ovr * 120000) + (formScore * 85000) + (goals * 175000) + (wins * 125000) + (ratingCount * 45000)));
        const marketText = "₺ " + (market / 1000000).toFixed(1) + "M";
        const trend = formScore >= 80 ? "🔥 Çok Formda" : formScore >= 62 ? "📈 Formda" : formScore >= 38 ? "⚡ Yükselişte" : "📊 Veri Toplanıyor";
        const role = normalizePos(p.mainPos) || "-";
        const badges = [];
        if (goals >= 10) badges.push("🎯 Keskin Nişancı");
        if (wins >= 10) badges.push("👑 Kazanan Mentalite");
        if (avgRating >= 8 && ratingCount >= 3) badges.push("🐐 GOAT Adayı");
        if ((p.stats?.defans || 0) >= 80) badges.push("🧱 Duvar");
        if ((p.stats?.hiz || 0) >= 80) badges.push("💨 Roket");
        if (formScore >= 80) badges.push("🔥 Alev Alev");
        if (!badges.length) badges.push("🌱 Gelişimde");

        return { ...p, name, goals, wins, avgRating, ratingCount, ovr, formScore, consistency, market, marketText, trend, role, badges };
    }).sort((a,b) => b.formScore - a.formScore);

    ADV_FORM_CACHE.at = Date.now();
    ADV_FORM_CACHE.groupId = currentGroupId;
    ADV_FORM_CACHE.data = players;
    return players;
}

function advMetrics() {
    return advNowFresh() ? ADV_FORM_CACHE.data : computeAdvancedMetrics();
}

function renderAdvancedFormPage() {
    const host = document.getElementById("advancedFormList");
    if (!host) return;
    const data = advMetrics();
    if (!data.length) { host.innerHTML = `<div class="advanced-panel">Henüz oyuncu verisi yok.</div>`; return; }

    host.innerHTML = data.map(p => `
        <div class="advanced-card">
            <h3>${advEsc(p.name)}</h3>
            <span class="advanced-badge">${p.trend}</span>
            <div class="advanced-kpi">
                <div><b>${p.goals}</b><span>Gol</span></div>
                <div><b>${p.wins}</b><span>Galibiyet</span></div>
                <div><b>${p.avgRating ? p.avgRating.toFixed(1) : "-"}</b><span>Puan</span></div>
            </div>
            <div class="muted">Form Skoru: <b>${p.formScore}/100</b> · OVR: <b>${p.ovr}</b> · Mevki: <b>${advEsc(p.role)}</b></div>
            <div class="advanced-bar"><span style="width:${p.formScore}%"></span></div>
        </div>
    `).join("");
}

function renderMarketPage() {
    const host = document.getElementById("marketContent");
    if (!host) return;
    const data = [...advMetrics()].sort((a,b) => b.market - a.market);
    host.innerHTML = data.map((p, i) => `
        <div class="advanced-card">
            <h3>${i+1}. ${advEsc(p.name)}</h3>
            <div class="market-value">${p.marketText}</div>
            <div class="muted">OVR ${p.ovr} · Form ${p.formScore} · ${p.goals} gol · ${p.wins} galibiyet</div>
            <div class="advanced-bar"><span style="width:${Math.min(100, Math.round(p.market / Math.max(1, data[0]?.market) * 100))}%"></span></div>
        </div>
    `).join("") || `<div class="advanced-panel">Market için oyuncu verisi yok.</div>`;
}

function renderAchievementsPage() {
    const host = document.getElementById("achievementsContent");
    if (!host) return;
    const data = advMetrics();
    host.innerHTML = data.map(p => `
        <div class="advanced-card">
            <h3>${advEsc(p.name)}</h3>
            <div class="achievement-row">${p.badges.map(b => `<span class="achievement-chip">${advEsc(b)}</span>`).join("")}</div>
            <div class="muted" style="margin-top:10px;">Rozetler gol, galibiyet, puan ve oyuncu özelliklerine göre otomatik hesaplanır.</div>
        </div>
    `).join("") || `<div class="advanced-panel">Rozet için veri yok.</div>`;
}

function renderChemistryPage() {
    const host = document.getElementById("chemistryContent");
    if (!host) return;

    const comboMap = new Map();

    function comboKey(arr) {
        return arr.map(x => String(x || "").trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b, "tr")).join("|||");
    }

    function combinations(arr, size) {
        const clean = Array.from(new Set((arr || []).filter(Boolean)));
        const out = [];
        function walk(start, picked) {
            if (picked.length === size) {
                out.push(picked.slice());
                return;
            }
            for (let i = start; i < clean.length; i++) {
                picked.push(clean[i]);
                walk(i + 1, picked);
                picked.pop();
            }
        }
        walk(0, []);
        return out;
    }

    (CACHE.winners || []).forEach(w => {
        const arr = Array.isArray(w.players) ? w.players.filter(Boolean) : [];
        // 2'li uyum yerine daha gerçekçi takım çekirdeği: önce 4'lü, mümkün değilse 3'lü kombinasyonlar.
        const size = arr.length >= 4 ? 4 : (arr.length >= 3 ? 3 : 0);
        if (!size) return;
        combinations(arr, size).forEach(group => {
            const key = comboKey(group);
            if (!key) return;
            comboMap.set(key, (comboMap.get(key) || 0) + 1);
        });
    });

    const rows = [...comboMap.entries()].map(([key,wins]) => {
        const names = key.split("|||");
        const avg = names.reduce((s,n) => s + advAvgRating(n), 0) / Math.max(1, names.length);
        const score = Math.min(99, 38 + wins * 8 + Math.round(avg * 2) + names.length * 3);
        return { names, wins, score };
    }).sort((x,y) => y.score - x.score).slice(0,24);

    host.innerHTML = rows.map(r => `
        <div class="advanced-card">
            <h3>${r.names.map(advEsc).join(" + ")}</h3>
            <span class="advanced-badge">${r.names.length} kişilik uyum ${(r.score ?? r.value ?? r.rating ?? r.puan)}</span>
            <div class="muted" style="margin-top:10px;">Birlikte kazanılan maç: <b>${r.wins}</b></div>
            <div class="advanced-bar"><span style="width:${(r.score ?? r.value ?? r.rating ?? r.puan)}%"></span></div>
        </div>
    `).join("") || `<div class="advanced-panel">Chemistry için en az 3 kişilik kazanan takım verisi birikmeli.</div>`;
}

function addLocalSocialPost() {
    const input = document.getElementById("socialPostInput");
    const text = (input?.value || "").trim();
    if (!text) return alert("Bir mesaj yaz.");
    const arr = JSON.parse(localStorage.getItem(socialKey()) || "[]");
    arr.unshift({ text, user: currentUser || currentDisplayName || "Oyuncu", date: new Date().toISOString() });
    localStorage.setItem(socialKey(), JSON.stringify(arr.slice(0,50)));
    input.value = "";
    renderSocialPage();
}

function renderAdvancedDashboardMini() {
    const box = document.getElementById("formStatusContent");
    const badge = document.getElementById("formStatusBadge");
    if (!box || !badge) return;
    const name = currentDisplayName || currentUser;
    const me = advMetrics().find(p => p.name === name) || advMetrics()[0];
    if (!me) return;
    badge.textContent = me.trend.replace(/[🔥📈⚡📊]/g, "").trim();
    box.innerHTML = `
        <div class="advanced-kpi">
            <div><b>${me.goals}</b><span>Gol</span></div>
            <div><b>${me.wins}</b><span>Galibiyet</span></div>
            <div><b>${me.avgRating ? me.avgRating.toFixed(1) : "-"}</b><span>Ort.</span></div>
        </div>
        <div>Genel form skorun <b>${me.formScore}/100</b>. Market değerin <b>${me.marketText}</b>. Rozetlerin: ${me.badges.map(advEsc).join(", ")}.</div>
        <div class="advanced-bar"><span style="width:${me.formScore}%"></span></div>`;
}

function renderAdvancedPage(id) {
    try {
        if (!currentGroupId) return;
        if (id === "formAnalizi") renderAdvancedFormPage();
        if (id === "chemistry") renderChemistryPage();
        if (id === "market") renderMarketPage();
    } catch(e) { console.warn("advanced render error:", e); }
}

(function hookAdvancedPages(){
    const oldShow = window.showPage;
    if (typeof oldShow === "function" && !window.__advancedShowHooked) {
        window.__advancedShowHooked = true;
        window.showPage = function(id) {
            oldShow(id);
            renderAdvancedPage(id);
        };
    }

    const oldOpenDashboard = window.openDashboard;
    if (typeof oldOpenDashboard === "function" && !window.__advancedDashboardHooked) {
        window.__advancedDashboardHooked = true;
        window.openDashboard = async function() {
            await oldOpenDashboard();
            renderAdvancedDashboardMini();
        };
    }
})();


/* ==========================================================
   PRO FEATURES 2026 — tasarım sonrası gelişmiş özellikler
   Ücretsiz Firebase dostu: mevcut CACHE verilerini kullanır, ekstra Firestore yazmaz.
========================================================= */
function advPercent(v){ return Math.max(0, Math.min(100, Math.round(Number(v)||0))); }
function advTop(data, fn){ return [...data].sort((a,b)=>fn(b)-fn(a))[0] || null; }
function advFormatMetric(v, suffix=""){ return (v || v === 0) ? `${v}${suffix}` : "-"; }

function renderPlayerOptions() {
    const a = document.getElementById("comparePlayerA");
    const b = document.getElementById("comparePlayerB");
    if (!a || !b) return;
    const data = advMetrics();
    const opts = data.map(p => `<option value="${advEsc(p.name)}">${advEsc(p.name)}</option>`).join("");
    const prevA = a.value, prevB = b.value;
    a.innerHTML = opts;
    b.innerHTML = opts;
    if (prevA) a.value = prevA;
    if (prevB) b.value = prevB;
    if (!b.value && data[1]) b.value = data[1].name;
}

function renderPlayerCompare() {
    renderPlayerOptions();
    const host = document.getElementById("compareContent");
    if (!host) return;
    const data = advMetrics();
    if (data.length < 2) {
        host.innerHTML = `<div class="advanced-panel pro-panel">Karşılaştırma için en az 2 oyuncu gerekli.</div>`;
        return;
    }
    const nameA = document.getElementById("comparePlayerA")?.value || data[0].name;
    const nameB = document.getElementById("comparePlayerB")?.value || data[1].name;
    const p1 = data.find(p => p.name === nameA) || data[0];
    const p2 = data.find(p => p.name === nameB) || data[1] || data[0];
    const metrics = [
        ["Form", p1.formScore, p2.formScore],
        ["OVR", p1.ovr, p2.ovr],
        ["Gol", p1.goals, p2.goals],
        ["Galibiyet", p1.wins, p2.wins],
        ["Ortalama", Number((p1.avgRating||0).toFixed(1)), Number((p2.avgRating||0).toFixed(1))]
    ];
    const winner = (p1.formScore + p1.ovr + p1.goals*3 + p1.wins*4) >= (p2.formScore + p2.ovr + p2.goals*3 + p2.wins*4) ? p1 : p2;
    host.innerHTML = `
      <div class="pro-vs">
        ${renderCompareCard(p1)}
        <div class="pro-vs-mid">VS</div>
        ${renderCompareCard(p2)}
      </div>
      <div class="advanced-card" style="grid-column:1/-1;">
        <h3>Karşılaştırma Detayı</h3>
        ${metrics.map(([label,a,b]) => {
          const max = Math.max(Number(a)||0, Number(b)||0, 1);
          return `<div style="margin:12px 0;">
            <div style="display:flex;justify-content:space-between;color:white;font-weight:700;"><span>${label}</span><span>${advEsc(a)} / ${advEsc(b)}</span></div>
            <div class="advanced-bar"><span style="width:${Math.round(((Number(a)||0)/max)*100)}%"></span></div>
            <div class="advanced-bar" style="margin-top:5px;"><span style="width:${Math.round(((Number(b)||0)/max)*100)}%"></span></div>
          </div>`;
        }).join("")}
        <div class="advanced-badge">Öne çıkan: ${advEsc(winner.name)}</div>
      </div>`;
}

function renderCompareCard(p) {
    return `<div class="advanced-card">
      <h3>${advEsc(p.name)}</h3>
      <span class="advanced-badge">${advEsc(p.trend)}</span>
      <div class="market-value">${advEsc(p.marketText)}</div>
      <div class="advanced-kpi">
        <div><b>${p.ovr}</b><span>OVR</span></div>
        <div><b>${p.formScore}</b><span>Form</span></div>
        <div><b>${p.goals}</b><span>Gol</span></div>
      </div>
      <div class="achievement-row">${p.badges.slice(0,3).map(b=>`<span class="achievement-chip">${advEsc(b)}</span>`).join("")}</div>
    </div>`;
}

function renderWeeklyStars() {
    const host = document.getElementById("starsContent");
    if (!host) return;
    const data = advMetrics();
    if (!data.length) {
        host.innerHTML = `<div class="advanced-panel pro-panel">Yıldızlar için oyuncu verisi yok.</div>`;
        return;
    }
    const cards = [
      ["🔥 En Formda", advTop(data, p=>p.formScore), p=>`${p.formScore}/100 form`],
      ["💰 En Değerli", advTop(data, p=>p.market), p=>p.marketText],
      ["🎯 Gol Tehdidi", advTop(data, p=>p.goals), p=>`${p.goals} gol`],
      ["👑 Kazanan", advTop(data, p=>p.wins), p=>`${p.wins} galibiyet`],
      ["🧠 En İstikrarlı", advTop(data, p=>p.consistency), p=>`${p.consistency}/100 istikrar`],
      ["⭐ En Yüksek OVR", advTop(data, p=>p.ovr), p=>`${p.ovr} OVR`]
    ].filter(x=>x[1]);
    host.innerHTML = cards.map(([title,p,sub]) => `
      <div class="advanced-card star-card">
        <h3>${title}</h3>
        <div class="market-value" style="font-size:24px;">${advEsc(p.name)}</div>
        <span class="advanced-badge">${advEsc(sub(p))}</span>
        <div class="advanced-kpi">
          <div><b>${p.formScore}</b><span>Form</span></div>
          <div><b>${p.goals}</b><span>Gol</span></div>
          <div><b>${p.wins}</b><span>G</span></div>
        </div>
      </div>`).join("");
}

function renderProPage(id) {
    if (id === "karsilastirma") { renderPlayerOptions(); renderPlayerCompare(); }
}

/* showPage hook'unu genişlet: mevcut hook'u bozmadan ek sayfaları render eder */
(function hookProPages(){
    const prev = window.renderAdvancedPage;
    window.renderAdvancedPage = function(id) {
        if (typeof prev === "function") prev(id);
        try { renderProPage(id); } catch(e) { console.warn("pro render error:", e); }
    };
})();

