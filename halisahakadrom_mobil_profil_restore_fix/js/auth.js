/* ==========================================================
   AUTH.JS — Yeni sistem: email+şifre, migration dahil
========================================================= */

// Global kullanıcı bilgisi (Firebase Auth user)
let currentFirebaseUser = null;
let currentDisplayName = null;

// =============================================
// AUTH TAB SWITCH
// =============================================
function switchAuthTab(tab) {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));

    if (tab === "login") {
        document.querySelector(".auth-tab:first-child").classList.add("active");
        document.getElementById("authLoginForm").classList.add("active");
    } else {
        document.querySelector(".auth-tab:last-child").classList.add("active");
        document.getElementById("authRegisterForm").classList.add("active");
    }
}

function showAuthPage() {
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
    const auth = document.getElementById("authPage");
    auth.style.display = "block";
    auth.classList.add("active");
    document.getElementById("navbar").style.display = "none";
}

// =============================================
// FORGOT PASSWORD MODAL
// =============================================
function showForgotModal() {
    document.getElementById("forgotModal").classList.add("open");
}

function closeForgotModal() {
    document.getElementById("forgotModal").classList.remove("open");
    document.getElementById("forgotEmailInput").value = "";
}

async function sendForgotEmail() {
    const email = (document.getElementById("forgotEmailInput").value || "").trim();
    if (!email) return alert("E-posta adresin yaz!");
    try {
        await auth.sendPasswordResetEmail(email);
        notify("Şifre sıfırlama linki e-postana gönderildi");
        closeForgotModal();
    } catch (e) {
        console.warn(e);
        alert("Hata: " + e.message);
    }
}

// =============================================
// KAYIT OL (YENİ SİSTEM)
// =============================================
async function registerUser() {
    const displayName = (document.getElementById("regDisplayName").value || "").trim();
    const email = (document.getElementById("regEmailNew").value || "").trim();
    const pass = (document.getElementById("regPasswordNew").value || "").trim();

    if (!displayName) return alert("Kullanıcı adın yaz!");
if (!email) return alert("E-posta yaz!");
if (pass.length < 6) return alert("Şifre en az 6 karakter olmalı!");
const kvkkCheck = document.getElementById("kvkkCheck");
if (kvkkCheck && !kvkkCheck.checked) return alert("Devam edebilmek için KVKK metnini ve kullanım koşullarını kabul etmelisin.");

    try {
        if (window.__authPersistenceReady) await window.__authPersistenceReady;
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        const uid = cred.user.uid;

        // Kullanıcı profilini Firestore'a kaydet
        await db.collection("users").doc(uid).set({
            displayName,
            email,
            createdAt: new Date().toISOString(),
            groups: []
        });

        currentFirebaseUser = cred.user;
        currentDisplayName = displayName;

        notify("Kayıt tamamlandı! Hoş geldin " + displayName);
		// Invite token varsa gruba ekle
const urlParams = new URLSearchParams(window.location.search);
const inviteToken = sessionStorage.getItem("pendingInviteToken");
const inviteGroupId = sessionStorage.getItem("pendingInviteGroup");

if (inviteToken && inviteGroupId) {
    try {
        const groupDoc = await db.collection("groups").doc(inviteGroupId).get();
        if (groupDoc.exists && groupDoc.data().inviteToken === inviteToken) {
            await db.collection("groups").doc(inviteGroupId)
                .collection("members").doc(uid).set({
                    uid,
                    username: displayName,
                    displayName,
                    role: "member",
                    email,
                    status: "active",
                    joinedAt: new Date().toISOString()
                });
            await db.collection("users").doc(uid).set(
                { groups: firebase.firestore.FieldValue.arrayUnion(inviteGroupId) },
                { merge: true }
            );
            sessionStorage.removeItem("pendingInviteToken");
            sessionStorage.removeItem("pendingInviteGroup");
            notify("✅ Gruba otomatik olarak eklendi!");
        }
    } catch(e) {
        console.warn("Invite join failed:", e);
    }
}
		await showProfileSetup();

    } catch (e) {
        console.warn(e);
        if (e.code === "auth/email-already-in-use") {
            alert("Bu e-posta zaten kayıtlı. Giriş yapmayı dene.");
        } else {
            alert("Hata: " + e.message);
        }
    }
}

// =============================================
// GİRİŞ YAP (YENİ SİSTEM)
// =============================================
async function loginUser() {
    const email = (document.getElementById("loginEmail").value || "").trim();
    const pass = (document.getElementById("loginPassword").value || "").trim();
    if (!email) return alert("E-posta yaz!");
    if (!pass) return alert("Şifre yaz!");
    try {
        if (window.__authPersistenceReady) await window.__authPersistenceReady;
        const cred = await auth.signInWithEmailAndPassword(email, pass);
        const uid = cred.user.uid;
        currentFirebaseUser = cred.user;
        // Kullanıcı dökümanı var mı kontrol et
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            // Migration: eski sistemde hesap var ama users dökümanı yok
            // Email'e göre eski member kaydını bul
            await migrateOldUser(uid, email, cred.user);
			
        } else {
            currentDisplayName = userDoc.data().displayName || email;
        }
        // onAuthStateChanged otomatik tetiklenecek ve yönlendirmeyi yapacak
    } catch (e) {
        console.warn(e);
        if (e.code === "auth/wrong-password" || e.code === "auth/user-not-found") {
            alert("E-posta veya şifre hatalı!");
        } else {
            alert("Hata: " + e.message);
        }
    }
}

// =============================================
// MİGRASYON — eski kullanıcı ilk kez yeni sisteme giriyor
// =============================================
async function migrateOldUser(uid, email, firebaseUser) {
    // Tüm gruplarda bu email'e sahip member'ı bul
    const groupsSnap = await db.collection("groups").get();
    let foundGroups = [];
    let foundUsername = null;

    for (const groupDoc of groupsSnap.docs) {
        const membersSnap = await db.collection("groups")
            .doc(groupDoc.id)
            .collection("members")
            .where("email", "==", email)
            .limit(1)
            .get();

        if (!membersSnap.empty) {
            const memberData = membersSnap.docs[0].data();
            foundUsername = memberData.username || membersSnap.docs[0].id;
            foundGroups.push(groupDoc.id);

            // Member kaydına uid yaz (migration)
            await membersSnap.docs[0].ref.set({ uid }, { merge: true });
        }
    }

    const displayName = foundUsername || email.split("@")[0];
    currentDisplayName = displayName;

    // users dökümanı oluştur
    await db.collection("users").doc(uid).set({
    displayName,
    email,
    createdAt: new Date().toISOString(),
    groups: foundGroups,
    migratedAt: new Date().toISOString(),
    profileCompleted: foundGroups.length > 0
}, { merge: true });

    if (foundGroups.length > 0) {
        notify(`Hesabın taşındı! ${foundGroups.length} halısaha grubun bulundu.`);
    }
}

// =============================================
// ÇIKIŞ YAP
// =============================================
async function logoutUser() {
    try { await auth.signOut(); } catch (_) {}

    currentFirebaseUser = null;
    currentDisplayName = null;
    currentGroupId = null;
    currentGroupCode = null;
    currentUser = null;
    isAdmin = false;

    _allGroups = null;
    _myGroupIds = new Set();
    _myPendingIds = new Set();

    sessionStorage.removeItem("hsSession");
    sessionStorage.removeItem("hsPage");
    sessionStorage.removeItem("hsActiveGroup");
    sessionStorage.removeItem("hsSessionAlive");
    localStorage.removeItem("hsSession");
    localStorage.removeItem("hsPage");
    localStorage.removeItem("hsActiveGroup");

    hideAdminButtons();
    document.getElementById("navbar").style.display = "none";

    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });

    notify("Çıkış yapıldı");
    setTimeout(() => {
        window.location.href = "./landing.html";
    }, 500);
}

// =============================================
// ESKİ SİSTEM UYUMLULUK (auth.js'de kalması gerekenler)
// =============================================

// Eski forgotSend hala çalışsın (forgot sayfası için)
async function forgotSend() {
    const code = (document.getElementById("forgotCode")?.value || "").trim().toUpperCase();
    const email = (document.getElementById("forgotEmail")?.value || "").trim();
    const username = (document.getElementById("forgotUsername")?.value || "").trim();

    if (!code || !email || !username) {
        return alert("Halı saha kodu, e-posta ve kullanıcı adı yaz!");
    }

    const snap = await db.collection("groups")
        .where("code", "==", code)
        .where("adminEmail", "==", email)
        .where("adminUsername", "==", username)
        .limit(1)
        .get();

    if (snap.empty) {
        return alert("Bilgiler eşleşmiyor!");
    }

    try {
        await auth.sendPasswordResetEmail(email);
        notify("Şifre sıfırlama linki e-postana gönderildi");
    } catch (e) {
        console.warn(e);
    }
}

// Eski logout (bazı yerlerde hala çağrılıyor olabilir)
function logout() {
    logoutUser();
}