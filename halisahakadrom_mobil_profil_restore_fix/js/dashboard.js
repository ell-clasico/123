/* ==========================================================
   DASHBOARD.JS — gruplarım, arama, katılım, grup oluştur
========================================================= */

// Dashboard'u aç ve grupları yükle
async function openDashboard() {
    const warn = document.getElementById("groupSelectWarning");
    if (warn) warn.style.display = "none";
    const mobileNav = document.getElementById("mobileNav");
    if (mobileNav) mobileNav.style.display = "none";
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });

    document.getElementById("navbar").style.display = "none";

    const dash = document.getElementById("dashboard");
    dash.style.display = "block";
    dash.classList.add("active");

    // Her açılışta arama cache'ini temizle
    _allGroups = null;
    _myGroupIds = new Set();
    _myPendingIds = new Set();

    const searchInput = document.getElementById("groupSearchInput");
    if (searchInput) searchInput.value = "";
    const searchResults = document.getElementById("groupSearchResults");
    if (searchResults) searchResults.innerHTML = "";

    await Promise.all([loadMyGroups(), loadDashProfile()]);
}

// Dashboard'a geri dön (navbar'daki 🏠 butonu)
async function goToDashboard() {
    currentGroupId = null;
    currentGroupCode = null;
    currentUser = null;
    currentRole = null;
    isAdmin = false;
    window.activeGroup = null;
    sessionStorage.removeItem("hsActiveGroup");
    localStorage.removeItem("hsActiveGroup");
    sessionStorage.removeItem("hsPage");
    localStorage.removeItem("hsPage");

    _allGroups = null;
    _myGroupIds = new Set();
    _myPendingIds = new Set();

    history.pushState({ page: "dashboard" }, "", "/dashboard");
    await openDashboard();
}

// =============================================
// GRUPLARIMİ YÜKLE
// =============================================
async function loadMyGroups() {
    const grid = document.getElementById("myGroupsGrid");
    if (!grid) return;

    grid.innerHTML = `<div class="dash-empty">Yükleniyor...</div>`;
	
    if (!currentFirebaseUser) return;

    const uid = currentFirebaseUser.uid;

    try {
        // Kullanıcının üye olduğu grupları çek
        const membersSnap = await db.collectionGroup("members")
            .where("uid", "==", uid)
            .get();

        if (membersSnap.empty) {
            grid.innerHTML = `<div class="dash-empty">Henüz bir halı saha grubuna üye değilsin.</div>`;
            return;
        }

        grid.innerHTML = "";

        // Her member kaydından grubu bul
        const groupPromises = membersSnap.docs.map(async (memberDoc) => {
            const groupId = memberDoc.ref.parent.parent.id;
            const memberData = memberDoc.data();

            const groupDoc = await db.collection("groups").doc(groupId).get();
            if (!groupDoc.exists) return null;

            const groupData = groupDoc.data();

            // Bekleyen istek sayısını çek (sadece adminse)
            let pendingCount = 0;
            if (memberData.role === "admin") {
                const pendingSnap = await db.collection("groups").doc(groupId)
                    .collection("joinRequests")
                    .where("status", "==", "pending")
                    .get();
                pendingCount = pendingSnap.size;
            }

            return { groupId, groupData, memberData, pendingCount };
        });

        const groups = (await Promise.all(groupPromises)).filter(g => g !== null);
		
        if (groups.length === 0) {
            grid.innerHTML = `<div class="dash-empty">Henüz bir halı saha grubuna üye değilsin.</div>`;
            return;
        }
		grid.innerHTML = "";
        groups.forEach(({ groupId, groupData, memberData, pendingCount }) => {
            const roleText = memberData.role === "admin" ? "Admin" : "Üye";
            const badgeHtml = pendingCount > 0
                ? `<div class="group-card-badge">${pendingCount}</div>`
                : "";

            const card = document.createElement("div");
            card.className = "group-card";
            card.innerHTML = `
                ${badgeHtml}
                <div class="group-card-icon">🏟️</div>
                <div class="group-card-name">${groupData.name || "Halı Saha"}</div>
                <div class="group-card-role">${roleText}</div>
            `;

            card.onclick = () => enterGroup(groupId, groupData, memberData);
            grid.appendChild(card);
        });

        // 5'ten az grup varsa "+ Katıl" kartı ekle
        if (groups.length < 5) {
            const addCard = document.createElement("div");
            addCard.className = "group-card group-card-add";
            addCard.innerHTML = `
                <div class="group-card-icon">➕</div>
                <div class="group-card-name">Grup Ekle</div>
                <div class="group-card-role">Ara veya oluştur</div>
            `;
            addCard.onclick = () => {
                document.getElementById("groupSearchInput").scrollIntoView({ behavior: "smooth" });
                document.getElementById("groupSearchInput").focus();
            };
            grid.appendChild(addCard);
        }

    } catch (e) {
        console.error("loadMyGroups error:", e);
        grid.innerHTML = `<div class="dash-empty">Gruplar yüklenemedi.</div>`;
    }
}

// =============================================
// GRUBA GİR
// =============================================
async function enterGroup(groupId, groupData, memberData) {
    console.log("enterGroup BAŞLADI", groupId);
    
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
    document.getElementById("navbar").style.display = "none";

    currentGroupId = groupId;
    currentGroupCode = groupData.code || "";
    currentUser = memberData.username || memberData.displayName || currentDisplayName;
    currentRole = memberData.role || "member";
    isAdmin = currentRole === "admin";

    window.activeGroup = {
        groupId,
        groupCode: groupData.code || "",
        name: groupData.name || "Halı Saha",
        username: currentUser,
        role: currentRole
    };

    sessionStorage.setItem("hsActiveGroup", JSON.stringify(window.activeGroup));

    setSession({
        groupId,
        groupCode: groupData.code || "",
        username: currentUser,
        role: currentRole
    });

    console.log("writeLoginLog öncesi");
    writeLoginLog(currentUser);
    console.log("writeLoginLog sonrası");
    
    console.log("navbar ayarlanıyor");
    const nav = document.getElementById("navbar");
    if (nav) nav.style.display = "flex";

    hideAdminButtons();
    if (isAdmin) showAdminButtons();

    document.getElementById("profilBtn").style.display = "inline-block";
    document.getElementById("kadroBtn").style.display = isAdmin ? "inline-block" : "none";

    console.log("ensurePlayerDoc öncesi");
    await ensurePlayerDoc(currentUser);
    console.log("loadAll öncesi");
    await loadAll();
    console.log("loadAll sonrası");

    if (isAdmin) await loadPendingRequests();

   const _urlPage = getPageIdFromUrl();
let savedPage = (_urlPage && _urlPage !== "dashboard") ? _urlPage : (sessionStorage.getItem("hsPage") || localStorage.getItem("hsPage") || "oyuncular");
if (!savedPage || AUTH_PAGES.includes(savedPage) || savedPage === "dashboard" || savedPage === "authPage" || savedPage === "profileSetup") {
    savedPage = "oyuncular";
}
// Firestore keep-alive kaldırıldı: ücretsiz Firebase için gereksiz periyodik read yapılmaz.
console.log("showPage çağrılıyor:", savedPage);
showPage(savedPage);

}

// =============================================
// GRUP ARA
// =============================================
let _allGroups = null;
let _myGroupIds = new Set();
let _myPendingIds = new Set();
let _searchDebounce = null;

async function initSearchCache() {
    const uid = currentFirebaseUser?.uid;
    const [allSnap, myMembersSnap, pendingSnap] = await Promise.all([
        db.collection("groups").get(),
        uid ? db.collectionGroup("members").where("uid","==",uid).get() : Promise.resolve({docs:[]}),
        uid ? db.collectionGroup("joinRequests").where("uid","==",uid).where("status","==","pending").get() : Promise.resolve({docs:[]})
    ]);
    _allGroups = allSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    _myGroupIds = new Set(myMembersSnap.docs.map(d => d.ref.parent.parent.id));
    _myPendingIds = new Set(pendingSnap.docs.map(d => d.ref.parent.parent.id));
}

function renderSearchResults(query) {
    const resultsDiv = document.getElementById("groupSearchResults");
    if (!_allGroups) { resultsDiv.innerHTML = `<div class="dash-empty">Yükleniyor...</div>`; return; }
    const q = (query || "").trim().toLowerCase();
    if (!q) { resultsDiv.innerHTML = ""; return; }

    const matches = _allGroups.filter(g => {
        const name = (g.name || "").toLowerCase();
        const code = (g.code || "").toLowerCase();
        // İsim baştan eşleşsin VEYA kelime başından eşleşsin
        if (name.startsWith(q)) return true;
        if (code.startsWith(q)) return true;
        // Kelimelerin başından eşleşsin (örn. "el" → "el-clasico")
        const words = name.split(/[\s\-_]+/);
        if (words.some(w => w.startsWith(q))) return true;
        return false;
    });

    if (!matches.length) { resultsDiv.innerHTML = `<div class="dash-empty">Sonuç bulunamadı.</div>`; return; }
    resultsDiv.innerHTML = "";
    matches.forEach(g => {
        let btnClass = "search-result-btn";
        let btnText = "Katılım İste";
        let btnDisabled = false;
        if (_myGroupIds.has(g.id)) { btnClass += " member"; btnText = "✓ Üyesin"; btnDisabled = true; }
        else if (_myPendingIds.has(g.id)) { btnClass += " sent"; btnText = "⏳ İstek Gönderildi"; btnDisabled = true; }
        const item = document.createElement("div");
        item.className = "search-result-item";
        item.innerHTML = `
            <div class="search-result-info">
                <h4>🏟️ ${g.name||"Halı Saha"}</h4>
                <span>Kod: ${g.code||"-"}</span>
            </div>
            <button class="${btnClass}" ${btnDisabled?"disabled":""}
                onclick="sendJoinRequest('${g.id}','${(g.name||"").replace(/'/g,"")}',this)">
                ${btnText}
            </button>`;
        resultsDiv.appendChild(item);
    });
}

async function searchGroups() {
    const query = document.getElementById("groupSearchInput").value || "";
    // Her aramada cache'i sıfırla, taze veri çek
    _allGroups = null;
    _myGroupIds = new Set();
    _myPendingIds = new Set();
    await initSearchCache();
    renderSearchResults(query);
}

// Enter ile arama
document.addEventListener("DOMContentLoaded", () => {
    const inp = document.getElementById("groupSearchInput");
    if (inp) {
        inp.addEventListener("input", async () => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(async () => {
        _allGroups = null;
        _myGroupIds = new Set();
        _myPendingIds = new Set();
        await initSearchCache();
        renderSearchResults(inp.value);
    }, 300);
});
inp.addEventListener("keydown", async e => {
    if (e.key === "Enter") {
        _allGroups = null;
        _myGroupIds = new Set();
        _myPendingIds = new Set();
        await initSearchCache();
        renderSearchResults(inp.value);
    }
});
    }
});

// =============================================
// KATILIM İSTEĞİ GÖNDER
// =============================================
async function sendJoinRequest(groupId, groupName, btn) {
    if (!currentFirebaseUser) return alert("Giriş yapman gerekiyor!");

    const uid = currentFirebaseUser.uid;
    const displayName = currentDisplayName || currentFirebaseUser.email;

    // Kaç gruba üyeyim?
    const myMembersSnap = await db.collectionGroup("members").where("uid", "==", uid).get();
    if (myMembersSnap.size >= 5) {
        return alert("En fazla 5 halı saha grubuna üye olabilirsin!");
    }

    // İstek zaten var mı?
    const existing = await db.collection("groups").doc(groupId)
        .collection("joinRequests").doc(uid).get();

    if (existing.exists && existing.data().status === "pending") {
        return alert("Bu gruba zaten istek gönderdin!");
    }

    // İstek gönder
    await db.collection("groups").doc(groupId)
        .collection("joinRequests").doc(uid).set({
            uid,
            displayName,
            email: currentFirebaseUser.email,
            requestedAt: new Date().toISOString(),
            status: "pending"
        });

    btn.textContent = "⏳ İstek Gönderildi";
    btn.classList.add("sent");
    btn.disabled = true;
	_myPendingIds.add(groupId);
    notify(`"${groupName}" grubuna katılım isteğin gönderildi!`);
}

// =============================================
// GRUP OLUŞTUR
// =============================================
function openCreateGroupModal() {
    document.getElementById("createGroupModal").classList.add("open");
}

function closeCreateGroupModal() {
    document.getElementById("createGroupModal").classList.remove("open");
    document.getElementById("newGroupName").value = "";
}

async function createGroup() {
    const groupName = (document.getElementById("newGroupName").value || "").trim();
    if (!groupName) return alert("Grup ismi yaz!");
	// Aynı isimde grup var mı kontrol et
		const existingName = await db.collection("groups")
    .where("name", "==", groupName).limit(1).get();
	if (!existingName.empty) {
    closeCreateGroupModal();
    setTimeout(() => notify("❌ Bu isimde bir grup zaten mevcut! Farklı bir isim dene."), 300);
    return;
}
    if (!currentFirebaseUser) return alert("Giriş yapman gerekiyor!");

    const uid = currentFirebaseUser.uid;
    const displayName = currentDisplayName || currentFirebaseUser.email;

    // Kaç gruba üyeyim?
    const myMembersSnap = await db.collectionGroup("members").where("uid", "==", uid).get();
    if (myMembersSnap.size >= 5) {
        return alert("En fazla 5 halı saha grubuna üye/admin olabilirsin!");
    }

    // Benzersiz kod üret
    let code = null;
    for (let i = 0; i < 12; i++) {
        const c = randomCode(6);
        const exists = await findGroupByCode(c);
        if (!exists) { code = c; break; }
    }
    if (!code) return alert("Kod üretilemedi, tekrar dene.");

    // Grubu oluştur
    const groupRef = await db.collection("groups").add({
        name: groupName,
        code,
        adminUid: uid,
        adminEmail: currentFirebaseUser.email,
        adminUsername: displayName,
        createdAt: new Date().toISOString()
    });

    // Admin olarak member ekle
    await db.collection("groups").doc(groupRef.id)
        .collection("members").doc(uid).set({
            uid,
            username: displayName,
            displayName,
            role: "admin",
            email: currentFirebaseUser.email,
            status: "active",
            createdAt: new Date().toISOString()
        });

    // users dökümanındaki groups listesini güncelle
    await db.collection("users").doc(uid).set(
        { groups: firebase.firestore.FieldValue.arrayUnion(groupRef.id) },
        { merge: true }
    );

    closeCreateGroupModal();
    notify(`"${groupName}" grubu oluşturuldu! Grup kodu: ${code}`);

    // Grubu yükle ve direkt gir
    await loadMyGroups();

    // Gruba direkt gir
    const groupData = { name: groupName, code };
    const memberData = { username: displayName, role: "admin" };
    await enterGroup(groupRef.id, groupData, memberData);
}

// =============================================
// BEKLEYENİSTEKLER (Admin Paneli)
// =============================================
async function loadPendingRequests() {
    const container = document.getElementById("pendingRequestsList");
    if (!container || !currentGroupId) return;
    try {
        const snap = await db.collection("groups").doc(currentGroupId)
            .collection("joinRequests")
            .where("status", "==", "pending")
            .get();

        if (snap.empty) {
            container.innerHTML = `<div class="dash-empty">Bekleyen istek yok.</div>`;
            return;
        }

        container.innerHTML = "";

        for (const doc of snap.docs) {
            const data = doc.data();
            const reqUid = doc.id;
            let statsHtml = "";

            try {
                const reqUserDoc = await db.collection("users").doc(reqUid).get();
                if (reqUserDoc.exists) {
                    const reqData = reqUserDoc.data();
                    const selfStats = reqData.selfStats || {};
                    const groupRatings = reqData.groupRatings || {};

                    if (Object.keys(selfStats).length > 0) {
                        statsHtml += `
                        <div style="margin-top:8px;padding:6px 8px;background:rgba(138,43,255,0.15);border-radius:8px;font-size:12px;">
                            <b style="color:#a78bfa;">📊 Kendi Puanı:</b>
                            <span style="color:rgba(255,255,255,0.8);margin-left:4px;">
                                HIZ:${selfStats.hiz||0} ŞUT:${selfStats.sut||0} PAS:${selfStats.pas||0} 
                                KON:${selfStats.kondisyon||0} DEF:${selfStats.defans||0} FİZ:${selfStats.fizik||0}
                            </span>
                        </div>`;
                    }

                    for (const [gId, gStats] of Object.entries(groupRatings)) {
                        if (gId === currentGroupId) continue;
                        try {
                            const groupDoc = await db.collection("groups").doc(gId).get();
                            const groupName = groupDoc.exists ? (groupDoc.data().name || gId) : gId;
                            statsHtml += `
                            <div style="margin-top:4px;padding:6px 8px;background:rgba(96,179,255,0.1);border-radius:8px;font-size:12px;">
                                <b style="color:#60b3ff;">🏟️ ${groupName}:</b>
                                <span style="color:rgba(255,255,255,0.8);margin-left:4px;">
                                    HIZ:${gStats.hiz||0} ŞUT:${gStats.sut||0} PAS:${gStats.pas||0} 
                                    KON:${gStats.kondisyon||0} DEF:${gStats.defans||0} FİZ:${gStats.fizik||0}
                                </span>
                            </div>`;
                        } catch(_) {}
                    }
                }
            } catch(e) { console.warn("Stats çekilemedi:", e); }

            const item = document.createElement("div");
            item.className = "request-item";
            item.id = `req-${doc.id}`;
            item.innerHTML = `
                <div class="request-info" style="flex:1;">
                    <h4>👤 ${data.displayName || data.email}</h4>
                    <span>${data.email} · ${new Date(data.requestedAt).toLocaleDateString("tr-TR")}</span>
                    ${statsHtml}
                </div>
                <div class="request-actions">
                    <button class="btn-accept" onclick="acceptJoinRequest('${doc.id}', '${(data.displayName || "").replace(/'/g, "")}', '${data.email}')">✓ Kabul</button>
                    <button class="btn-reject" onclick="rejectJoinRequest('${doc.id}')">✕ Red</button>
                </div>
            `;
            container.appendChild(item);
        }

    } catch (e) {
        console.error("loadPendingRequests error:", e);
    }
}

async function acceptJoinRequest(uid, displayName, email) {
    if (!currentGroupId) return;

    // Member ekle
    await db.collection("groups").doc(currentGroupId)
        .collection("members").doc(uid).set({
            uid,
            username: displayName,
            displayName,
            role: "member",
            email,
            status: "active",
            joinedAt: new Date().toISOString()
        });

    // Player doc oluştur
    const ref = db.collection("groups").doc(currentGroupId).collection("players").doc(displayName);
const existing = await ref.get();

// Kullanıcının mevcut profil bilgilerini çek
const userDoc = await db.collection("users").doc(uid).get();
const userData = userDoc.exists ? userDoc.data() : {};
const stats = userData.displayStats || userData.selfStats || null;
const mainPos = userData.mainPos || "";
const subPos  = userData.subPos  || "";
const photo   = userData.photo   || DEFAULT_PHOTO;

if (!existing.exists) {
    await ref.set({
        name: displayName,
        photo,
        mainPos,
        subPos,
        stats,
        createdAt: new Date().toISOString()
    });
} else {
    // Zaten varsa stats/mevki/fotoğraf güncelle
    await ref.set({ photo, mainPos, subPos, stats }, { merge: true });
}

    // İsteği güncelle
    await db.collection("groups").doc(currentGroupId)
        .collection("joinRequests").doc(uid)
        .set({ status: "accepted", resolvedAt: new Date().toISOString() }, { merge: true });

    // users dökümanındaki groups listesini güncelle
    await db.collection("users").doc(uid).set(
        { groups: firebase.firestore.FieldValue.arrayUnion(currentGroupId) },
        { merge: true }
    );

    // UI'dan kaldır
    const el = document.getElementById(`req-${uid}`);
    if (el) el.remove();

    await refreshCachePartial(["players"]);
await loadPlayers();
await setupSelects();
notify(`${displayName} gruba kabul edildi!`);

    // Boş kontrol
    const container = document.getElementById("pendingRequestsList");
    if (container && container.children.length === 0) {
        container.innerHTML = `<div class="dash-empty">Bekleyen istek yok.</div>`;
    }
}

async function rejectJoinRequest(uid) {
    if (!currentGroupId) return;

    await db.collection("groups").doc(currentGroupId)
        .collection("joinRequests").doc(uid)
        .set({ status: "rejected", resolvedAt: new Date().toISOString() }, { merge: true });

    const el = document.getElementById(`req-${uid}`);
    if (el) el.remove();

    notify("İstek reddedildi.");

    const container = document.getElementById("pendingRequestsList");
    if (container && container.children.length === 0) {
        container.innerHTML = `<div class="dash-empty">Bekleyen istek yok.</div>`;
    }
}