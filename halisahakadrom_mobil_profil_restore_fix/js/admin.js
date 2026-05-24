/* ==========================================================
   ADMIN.JS — admin paneli, log, reset, analiz
========================================================= */


// ==========================================================
// MİSAFİR OYUNCU EKLE
// ==========================================================
async function addGuestPlayer() {
    const _myDoc = await db.collection("groups").doc(currentGroupId).collection("members").doc(currentFirebaseUser.uid).get();
    if (!_myDoc.exists || _myDoc.data().role !== "admin") return alert("Sadece admin!");

    const name = (document.getElementById("guestPlayerName").value || "").trim();
    if (!name) return alert("Oyuncu adı gir!");

    // Grup ortalama statını hesapla
    const playersWithStats = CACHE.players.filter(p => p.stats && !p.isGuest);
    let avgStats = null;
    if (playersWithStats.length > 0) {
        const keys = ["sut", "pas", "kondisyon", "hiz", "fizik", "defans", "oyunGorusu"];
        avgStats = {};
        keys.forEach(k => {
            const total = playersWithStats.reduce((sum, p) => sum + (p.stats[k] || 0), 0);
            avgStats[k] = Math.round(total / playersWithStats.length);
        });
    }

    await C("players").doc(name).set({
        name,
        photo: DEFAULT_PHOTO,
        mainPos: "",
        subPos: "",
        stats: avgStats,
        isGuest: true,
        createdAt: new Date().toISOString()
    }, { merge: true });

    document.getElementById("guestPlayerName").value = "";

    await refreshCachePartial(["players"]);
    await loadPlayers();
    await setupSelects();
    await loadGuestListForConvert();
    notify("Misafir oyuncu eklendi!");
}

// ==========================================================
// MİSAFİR LİSTESİ — DÖNÜŞTÜR BÖLÜMÜ
// ==========================================================
async function loadGuestListForConvert() {
    const box = document.getElementById("guestListForConvert");
    if (!box) return;

    const guests = CACHE.players.filter(p => p.isGuest === true);
    if (!guests.length) {
        box.innerHTML = `<p style="color:rgba(255,255,255,0.4);font-size:13px;">Sistemde misafir oyuncu yok.</p>`;
        return;
    }

    box.innerHTML = guests.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;
            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
            border-radius:10px;padding:10px 14px;margin-bottom:8px;">
            <div>
                <span style="font-weight:700;font-size:14px;">${p.name}</span>
                <span style="color:rgba(255,255,255,0.45);font-size:12px;margin-left:8px;">${p.mainPos || 'Mevki yok'}</span>
            </div>
            <button onclick="selectGuestForConvert('${p.name}', this)"
                style="padding:6px 14px;border-radius:8px;border:1.5px solid #a347ff;
                background:transparent;color:white;font-size:12px;font-weight:600;
                cursor:pointer;font-family:Poppins,sans-serif;">
                Seç
            </button>
        </div>`).join("");
}

let _selectedGuestForConvert = null;

function selectGuestForConvert(name, btn) {
    _selectedGuestForConvert = name;
    document.querySelectorAll("#guestListForConvert button").forEach(b => {
        b.style.background = "transparent";
        b.textContent = "Seç";
    });
    btn.style.background = "rgba(138,43,255,0.4)";
    btn.textContent = "✓ Seçildi";
    notify(name + " seçildi — e-posta ve şifre gir");
}

// ==========================================================
// MİSAFİR → TAM ÜYE DÖNÜŞTÜR
// ==========================================================
async function convertGuestToMember() {
    const _myDoc = await db.collection("groups").doc(currentGroupId).collection("members").doc(currentFirebaseUser.uid).get();
    if (!_myDoc.exists || _myDoc.data().role !== "admin") return alert("Sadece admin!");

    if (!_selectedGuestForConvert) return alert("Listeden bir misafir oyuncu seç!");

    const email = (document.getElementById("convertEmail").value || "").trim();
    const pass  = (document.getElementById("convertPass").value  || "").trim();

    if (!email)          return alert("E-posta gir!");
    if (pass.length < 6) return alert("Şifre en az 6 karakter olmalı!");

    try {
        const secondaryApp = firebase.initializeApp(firebase.app().options, "secondary_" + Date.now());
const secondaryAuth = secondaryApp.auth();
const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pass);
const uid  = cred.user.uid;
await secondaryApp.delete();
        const name = _selectedGuestForConvert;

        await C("players").doc(name).set({ isGuest: false }, { merge: true });

        await db.collection("groups").doc(currentGroupId).collection("members").doc(uid).set({
            username: name, email, uid,
            role: "member", status: "active",
            isGuest: false,
            joinedAt: new Date().toISOString(),
            convertedFromGuest: true
        });

        await db.collection("users").doc(uid).set({
            displayName: name, email,
            createdAt: new Date().toISOString(),
            groups: [currentGroupId]
        });

        _selectedGuestForConvert = null;
        document.getElementById("convertEmail").value = "";
        document.getElementById("convertPass").value  = "";

		notify("Dönüştürüldü!");

    } catch (e) {
        console.warn(e);
        alert(e.code === "auth/email-already-in-use" ? "Bu e-posta zaten kayıtlı!" : "Hata: " + e.message);
    }
}

async function resetAllPoints() {


    await C("ga").get().then(q => q.forEach(d => d.ref.delete()));
    await C("winners").get().then(q => q.forEach(d => d.ref.delete()));
    await C("ratings").get().then(q => q.forEach(d => d.ref.delete()));

    notify("Gol, Kazananlar ve En İyi Oyuncu verileri tamamen sıfırlandı!");
    await refreshCachePartial(["ga", "winners", "ratings"]);
await Promise.all([loadGolKr(), loadKazananlar(), loadEnIyi(), loadGecmis()]);
}

async function loadLoginLogs() {
    const table = document.getElementById("loginLogsTable");
    if (!table) return;
    table.innerHTML = "";

    const snap = await C("loginLogs").orderBy("timestamp", "desc").limit(50).get();
    snap.forEach(doc => {
        const data = doc.data();
        const t = new Date(data.timestamp);
        table.innerHTML += `
            <tr>
                <td>${data.user}</td>
                <td>${t.toLocaleDateString()}</td>
                <td>${t.toLocaleTimeString()}</td>
            </tr>`;
    });
}

async function writeLoginLog(username) {
    try {
        const groupId = currentGroupId;
        if (!groupId) return;

        const logRef = db.collection("groups").doc(groupId).collection("loginLogs");
        await logRef.add({ user: username, timestamp: new Date().toISOString() });

        const cleanupKey = "hsLogCleanup";
        const lastCleanup = localStorage.getItem(cleanupKey);
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (!lastCleanup || Date.now() - Number(lastCleanup) > oneWeek) {
            const allSnap = await logRef.orderBy("timestamp", "asc").get();
            if (allSnap.docs.length > 50) {
                const toDelete = allSnap.docs.slice(0, allSnap.docs.length - 50);
                const batch = db.batch();
                toDelete.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }
            localStorage.setItem(cleanupKey, String(Date.now()));
        }
    } catch (e) {
        console.warn("Login log yazılamadı:", e);
    }
}

// ==========================================================
// TAKİM ANALİZ
// ==========================================================
function hideAnaliz() {
    const c = document.getElementById("analizContent");
    const b = document.getElementById("analizBtn");
    if (c) c.innerHTML = "<span style='color:#aaa;font-style:italic;'>Analiz gizlendi — tekrar görmek için butona tıkla.</span>";
    if (b) { b.textContent = "🤖 Analiz Et"; b.disabled = false; }
}

async function generateTeamAnalysis() {
    const btn = document.getElementById("analizBtn");
    const box = document.getElementById("analizContent");
    if (!btn || !box) return;

    const snap = await C("haftaninKadro").doc("latest").get();
    if (!snap.exists) { box.innerHTML = "<span style='color:#aaa'>Önce kadro oluştur.</span>"; return; }

    btn.disabled = true;
    btn.textContent = "⏳ Analiz yapılıyor...";

    const posMap = snap.data().posMap || {};
    const POSITIONS = ["GK", "CB", "CBX", "LB", "RB", "CM", "CMX", "LW", "RW", "ST", "STX"];

    function collectTeam(suffix) {
        const list = [];
        POSITIONS.forEach(pos => {
            const id = posMap[pos + suffix];
            if (!id) return;
            const p = CACHE.players.find(x => x.id === id);
            if (!p) return;
            const s = p.stats || {};
            const gaDoc = CACHE.ga.find(x => x.name === p.name) || {};
            const winCnt = CACHE.winners.filter(w => (w.players || []).includes(p.name)).length;
            list.push({
                isim: p.name, pos, posAd: posTranslate(pos),
                ovr: p.matchOVR ?? getOVR_withBonus(p),
                sut: s.sut || 0, pas: s.pas || 0, hiz: s.hiz || 0,
                defans: s.defans || 0, fizik: s.fizik || 0,
                kondisyon: s.kondisyon || 0, oyunGorusu: s.oyunGorusu || 0,
                gol: gaDoc.gol || 0, kazanma: winCnt
            });
        });
        return list;
    }

    const A = collectTeam("");
    const B = collectTeam("2");

    function ort(takim, stat) {
        const out = takim.filter(p => p.pos !== "GK");
        if (!out.length) return 0;
        return Math.round(out.reduce((s, p) => s + p[stat], 0) / out.length);
    }
    function enIyi(takim, stat, haric = []) {
        return takim.filter(p => !haric.includes(p.isim)).reduce((b, p) => p[stat] > (b?.[stat] ?? -1) ? p : b, null);
    }
    function pozOyuncu(takim, pos) {
        return takim.find(p => p.pos === pos) || takim.find(p => p.pos === pos + "X") || null;
    }
    function ovrTop(takim) { return takim.filter(p => p.pos !== "GK").reduce((s, p) => s + p.ovr, 0); }
    function seviye(v) { return v >= 83 ? "olağanüstü" : v >= 75 ? "çok iyi" : v >= 65 ? "iyi" : v >= 55 ? "orta" : "zayıf"; }
    function kimlikBul(takim) {
        const o = { sut: ort(takim, "sut"), pas: ort(takim, "pas"), hiz: ort(takim, "hiz"), defans: ort(takim, "defans") };
        const s = Object.entries(o).sort((a, b) => b[1] - a[1]);
        const e = { sut: "golcü", pas: "oyun kurucu", hiz: "hızlı pozisyon alan", defans: "defansif" };
        return { birinci: e[s[0][0]], ikinci: e[s[1][0]], degerler: o };
    }

    function takimAnaliz(takim, ad) {
        const secilen = [];
        const satirlar = [];
        const kimlik = kimlikBul(takim);
        const o = kimlik.degerler;
        satirlar.push(`<b>⚡ Genel Kimlik:</b> ${ad} <b>${kimlik.birinci}</b> kimliğiyle öne çıkıyor. İkincil güç: <b>${kimlik.ikinci}</b>. (Şut: ${o.sut} | Pas: ${o.pas} | Hız: ${o.hiz} | Def: ${o.defans})`);

        const forvet = pozOyuncu(takim, "ST");
        if (forvet) {
            secilen.push(forvet.isim);
            const golSicil = forvet.gol > 0 ? `, sezonluk ${forvet.gol} gol` : "";
            satirlar.push(`<b>🎯 Hücum Tehdidi:</b> Forvet <b>${forvet.isim}</b> (şut: ${forvet.sut}, OVR: ${forvet.ovr}${golSicil}) — şut kalitesi ${seviye(forvet.sut)}.`);
        }

        const kanatlar = takim.filter(p => (p.pos === "LW" || p.pos === "RW") && !secilen.includes(p.isim));
        if (kanatlar.length) {
            const k = kanatlar.reduce((b, p) => (p.sut + p.hiz) > ((b?.sut ?? 0) + (b?.hiz ?? 0)) ? p : b, null);
            if (k && (k.sut + k.hiz) >= 130) {
                secilen.push(k.isim);
                satirlar.push(`<b>🔥 Kanat Tehdidi:</b> <b>${k.isim}</b> (${k.posAd}, hız: ${k.hiz}, şut: ${k.sut}) kanatta tehlikeli.`);
            }
        }

        const cm = pozOyuncu(takim, "CM");
        if (cm && !secilen.includes(cm.isim)) {
            secilen.push(cm.isim);
            satirlar.push(`<b>🎮 Orta Saha:</b> <b>${cm.isim}</b> (pas: ${cm.pas}, oyun görüşü: ${cm.oyunGorusu}, OVR: ${cm.ovr}) — ${seviye(cm.pas)} pas kalitesiyle takımın organizasyonunu yönetiyor.`);
        } else {
            const pasci = enIyi(takim, "pas", secilen);
            if (pasci && pasci.pas >= 65) {
                secilen.push(pasci.isim);
                satirlar.push(`<b>🎮 Oyun Kurma:</b> <b>${pasci.isim}</b> (${pasci.posAd}, pas: ${pasci.pas}) takımın top dağıtım merkezi.`);
            }
        }

        const stoper = pozOyuncu(takim, "CB");
        if (stoper && !secilen.includes(stoper.isim)) {
            secilen.push(stoper.isim);
            const dk = stoper.defans >= 75 ? "sağlam bir duvar" : stoper.defans >= 60 ? "güvenilir" : "kırılgan nokta";
            satirlar.push(`<b>🛡️ Savunma:</b> Stoper <b>${stoper.isim}</b> (defans: ${stoper.defans}, fizik: ${stoper.fizik}) ${dk}. Savunma ort: ${ort(takim, "defans")}.`);
        }

        const kale = pozOyuncu(takim, "GK");
        if (kale) satirlar.push(`<b>🧤 Kale:</b> <b>${kale.isim}</b> (OVR: ${kale.ovr}) kaleyi koruyor.`);

        const golKrali = takim.filter(p => p.gol > 0).sort((a, b) => b.gol - a.gol)[0];
        if (golKrali && !secilen.includes(golKrali.isim))
            satirlar.push(`<b>👑 Gol Krallığı:</b> <b>${golKrali.isim}</b> — sezonluk ${golKrali.gol} gol.`);

        const kazananlar = takim.filter(p => p.kazanma > 0).sort((a, b) => b.kazanma - a.kazanma).slice(0, 2);
        if (kazananlar.length) {
            satirlar.push(`<b>🏆 Kazanma Sicili:</b> ${kazananlar.map(p => `${p.isim} (${p.kazanma})`).join(", ")} — kazanmaya alışkın isimler.`);
        }

        const konOrt = ort(takim, "kondisyon");
        if (konOrt < 63) satirlar.push(`<b>⚠️ Zayıf Nokta:</b> Kondisyon ort. düşük (${konOrt}) — ikinci yarıda tempo kaybı beklenir.`);

        return satirlar.join("<br><br>");
    }

    function tahmin(a, b) {
        const ovrA = ovrTop(a), ovrB = ovrTop(b);
        const sutA = ort(a, "sut"), sutB = ort(b, "sut");
        const defA = ort(a, "defans"), defB = ort(b, "defans");
        const hizA = ort(a, "hiz"), hizB = ort(b, "hiz");
        const pasA = ort(a, "pas"), pasB = ort(b, "pas");
        const satirlar = [];
        const fark = Math.abs(ovrA - ovrB);

        if (fark <= 8) satirlar.push(`📊 <b>Güç dengesi:</b> İki takım çok yakın güçte (A: ${ovrA} — B: ${ovrB}). Maç son dakikaya kadar belirsiz.`);
        else {
            const guclu = ovrA > ovrB ? "A Takımı" : "B Takımı";
            satirlar.push(`📊 <b>Güç dengesi:</b> ${guclu} ${fark} OVR farkıyla üstün (A: ${ovrA} — B: ${ovrB}).`);
        }
        if (sutA > defB + 12) satirlar.push(`⚡ <b>Kritik avantaj:</b> A şutu (${sutA}) B defansını (${defB}) geçiyor — A cephesinden erken gol beklenir.`);
        else if (sutB > defA + 12) satirlar.push(`⚡ <b>Kritik avantaj:</b> B şutu (${sutB}) A defansını (${defA}) geçiyor — B cephesinden erken gol beklenir.`);
        else satirlar.push(`⚡ <b>Şut-Defans:</b> Her iki takım da birbirini tutacak güçte.`);
        if (hizA > hizB + 10) satirlar.push(`💨 <b>Hız avantajı:</b> A Takımı belirgin daha hızlı (${hizA} vs ${hizB}).`);
        else if (hizB > hizA + 10) satirlar.push(`💨 <b>Hız avantajı:</b> B Takımı belirgin daha hızlı (${hizB} vs ${hizA}).`);
        if (pasA > pasB + 10) satirlar.push(`🎮 <b>Top hakimiyeti:</b> A Takımı daha iyi pas oyunuyla (${pasA} vs ${pasB}) sahayı kontrol eder.`);
        else if (pasB > pasA + 10) satirlar.push(`🎮 <b>Top hakimiyeti:</b> B Takımı daha iyi pas oyunuyla (${pasB} vs ${pasA}) sahayı kontrol eder.`);

        const stA = pozOyuncu(a, "ST") || enIyi(a, "sut", []);
        const cbB = pozOyuncu(b, "CB") || enIyi(b, "defans", []);
        const stB = pozOyuncu(b, "ST") || enIyi(b, "sut", []);
        const cbA = pozOyuncu(a, "CB") || enIyi(a, "defans", []);
        if (stA && cbB) satirlar.push(`🔥 <b>Kilit Duel #1:</b> <b>${stA.isim}</b> (şut: ${stA.sut}) vs <b>${cbB.isim}</b> (defans: ${cbB.defans}).`);
        if (stB && cbA && stB.isim !== stA?.isim) satirlar.push(`🔥 <b>Kilit Duel #2:</b> <b>${stB.isim}</b> (şut: ${stB.sut}) vs <b>${cbA.isim}</b> (defans: ${cbA.defans}).`);

        const golA = a.filter(p => p.gol > 0).sort((a, b) => b.gol - a.gol)[0];
        const golB = b.filter(p => p.gol > 0).sort((a, b) => b.gol - a.gol)[0];
        if (golA && golB) satirlar.push(`👑 <b>Gol Krallığı Yarışı:</b> <b>${golA.isim}</b> (${golA.gol} gol) vs <b>${golB.isim}</b> (${golB.gol} gol).`);
        else if (golA) satirlar.push(`👑 <b>Form:</b> <b>${golA.isim}</b> sezonun en golcüsü (${golA.gol} gol).`);
        else if (golB) satirlar.push(`👑 <b>Form:</b> <b>${golB.isim}</b> sezonun en golcüsü (${golB.gol} gol).`);

        return satirlar.join("<br><br>");
    }

    box.innerHTML = `
        <div style="margin-bottom:20px">
            <div style="font-size:16px;font-weight:700;color:#ff6b6b;margin-bottom:12px;border-bottom:1px solid rgba(255,107,107,0.3);padding-bottom:8px">🔴 A TAKIMI</div>
            <div style="font-size:14px;line-height:2">${takimAnaliz(A, "A Takımı")}</div>
        </div>
        <div style="margin-bottom:20px">
            <div style="font-size:16px;font-weight:700;color:#60b3ff;margin-bottom:12px;border-bottom:1px solid rgba(96,179,255,0.3);padding-bottom:8px">🔵 B TAKIMI</div>
            <div style="font-size:14px;line-height:2">${takimAnaliz(B, "B Takımı")}</div>
        </div>
        <div>
            <div style="font-size:16px;font-weight:700;color:#ffd700;margin-bottom:12px;border-bottom:1px solid rgba(255,215,0,0.3);padding-bottom:8px">⚡ MAÇ TAHMİNİ</div>
            <div style="font-size:14px;line-height:2">${tahmin(A, B)}</div>
        </div>`;

    btn.disabled = false;
    btn.textContent = "🔄 Yeniden Analiz Et";
}
async function generateInviteLink() {
    const token = randomCode(24);
    await db.collection("groups").doc(currentGroupId).set(
        { inviteToken: token },
        { merge: true }
    );
    const link = `https://halisahakadrom.com/join?invite=${token}&group=${currentGroupId}`;
    const box = document.getElementById("inviteLinkBox");
    if (box) {
        box.value = link;
        box.style.display = "block";
    }
    const copyBtn = document.getElementById("copyInviteBtn");
    if (copyBtn) copyBtn.style.display = "inline-block";
    notify("Davet linki oluşturuldu!");
}

async function copyInviteLink() {
    const box = document.getElementById("inviteLinkBox");
    if (!box) return;
    try {
        await navigator.clipboard.writeText(box.value);
        notify("Link kopyalandı!");
    } catch(e) {
        box.select();
        document.execCommand("copy");
        notify("Link kopyalandı!");
    }
}
async function loadInviteLink() {
    if (!currentGroupId) {
        setTimeout(loadInviteLink, 300);
        return;
    }
    try {
        const groupDoc = await db.collection("groups").doc(currentGroupId).get();
        if (!groupDoc.exists) return;
        const token = groupDoc.data().inviteToken;
        const box = document.getElementById("inviteLinkBox");
        const copyBtn = document.getElementById("copyInviteBtn");
        if (!token) {
            if (box) box.style.display = "none";
            if (copyBtn) copyBtn.style.display = "none";
            return;
        }
        const link = `https://halisahakadrom.com/join?invite=${token}&group=${currentGroupId}`;
        if (box) { box.value = link; box.style.display = "block"; }
        if (copyBtn) copyBtn.style.display = "inline-block";
    } catch(e) {
        console.warn("loadInviteLink error:", e);
    }
}