/* ==========================================================
   STATS.JS — geçmiş, puan ver, gol/kazanan yönetimi
========================================================= */

// ==========================================================
// PUAN GÖNDER
// ==========================================================
async function puanGonder() {
    let hedef = selects["puanTarget"].value;
    let val = Number(document.getElementById("puanValue").value);

    if (!hedef) return alert("Oyuncu seç!");
    if (!val || val < 1 || val > 10) return alert("1-10 arası puan!");
    if (hedef === currentUser) return alert("Kendine puan veremezsin!");
    if (!Number.isInteger(val)) return alert("Puan tam sayı olmalı!");

    let kontrol = CACHE.ratings.filter(r => r.from === currentUser && r.to === hedef)[0];
    if (kontrol) {
        let lastDate = new Date(kontrol.date);
        let diffDays = Math.floor((Date.now() - lastDate) / 86400000);
        if (diffDays < 5) return alert(`Tekrar puan verebilmek için ${5 - diffDays} gün daha bekle.`);
    }

    await C("ratings").add({
        from: currentUser, to: hedef, score: val, date: new Date().toISOString()
    });

    await refreshCachePartial(["ratings"]);
	await loadGecmis();
    document.getElementById("puanValue").value = "";
    notify("Puan Gönderildi");
}

// ==========================================================
// GEÇMİŞ
// ==========================================================
async function loadGecmis() {
    const list = document.getElementById("gecmisList");
    list.innerHTML = "";
    let sorted = [...CACHE.ratings].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
    list.innerHTML = sorted.map(r => `<li>${r.from} → ${r.to} | ${r.score} puan | ${(r.date || "").slice(0, 10)}</li>`).join("");
}

// ==========================================================
// GOL KRALLIĞI

// ==========================================================
// EN İYİ OYUNCULAR

// ==========================================================
// KAZANANLAR

// ==========================================================
// GOL YÖNETİMİ
// ==========================================================
async function ekleGolAsist() {
    const _myDoc = await db.collection("groups").doc(currentGroupId).collection("members").doc(currentFirebaseUser.uid).get();
    if (!_myDoc.exists || _myDoc.data().role !== "admin") return alert("Sadece admin!");
    let name = selects["gaPlayer"]?.value;
    let gol = Number(document.getElementById("gaGol")?.value);
    if (!name) return alert("Oyuncu seç!");
    if (!Number.isFinite(gol) || gol <= 0) return alert("Gol sayısı 1 veya daha büyük olmalı!");
    let p = CACHE.players.find(x => x.name === name);
    await C("ga").add({ name, gol, photo: p?.photo || DEFAULT_PHOTO, date: new Date().toISOString() });
    const golInput = document.getElementById("gaGol");
    if (golInput) golInput.value = "";
    await refreshCachePartial(["ga"]);
    resetAdvancedCaches();
    await refreshStatsViews();
    notify("Gol kaydedildi ve istatistikler güncellendi");
}

// ==========================================================
// KAZANAN YÖNETİMİ
// ==========================================================
let winnerSelected = [];

function loadWinnerPlayerGrid() {
    const grid = document.getElementById("winnerPlayerGrid");
    if (!grid) return;
    grid.innerHTML = "";
    CACHE.players.forEach(p => {
        const div = document.createElement("div");
        div.className = "player-item";
        div.innerText = p.name;
        div.dataset.id = p.id;
        div.onclick = () => {
            if (div.classList.contains("selected")) {
                div.classList.remove("selected");
                winnerSelected = winnerSelected.filter(x => x !== p.name);
            } else {
                div.classList.add("selected");
                winnerSelected.push(p.name);
            }
        };
        grid.appendChild(div);
    });
}

async function kazananKaydet() {
    let arr = winnerSelected;
    if (!arr.length) return alert("Oyuncu seç!");
    await saveWinnerPlayers(arr, { source: "manual" });
    winnerSelected = [];
    document.querySelectorAll("#winnerPlayerGrid .player-item").forEach(el => el.classList.remove("selected"));
}

async function saveWinnerPlayers(arr, extra = {}) {
    const players = Array.from(new Set((arr || []).filter(Boolean)));
    if (!players.length) return alert("Oyuncu seç!");
    await C("winners").add({ players, date: new Date().toISOString(), ...extra });
    await refreshCachePartial(["winners"]);
    resetAdvancedCaches();
    await refreshStatsViews();
    notify("Kazananlar kaydedildi ve lig puanları güncellendi");
}

function resetAdvancedCaches() {
    try {
        if (typeof ELITE_CACHE !== "undefined") {
            ELITE_CACHE.at = 0;
            ELITE_CACHE.groupId = null;
            ELITE_CACHE.metrics = null;
            ELITE_CACHE.attendance = null;
        }
    } catch(e) {}
    try {
        if (typeof ADV_FORM_CACHE !== "undefined") {
            ADV_FORM_CACHE.at = 0;
            ADV_FORM_CACHE.groupId = null;
            ADV_FORM_CACHE.data = null;
        }
    } catch(e) {}
}

async function refreshStatsViews() {
    try { await loadGecmis(); } catch(e) {}
    try { loadGolKr(); } catch(e) {}
    try { loadKazananlar(); } catch(e) {}
    try { loadEnIyi(); } catch(e) {}

    const active = document.querySelector(".page.active")?.id || document.querySelector('.page[style*="block"]')?.id;

    // Gol, kazanan veya maç sonu puan değiştiğinde gelişmiş hesaplar tekrar üretilsin.
    try { if ((active === "formAnalizi" || document.getElementById("formAnaliziContent")) && typeof renderAdvancedFormPage === "function") renderAdvancedFormPage(); } catch(e) {}
    try { if ((active === "chemistry" || document.getElementById("chemistryContent")) && typeof renderChemistryPage === "function") renderChemistryPage(); } catch(e) {}
    try { if ((active === "market" || document.getElementById("marketContent")) && typeof renderMarketPage === "function") renderMarketPage(); } catch(e) {}
    try { if ((active === "proLigMotoru" || document.getElementById("proLeagueContent")) && typeof renderProLeagueEngine === "function") renderProLeagueEngine(); } catch(e) {}

    // Ana profil/dashboard mini kartında görünen market/form bilgisi de beklemeden yenilensin.
    try { if (typeof renderAdvancedDashboardMini === "function") renderAdvancedDashboardMini(); } catch(e) {}
}

function statScoreOf(r) {
    return Number(r?.score ?? r?.value ?? r?.rating ?? r?.puan ?? 0) || 0;
}

function loadGolKr() {
    const list = document.getElementById("golKrList") || document.getElementById("golKralligiList");
    if (!list) return;
    const rows = [...(CACHE.players || [])].map(p => ({
        name: p.name,
        gol: (CACHE.ga || []).filter(g => g.name === p.name || g.player === p.name).reduce((s,g)=>s + (Number(g.gol ?? g.goals) || 0), 0)
    })).sort((a,b)=>b.gol-a.gol).slice(0, 20);
    list.innerHTML = rows.map((r,i)=>`<li>${i+1}. ${r.name} — ${r.gol} gol</li>`).join("") || "<li>Veri yok</li>";
}

function loadKazananlar() {
    const list = document.getElementById("kazananlarList") || document.getElementById("enCokKazananlarList");
    if (!list) return;
    const rows = [...(CACHE.players || [])].map(p => ({
        name: p.name,
        win: (CACHE.winners || []).filter(w => Array.isArray(w.players) ? w.players.includes(p.name) : (w.name === p.name || w.player === p.name || w.winner === p.name)).length
    })).sort((a,b)=>b.win-a.win).slice(0, 20);
    list.innerHTML = rows.map((r,i)=>`<li>${i+1}. ${r.name} — ${r.win} galibiyet</li>`).join("") || "<li>Veri yok</li>";
}

function loadEnIyi() {
    const list = document.getElementById("enIyiList") || document.getElementById("enIyiOyuncularList");
    if (!list) return;
    const rows = [...(CACHE.players || [])].map(p => {
        const rs = (CACHE.ratings || []).filter(r => r.to === p.name || r.player === p.name || r.name === p.name).map(statScoreOf).filter(Boolean);
        const avg = rs.length ? rs.reduce((a,b)=>a+b,0)/rs.length : 0;
        return { name: p.name, avg, count: rs.length };
    }).sort((a,b)=>b.avg-a.avg).slice(0, 20);
    list.innerHTML = rows.map((r,i)=>`<li>${i+1}. ${r.name} — ${r.avg.toFixed(1)} puan (${r.count})</li>`).join("") || "<li>Veri yok</li>";
}
