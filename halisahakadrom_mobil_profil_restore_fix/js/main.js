/* ==========================================================
   MAIN.JS — DOMContentLoaded, openApp, loadAll
========================================================= */

async function openApp() {
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });

    const nav = document.getElementById("navbar");
    if (nav) nav.style.display = "flex";

    hideAdminButtons();
    if (isAdmin) showAdminButtons();

    document.getElementById("profilBtn").style.display = "inline-block";
    document.getElementById("kadroBtn").style.display = isAdmin ? "inline-block" : "none";

    await loadAll();

    const urlPage = getPageIdFromUrl();
let savedPage = (urlPage && urlPage !== "dashboard") 
    ? urlPage 
    : (sessionStorage.getItem("hsPage") || localStorage.getItem("hsPage") || "oyuncular");
if (["puan", "achievements", "haftaninYildizlari"].includes(savedPage)) {
    savedPage = savedPage === "puan" ? "gecmis" : "oyuncular";
}
if (AUTH_PAGES.includes(savedPage) || savedPage === "dashboard" || savedPage === "authPage") {
    savedPage = "oyuncular";
}
showPage(savedPage);
}
async function loadAll() {
    await refreshCache({ force: true });
    await Promise.all([
        loadPlayers(),
        loadGecmis(),
        loadGolKr(),
        loadKazananlar(),
        loadEnIyi()
    ]);
    await setupSelects();
}

// ==========================================================
// DOM LOADED
// ==========================================================
window.addEventListener("DOMContentLoaded", async () => {
    initEmailJSOnce();

    // Tüm sayfaları gizle
    document.getElementById("navbar").style.display = "none";
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
	// Invite linki kontrolü
if (window.location.pathname === "/join") {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get("invite");
    const inviteGroupId = urlParams.get("group");

    if (!inviteToken || !inviteGroupId) {
        document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0015;color:white;font-family:Poppins,sans-serif;text-align:center;">
            <div>
                <div style="font-size:48px;margin-bottom:16px;">🔗</div>
                <h2 style="color:#a78bfa;margin-bottom:8px;">Geçersiz Davet Linki</h2>
                <p style="color:rgba(255,255,255,0.5);">Bu link geçersiz veya eksik.</p>
            </div>
        </div>`;
        return;
    }

    sessionStorage.setItem("fromLanding", "1");
    sessionStorage.setItem("pendingInviteToken", inviteToken);
    sessionStorage.setItem("pendingInviteGroup", inviteGroupId);

    // Token'ı Firestore'da doğrula
    db.collection("groups").doc(inviteGroupId).get().then(groupDoc => {
        if (!groupDoc.exists || groupDoc.data().inviteToken !== inviteToken) {
            document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0015;color:white;font-family:Poppins,sans-serif;text-align:center;">
                <div>
                    <div style="font-size:48px;margin-bottom:16px;">❌</div>
                    <h2 style="color:#ff6b6b;margin-bottom:8px;">Davet Linki Geçersiz</h2>
                    <p style="color:rgba(255,255,255,0.5);">Bu davet linki artık geçerli değil.</p>
                    <p style="color:rgba(255,255,255,0.3);font-size:13px;margin-top:8px;">Admin yeni bir link oluşturmuş olabilir.</p>
                </div>
            </div>`;
        }
        // Token geçerliyse sayfa normal yüklenir, kayıt ekranı açılır
    }).catch(() => {
        document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0015;color:white;font-family:Poppins,sans-serif;text-align:center;">
            <div>
                <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
                <h2 style="color:#fbbf24;margin-bottom:8px;">Bağlantı Hatası</h2>
                <p style="color:rgba(255,255,255,0.5);">Lütfen tekrar deneyin.</p>
            </div>
        </div>`;
    });
}
    // Aktif oturum varsa boş ekran göster (flash önleme)
    // onAuthStateChanged gelince doğru sayfa açılacak
    const hasSession = sessionStorage.getItem("hsSessionAlive") && sessionStorage.getItem("hsActiveGroup");
    if (!hasSession) {
        const authPage = document.getElementById("authPage");
        authPage.style.display = "block";
        authPage.classList.add("active");
    }
    // hasSession varsa hiçbir şey gösterme — onAuthStateChanged halleder

    // Maç formatı select dinleyicisi
    const sel = document.getElementById("matchSizeSelect");
    if (sel && !sel._wired) {
        sel._wired = true;
        sel.addEventListener("change", () => {
            localStorage.setItem("hsMatchSize", sel.value);
            if (typeof updateMatchLabelUI === "function") updateMatchLabelUI();
            const kadroPage = document.getElementById("kadro");
            if (kadroPage && kadroPage.classList.contains("active")) {
                if (typeof loadKadroPlayerGrid === "function") loadKadroPlayerGrid();
            }
        });
    }

    if (typeof updateMatchLabelUI === "function") updateMatchLabelUI();

    // Fotoğraf seç butonu
    const selectFileBtn = document.getElementById("selectFileBtn");
    if (selectFileBtn) {
        selectFileBtn.onclick = () => {
            const input = document.getElementById("profilUpload");
            input.value = "";
            input.click();
        };
    }

    // Fotoğraf önizleme
    const profilUpload = document.getElementById("profilUpload");
    if (profilUpload) {
        profilUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = document.getElementById("fifa-photo");
        if (img) img.src = ev.target.result;
        const dashImg = document.getElementById("dashProfilePhoto");
        if (dashImg) dashImg.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});
    }
	const dashProfilUpload = document.getElementById("dashProfilUpload");
if (dashProfilUpload) {
    dashProfilUpload.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dashImg = document.getElementById("dashProfilePhoto");
            if (dashImg) dashImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

    // Rating kaydet
    const saveRatingBtn = document.getElementById("saveRating");
saveRatingBtn.onclick = async () => {
    const groupStats = {
        sut:        Number(document.getElementById("rate-sut").value),
        pas:        Number(document.getElementById("rate-pas").value),
        kondisyon:  Number(document.getElementById("rate-kond").value),
        hiz:        Number(document.getElementById("rate-hiz").value),
        fizik:      Number(document.getElementById("rate-fizik").value),
        defans:     Number(document.getElementById("rate-def").value),
        oyunGorusu: Number(document.getElementById("rate-oyunGorusu").value)
    };

    const playerDoc = CACHE.players.find(x => x.id === selectedPlayerId);
    const playerName = playerDoc?.name || document.getElementById("ratePlayerName").textContent;

    if (playerDoc?.isGuest) {
        await C("players").doc(selectedPlayerId).update({ stats: groupStats });
        await refreshCachePartial(["players"]);
		await loadPlayers();
        closeRatePanel();
        notify("Puanlar Kaydedildi");
        return;
    }

    const memberSnap = await db.collection("groups").doc(currentGroupId)
        .collection("members").where("username", "==", playerName).limit(1).get();

    if (memberSnap.empty || !memberSnap.docs[0].data().uid) {
        await C("players").doc(selectedPlayerId).update({ stats: groupStats });
        await refreshCachePartial(["players"]);
		await loadPlayers();
        closeRatePanel();
        notify("Puanlar Kaydedildi");
        return;
    }

    const memberUid = memberSnap.docs[0].data().uid;

    await db.collection("users").doc(memberUid).set({
    groupRatings: {
        [currentGroupId]: groupStats
    }
}, { merge: true });

    const playerRef = await findPlayerDocInGroup(currentGroupId, playerName, memberUid);
    await playerRef.set({ stats: groupStats }, { merge: true });
        await refreshCachePartial(["players"]);
		await loadPlayers();
    closeRatePanel();
    notify("Puanlar Kaydedildi");
};
    // Login enter
    const loginEmailEl = document.getElementById("loginEmail");
    const loginPasswordEl = document.getElementById("loginPassword");
    if (loginEmailEl) loginEmailEl.addEventListener("keydown", e => { if (e.key === "Enter") loginUser(); });
    if (loginPasswordEl) loginPasswordEl.addEventListener("keydown", e => { if (e.key === "Enter") loginUser(); });

    // Register enter
    const regDisplayNameEl = document.getElementById("regDisplayName");
    const regEmailNewEl = document.getElementById("regEmailNew");
    const regPasswordNewEl = document.getElementById("regPasswordNew");
    if (regDisplayNameEl) regDisplayNameEl.addEventListener("keydown", e => { if (e.key === "Enter") registerUser(); });
    if (regEmailNewEl) regEmailNewEl.addEventListener("keydown", e => { if (e.key === "Enter") registerUser(); });
    if (regPasswordNewEl) regPasswordNewEl.addEventListener("keydown", e => { if (e.key === "Enter") registerUser(); });

    // ==========================================================
    // AUTH STATE — YENİ SİSTEM
    // ==========================================================
    auth.onAuthStateChanged(async (user) => {
    if (!user) {
        currentFirebaseUser = null;
        currentDisplayName = null;
        sessionStorage.removeItem("hsSession");
        sessionStorage.removeItem("hsActiveGroup");
        sessionStorage.removeItem("hsPage");
        sessionStorage.removeItem("hsSessionAlive");
        localStorage.removeItem("hsSession");
        sessionStorage.removeItem("hsActiveGroup");
        localStorage.removeItem("hsActiveGroup");
        localStorage.removeItem("hsPage");
        document.querySelectorAll(".page").forEach(p => { p.classList.remove("active"); p.style.display = "none"; });
        const ap = document.getElementById("authPage");
        ap.style.display = "block";
        ap.classList.add("active");
        document.getElementById("navbar").style.display = "none";
        return;
    }

    currentFirebaseUser = user;

    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
        await migrateOldUser(user.uid, user.email, user);
    } else {
        currentDisplayName = userDoc.data().displayName || user.email;
    }

    // sessionStorage boşsa → sekme yeni açıldı → taze başlangıç
    // sessionStorage doluysa → F5 / navigasyon → kaldığı yerden devam
    const freshSession = !sessionStorage.getItem("hsSessionAlive");
    if (freshSession) {
        sessionStorage.removeItem("hsActiveGroup");
        sessionStorage.removeItem("hsPage");
        sessionStorage.removeItem("hsActiveGroup");
        localStorage.removeItem("hsActiveGroup");
        localStorage.removeItem("hsPage");
        sessionStorage.setItem("hsSessionAlive", "1");
    }

    // Aktif grup var mı?
    const activeGroupRaw = sessionStorage.getItem("hsActiveGroup");
    if (activeGroupRaw) {
        try {
            const activeGroup = JSON.parse(activeGroupRaw);
            if (activeGroup.groupId) {
                const memberDoc = await db.collection("groups")
                    .doc(activeGroup.groupId)
                    .collection("members")
                    .doc(user.uid)
                    .get();

                if (memberDoc.exists && memberDoc.data().status === "active") {
                    const groupDoc = await db.collection("groups").doc(activeGroup.groupId).get();
                    if (groupDoc.exists) {
                        try {
                            await enterGroup(activeGroup.groupId, groupDoc.data(), memberDoc.data());
                        } catch(e) {
                            console.error("enterGroup HATA:", e);
                        }
                        return;
                    }
                }
            }
        } catch (_) {}
        sessionStorage.removeItem("hsActiveGroup");
        localStorage.removeItem("hsActiveGroup");
    }

    // Profil tamamlanmış mı?
  const freshData = userDoc.exists ? userDoc.data() : {};

    if (!freshData.profileCompleted) {
        if (freshData.selfStats || freshData.migratedAt) {
            await db.collection("users").doc(user.uid).set({ profileCompleted: true }, { merge: true });
        } else {
            const memberCheck = await db.collectionGroup("members").where("uid", "==", user.uid).get();
            if (!memberCheck.empty) {
                await db.collection("users").doc(user.uid).set({ profileCompleted: true }, { merge: true });
            } else {
                await showProfileSetup();
                return;
            }
        }
    }

    await openDashboard();
});
});