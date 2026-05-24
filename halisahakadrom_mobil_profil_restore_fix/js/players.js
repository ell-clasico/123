/* ==========================================================
   PLAYERS.JS — oyuncular, profil, rating, fotoğraf
========================================================= */

let selectedPlayerId = null;
let mainPos = null;
let subPos = null;

// ==========================================================
// OYUNCULAR LİSTESİ
// ==========================================================
async function loadPlayers() {
    const box = document.getElementById("oyuncuListe");
    box.innerHTML = "";
    const posOrder = ["GK", "LB", "CB", "RB", "CM", "LW", "RW", "ST", ""];
    let sortedPlayers = [...CACHE.players].sort((a, b) => {
        let pa = normalizePos(a.mainPos) || "";
        let pb = normalizePos(b.mainPos) || "";
        let orderA = posOrder.indexOf(pa);
        let orderB = posOrder.indexOf(pb);
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || "").localeCompare(b.name || "");
    });

    const html = sortedPlayers.map(p => {
        const photo = p.photo || DEFAULT_PHOTO;
        const ovr = getOVR_withBonus(p);
        const base = p.stats || {};
        const applied = applyMatchBonus(p, base);
        const s = p.stats || {};

        const svBonus = (baseVal, appliedVal) => {
            if (!appliedVal && appliedVal !== 0) return `<span class="stat-val low">-</span>`;
            const c = appliedVal >= 75 ? 'high' : appliedVal >= 60 ? 'mid' : 'low';
            const glow = appliedVal !== baseVal ? ' bonus-glow' : '';
            return `<span class="stat-val ${c}${glow}">${appliedVal}</span>`;
        };

        const guestBadge = p.isGuest
            ? `<span style="background:rgba(255,165,0,0.15);border:1px solid orange;color:orange;
                font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;
                margin-bottom:6px;display:inline-block;">👟 MİSAFİR</span>`
            : "";
        const form = (typeof advMetrics === "function" ? advMetrics().find(x => x.name === p.name) : null);
        const advancedBadge = form ? `<span style="background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.25);color:#86efac;font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;margin-bottom:4px;display:inline-block;">${form.trend}</span>` : "";

        return `
    <div class="card" onclick="this.classList.toggle('flipped')">
        <div class="card-inner">
            <div class="card-front">
                <div class="ovr-badge">${ovr}</div>
                <img src="${photo}" style="margin-top:30px;">
                <h3>${p.name}</h3>
                ${guestBadge}
                ${advancedBadge}
                ${typeof proTraitLabels === "function" && proTraitLabels(p).length ? `<div class="player-traits">${proTraitLabels(p).map(x=>`<span>${x.replace(/^\S+\s*/,"")}</span>`).join("")}</div>` : ""}
                <div class="player-pos">
                    <p><strong>Asıl Mevki:</strong> ${p.mainPos || '-'}</p>
                    <p><strong>Yedek Mevki:</strong> ${p.subPos || '-'}</p>
                </div>
                ${isAdmin ? `<button class="rate-btn" onclick="event.stopPropagation();openRatePanel('${p.id}', '${p.name}')">Puanla</button>` : ``}
            </div>
            <div class="card-back">
                <div class="back-name">${p.name}</div>
                <div class="back-pos">${p.mainPos || '-'}</div>
                <div class="stat-row"><span class="stat-label">HIZ</span>${svBonus(base.hiz, applied.hiz)}</div>
                <div class="stat-row"><span class="stat-label">ŞUT</span>${svBonus(base.sut, applied.sut)}</div>
                <div class="stat-row"><span class="stat-label">PAS</span>${svBonus(base.pas, applied.pas)}</div>
                <div class="stat-row"><span class="stat-label">KON</span>${svBonus(base.kondisyon, applied.kondisyon)}</div>
                <div class="stat-row"><span class="stat-label">DEF</span>${svBonus(base.defans, applied.defans)}</div>
                <div class="stat-row"><span class="stat-label">FİZ</span>${svBonus(base.fizik, applied.fizik)}</div>
                <div class="stat-row"><span class="stat-label">GÖRÜŞ</span>${svBonus(base.oyunGorusu, applied.oyunGorusu)}</div>
            </div>
        </div>
    </div>`;
    }).join("");
    box.innerHTML = html;
}
// ==========================================================
// OYUNCU EKLE / SİL
// ==========================================================


async function deletePlayer() {
    const _myDoc = await db.collection("groups").doc(currentGroupId).collection("members").doc(currentFirebaseUser.uid).get();
    if (!_myDoc.exists || _myDoc.data().role !== "admin") return alert("Sadece admin!");
    const name = selects["deleteUser"]?.value;
    if (!name) return alert("Oyuncu seç!");

    // YENİ — BUNU YAPISTIR
if (currentGroupId) {
    try {
        const memberSnap = await db.collection("groups").doc(currentGroupId)
            .collection("members")
            .where("username", "==", name)
            .limit(1)
            .get();
        if (!memberSnap.empty) {
            await memberSnap.docs[0].ref.delete();
        }
    } catch (e) { console.warn("Member delete failed:", e); }
}

    try {
        const p = CACHE.players.find(x => x.name === name);
        const pid = p?.id || p?.name || name;
        await C("players").doc(pid).delete();
    } catch (_) { }

    try { await C("attendance").doc(name).delete(); } catch (_) { }

    const deletePromises = [];
    for (const r of CACHE.ratings.filter(x => x.from === name || x.to === name)) {
        if (r?.id) deletePromises.push(C("ratings").doc(r.id).delete().catch(() => {}));
    }
    for (const g of CACHE.ga.filter(x => x.name === name)) {
        if (g?.id) deletePromises.push(C("ga").doc(g.id).delete().catch(() => {}));
    }
    for (const w of CACHE.winners) {
        if (!w?.id || !Array.isArray(w.players)) continue;
        if (w.players.includes(name)) {
            const arr = w.players.filter(x => x !== name);
            deletePromises.push(C("winners").doc(w.id).set({ players: arr }, { merge: true }).catch(() => {}));
        }
    }

    deletePromises.push((async () => {
        try {
            const wkRef = C("haftaninKadro").doc("latest");
            const wkDoc = await wkRef.get();
            if (!wkDoc.exists) return;
            const data = wkDoc.data() || {};
            const teamA = Array.isArray(data.teamA) ? data.teamA : [];
            const teamB = Array.isArray(data.teamB) ? data.teamB : [];
            const posMap = data.posMap || {};
            const cleanArr = (arr) => arr.filter(x => x !== name);
            const newTeamA = cleanArr(teamA);
            const newTeamB = cleanArr(teamB);
            let changed = (newTeamA.length !== teamA.length) || (newTeamB.length !== teamB.length);
            const newPosMap = { ...posMap };
            for (const k of Object.keys(newPosMap)) {
                if (newPosMap[k] === name) { delete newPosMap[k]; changed = true; }
            }
            if (changed) await wkRef.set({ teamA: newTeamA, teamB: newTeamB, posMap: newPosMap }, { merge: true });
        } catch (e) { console.warn("Weekly cleanup skipped:", e); }
    })());

    await Promise.all(deletePromises);
    await refreshCachePartial(["players", "ratings", "ga", "winners"]);
await loadPlayers();
await setupSelects();
notify("Oyuncu silindi.");
}

// ==========================================================
// PROFİL
// ==========================================================
async function loadProfil() {
    if (!currentUser) return;
    const p = CACHE.players.find(x => x.name === currentUser);
    if (!p) return;

    document.getElementById("fifa-name").textContent = p.name;
    document.getElementById("fifa-position").textContent = p.mainPos || "-";

    const stats = p.stats || { sut: 0, pas: 0, kondisyon: 0, hiz: 0, fizik: 0, defans: 0, oyunGorusu: 0 };
    renderFifaCard({ ...p, stats });

    document.getElementById("mainPos").value = p.mainPos || "";
    document.getElementById("subPos").value = p.subPos || "";
    highlightSavedPositions(p.mainPos, p.subPos);
    if (typeof renderTraitPicker === "function") renderTraitPicker("profileTraitPicker", (p.traits || p.characterTraits || []));
}

function highlightSavedPositions(mainPos, subPos) {
    document.querySelectorAll(".fm-card").forEach(c => {
        c.classList.remove("selected-main", "selected-sub");
    });
    if (mainPos) {
        const code = POS_MAP_REVERSE[mainPos];
        const el = document.querySelector(`.fm-card[data-pos="${code}"]`);
        if (el) el.classList.add("selected-main");
    }
    if (subPos) {
        const code = POS_MAP_REVERSE[subPos];
        const el = document.querySelector(`.fm-card[data-pos="${code}"]`);
        if (el) el.classList.add("selected-sub");
    }
}

function renderFifaCard(p) {
    const base = p.stats || { sut: 0, pas: 0, kondisyon: 0, hiz: 0, fizik: 0, defans: 0, oyunGorusu: 0 };
    const applied = applyMatchBonus(p, base);
    const ovr = getOVR_withBonus(p);

    document.getElementById("fifa-name").textContent = p.name || "-";
    document.getElementById("fifa-position").textContent = p.mainPos || "-";
    document.getElementById("fifa-overall").textContent = ovr;

    const isBonus = (key) => applied[key] !== base[key];
    const writeStat = (id, key) => {
        const el = document.getElementById(id);
        el.textContent = applied[key];
        if (isBonus(key)) el.classList.add("bonus-glow");
        else el.classList.remove("bonus-glow");
    };

    writeStat("fifa-hiz", "hiz");
    writeStat("fifa-sut", "sut");
    writeStat("fifa-pas", "pas");
    writeStat("fifa-kondisyon", "kondisyon");
    writeStat("fifa-defans", "defans");
    writeStat("fifa-fizik", "fizik");

    const photoEl = document.getElementById("fifa-photo");
    if (photoEl) photoEl.src = p.photo || DEFAULT_PHOTO;
}

async function savePositions() {
    const mainP = document.getElementById("mainPos").value;
    const subP = document.getElementById("subPos").value;
    const traits = typeof getTraitPickerValue === "function" ? getTraitPickerValue("profileTraitPicker") : [];
    let p = CACHE.players.find(x => x.name === currentUser);
    await C("players").doc(p.id || p.name).update({ mainPos: mainP, subPos: subP, traits, characterTraits: traits });
    try {
        if (currentFirebaseUser?.uid) await db.collection("users").doc(currentFirebaseUser.uid).set({ mainPos: mainP, subPos: subP, traits, characterTraits: traits }, { merge: true });
    } catch(e) { console.warn("user trait sync skipped", e); }
    notify("Mevki ve özellikler kaydedildi");
    await refreshCachePartial(["players"]);
        await loadPlayers();
    const updated = CACHE.players.find(x => x.name === currentUser);
    if (updated) renderFifaCard(updated);
}

async function updatePhoto() {
    const fileInput = document.getElementById("profilUpload");
    const file = fileInput.files[0];
    if (!file) { notify("Lütfen bir dosya seç!"); return; }

    const btn = document.querySelector('button[onclick="updatePhoto()"]');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.textContent = "Yükleniyor ⏳";
    }

    try {
        const url = await uploadImageToStorage(file, "profile_photos");
        let p = CACHE.players.find(x => x.name === currentUser);
        if (p) {
            await C("players").doc(p.id || p.name).set({ photo: url }, { merge: true });
            const img = document.getElementById("fifa-photo");
            if (img) img.src = url;
            renderFifaCard({ ...p, photo: url });
        }
        await refreshCachePartial(["players"]);
        await loadPlayers();
        notify("Fotoğraf Güncellendi");
    } catch (e) {
        console.warn(e);
        notify("Fotoğraf yüklenemedi");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = "";
            btn.style.cursor = "";
            btn.textContent = "Fotoğrafı Güncelle";
        }
    }
}

// ==========================================================
// RATING PANEL
// ==========================================================
function openRatePanel(id, name) {
    selectedPlayerId = id;
    document.getElementById("ratePlayerName").textContent = name;

    const modal = document.getElementById("rateModal");
    modal.style.display = "flex";

    // Kartın konumuna göre modal'ı ortala
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.zIndex = "1000";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";

    const p = CACHE.players.find(x => x.id === id);
    const s = p?.stats || {};
    document.getElementById("rate-sut").value = s.sut ?? 0;
    document.getElementById("rate-pas").value = s.pas ?? 0;
    document.getElementById("rate-kond").value = s.kondisyon ?? 0;
    document.getElementById("rate-hiz").value = s.hiz ?? 0;
    document.getElementById("rate-fizik").value = s.fizik ?? 0;
    document.getElementById("rate-def").value = s.defans ?? 0;
    document.getElementById("rate-oyunGorusu").value = s.oyunGorusu ?? 0;

    // Scroll'u en üste al
    window.scrollTo(0, 0);
    document.body.style.overflow = "hidden";
}

function closeRatePanel() {
    document.getElementById("rateModal").style.display = "none";
    document.body.style.overflow = "";
}



// ==========================================================
// MEVKİ SEÇİM (FM KART)
// ==========================================================
document.querySelectorAll(".fm-card").forEach(card => {
    card.onclick = () => {
        const posName = card.dataset.name;
        const mainPosVal = document.getElementById("mainPos").value;
        const subPosVal = document.getElementById("subPos").value;

        if (card.classList.contains("selected-main")) {
            document.getElementById("mainPos").value = "";
            card.classList.remove("selected-main");
            return;
        }
        if (card.classList.contains("selected-sub")) {
            document.getElementById("subPos").value = "";
            card.classList.remove("selected-sub");
            return;
        }
        if (mainPosVal && subPosVal) {
            notify("3. mevki seçilmesine izin verilmiyor.");
            return;
        }
        if (!mainPosVal) {
            document.getElementById("mainPos").value = posName;
            card.classList.add("selected-main");
            return;
        }
        if (!subPosVal) {
            document.getElementById("subPos").value = posName;
            card.classList.add("selected-sub");
            return;
        }
    };
});
// ==========================================================
// PROFİL KURULUM
// ==========================================================
const SETUP_QUESTIONS = [
    {
        id: "q1", text: "Rakibini geçerken en çok neye güvenirsin?",
        options: [
            { text: "Hızıma",            stats: { hiz:15, sut:5 } },
            { text: "Topla buluşmama",   stats: { pas:10, oyunGorusu:10 } },
            { text: "Pas oyunuma",       stats: { pas:15, oyunGorusu:5 } },
            { text: "Pozisyon almama",   stats: { oyunGorusu:15, defans:5 } }
        ]
    },
    {
        id: "q2", text: "Şut atarken önceliğin ne?",
        options: [
            { text: "Güç",                           stats: { sut:15, fizik:5 } },
            { text: "İsabet",                        stats: { sut:10, oyunGorusu:10 } },
            { text: "Köşe seçimi",                   stats: { sut:8, oyunGorusu:12 } },
            { text: "Fırsat bulmak bile yeterli",    stats: { sut:5, kondisyon:5 } }
        ]
    },
    {
        id: "q3", text: "Maçta ne kadar koşarsın?",
        options: [
            { text: "Çok koşarım, sahayı baştan başa gezerim",  stats: { kondisyon:20, hiz:5 } },
            { text: "Orta düzeyde, pozisyonuma göre",           stats: { kondisyon:12, oyunGorusu:8 } },
            { text: "Az koşarım, doğru anlarda hareket ederim", stats: { oyunGorusu:15, kondisyon:5 } }
        ]
    },
    {
        id: "q4", text: "Fiziksel olarak kendini nasıl tanımlarsın?",
        options: [
            { text: "Güçlü ve zorlu",   stats: { fizik:20, defans:5 } },
            { text: "Atletik ve hızlı", stats: { hiz:15, fizik:10 } },
            { text: "Çevik ve dengeli", stats: { hiz:10, kondisyon:10 } },
            { text: "Hafif yapılı",     stats: { hiz:10, pas:5 } }
        ]
    },
    {
        id: "q5", text: "Savunmada ne kadar etkilisin?",
        options: [
            { text: "Çok iyiyim, top çalmayı severim",    stats: { defans:20, fizik:5 } },
            { text: "Ortayım, gerekince müdahale ederim", stats: { defans:12, oyunGorusu:5 } },
            { text: "Savunma benim işim değil",           stats: { sut:8, hiz:5 } },
            { text: "Pozisyon alarak engel olurum",       stats: { defans:10, oyunGorusu:10 } }
        ]
    },
    {
        id: "q6", text: "Top kontrolün nasıl?",
        options: [
            { text: "Çok iyi, topa hakim olmayı severim", stats: { pas:15, oyunGorusu:10 } },
            { text: "İyi, basit pasları güvenle veririm", stats: { pas:12, kondisyon:5 } },
            { text: "Orta düzeyde",                      stats: { pas:8, hiz:5 } },
            { text: "Geliştirmem gereken bir alan",       stats: { kondisyon:8, fizik:5 } }
        ]
    },
    {
        id: "q7", text: "Sahayı okuma konusunda kendini nasıl değerlendirirsin?",
        options: [
            { text: "Çok iyi, birkaç adım öncesini görürüm",  stats: { oyunGorusu:20, pas:5 } },
            { text: "İyi, takım arkadaşlarımı iyi okurum",    stats: { oyunGorusu:15, pas:8 } },
            { text: "Orta düzeyde",                           stats: { oyunGorusu:8, kondisyon:5 } },
            { text: "Daha çok gelişmem lazım",                stats: { fizik:8, kondisyon:5 } }
        ]
    },
    {
        id: "q8", text: "Haftada kaç kez spor yaparsın?",
        options: [
            { text: "Her gün",         stats: { kondisyon:20, fizik:10 } },
            { text: "Haftada 3-4 kez", stats: { kondisyon:15, fizik:8 } },
            { text: "Haftada 1-2 kez", stats: { kondisyon:8, fizik:5 } },
            { text: "Düzensiz",        stats: { kondisyon:4, fizik:3 } }
        ]
    },
    {
        id: "q9", text: "Kaç yıldır futbol oynuyorsun?",
        options: [
            { text: "10 yıldan fazla", stats: { oyunGorusu:15, pas:10, sut:10 } },
            { text: "5-10 yıl",        stats: { oyunGorusu:10, pas:8, sut:8 } },
            { text: "2-5 yıl",         stats: { oyunGorusu:6, pas:5, sut:5 } },
            { text: "2 yıldan az",     stats: { kondisyon:5, hiz:5 } }
        ]
    }
];

let setupQIndex = 0;
let setupAnswers = {};

function showProfileSetup() {
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
    document.getElementById("navbar").style.display = "none";
    const pg = document.getElementById("profileSetup");
    pg.style.display = "block";
    pg.classList.add("active");

    // Adım 1'i göster, diğerlerini gizle
    document.getElementById("setupStep1").style.display = "block";
    document.getElementById("setupStep2").style.display = "none";
    document.getElementById("setupStep3").style.display = "none";
    const step4 = document.getElementById("setupStep4"); if (step4) step4.style.display = "none";

    // FM kartlara event ekle
    document.querySelectorAll(".setup-pos").forEach(card => {
        card.onclick = () => {
            const posName = card.dataset.name;
            const mainVal = document.getElementById("setupMainPos").value;
            const subVal  = document.getElementById("setupSubPos").value;

            if (card.classList.contains("selected-main")) {
                document.getElementById("setupMainPos").value = "";
                card.classList.remove("selected-main"); return;
            }
            if (card.classList.contains("selected-sub")) {
                document.getElementById("setupSubPos").value = "";
                card.classList.remove("selected-sub"); return;
            }
            if (mainVal && subVal) { notify("En fazla 2 mevki seçebilirsin."); return; }
            if (!mainVal) {
                document.getElementById("setupMainPos").value = posName;
                card.classList.add("selected-main");
            } else {
                document.getElementById("setupSubPos").value = posName;
                card.classList.add("selected-sub");
            }
        };
    });
}

function setupGoStep2() {
    if (!document.getElementById("setupMainPos").value) return notify("En az ana mevkini seç!");
    document.getElementById("setupStep1").style.display = "none";
    document.getElementById("setupStep2").style.display = "block";
    setupQIndex = 0;
    setupAnswers = {};
    renderSetupQuestion();
}

function renderSetupQuestion() {
    const q = SETUP_QUESTIONS[setupQIndex];
    document.getElementById("setupQuestionCounter").textContent = `Soru ${setupQIndex + 1} / ${SETUP_QUESTIONS.length}`;
    document.getElementById("setupQPrevBtn").style.display = setupQIndex > 0 ? "block" : "none";

    const saved = setupAnswers[q.id];
    document.getElementById("setupQuestionBox").innerHTML = `
        <h3>${q.text}</h3>
        ${q.options.map((opt, i) => `
            <button class="setup-option ${saved === i ? 'selected' : ''}"
                onclick="selectSetupOption(${i}, this)">${opt.text}</button>
        `).join("")}`;
}

function selectSetupOption(index, el) {
    document.querySelectorAll(".setup-option").forEach(b => b.classList.remove("selected"));
    el.classList.add("selected");
    setupAnswers[SETUP_QUESTIONS[setupQIndex].id] = index;
}

function setupQNext() {
    if (setupAnswers[SETUP_QUESTIONS[setupQIndex].id] === undefined) return notify("Bir seçenek seç!");
    if (setupQIndex < SETUP_QUESTIONS.length - 1) {
        setupQIndex++;
        renderSetupQuestion();
    } else {
        document.getElementById("setupStep2").style.display = "none";
        document.getElementById("setupStep3").style.display = "block";
    }
}

function setupQPrev() {
    if (setupQIndex > 0) { setupQIndex--; renderSetupQuestion(); }
}

function calculateStatsFromAnswers() {
    const base = { hiz:40, sut:40, pas:40, kondisyon:40, defans:40, fizik:40, oyunGorusu:40 };
    SETUP_QUESTIONS.forEach(q => {
        const idx = setupAnswers[q.id];
        if (idx === undefined) return;
        Object.entries(q.options[idx].stats).forEach(([k, v]) => {
            base[k] = Math.min(99, base[k] + v);
        });
    });
    return base;
}

async function setupFinish() {
    const mainPos = document.getElementById("setupMainPos").value;
    const subPos  = document.getElementById("setupSubPos").value;
    const traits = typeof getTraitPickerValue === "function" ? getTraitPickerValue("setupTraitPicker") : [];

    const fromQ = calculateStatsFromAnswers();
    const fromS = {
        hiz:        Number(document.getElementById("sliderHiz").value),
        sut:        Number(document.getElementById("sliderSut").value),
        pas:        Number(document.getElementById("sliderPas").value),
        kondisyon:  Number(document.getElementById("sliderKon").value),
        defans:     Number(document.getElementById("sliderDef").value),
        fizik:      Number(document.getElementById("sliderFiz").value),
        oyunGorusu: Number(document.getElementById("sliderOG").value)
    };

    const finalStats = {};
    Object.keys(fromS).forEach(k => {
        finalStats[k] = Math.round((fromQ[k] + fromS[k]) / 2);
    });

    const uid  = currentFirebaseUser?.uid;
    const name = currentDisplayName;

    if (!uid) return;

    // users koleksiyonuna kaydet
    await db.collection("users").doc(uid).set({
        profileCompleted: true,
        mainPos,
        subPos,
        traits,
        characterTraits: traits,
        selfStats: finalStats,
        statsLocked: true
    }, { merge: true });

    // Mevcut gruplardaki players dokümanlarını güncelle — YENİ DÖKÜMAN AÇMA
    const membersSnap = await db.collectionGroup("members").where("uid", "==", uid).get();
    for (const memberDoc of membersSnap.docs) {
        const groupId = memberDoc.ref.parent.parent.id;
        const groupUsername = memberDoc.data().username || name;
        const playerRef = await findPlayerDocInGroup(groupId, groupUsername, uid);
        await playerRef.set({
            mainPos,
            subPos,
            traits,
            characterTraits: traits,
            stats: finalStats
        }, { merge: true });
    }
const statLabels = { hiz:"Hız", sut:"Şut", pas:"Pas", kondisyon:"Kondisyon", defans:"Defans", fizik:"Fizik", oyunGorusu:"Oyun Görüşü" };
const sorted = Object.entries(finalStats).sort((a,b) => b[1]-a[1]);
const best = sorted.slice(0,2).map(([k]) => statLabels[k]).join(" ve ");
const weak = sorted.slice(-2).map(([k]) => statLabels[k]).join(" ve ");
const ovr = Math.round(Object.values(finalStats).reduce((a,b)=>a+b,0)/7);

// Mevkiye göre yorum
const posComments = {
    "Santrafor": "Forvet olarak şut ve hız değerlerin maçta belirleyici olacak.",
    "Merkez Orta": "Orta saha oyuncusu olarak pas ve oyun görüşün takımın motoru.",
    "Sol Kanat": "Kanat oyuncusu olarak hız ve şut kombinasyonun tehlikeli.",
    "Sağ Kanat": "Kanat oyuncusu olarak hız ve şut kombinasyonun tehlikeli.",
    "Sol Bek": "Bek olarak defans ve fizik değerlerin savunmada kritik.",
    "Sağ Bek": "Bek olarak defans ve fizik değerlerin savunmada kritik.",
    "Stoper": "Stoper olarak defans ve fizik değerlerin takımın kalkanı.",
    "Kaleci": "Kaleci olarak defans ve kondisyon değerlerin kaleyi koruyacak."
};
const posComment = posComments[mainPos] || "Sahada güçlü bir oyuncu profilin var.";

// OVR yorumu
const ovrComment = ovr >= 75 ? "Üst düzey bir oyuncu profiline sahipsin! 🔥" 
    : ovr >= 60 ? "Ortalamanın üzerinde bir oyuncu profilin var. 💪" 
    : "Gelişim potansiyeli yüksek bir oyuncu profilin var. 📈";
const modal = document.getElementById("profileAnalysisModal");
const content = document.getElementById("profileAnalysisContent");
if (modal && content) {
const appliedFinal = applyMatchBonus({mainPos, stats: finalStats}, finalStats);
const allStatsSorted = Object.entries(appliedFinal).sort((a,b) => b[1]-a[1]);
const topKey = allStatsSorted[0][0];

const playerType = 
    topKey === "sut" ? { tip: "⚡ Golcü Tipi", desc: "Sahada en tehlikeli silahın şutun. Kaleciyle karşı karşıya kaldığında soğukkanlılığını koruyorsun." } :
    topKey === "hiz" ? { tip: "💨 Hız Canavarı", desc: "Savunmaların kabusu! Arkana top atıldığında kimse sana yetişemiyor." } :
    topKey === "pas" ? { tip: "🎮 Oyun Kurucu", desc: "Takımının beyni sensin. Doğru anda doğru pasa kimse hayır diyemez." } :
    topKey === "defans" ? { tip: "🛡️ Kaya Gibi Defans", desc: "Rakip forvetler senden geçmeyi hayal bile edemez. Savunmada lidersin." } :
    topKey === "fizik" ? { tip: "💪 Fizik Canavarı", desc: "İkili mücadelelerde rakibin nefesi kesilir. Fiziksel üstünlüğün fark yaratıyor." } :
    topKey === "kondisyon" ? { tip: "🏃 Koşu Makinesi", desc: "90 dakika boyunca sahada en çok koşan sensin. Kondisyonun takımın motoru." } :
    { tip: "👁️ Zeki Oyuncu", desc: "Sahayı okuyan, pozisyon alan ve her zaman doğru yerde olan bir oyuncusun." };

const rankComment = 
    ovr >= 85 ? "🏆 Sen grubundaki en iyi oyunculardan birisin. Rakipler seni özellikle durdurmaya çalışır." :
    ovr >= 75 ? "⭐ Grubundaki güçlü oyuncular arasındasın. Sahada fark yaratan isimlerden birisin." :
    ovr >= 65 ? "📈 Ortalamanın üzerinde bir profil. Biraz daha çalışırsan elit seviyeye ulaşabilirsin." :
    ovr >= 55 ? "💡 Gelişim yolundasın. Güçlü yönlerini daha sık kullanan daha etkili olursun." :
    "🌱 Her büyük oyuncu bir yerden başladı. Antrenman ve tutarlılıkla çok daha iyi olacaksın.";

const matchupTip =
    mainPos === "Santrafor" ? "💡 <b>Maç tüyosu:</b> Defansın arkasına koş, kaleciden önce topa değ." :
    mainPos === "Merkez Orta" ? "💡 <b>Maç tüyosu:</b> Topla döndüğünde etraftakileri oku. İlk pasın hep doğru olsun." :
    mainPos === "Sol Kanat" || mainPos === "Sağ Kanat" ? "💡 <b>Maç tüyosu:</b> Hız avantajını kullan, içe kes ve şut çek." :
    mainPos === "Sol Bek" || mainPos === "Sağ Bek" ? "💡 <b>Maç tüyosu:</b> Hücuma çıktığında arkandaki boşluğu unutma." :
    mainPos === "Stoper" ? "💡 <b>Maç tüyosu:</b> Topu erkenden kes, pozisyon alman şut çekmelerinden daha değerli." :
    mainPos === "Kaleci" ? "💡 <b>Maç tüyosu:</b> Çizgini iyi belirle, erken çıkma. Komutlarınla savunmayı yönet." :
    "💡 <b>Maç tüyosu:</b> Güçlü yönlerini en çok öne çıkarabileceğin pozisyonu bul.";

content.innerHTML = `
    <div style="background:linear-gradient(135deg,rgba(138,43,255,0.25),rgba(255,215,0,0.08));border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid rgba(255,215,0,0.3);text-align:center;">
        <div style="font-size:11px;color:#ffd700;font-weight:700;letter-spacing:2px;margin-bottom:6px;">⚡ GENEL PUAN</div>
        <div style="font-size:52px;font-weight:900;color:#a78bfa;line-height:1;">${ovr}</div>
        <div style="font-size:12px;color:rgba(255,215,0,0.7);font-weight:700;margin-bottom:8px;">OVR</div>
        <div style="background:rgba(138,43,255,0.2);border-radius:8px;padding:8px 12px;display:inline-block;">
            <span style="font-size:14px;font-weight:700;color:white;">${playerType.tip}</span>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:8px;line-height:1.5;">${playerType.desc}</div>
    </div>

    <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:12px;margin-bottom:10px;">
        <div style="font-size:11px;color:rgba(255,255,255,0.4);font-weight:700;margin-bottom:8px;letter-spacing:1px;">📊 İSTATİSTİKLER</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
        ${Object.entries(appliedFinal).map(([k,v]) => {
            const label = statLabels[k] || k;
            const color = v>=75?"#4ade80":v>=60?"#fbbf24":"#f87171";
            return `<div>
                <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                    <span style="font-size:11px;color:rgba(255,255,255,0.55);">${label}</span>
                    <span style="font-size:12px;font-weight:700;color:${color};">${v}</span>
                </div>
                <div style="background:rgba(255,255,255,0.08);border-radius:4px;height:5px;">
                    <div style="background:${color};width:${Math.min(v,99)}%;height:5px;border-radius:4px;"></div>
                </div>
            </div>`;
        }).join("")}
        </div>
    </div>

    <div style="background:rgba(74,222,128,0.08);border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid #4ade80;">
        <div style="font-size:11px;font-weight:700;color:#4ade80;margin-bottom:4px;">💪 EN GÜÇLÜ YÖNLERİN</div>
        <div style="font-size:15px;font-weight:700;color:white;">${best}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;">Bu alanlarda rakiplerini geride bırakıyorsun 🔥</div>
    </div>

    <div style="background:rgba(255,107,107,0.08);border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid #f87171;">
        <div style="font-size:11px;font-weight:700;color:#f87171;margin-bottom:4px;">📈 GELİŞTİRMEN GEREKEN</div>
        <div style="font-size:15px;font-weight:700;color:white;">${weak}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:3px;">Bu alanlara odaklanırsan seviye atlarsın 💡</div>
    </div>

    <div style="background:rgba(96,179,255,0.08);border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid #60b3ff;">
        <div style="font-size:11px;font-weight:700;color:#60b3ff;margin-bottom:4px;">🎯 MEVKİ YORUMU</div>
        <div style="font-size:13px;color:white;line-height:1.5;">${posComment}</div>
    </div>

    <div style="background:rgba(255,215,0,0.06);border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid #ffd700;">
        <div style="font-size:13px;color:rgba(255,255,255,0.85);line-height:1.6;">${matchupTip}</div>
    </div>

    <div style="background:rgba(138,43,255,0.1);border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid rgba(138,43,255,0.25);text-align:center;">
        <div style="font-size:13px;color:rgba(255,255,255,0.85);line-height:1.6;">${rankComment}</div>
    </div>

    <div style="font-size:10px;color:rgba(255,255,255,0.2);text-align:center;margin-top:4px;">
        Mevki bonusu uygulanmış istatistiklere göre hesaplandı
    </div>`;
modal.style.display = "flex";
}
    await openDashboard();
}

// ==========================================================
// DASHBOARD PROFİL PANELİ
// ==========================================================
async function loadDashProfile() {
    const panel = document.getElementById("dashProfilePanel");
    if (!panel || !currentFirebaseUser) return;

    const uid = currentFirebaseUser.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists || !userDoc.data().profileCompleted) return;

    const data = userDoc.data();
    panel.style.display = "block";

    // Analiz butonu — profil kartının köşesine
    const existingBtn = document.getElementById("profileAnalysisBtn");
    if (existingBtn) existingBtn.remove();
    if (true) {
        const btn = document.createElement("button");
        btn.id = "profileAnalysisBtn";
        btn.title = "Profil Analizini Gör";
        btn.innerHTML = "Profil Analizi";
        btn.style.cssText = `position:absolute;top:10px;right:10px;background:rgba(138,43,255,0.3);
            border:1px solid #a347ff;color:white;border-radius:999px;min-width:118px;height:32px;padding:0 12px;
            font-size:12px;font-weight:800;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center;`;
        btn.onclick = async () => {
            const uid = currentFirebaseUser?.uid;
            if (!uid) return;
            const userDoc = await db.collection("users").doc(uid).get();
            const data = userDoc.exists ? userDoc.data() : {};
            const selfStats = data.selfStats || {};
            const mainPos = data.mainPos || "";
            const tempPlayer = { mainPos, stats: selfStats };
            const appliedStats = applyMatchBonus(tempPlayer, selfStats);
            const ovr = getOVR_withBonus(tempPlayer);
            const statLabels = { hiz:"Hız", sut:"Şut", pas:"Pas", kondisyon:"Kondisyon", defans:"Defans", fizik:"Fizik", oyunGorusu:"Oyun Görüşü" };
            const sortedApplied = Object.entries(appliedStats).sort((a,b) => b[1]-a[1]);
            const best = sortedApplied.slice(0,2).map(([k]) => statLabels[k]).filter(Boolean).join(" ve ");
            const weak = sortedApplied.slice(-2).map(([k]) => statLabels[k]).filter(Boolean).join(" ve ");
            const posScores = {
                "Santrafor":   (appliedStats.sut||0)*2 + (appliedStats.hiz||0),
                "Sol Kanat":   (appliedStats.hiz||0)*2 + (appliedStats.sut||0),
                "Sağ Kanat":   (appliedStats.hiz||0)*2 + (appliedStats.sut||0),
                "Merkez Orta": (appliedStats.pas||0)*2 + (appliedStats.oyunGorusu||0),
                "Sol Bek":     (appliedStats.defans||0)*2 + (appliedStats.fizik||0),
                "Sağ Bek":     (appliedStats.defans||0)*2 + (appliedStats.fizik||0),
                "Stoper":      (appliedStats.defans||0)*3 + (appliedStats.fizik||0),
                "Kaleci":      (appliedStats.defans||0)*2 + (appliedStats.kondisyon||0)
            };
            const suggestedPos = Object.entries(posScores).sort((a,b) => b[1]-a[1])[0][0];
            const posMatch = suggestedPos === mainPos ? "✅ Seçtiğin mevki istatistiklerinle örtüşüyor."
                : `💡 İstatistiklerin <b>${suggestedPos}</b> mevkisine daha uygun görünüyor.`;
            const posComments = {
                "Santrafor": "Forvet olarak şut ve hız değerlerin maçta belirleyici olacak.",
                "Merkez Orta": "Orta saha oyuncusu olarak pas ve oyun görüşün takımın motoru.",
                "Sol Kanat": "Kanat oyuncusu olarak hız ve şut kombinasyonun tehlikeli.",
                "Sağ Kanat": "Kanat oyuncusu olarak hız ve şut kombinasyonun tehlikeli.",
                "Sol Bek": "Bek olarak defans ve fizik değerlerin savunmada kritik.",
                "Sağ Bek": "Bek olarak defans ve fizik değerlerin savunmada kritik.",
                "Stoper": "Stoper olarak defans ve fizik değerlerin takımın kalkanı.",
                "Kaleci": "Kaleci olarak defans ve kondisyon değerlerin kaleyi koruyacak."
            };
            const posComment = posComments[mainPos] || "Sahada güçlü bir oyuncu profilin var.";
            const ovrComment = ovr >= 75 ? "Üst düzey bir oyuncu profiline sahipsin! 🔥"
                : ovr >= 60 ? "Ortalamanın üzerinde bir oyuncu profilin var. 💪"
                : "Gelişim potansiyeli yüksek bir oyuncu profilin var. 📈";
            const modal = document.getElementById("profileAnalysisModal");
            const content = document.getElementById("profileAnalysisContent");
            if (modal && content) {
                content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;">
        <div>
            <div style="background:linear-gradient(135deg,rgba(138,43,255,0.25),rgba(255,215,0,0.08));border-radius:12px;padding:14px;margin-bottom:10px;border:1px solid rgba(255,215,0,0.3);text-align:center;">
                <div style="font-size:11px;color:#ffd700;font-weight:700;letter-spacing:2px;margin-bottom:4px;">⚡ GENEL PUAN</div>
                <div style="font-size:46px;font-weight:900;color:#a78bfa;line-height:1;">${ovr}</div>
                <div style="font-size:11px;color:rgba(255,215,0,0.7);font-weight:700;margin-bottom:6px;">OVR</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:4px;line-height:1.4;">${ovrComment}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px;">
                <div style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:700;margin-bottom:6px;letter-spacing:1px;">📊 İSTATİSTİKLER</div>
                <div style="display:flex;flex-direction:column;gap:5px;">
                ${Object.entries(appliedStats).map(([k,v]) => {
                    const label = statLabels[k] || k;
                    const color = v>=75?"#4ade80":v>=60?"#fbbf24":"#f87171";
                    return `<div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                            <span style="font-size:10px;color:rgba(255,255,255,0.55);">${label}</span>
                            <span style="font-size:11px;font-weight:700;color:${color};">${v}</span>
                        </div>
                        <div style="background:rgba(255,255,255,0.08);border-radius:3px;height:4px;">
                            <div style="background:${color};width:${Math.min(v,99)}%;height:4px;border-radius:3px;"></div>
                        </div>
                    </div>`;
                }).join("")}
                </div>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="background:rgba(74,222,128,0.08);border-radius:10px;padding:10px;border-left:3px solid #4ade80;">
                <div style="font-size:10px;font-weight:700;color:#4ade80;margin-bottom:3px;">💪 EN GÜÇLÜ YÖNLERİN</div>
                <div style="font-size:14px;font-weight:700;color:white;">${best}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">Rakiplerini geride bırakıyorsun 🔥</div>
            </div>
            <div style="background:rgba(255,107,107,0.08);border-radius:10px;padding:10px;border-left:3px solid #f87171;">
                <div style="font-size:10px;font-weight:700;color:#f87171;margin-bottom:3px;">📈 GELİŞTİRMEN GEREKEN</div>
                <div style="font-size:14px;font-weight:700;color:white;">${weak}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px;">Bu alanlara odaklanırsan seviye atlarsın 💡</div>
            </div>
            <div style="background:rgba(96,179,255,0.08);border-radius:10px;padding:10px;border-left:3px solid #60b3ff;">
                <div style="font-size:10px;font-weight:700;color:#60b3ff;margin-bottom:3px;">🎯 MEVKİ YORUMU</div>
                <div style="font-size:12px;color:white;line-height:1.4;">${posComment}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;">${posMatch}</div>
            </div>
            <div style="background:rgba(255,215,0,0.06);border-radius:10px;padding:10px;border-left:3px solid #ffd700;">
                <div style="font-size:12px;color:rgba(255,255,255,0.85);line-height:1.5;">💡 <b>Maç tüyosu:</b> ${
                    mainPos === "Santrafor" ? "Defansın arkasına koş, kaleciden önce topa değ." :
                    mainPos === "Merkez Orta" ? "Topla döndüğünde etraftakileri oku. İlk pasın hep doğru olsun." :
                    mainPos === "Sol Kanat" || mainPos === "Sağ Kanat" ? "Hız avantajını kullan, içe kes ve şut çek." :
                    mainPos === "Sol Bek" || mainPos === "Sağ Bek" ? "Hücuma çıktığında arkandaki boşluğu unutma." :
                    mainPos === "Stoper" ? "Topu erkenden kes, pozisyon alman şut çekmelerinden daha değerli." :
                    mainPos === "Kaleci" ? "Çizgini iyi belirle, erken çıkma." :
                    "Güçlü yönlerini en çok öne çıkarabileceğin pozisyonu bul."
                }</div>
            </div>
            <div style="background:rgba(138,43,255,0.1);border-radius:10px;padding:10px;border:1px solid rgba(138,43,255,0.25);text-align:center;">
                <div style="font-size:12px;color:rgba(255,255,255,0.85);line-height:1.5;">${
                    ovr >= 85 ? "🏆 Sen grubundaki en iyi oyunculardan birisin. Rakipler seni özellikle durdurmaya çalışır." :
                    ovr >= 75 ? "⭐ Grubundaki güçlü oyuncular arasındasın. Sahada fark yaratan isimlerden birisin." :
                    ovr >= 65 ? "📈 Ortalamanın üzerinde bir profil. Biraz daha çalışırsan elit seviyeye ulaşabilirsin." :
                    ovr >= 55 ? "💡 Gelişim yolundasın. Güçlü yönlerini daha sık kullanan daha etkili olursun." :
                    "🌱 Her büyük oyuncu bir yerden başladı. Antrenman ve tutarlılıkla çok daha iyi olacaksın."
                }</div>
            </div>
        </div>
    </div>
    <div style="font-size:10px;color:rgba(255,255,255,0.2);text-align:center;margin-top:8px;">
        Mevki bonusu uygulanmış istatistiklere göre hesaplandı
    </div>`;
                modal.style.display = "flex";
            }
        };
        panel.appendChild(btn);
    }

    const name = currentDisplayName || "";
    document.getElementById("dashProfileName").textContent = name.toUpperCase();
    document.getElementById("dashProfilePhoto").src = data.photo || DEFAULT_PHOTO;

    const mainPos = data.mainPos || "";
    const subPos  = data.subPos  || "";
    document.getElementById("dashMainPos").value = mainPos;
    document.getElementById("dashSubPos").value  = subPos;
    document.getElementById("dashProfilePos").textContent = mainPos || "-";

    document.querySelectorAll(".dash-pos").forEach(card => {
        card.classList.remove("selected-main", "selected-sub");
        if (card.dataset.name === mainPos) card.classList.add("selected-main");
        if (card.dataset.name === subPos)  card.classList.add("selected-sub");

        card.onclick = () => {
            const posName = card.dataset.name;
            const mVal = document.getElementById("dashMainPos").value;
            const sVal = document.getElementById("dashSubPos").value;
            if (card.classList.contains("selected-main")) {
                document.getElementById("dashMainPos").value = "";
                document.getElementById("dashProfilePos").textContent = "-";
                card.classList.remove("selected-main"); return;
            }
            if (card.classList.contains("selected-sub")) {
                document.getElementById("dashSubPos").value = "";
                card.classList.remove("selected-sub"); return;
            }
            if (mVal && sVal) { notify("En fazla 2 mevki seçebilirsin."); return; }
            if (!mVal) {
                document.getElementById("dashMainPos").value = posName;
                document.getElementById("dashProfilePos").textContent = posName;
                card.classList.add("selected-main");
            } else {
                document.getElementById("dashSubPos").value = posName;
                card.classList.add("selected-sub");
            }
        };
    });

    // Stats hesapla — bonus dahil
    const selfStats = data.displayStats || data.selfStats || {};
    const tempPlayer = { mainPos, stats: selfStats };
    const applied = applyMatchBonus(tempPlayer, selfStats);
    const ovr = getOVR_withBonus(tempPlayer);

    document.getElementById("dashProfileOVR").textContent = ovr;
    renderFormStatus(data.displayName || currentDisplayName || "");
    document.getElementById("dash-hiz").textContent       = applied.hiz        || 0;
    document.getElementById("dash-sut").textContent       = applied.sut        || 0;
    document.getElementById("dash-pas").textContent       = applied.pas        || 0;
    document.getElementById("dash-kondisyon").textContent = applied.kondisyon  || 0;
    document.getElementById("dash-defans").textContent    = applied.defans     || 0;
    document.getElementById("dash-fizik").textContent     = applied.fizik      || 0;
}
async function updateDashPhoto() {
    const fileInput = document.getElementById("dashProfilUpload");
    const file = fileInput.files[0];
    if (!file) { notify("Lütfen bir dosya seç!"); return; }

    const btn = document.querySelector('button[onclick="updateDashPhoto()"]');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.textContent = "Yükleniyor ⏳";
    }

    // Tarayıcıya render için 1 frame ver
    await new Promise(r => setTimeout(r, 50));

    try {
        const url = await uploadImageToStorage(file, "profile_photos");
        const uid = currentFirebaseUser?.uid;
        const name = currentDisplayName;
        if (!uid) return;

        await db.collection("users").doc(uid).set({ photo: url }, { merge: true });

        const membersSnap = await db.collectionGroup("members").where("uid", "==", uid).get();
        for (const memberDoc of membersSnap.docs) {
            const groupId = memberDoc.ref.parent.parent.id;
            const groupUsername = memberDoc.data().username || name;
            const playerRef = await findPlayerDocInGroup(groupId, groupUsername, uid);
            await playerRef.set({ photo: url }, { merge: true });
        }

        document.getElementById("dashProfilePhoto").src = url;
        notify("Fotoğraf güncellendi!");
    } catch (e) {
        console.warn(e);
        notify("Fotoğraf yüklenemedi.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = "";
            btn.style.cursor = "";
            btn.textContent = "Fotoğrafı Güncelle";
        }
    }
}
async function saveDashPositions() {
    const mainPos = document.getElementById("dashMainPos").value;
    const subPos  = document.getElementById("dashSubPos").value;
    if (!mainPos) return notify("Ana mevki seç!");
    const uid  = currentFirebaseUser?.uid;
    const name = currentDisplayName;
    if (!uid) return;
    const traits = typeof getTraitPickerValue === "function" ? getTraitPickerValue("profileTraitPicker") : ((CACHE.players || []).find(x => x.name === currentUser)?.traits || []);
    await db.collection("users").doc(uid).set({ mainPos, subPos, traits, characterTraits: traits }, { merge: true });
    const membersSnap = await db.collectionGroup("members").where("uid", "==", uid).get();
   for (const memberDoc of membersSnap.docs) {
    const groupId = memberDoc.ref.parent.parent.id;
    const groupUsername = memberDoc.data().username || name;
    const playerRef = await findPlayerDocInGroup(groupId, groupUsername, uid);
    await playerRef.set({ mainPos, subPos, traits, characterTraits: traits }, { merge: true });
}
    await loadDashProfile();
    notify("Mevkiler kaydedildi!");
}

// YENİ — BUNU YAPISTIR
async function findPlayerDocInGroup(groupId, name, uid) {
    const playersRef = db.collection("groups").doc(groupId).collection("players");

    // Önce CACHE'den bak — Firestore sorgusu yapmadan
    if (uid) {
        const cached = CACHE.players?.find(p => p.uid === uid);
        if (cached) return playersRef.doc(cached.id || cached.name || name);
    }

    // 1. Direkt doc(name) dene — en hızlı yol
    const directRef = playersRef.doc(name);
    const directDoc = await directRef.get();
    if (directDoc.exists) return directRef;

    // 2. uid alanına göre ara
    if (uid) {
        const byUidSnap = await playersRef.where("uid", "==", uid).limit(1).get();
        if (!byUidSnap.empty) return byUidSnap.docs[0].ref;
    }

    // 3. name alanına göre sorgu
    const byNameSnap = await playersRef.where("name", "==", name).limit(1).get();
    if (!byNameSnap.empty) return byNameSnap.docs[0].ref;

    // 4. Yoksa oluştur
    await directRef.set({ name, uid: uid || null, photo: DEFAULT_PHOTO }, { merge: true });
    return directRef;
}

// ==========================================================
// DASHBOARD FORM DURUMU — tüm gruplardaki gol/galibiyet/puan verilerini özetler
// ==========================================================
async function renderFormStatus(playerName) {
    const box = document.getElementById("formStatusBox");
    const content = document.getElementById("formStatusContent");
    const badge = document.getElementById("formStatusBadge");
    if (!box || !content || !badge || !currentFirebaseUser) return;

    box.style.display = "block";
    content.textContent = "Form analizi yükleniyor...";
    badge.textContent = "Analiz";

    try {
        const uid = currentFirebaseUser.uid;
        const membersSnap = await db.collectionGroup("members").where("uid", "==", uid).get();
        const groupRefs = membersSnap.docs.slice(0, 10).map(doc => ({
            groupId: doc.ref.parent.parent.id,
            username: doc.data().username || playerName
        }));

        let totalGoals = 0;
        let totalWins = 0;
        let ratingSum = 0;
        let ratingCount = 0;
        let activeGroups = 0;

        await Promise.all(groupRefs.map(async ({ groupId, username }) => {
            const groupRef = db.collection("groups").doc(groupId);
            const [gaSnap, winSnap, ratingSnap] = await Promise.all([
                groupRef.collection("ga").where("name", "==", username).limit(50).get().catch(() => null),
                groupRef.collection("winners").limit(50).get().catch(() => null),
                groupRef.collection("ratings").where("to", "==", username).limit(50).get().catch(() => null)
            ]);

            if (gaSnap) {
                activeGroups++;
                gaSnap.forEach(d => { totalGoals += Number(d.data().gol || 0); });
            }
            if (winSnap) {
                winSnap.forEach(d => {
                    const players = d.data().players || [];
                    if (Array.isArray(players) && players.includes(username)) totalWins++;
                });
            }
            if (ratingSnap) {
                ratingSnap.forEach(d => {
                    ratingSum += Number(d.data().score || 0);
                    ratingCount++;
                });
            }
        }));

        const avgRating = ratingCount ? ratingSum / ratingCount : 0;
        const formScore = Math.round((totalGoals * 8) + (totalWins * 10) + (avgRating * 8) + Math.min(ratingCount, 10));
        const level = formScore >= 85 ? "Çok Formda" : formScore >= 55 ? "Formda" : formScore >= 25 ? "Yükselişte" : "Veri Az";
        badge.textContent = level;

        content.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;text-align:center;">
                <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:8px;"><b style="display:block;font-size:18px;color:#4ade80;">${totalGoals}</b><span style="font-size:11px;color:rgba(255,255,255,.55);">Gol</span></div>
                <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:8px;"><b style="display:block;font-size:18px;color:#ffd700;">${totalWins}</b><span style="font-size:11px;color:rgba(255,255,255,.55);">Galibiyet</span></div>
                <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:8px;"><b style="display:block;font-size:18px;color:#a78bfa;">${avgRating ? avgRating.toFixed(1) : "-"}</b><span style="font-size:11px;color:rgba(255,255,255,.55);">Ort. Puan</span></div>
            </div>
            <div>${activeGroups || groupRefs.length} grup verisine göre form skorun <b>${formScore}</b>. ${level === "Çok Formda" ? "Sahada direkt fark yaratıyorsun." : level === "Formda" ? "Düzenli katkı veriyorsun; gol/galibiyet sayısı arttıkça skorun yükselecek." : level === "Yükselişte" ? "İyi sinyaller var; daha fazla maç verisiyle analiz güçlenecek." : "Henüz yeterli maç verisi yok; gol, galibiyet ve puanlar geldikçe analiz netleşir."}</div>
        `;
    } catch (e) {
        console.warn("Form analizi yüklenemedi:", e);
        badge.textContent = "-";
        content.textContent = "Form analizi için yeterli veriye ulaşılamadı.";
    }
}
