/* ==========================================================
   KADRO.JS — kadro oluştur, haftanın kadrosu, swap, analiz
========================================================= */

let currentWeeklyData = null;

// ==========================================================
// KATILIM
// ==========================================================
async function saveAttendance() {
    if (!currentUser) return;
    let coming = document.getElementById("comingCheck").checked;
    await C("attendance").doc(currentUser).set({
        user: currentUser, coming, timestamp: new Date().toISOString()
    });
    notify("Katılım Kaydedildi");
}

async function loadUserAttendanceState() {
    if (!currentUser || currentUser.trim() === "") return;
    const check = document.getElementById("comingCheck");
    const status = document.getElementById("comingStatus");
    if (!check) return;
    try {
        const ref = await C("attendance").doc(currentUser).get();
        const coming = ref.exists ? (ref.data().coming === true) : false;
        // iOS için zorla set et
        check.checked = coming;
        check.setAttribute("checked", coming ? "checked" : "");
        if (!coming) {
            check.removeAttribute("checked");
            if (status) status.innerText = "";
        }
    } catch(e) {
        console.warn("loadUserAttendanceState error:", e);
    }
}

async function getMyOrder(user) {
    const attSnap = await C("attendance").orderBy("timestamp", "asc").get();
    let index = 1;
    for (const a of attSnap.docs) {
        const data = a.data();
        if (data.coming) {
            if (data.user === user) return index;
            index++;
        }
    }
    return null;
}

// ==========================================================
// KADRO OYUNCU GRİDİ
// ==========================================================
async function loadKadroPlayerGrid() {
    const limit = getMatchLimit();
    updateMatchLabelUI();
    const attSnap = await C("attendance").orderBy("timestamp", "asc").get();
const snap = { forEach: (cb) => CACHE.players.forEach(p => cb({ data: () => p, id: p.id })) };

    let orderMap = {};
    let index = 1;
    attSnap.forEach(a => {
        const data = a.data();
        if (data.coming) { orderMap[data.user] = index; index++; }
    });

    const grid = document.getElementById("kadroPlayerGrid");
    grid.innerHTML = "";
    selectedPlayers = [];

    snap.forEach(doc => {
        const p = doc.data();
        const id = doc.id;
        const div = document.createElement("div");
        div.className = "player-item";
        div.innerText = p.name;
        div.dataset.id = id;
        div.style.position = "relative";
        let sira = orderMap[p.name] || null;

        if (sira !== null) {
            const badge = document.createElement("div");
            badge.innerText = sira;
            badge.style.cssText = `position:absolute;top:3px;left:6px;font-size:11px;font-weight:700;padding:2px 5px;border-radius:6px;`;
            badge.style.background = sira <= limit ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.8)";
            badge.style.color = "#fff";
            div.appendChild(badge);
        }

        if (sira !== null && sira <= limit) {
            div.classList.add("selected");
            selectedPlayers.push(id);
        }

        div.addEventListener("click", () => {
            if (div.classList.contains("selected")) {
                div.classList.remove("selected");
                selectedPlayers = selectedPlayers.filter(x => x !== id);
            } else {
                if (selectedPlayers.length >= limit) {
                    alert(`En fazla ${limit} oyuncu seçebilirsin!`);
                    return;
                }
                div.classList.add("selected");
                selectedPlayers.push(id);
            }
            updateGKDropdowns();
        });

        grid.appendChild(div);
    });

    updateGKDropdowns();
}

function updateGKDropdowns() {
    const gkA = document.querySelector("#gkASelect .custom-options");
    const gkB = document.querySelector("#gkBSelect .custom-options");
    gkA.innerHTML = "";
    gkB.innerHTML = "";
    selectedPlayers.forEach(id => {
        const p = CACHE.players.find(x => x.id === id);
        if (!p) return;
        gkA.innerHTML += `<div class="option" data-id="${id}">${p.name}</div>`;
        gkB.innerHTML += `<div class="option" data-id="${id}">${p.name}</div>`;
    });
    initCustomSelects();
}

function selectGKA(playerId, playerName) {
    const el = document.querySelector("#gkASelect");
    el.dataset.value = playerId;
    el.querySelector(".custom-display").innerText = playerName;
}

function selectGKB(playerId, playerName) {
    const el = document.querySelector("#gkBSelect");
    el.dataset.value = playerId;
    el.querySelector(".custom-display").innerText = playerName;
}

function clearKadroUI() {
    selectedPlayers = [];
    document.querySelectorAll("#kadroPlayerGrid .player-item").forEach(div => div.classList.remove("selected"));
}

async function resetWeek() {
    const attQ = await C("attendance").get();
	await Promise.all(attQ.docs.map(d => d.ref.delete()));
    const saha = document.getElementById("matchSahaInput")?.value || "";
    const tarih = document.getElementById("matchTarihInput")?.value || "";
    const saat = document.getElementById("matchSaatInput")?.value || "";
    const konum = document.getElementById("matchKonumInput")?.value || "";
    await C("weekNote").doc("latest").set({ saha, tarih, saat, konum, timestamp: new Date().toISOString() });
    await C("haftaninKadro").doc("latest").delete();
    notify("Yeni hafta başlatıldı!");
    const ch = document.getElementById("comingCheck");
    if (ch) ch.checked = false;
    clearKadroUI();
    if (typeof loadHaftaninKadro === "function") loadHaftaninKadro();
}

// ==========================================================
// KADRO OLUŞTUR BUTONU
// ==========================================================
document.getElementById("buildBtn").onclick = async () => {
    const matchSize = getMatchSize();
    const limit = matchSize * 2;
    updateMatchLabelUI();

    if (selectedPlayers.length !== limit)
        return alert(`${limit} oyuncu seçmelisin! (${matchSize}/${matchSize})`);

    const gkA = document.querySelector("#gkASelect").dataset.value;
    const gkB = document.querySelector("#gkBSelect").dataset.value;
    if (!gkA || !gkB) return alert("Kalecileri seç!");

    const result = buildBalancedTeams(selectedPlayers, gkA, gkB, matchSize);
    printTeamOVRs(result.teamA, result.teamB);

    posMap = result.posMap;
    window.lastResult = result;

    const dataToSave = {
        teamA: clean(result.teamA), teamB: clean(result.teamB),
        posMap: clean(result.posMap), matchSize, limit,
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
    notify ("Kadro oluşturuldu!");
};

// ==========================================================
// HAFTANIN KADROSU
// ==========================================================
async function loadHaftaninKadro() {
    const userPanel = document.getElementById("userAttendancePanel");
    const squadPanel = document.getElementById("weeklySquadPanel");


    const snap = await C("haftaninKadro").doc("latest").get();
    const noteSnap = await C("weekNote").doc("latest").get();
    const noteData = noteSnap.exists ? noteSnap.data() : {};
    const noteBox = document.getElementById("weekNoteBox");

    const saha = noteData.saha || "";
    const tarih = noteData.tarih || "";
    const saat = noteData.saat || "";
    const konum = noteData.konum || "";

    let tarihStr = "";
    if (tarih) {
        const d = new Date(tarih + "T00:00:00");
        tarihStr = d.toLocaleDateString("tr-TR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }

    const hasInfo = saha || tarih || konum;
if (noteBox) {
    if (!hasInfo && !isAdmin) {
        noteBox.style.display = "none";
    } else {
        noteBox.style.display = "block";
        const sahaEl = document.getElementById("matchSahaBox");
		if (!hasInfo && isAdmin) {
        if (sahaEl) sahaEl.textContent = "⚙️ Maç bilgisi henüz girilmedi";
    }
        const tsEl = document.getElementById("matchTarihSaatBox");
        const konumEl = document.getElementById("matchKonumBox");
        if (sahaEl) sahaEl.textContent = saha ? "🏟️ " + saha : "";
        if (tsEl) tsEl.textContent = tarihStr ? (tarihStr + (saat ? " — ⏰ " + saat : "")) : (saat ? "⏰ " + saat : "");
        if (konumEl) konumEl.innerHTML = konum ? "📍 " + (konum.startsWith("http") ? `<a href="${konum}" target="_blank" style="color:#d4aaff">${konum}</a>` : konum) : "";

        // Admin düzenleme butonu
        const existingEditBtn = document.getElementById("weekNoteEditBtn");
        if (existingEditBtn) existingEditBtn.remove();
        const existingEditPanel = document.getElementById("weekNoteEditPanel");
        if (existingEditPanel) existingEditPanel.remove();

        if (isAdmin) {
            const editBtn = document.createElement("button");
            editBtn.id = "weekNoteEditBtn";
            editBtn.innerHTML = "✏️";
            editBtn.title = "Bilgileri Düzenle";
            editBtn.style.cssText = `position:absolute;top:4px;right:8px;background:rgba(138,43,255,0.3);
                border:1px solid #a347ff;color:white;border-radius:6px;padding:4px 8px;
                font-size:14px;cursor:pointer;`;

            const editPanel = document.createElement("div");
            editPanel.id = "weekNoteEditPanel";
            editPanel.style.cssText = `display:none;margin-top:14px;padding:14px;
                background:rgba(255,255,255,0.05);border-radius:10px;
                border:1px solid rgba(138,43,255,0.3);`;
            editPanel.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <input id="editSahaInput" type="text" placeholder="🏟️ Saha İsmi" value="${saha}"
                        style="padding:8px;border-radius:6px;border:none;background:rgba(255,255,255,0.1);color:white;">
                    <div style="display:flex;gap:8px;">
                        <input id="editTarihInput" type="date" value="${noteData.tarih || ""}"
                            style="flex:1;padding:8px;border-radius:6px;border:none;background:rgba(255,255,255,0.1);color:white;color-scheme:dark;">
                        <input id="editSaatInput" type="time" value="${noteData.saat || ""}"
                            style="flex:1;padding:8px;border-radius:6px;border:none;background:rgba(255,255,255,0.1);color:white;color-scheme:dark;">
                    </div>
                    <input id="editKonumInput" type="text" placeholder="📍 Konum veya Google Maps linki" value="${konum}"
                        style="flex:1;padding:8px;border-radius:6px;border:none;background:rgba(255,255,255,0.1);color:white;color-scheme:dark;">
                    <select id="editMatchSize"
                        style="padding:8px;border-radius:6px;border:none;background:#1a0a2e;color:white;">
                        <option value="6" ${Number(noteData?.matchSize)===6?"selected":""}>Katılımcı Sayısı: 6/6</option>
<option value="7" ${Number(noteData?.matchSize)===7?"selected":""}>Katılımcı Sayısı: 7/7</option>
<option value="8" ${!noteData?.matchSize||Number(noteData?.matchSize)===8?"selected":""}>Katılımcı Sayısı: 8/8</option>
<option value="9" ${Number(noteData?.matchSize)===9?"selected":""}>Katılımcı Sayısı: 9/9</option>
<option value="10" ${Number(noteData?.matchSize)===10?"selected":""}>Katılımcı Sayısı: 10/10</option>
<option value="11" ${Number(noteData?.matchSize)===11?"selected":""}>Katılımcı Sayısı: 11/11</option>
                    </select>
                    <button onclick="weekNoteUpdate()" style="padding:8px;border-radius:6px;border:none;
                        background:rgba(138,43,255,0.6);color:white;font-weight:700;cursor:pointer;">
                        💾 Kaydet
                    </button>
                </div>`;

            editBtn.onclick = () => {
                editPanel.style.display = editPanel.style.display === "none" ? "block" : "none";
            };

            noteBox.style.position = "relative";
            noteBox.appendChild(editBtn);
            noteBox.appendChild(editPanel);
        }
    }
}

    if (!snap.exists) {
    if (userPanel) {
        userPanel.style.display = "block";
        setTimeout(() => {
            if (currentUser && currentUser.trim() !== "") loadUserAttendanceState();
        }, 200);
    }
        const teamABox = document.getElementById("haftaTeamA");
        const teamBBox = document.getElementById("haftaTeamB");
        const field = document.getElementById("playersOnField");
        if (teamABox) teamABox.innerHTML = "";
        if (teamBBox) teamBBox.innerHTML = "";
        if (field) field.innerHTML = "";
        return;
    }

    if (userPanel) userPanel.style.display = "none";
	if (squadPanel) squadPanel.style.display = "block";

    const data = snap.data();
    const posMap = data.posMap || {};
    const matchSize = Number(data.matchSize) || 8;

    currentKadroPosMap = { ...posMap };
    currentWeeklyData = data;

    const teamABox = document.getElementById("haftaTeamA");
    const teamBBox = document.getElementById("haftaTeamB");
    const field = document.getElementById("playersOnField");
    teamABox.innerHTML = "";
    teamBBox.innerHTML = "";
    field.innerHTML = "";

    const FORMATION_BY_SIZE = {
    6:  ["GK", "CB", "LB", "RB", "CM", "ST"],
    7:  ["GK", "CB", "CBX", "CM", "LW", "RW", "ST"],
    8:  ["GK", "CB", "LB", "RB", "CM", "LW", "RW", "ST"],
    9:  ["GK", "CB", "LB", "RB", "CM", "CMX", "LW", "RW", "ST"],
    10: ["GK", "CB", "CBX", "LB", "RB", "CM", "CMX", "LW", "RW", "ST"],
    11: ["GK", "CB", "CBX", "LB", "RB", "CM", "CMX", "LW", "RW", "ST", "STX"]
};

    let posList = (FORMATION_BY_SIZE[matchSize] || FORMATION_BY_SIZE[8]).slice();
    const existsInCache = (id) => !!id && !!CACHE.players.find(p => p.id === id);
    posList = posList.filter(pos => existsInCache(posMap[pos]) || existsInCache(posMap[pos + "2"]));

    const getOVRLocal = (p) => p?.matchOVR ?? getOVR_withBonus(p);
    const getOvrClass = (o) => o >= 85 ? "ovr-gold" : o >= 75 ? "ovr-silver" : "ovr-bronze";

    posList.forEach(pos => {
        const A_id = posMap[pos] || null;
        const B_id = posMap[pos + "2"] || null;
        const A_player = CACHE.players.find(p => p.id === A_id);
        const B_player = CACHE.players.find(p => p.id === B_id);
        if (A_player) preparePlayerForMatch(A_player);
        if (B_player) preparePlayerForMatch(B_player);
        const posName = posTranslate(pos);
        const ovrA = getOVRLocal(A_player);
        const ovrB = getOVRLocal(B_player);
        const classA = getOvrClass(ovrA);
        const classB = getOvrClass(ovrB);

        teamABox.innerHTML += `
            <div class="hkPlayer ${isAdmin ? 'swap-clickable' : ''}" data-team="A" data-pos="${pos}">
                <img class="hkFormImg" src="${FORMA_A}">
                <div class="playerOVR ${classA}">${A_player ? ovrA : "-"}</div>
                <span>${A_player ? A_player.name : "-"}</span>
                <span class="playerPos">${A_player ? posName : "-"}</span>
            </div>`;

        teamBBox.innerHTML += `
            <div class="hkPlayer ${isAdmin ? 'swap-clickable' : ''}" data-team="B" data-pos="${pos}">
                <img class="hkFormImg" src="${FORMA_B}">
                <div class="playerOVR ${classB}">${B_player ? ovrB : "-"}</div>
                <span>${B_player ? B_player.name : "-"}</span>
                <span class="playerPos">${B_player ? posName : "-"}</span>
            </div>`;
    });

    const COORDS_BY_SIZE_A = {
    6:  { "GK":{x:8,y:44},  "CB":{x:28,y:44}, "LB":{x:35,y:20}, "RB":{x:35,y:68}, "CM":{x:52,y:44}, "ST":{x:72,y:44} },
    7:  { "GK":{x:8,y:44},  "CB":{x:22,y:44}, "CBX":{x:22,y:26},"CM":{x:45,y:44}, "LW":{x:62,y:14}, "RW":{x:62,y:74}, "ST":{x:74,y:44} },
    8:  { "GK":{x:8,y:44},  "CB":{x:22,y:44}, "LB":{x:28,y:16}, "RB":{x:28,y:72}, "CM":{x:48,y:44}, "LW":{x:62,y:12}, "RW":{x:62,y:76}, "ST":{x:74,y:44} },
    9:  { "GK":{x:8,y:44},  "CB":{x:20,y:44}, "LB":{x:26,y:16}, "RB":{x:26,y:72}, "CM":{x:44,y:34}, "CMX":{x:44,y:54},"LW":{x:60,y:12}, "RW":{x:60,y:76}, "ST":{x:74,y:44} },
    10: { "GK":{x:8,y:44},  "CB":{x:20,y:36}, "CBX":{x:20,y:52},"LB":{x:26,y:16}, "RB":{x:26,y:72}, "CM":{x:44,y:34}, "CMX":{x:44,y:54},"LW":{x:60,y:12}, "RW":{x:60,y:76}, "ST":{x:74,y:44} },
    11: { "GK":{x:8,y:44},  "CB":{x:20,y:36}, "CBX":{x:20,y:52},"LB":{x:26,y:16}, "RB":{x:26,y:72}, "CM":{x:44,y:34}, "CMX":{x:44,y:54},"LW":{x:60,y:12}, "RW":{x:60,y:76}, "ST":{x:72,y:34}, "STX":{x:72,y:54} }
};

const COORDS_BY_SIZE_B = {
    6:  { "GK":{x:92,y:44}, "CB":{x:72,y:44}, "LB":{x:65,y:72}, "RB":{x:65,y:28}, "CM":{x:48,y:44}, "ST":{x:28,y:44} },
    7:  { "GK":{x:92,y:44}, "CB":{x:78,y:44}, "CBX":{x:78,y:62},"CM":{x:55,y:44}, "LW":{x:38,y:74}, "RW":{x:38,y:14}, "ST":{x:26,y:44} },
    8:  { "GK":{x:92,y:44}, "CB":{x:78,y:44}, "LB":{x:72,y:72}, "RB":{x:72,y:16}, "CM":{x:52,y:44}, "LW":{x:38,y:76}, "RW":{x:38,y:12}, "ST":{x:26,y:44} },
    9:  { "GK":{x:92,y:44}, "CB":{x:80,y:44}, "LB":{x:74,y:72}, "RB":{x:74,y:16}, "CM":{x:56,y:54}, "CMX":{x:56,y:34},"LW":{x:40,y:76}, "RW":{x:40,y:12}, "ST":{x:26,y:44} },
    10: { "GK":{x:92,y:44}, "CB":{x:80,y:52}, "CBX":{x:80,y:36},"LB":{x:74,y:72}, "RB":{x:74,y:16}, "CM":{x:56,y:54}, "CMX":{x:56,y:34},"LW":{x:40,y:76}, "RW":{x:40,y:12}, "ST":{x:26,y:44} },
    11: { "GK":{x:92,y:44}, "CB":{x:80,y:52}, "CBX":{x:80,y:36},"LB":{x:74,y:72}, "RB":{x:74,y:16}, "CM":{x:56,y:54}, "CMX":{x:56,y:34},"LW":{x:40,y:76}, "RW":{x:40,y:12}, "ST":{x:28,y:54}, "STX":{x:28,y:34} }
};

const coordsA = COORDS_BY_SIZE_A[matchSize] || COORDS_BY_SIZE_A[8];
const coordsB = COORDS_BY_SIZE_B[matchSize] || COORDS_BY_SIZE_B[8];

    function drawOnField(player, pos, team) {
        if (!player) return;
        const posXY = team === "A" ? coordsA[pos] : coordsB[pos];
        if (!posXY) return;
        field.innerHTML += `
            <div class="playerMark" style="left:${posXY.x}%; top:${posXY.y}%;">
                <div class="formWrapper">
                    <img class="formImg" src="${team === "A" ? FORMA_A : FORMA_B}">
                    <span class="formNumber">${player.matchOVR ?? getOVR_withBonus(player)}</span>
                </div>
                <div class="playerName">${player.name}</div>
            </div>`;
    }

    posList.forEach(pos => {
        drawOnField(CACHE.players.find(p => p.id === posMap[pos]), pos, "A");
        drawOnField(CACHE.players.find(p => p.id === posMap[pos + "2"]), pos, "B");
    });

    if (isAdmin) {
        document.querySelectorAll(".swap-clickable").forEach(el => {
            el.onclick = () => adminSwapClick(el, posList);
        });
    }
	setTimeout(() => {
    if (currentUser && currentUser.trim() !== "") loadUserAttendanceState();
}, 200);
    const analizBox = document.getElementById("takimAnalizBox");
    if (analizBox) {
        analizBox.style.display = data?.matchCompleted ? "none" : "block";
        const analizContent = document.getElementById("analizContent");
        if (analizContent && !data?.matchCompleted) analizContent.innerHTML = "<span style='color:#aaa; font-style:italic;'>Kadro hazır — analiz için butona tıkla.</span>";
        const analizBtn = document.getElementById("analizBtn");
        if (analizBtn && !data?.matchCompleted) { analizBtn.disabled = false; analizBtn.textContent = "🤖 Analiz Et"; }
    }

    const weekNoteBox = document.getElementById("weekNoteBox");
    if (weekNoteBox && data?.matchCompleted) weekNoteBox.style.display = "none";

    renderWeeklyMatchControls(data);
}

function weeklyTeamNames(data, team) {
    const posMap = data?.posMap || {};
    const raw = Array.isArray(data?.[team === "A" ? "teamA" : "teamB"]) ? data[team === "A" ? "teamA" : "teamB"] : [];
    const ids = new Set(raw.filter(Boolean));
    Object.keys(posMap).forEach(k => {
        const isB = k.endsWith("2");
        if ((team === "B" && isB) || (team === "A" && !isB)) ids.add(posMap[k]);
    });
    return Array.from(ids).map(id => CACHE.players.find(p => p.id === id)?.name || id).filter(Boolean);
}

function weeklyWeekId(data) {
    return data?.createdAt || data?.completedAt || "latest";
}

function renderWeeklyMatchControls(data) {
    const resultPanel = document.getElementById("weeklyMatchResultPanel");
    const ratingPanel = document.getElementById("weeklyRatingPanel");
    if (!resultPanel || !ratingPanel) return;

    const completed = !!data?.matchCompleted;
    const winnerTeam = data?.winnerTeam || "";

    if (isAdmin) {
        resultPanel.style.display = "block";
        resultPanel.innerHTML = completed
            ? `<div class="weekly-result-card done"><b>✅ Maç tamamlandı</b><span>Kazanan: ${winnerTeam === "A" ? "A Takımı" : winnerTeam === "B" ? "B Takımı" : "Seçilmedi"}</span></div>`
            : `<div class="weekly-result-card"><b>Admin İşlemi</b><span>Maç bittiyse kazanan takımı seç.</span><button class="btn" onclick="openWeeklyCompleteDialog()">🏁 Maç Tamamlandı</button></div>`;
    } else {
        resultPanel.style.display = completed ? "block" : "none";
        resultPanel.innerHTML = completed ? `<div class="weekly-result-card done"><b>✅ Maç tamamlandı</b><span>Kazanan: ${winnerTeam === "A" ? "A Takımı" : "B Takımı"}</span></div>` : "";
    }

    if (completed) renderWeeklyRatingPanel(data);
    else { ratingPanel.style.display = "none"; ratingPanel.innerHTML = ""; }
}

async function openWeeklyCompleteDialog() {
    if (!isAdmin) return alert("Sadece admin!");
    const choice = prompt("Kazanan takımı yaz: A veya B");
    if (!choice) return;
    const team = choice.trim().toUpperCase();
    if (!["A", "B"].includes(team)) return alert("Lütfen A veya B yaz.");
    await completeWeeklyMatch(team);
}

async function completeWeeklyMatch(team) {
    const snap = await C("haftaninKadro").doc("latest").get();
    if (!snap.exists) return alert("Haftanın kadrosu bulunamadı.");
    const data = snap.data();
    const winners = weeklyTeamNames(data, team);
    if (!winners.length) return alert("Kazanan takımda oyuncu bulunamadı.");

    const completedAt = new Date().toISOString();
    await C("haftaninKadro").doc("latest").set({
        matchCompleted: true,
        winnerTeam: team,
        completedAt
    }, { merge: true });

    if (typeof saveWinnerPlayers === "function") {
        await saveWinnerPlayers(winners, { source: "weeklyKadro", winnerTeam: team, weekId: weeklyWeekId(data), completedAt });
    } else {
        await C("winners").add({ players: winners, date: completedAt, source: "weeklyKadro", winnerTeam: team, weekId: weeklyWeekId(data), completedAt });
        await refreshCachePartial(["winners"]);
    }

    await loadHaftaninKadro();
}


function weeklyNormName(v) {
    return String(v || "")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/\s+/g, " ");
}

function weeklyCurrentUserAliases() {
    const aliases = new Set();
    [currentUser, currentDisplayName, currentFirebaseUser?.displayName, currentFirebaseUser?.email].forEach(v => {
        if (v) aliases.add(weeklyNormName(v));
    });
    const authUid = currentFirebaseUser?.uid;
    (CACHE.players || []).forEach(p => {
        const fields = [p.name, p.username, p.displayName, p.email, p.uid, p.userId, p.id];
        const same = fields.some(v => v && (
            weeklyNormName(v) === weeklyNormName(currentUser) ||
            weeklyNormName(v) === weeklyNormName(currentDisplayName) ||
            weeklyNormName(v) === weeklyNormName(currentFirebaseUser?.displayName) ||
            weeklyNormName(v) === weeklyNormName(currentFirebaseUser?.email) ||
            (authUid && String(v) === String(authUid))
        ));
        if (same && p.name) aliases.add(weeklyNormName(p.name));
    });
    return aliases;
}

function weeklyIsCurrentUserPlayer(playerName) {
    return weeklyCurrentUserAliases().has(weeklyNormName(playerName));
}

function renderWeeklyRatingPanel(data) {
    const panel = document.getElementById("weeklyRatingPanel");
    if (!panel) return;

    const allMatchPlayers = [...weeklyTeamNames(data, "A"), ...weeklyTeamNames(data, "B")]
        .filter((n, i, a) => n && a.findIndex(x => weeklyNormName(x) === weeklyNormName(n)) === i);

    // Maç sonu puanlamayı yalnızca o haftaki kadroda bulunan oyuncular yapabilir.
    const isThisWeekPlayer = allMatchPlayers.some(n => weeklyIsCurrentUserPlayer(n));
    if (!isThisWeekPlayer) {
        panel.style.display = "none";
        panel.innerHTML = "";
        return;
    }

    // Oyuncu hem kendi takımına hem rakip takıma puan verebilir, sadece kendine veremez.
    const players = allMatchPlayers.filter(n => !weeklyIsCurrentUserPlayer(n));
    const weekId = weeklyWeekId(data);
    if (!players.length) {
        panel.style.display = "none";
        panel.innerHTML = "";
        return;
    }
    panel.style.display = "block";
    panel.innerHTML = `
        <div class="weekly-rating-head">
            <div><b>⭐ Maç Sonu Puanlama</b><span>Bu maçta oynayan tüm oyunculara 1-10 arası puan ver.</span></div>
        </div>
        <div class="weekly-rating-list">
            ${players.map(name => {
                const already = (CACHE.ratings || []).find(r =>
                    weeklyIsCurrentUserPlayer(r.from) &&
                    weeklyNormName(r.to) === weeklyNormName(name) &&
                    r.weekId === weekId &&
                    r.source === "weeklyKadro"
                );
                return `<div class="weekly-rate-row" data-player="${String(name).replaceAll('"','&quot;')}">
                    <span>${name}</span>
                    <select ${already ? "disabled" : ""}>${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${i===7?"selected":""}>${i+1}</option>`).join("")}</select>
                    <button class="btn" ${already ? "disabled" : ""} onclick="weeklySubmitRating(this, '${String(name).replaceAll("'", "\\'")}')">${already ? "Verildi" : "Puanla"}</button>
                </div>`;
            }).join("")}
        </div>`;
}

async function weeklySubmitRating(btn, playerName) {
    const snap = await C("haftaninKadro").doc("latest").get();
    if (!snap.exists) return alert("Haftanın kadrosu bulunamadı.");
    const data = snap.data();
    if (!data.matchCompleted) return alert("Maç tamamlanmadan puan verilemez.");
    const allMatchPlayers = [...weeklyTeamNames(data, "A"), ...weeklyTeamNames(data, "B")]
        .filter((n, i, a) => n && a.findIndex(x => weeklyNormName(x) === weeklyNormName(n)) === i);
    if (!allMatchPlayers.some(n => weeklyIsCurrentUserPlayer(n))) return alert("Sadece bu hafta maçta olan oyuncular puan verebilir.");
    if (!allMatchPlayers.some(n => weeklyNormName(n) === weeklyNormName(playerName))) return alert("Sadece bu maçtaki oyuncular puanlanabilir.");
    if (weeklyIsCurrentUserPlayer(playerName)) return alert("Kendine puan veremezsin!");
    const row = btn.closest(".weekly-rate-row");
    const score = Number(row?.querySelector("select")?.value);
    if (!score || score < 1 || score > 10) return alert("1-10 arası puan seç.");
    const weekId = weeklyWeekId(data);
    const exists = (CACHE.ratings || []).find(r =>
        weeklyIsCurrentUserPlayer(r.from) &&
        weeklyNormName(r.to) === weeklyNormName(playerName) &&
        r.weekId === weekId &&
        r.source === "weeklyKadro"
    );
    if (exists) return alert("Bu maç için bu oyuncuya zaten puan verdin.");
    await C("ratings").add({
        from: currentUser,
        to: playerName,
        score,
        date: new Date().toISOString(),
        source: "weeklyKadro",
        weekId
    });
    await refreshCachePartial(["ratings"]);
    if (typeof resetAdvancedCaches === "function") resetAdvancedCaches();
    if (typeof refreshStatsViews === "function") await refreshStatsViews();
    btn.textContent = "Verildi";
    btn.disabled = true;
    const sel = row?.querySelector("select");
    if (sel) sel.disabled = true;
    notify("Puan kaydedildi");
}

// ==========================================================
// ADMIN SWAP
// ==========================================================
async function adminSwapClick(el, posList) {
    if (!isAdmin) return;
    const team = el.dataset.team;
    const pos = el.dataset.pos;
    const key = team === "A" ? pos : pos + "2";
    const clickedId = currentKadroPosMap[key];
    if (!clickedId) return;

    if (!swapSelection) {
        swapSelection = { team, pos, key };
        el.classList.add("swap-selected");
        return;
    }

    if (swapSelection.team === team && swapSelection.pos === pos) {
        document.querySelectorAll(".swap-selected").forEach(x => x.classList.remove("swap-selected"));
        swapSelection = null;
        return;
    }

    const key1 = swapSelection.key;
    const key2 = key;
    const id1 = currentKadroPosMap[key1];
    const id2 = currentKadroPosMap[key2];
    currentKadroPosMap[key1] = id2;
    currentKadroPosMap[key2] = id1;

    document.querySelectorAll(".swap-selected").forEach(x => x.classList.remove("swap-selected"));
    swapSelection = null;

    await C("haftaninKadro").doc("latest").update({ posMap: currentKadroPosMap });
    await loadHaftaninKadro();
}

// ==========================================================
// TAKIM DENGE ALGORİTMASI
// ==========================================================
function preparePlayerForMatch(p) {
    const bonusStats = applyMatchBonus(p, p.stats);
    p.matchStats = bonusStats;
    p.matchOVR = getOVR(p);
    return p;
}

function getPlayerPositions(p) {
    return { id: p.id, name: p.name, main: normalizePos(p.mainPos), sub: normalizePos(p.subPos), ovr: p.matchOVR };
}

function avgScore(s) {
    if (!s) return 0;
    return ((s.sut || 0) + (s.pas || 0) + (s.kondisyon || 0) + (s.hiz || 0) + (s.fizik || 0) + (s.oyunGorusu || 0) + (s.defans || 0)) / 7;
}

function balanceTeams(teamA, teamB, posMap) {
    const getPlayer = id => CACHE.players.find(p => p.id === id);
    const getOVRB = p => p?.matchOVR ?? 0;
    const getStat = (p, stat) => p?.stats?.[stat] ?? 0;
    const ATK = ["ST", "LW", "RW", "STX"];
    const MID = ["CM", "CMX"];
    const DEF = ["CB", "LB", "RB", "CBX"];
    const ALL = [...ATK, ...MID, ...DEF];
    const gkAId = posMap["GK"] || teamA[0];
    const gkBId = posMap["GK2"] || teamB[0];
    const isGK = id => id === gkAId || id === gkBId;

    function statSum(team, stat) { return team.reduce((s, id) => isGK(id) ? s : s + getStat(getPlayer(id), stat), 0); }
    function ovrSum(team) { return team.reduce((s, id) => isGK(id) ? s : s + getOVRB(getPlayer(id)), 0); }
    function groupOVR(positions, suffix) {
        return positions.reduce((s, pos) => { const id = posMap[pos + suffix]; return id ? s + getOVRB(getPlayer(id)) : s; }, 0);
    }
    function imbalanceScore() {
        const STATS = ["sut", "pas", "defans", "hiz", "kondisyon", "oyunGorusu"];
        const ovrDiff = Math.abs(ovrSum(teamA) - ovrSum(teamB)) * 2;
        const statDiff = STATS.reduce((t, stat) => t + Math.abs(statSum(teamA, stat) - statSum(teamB, stat)), 0) * 1.5;
        const regionDiff = (Math.abs(groupOVR(ATK, "") - groupOVR(ATK, "2")) + Math.abs(groupOVR(MID, "") - groupOVR(MID, "2")) + Math.abs(groupOVR(DEF, "") - groupOVR(DEF, "2"))) * 1.2;
        return ovrDiff + statDiff + regionDiff;
    }
    function posGroup(pos) {
        if (ATK.includes(pos)) return "ATK";
        if (MID.includes(pos)) return "MID";
        if (DEF.includes(pos)) return "DEF";
        return null;
    }
    function playerGroup(id) {
        const p = getPlayer(id);
        if (!p) return null;
        const main = normalizePos(p.mainPos);
        const sub = normalizePos(p.subPos);
        if (ATK.includes(main) || ATK.includes(sub)) return "ATK";
        if (MID.includes(main) || MID.includes(sub)) return "MID";
        if (DEF.includes(main) || DEF.includes(sub)) return "DEF";
        return null;
    }
    function tryBestSwap(positions, enforceGroup = true) {
        const before = imbalanceScore();
        let bestGain = 0.5;
        let best = null;
        for (const posA of positions) {
            for (const posB of positions) {
                const aId = posMap[posA];
                const bId = posMap[posB + "2"];
                if (!aId || !bId || aId === bId) continue;
                if (isGK(aId) || isGK(bId)) continue;
                if (enforceGroup) {
                    const pgA = playerGroup(aId);
                    const pgB = playerGroup(bId);
                    const slotGroupA = posGroup(posA);
                    const slotGroupB = posGroup(posB);
                    if (pgA && slotGroupB && pgA !== slotGroupB) continue;
                    if (pgB && slotGroupA && pgB !== slotGroupA) continue;
                }
                posMap[posA] = bId; posMap[posB + "2"] = aId;
                const ai = teamA.indexOf(aId); const bi = teamB.indexOf(bId);
                if (ai > -1) teamA[ai] = bId; if (bi > -1) teamB[bi] = aId;
                const gain = before - imbalanceScore();
                posMap[posA] = aId; posMap[posB + "2"] = bId;
                if (ai > -1) teamA[ai] = aId; if (bi > -1) teamB[bi] = bId;
                if (gain > bestGain) { bestGain = gain; best = { posA, posB, aId, bId, ai, bi }; }
            }
        }
        if (!best) return false;
        posMap[best.posA] = best.bId; posMap[best.posB + "2"] = best.aId;
        if (best.ai > -1) teamA[best.ai] = best.bId;
        if (best.bi > -1) teamB[best.bi] = best.aId;
        return true;
    }
    for (let i = 0; i < 40; i++) { if (!tryBestSwap(ALL, true)) break; }
    for (let i = 0; i < 20; i++) { if (!tryBestSwap(ATK, true)) break; }
    for (let i = 0; i < 20; i++) { if (!tryBestSwap(DEF, true)) break; }
    for (let i = 0; i < 20; i++) { if (Math.abs(ovrSum(teamA) - ovrSum(teamB)) <= 8) break; if (!tryBestSwap(ALL, true)) break; }
	// Grup kısıtlaması olmadan swap yap — fark hala büyükse
for (let i = 0; i < 40; i++) { if (Math.abs(ovrSum(teamA) - ovrSum(teamB)) <= 5) break; if (!tryBestSwap(ALL, false)) break; }
// Son çare — tüm pozisyonları karıştır
for (let i = 0; i < 20; i++) { if (Math.abs(ovrSum(teamA) - ovrSum(teamB)) <= 5) break; if (!tryBestSwap(ALL, false)) break; }
    return { teamA, teamB, posMap };
}

function buildBalancedTeams(selectedPlayers, gkA, gkB, matchSize = 8) {
    let POS_ORDER;
    if (matchSize === 6)       POS_ORDER = ["ST", "CM", "CB", "LB", "RB"];
else if (matchSize === 7)  POS_ORDER = ["ST", "LW", "RW", "CM", "CB", "CBX"];
else if (matchSize === 8)  POS_ORDER = ["ST", "LW", "RW", "CM", "CB", "LB", "RB"];
else if (matchSize === 9)  POS_ORDER = ["ST", "LW", "RW", "CM", "CMX", "CB", "LB", "RB"];
else if (matchSize === 10) POS_ORDER = ["ST", "LW", "RW", "CM", "CMX", "CB", "CBX", "LB", "RB"];
else if (matchSize === 11) POS_ORDER = ["ST", "STX", "LW", "RW", "CM", "CMX", "CB", "CBX", "LB", "RB"];
else                       POS_ORDER = ["ST", "LW", "RW", "CM", "CB", "LB", "RB"];

    let teamA = [gkA];
    let teamB = [gkB];
    preparePlayerForMatch(CACHE.players.find(p => p.id === gkA));
    preparePlayerForMatch(CACHE.players.find(p => p.id === gkB));

    let players = selectedPlayers
        .filter(id => id !== gkA && id !== gkB)
        .map(id => preparePlayerForMatch(CACHE.players.find(p => p.id === id)))
        .filter(p => p)
        .map(p => getPlayerPositions(p));

    let groups = {};
    POS_ORDER.forEach(pos => groups[pos] = []);

    const CANON_FOR_X = (pos) => {
        if (pos === "CBX") return "CB";
        if (pos === "CMX") return "CM";
        if (pos === "STX") return "ST";
        return pos;
    };

    players.forEach(p => {
        if (POS_ORDER.includes(p.main)) groups[p.main].push(p);
        else if (POS_ORDER.includes(p.sub)) groups[p.sub].push(p);
        const mainCanon = CANON_FOR_X(p.main);
        const subCanon = CANON_FOR_X(p.sub);
        if (groups["CBX"] && (mainCanon === "CB" || subCanon === "CB")) groups["CBX"].push(p);
        if (groups["CMX"] && (mainCanon === "CM" || subCanon === "CM")) groups["CMX"].push(p);
        if (groups["STX"] && (mainCanon === "ST" || subCanon === "ST")) groups["STX"].push(p);
    });

    const uniqById = (arr) => { const seen = new Set(); return arr.filter(x => x && !seen.has(x.id) && seen.add(x.id)); };
    Object.keys(groups).forEach(k => groups[k] = uniqById(groups[k]));
    POS_ORDER.forEach(pos => groups[pos].sort((a, b) => b.ovr - a.ovr));

    let posMap = {};
    let used = new Set();
    let draftPairs = [];

    POS_ORDER.forEach(pos => {
        let ai = 0;
        while (ai < groups[pos].length && used.has(groups[pos][ai].id)) ai++;
        let bi = ai + 1;
        while (bi < groups[pos].length && used.has(groups[pos][bi].id)) bi++;
        if (ai >= groups[pos].length || bi >= groups[pos].length) return;
        draftPairs.push({ pos, best: groups[pos][ai], second: groups[pos][bi], topOvr: groups[pos][ai].ovr });
    });

    draftPairs.sort((a, b) => b.topOvr - a.topOvr);

    const snakeToA = (i) => {
        const cycle = Math.floor(i / 2) % 2;
        const pos = i % 2;
        return (cycle === 0 && pos === 0) || (cycle === 1 && pos === 1);
    };

    draftPairs.forEach(({ pos, best, second }, i) => {
        if (used.has(best.id) || used.has(second.id)) return;
        const bestToA = snakeToA(i);
        if (bestToA) {
            posMap[pos] = best.id; posMap[pos + "2"] = second.id;
            teamA.push(best.id); teamB.push(second.id);
        } else {
            posMap[pos] = second.id; posMap[pos + "2"] = best.id;
            teamA.push(second.id); teamB.push(best.id);
        }
        used.add(best.id); used.add(second.id);
    });

    let leftovers = players.filter(p => !used.has(p.id));
    leftovers.sort((a, b) => b.ovr - a.ovr);

    function findBestFit(pos, pool) {
        let idx = pool.findIndex(p => p.main === pos);
        if (idx === -1) idx = pool.findIndex(p => p.sub === pos);
        if (idx === -1) {
            const neighbors = { "LB": ["CB", "RB"], "RB": ["CB", "LB"], "CB": ["LB", "RB"], "LW": ["RW", "ST"], "RW": ["LW", "ST"], "ST": ["LW", "RW"], "CM": ["CB", "LB", "RB"] };
            const near = neighbors[pos] || [];
            idx = pool.findIndex(p => near.includes(p.main) || near.includes(p.sub));
        }
        if (idx === -1) idx = 0;
        if (idx < 0 || idx >= pool.length) return null;
        return pool.splice(idx, 1)[0];
    }

    POS_ORDER.forEach(pos => {
        if (!posMap[pos] && leftovers.length > 0) { let p = findBestFit(pos, leftovers); if (!p) return; posMap[pos] = p.id; teamA.push(p.id); used.add(p.id); }
        if (!posMap[pos + "2"] && leftovers.length > 0) { let p = findBestFit(pos, leftovers); if (!p) return; posMap[pos + "2"] = p.id; teamB.push(p.id); used.add(p.id); }
    });

    posMap["GK"] = gkA;
    posMap["GK2"] = gkB;

    return balanceTeams(teamA, teamB, posMap);
}

function printTeamOVRs(teamA, teamB) {
    const getPlayer = id => CACHE.players.find(p => p.id === id);
    console.log("================================\n🔥 A TAKIMI OYUNCU OVR LİSTESİ\n================================");
    teamA.forEach(id => { const p = getPlayer(id); if (p) console.log(`${p.name} → ${p.matchOVR}`); });
    console.log("\n================================\n🔥 B TAKIMI OYUNCU OVR LİSTESİ\n================================");
    teamB.forEach(id => { const p = getPlayer(id); if (p) console.log(`${p.name} → ${p.matchOVR}`); });
    const sumOVR = team => team.reduce((total, id) => { const p = getPlayer(id); return total + (p?.matchOVR || 0); }, 0);
    console.log(`\nA: ${sumOVR(teamA)} | B: ${sumOVR(teamB)} | FARK: ${Math.abs(sumOVR(teamA) - sumOVR(teamB))}`);
}

// ==========================================================
// GELENLERI GÖR BUTONU
// ==========================================================
document.getElementById("toggleComingListBtn").onclick = async () => {
    const box = document.getElementById("comingListBox");
    const btn = document.getElementById("toggleComingListBtn");
    if (box.style.display === "none" || box.style.display === "") {
        box.style.display = "block";
        btn.innerText = "🔽 Listeyi Gizle";
    } else {
        box.style.display = "none";
        btn.innerText = "👥 Gelenleri Gör";
    }
};

async function weekNoteUpdate() {
    const saha      = document.getElementById("editSahaInput")?.value || "";
    const tarih     = document.getElementById("editTarihInput")?.value || "";
    const saat      = document.getElementById("editSaatInput")?.value || "";
    const konum     = document.getElementById("editKonumInput")?.value || "";
    const matchSize = Number(document.getElementById("editMatchSize")?.value) || 8;

    await C("weekNote").doc("latest").set({ saha, tarih, saat, konum, matchSize, timestamp: new Date().toISOString() }, { merge: true });

    // matchSizeSelect ve localStorage güncelle
    const sel = document.getElementById("matchSizeSelect");
    if (sel) sel.value = String(matchSize);
    localStorage.setItem("hsMatchSize", String(matchSize));
    updateMatchLabelUI();

    notify("Maç bilgileri güncellendi!");

    // Sadece noteBox'ı güncelle, tüm sayfayı yeniden yükleme
    const noteSnap = await C("weekNote").doc("latest").get();
    const noteData = noteSnap.exists ? noteSnap.data() : {};
    const sahaEl  = document.getElementById("matchSahaBox");
    const tsEl    = document.getElementById("matchTarihSaatBox");
    const konumEl = document.getElementById("matchKonumBox");

    const s = noteData.saha || "";
    const t = noteData.tarih || "";
    const sa = noteData.saat || "";
    const k = noteData.konum || "";
    let tarihStr = "";
    if (t) {
        const d = new Date(t + "T00:00:00");
        tarihStr = d.toLocaleDateString("tr-TR", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
    }

    if (sahaEl) sahaEl.textContent = s ? "🏟️ " + s : "⚙️ Maç bilgisi henüz girilmedi";
    if (tsEl) tsEl.textContent = tarihStr ? (tarihStr + (sa ? " — ⏰ " + sa : "")) : (sa ? "⏰ " + sa : "");
    if (konumEl) konumEl.innerHTML = k ? "📍 " + (k.startsWith("http") ? `<a href="${k}" target="_blank" style="color:#d4aaff">${k}</a>` : k) : "";

    // Edit paneli kapat
    const ep = document.getElementById("weekNoteEditPanel");
    if (ep) ep.style.display = "none";

    // Katılım limitini güncelle
    const status = document.getElementById("comingStatus");
    if (status && currentUser) {
        const attSnap = await C("attendance").orderBy("timestamp", "asc").get();
        let index = 1, myOrder = null;
        attSnap.forEach(a => {
            const d = a.data();
            if (d.coming) {
                if (d.user === currentUser) myOrder = index;
                index++;
            }
        });
        const limit = matchSize * 2;
        status.innerText = renderOrderText(myOrder, limit);
        status.style.color = (myOrder > limit ? "#ff4d4d" : "#ffffff");
    }
	const kadroPage = document.getElementById("kadro");
if (kadroPage && kadroPage.classList.contains("active")) {
    await loadKadroPlayerGrid();
}
}