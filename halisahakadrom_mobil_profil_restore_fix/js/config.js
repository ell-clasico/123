/* ==========================================================
   CONFIG.JS — Sabitler, Cache, Session
========================================================= */

const DEFAULT_PHOTO = "./img/profil.png";
let currentUser = null;
const db = window.db || firebase.firestore();
const storage = window.storage || firebase.storage();
const auth = window.auth || firebase.auth();
const FORMA_A = "./img/Kırmızı.png";
const FORMA_B = "./img/Mavi.png";
let selects = {};
let selectedPlayers = [];
let multiSelects = {};
let currentKadroPosMap = {};
let swapSelection = null;
window.lastWeeklyData = null;

const AUTH_PAGES = ["login", "register", "forgot", "join"];

// ==========================================================
// GLOBAL CACHE
// ==========================================================
let CACHE = {
    players: [],
    ratings: [],
    ga: [],
    winners: []
};

// ==========================================================
// EMAILJS
// ==========================================================
const EMAILJS_PUBLIC_KEY = "EjYKFkkJCt9lQI8a3";
const EMAILJS_SERVICE_ID = "service_u5tda6s";
const EMAILJS_TPL_MAIN = "template_axdxxmc";

function emailjsReady() {
    return typeof emailjs !== "undefined" && EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID;
}

function initEmailJSOnce() {
    if (!emailjsReady()) return;
    if (window.__emailjsInited) return;
    try {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        window.__emailjsInited = true;
    } catch (e) {
        console.warn("EmailJS init failed:", e);
    }
}

async function sendEmail(templateId, params) {
    if (!emailjsReady() || !templateId) return;
    initEmailJSOnce();
    try {
        await emailjs.send(EMAILJS_SERVICE_ID, templateId, params);
    } catch (e) {
        console.warn("EmailJS send failed:", e);
    }
}

// ==========================================================
// GROUP SESSION
// ==========================================================
let currentGroupId = null;
let currentGroupCode = null;
let currentRole = null;
let isAdmin = false;

function C(name) {
    return db.collection("groups").doc(currentGroupId).collection(name);
}

function setSession({ groupId, groupCode, username, role }) {
    currentGroupId = groupId;
    currentGroupCode = groupCode;
    currentUser = username;
    currentRole = role || "member";
    isAdmin = currentRole === "admin";
    sessionStorage.setItem(
        "hsSession",
        JSON.stringify({ groupId, groupCode, username, role: currentRole })
    );
}

function getSession() {
    try {
        const raw = sessionStorage.getItem("hsSession");
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function clearSession() {
    currentGroupId = null;
    currentGroupCode = null;
    currentRole = null;
    isAdmin = false;
    currentUser = null;
    window.activeGroup = null;
    sessionStorage.removeItem("hsSession");
    localStorage.removeItem("hsSession");
}

function randomCode(len = 6) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

async function findGroupByCode(code) {
    const snap = await db.collection("groups").where("code", "==", code).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
}

async function findGroupByAdminEmail(email) {
    const snap = await db.collection("groups").where("adminEmail", "==", email).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
}

async function ensurePlayerDoc(username) {
    if (!username || username === "ADMIN") return;

    const ref = C("players").doc(username);
    const doc = await ref.get();

    // users koleksiyonundan mevcut profil bilgilerini çek
    const uid = currentFirebaseUser?.uid;
    let userData = {};
    if (uid) {
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) userData = userDoc.data();
    }

    const stats    = userData.displayStats || userData.selfStats || null;
    const mainPos  = userData.mainPos  || "";
    const subPos   = userData.subPos   || "";
    const photo    = userData.photo    || DEFAULT_PHOTO;

    if (!doc.exists) {
        await ref.set({
            name: username,
            photo,
            mainPos,
            subPos,
            stats,
            createdAt: new Date().toISOString()
        });
    } else {
        // Mevcut döküman varsa sadece eksik alanları güncelle
        const existing = doc.data();
        const updates = {};
        if (!existing.stats && stats)       updates.stats   = stats;
        if (!existing.mainPos && mainPos)   updates.mainPos = mainPos;
        if (!existing.subPos  && subPos)    updates.subPos  = subPos;
        if (!existing.photo || existing.photo === DEFAULT_PHOTO) updates.photo = photo;
        if (Object.keys(updates).length > 0) await ref.set(updates, { merge: true });
    }
}

async function uploadImageToStorage(file, folder = "images") {
    if (!file) return DEFAULT_PHOTO;

    const CLOUD_NAME = "ddvwifuqk";
    const UPLOAD_PRESET = "halisaha_upload";

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("folder", folder);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData
    });

    if (!res.ok) throw new Error("Cloudinary yükleme başarısız: " + res.status);
    const data = await res.json();
    return data.secure_url;
}

// ==========================================================
// CACHE REFRESH
// ==========================================================
const CACHE_TTL_MS = 30000;
let CACHE_META = { groupId: null, loadedAt: 0, collections: {} };

function cacheFresh(key = null) {
    if (!currentGroupId || CACHE_META.groupId !== currentGroupId) return false;
    const now = Date.now();
    if (key) return CACHE_META.collections[key] && (now - CACHE_META.collections[key] < CACHE_TTL_MS);
    return CACHE_META.loadedAt && (now - CACHE_META.loadedAt < CACHE_TTL_MS);
}

function docsToArray(snap) {
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function refreshCache(options = {}) {
    const force = options.force === true;
    if (!force && cacheFresh()) return;

    const [p, r, g, w] = await Promise.all([
        C("players").get(),
        C("ratings").orderBy("date", "desc").limit(200).get(),
        C("ga").limit(300).get(),
        C("winners").limit(300).get()
    ]);

    CACHE.players = docsToArray(p);
    CACHE.ratings = docsToArray(r);
    CACHE.ga = docsToArray(g);
    CACHE.winners = docsToArray(w);

    const now = Date.now();
    CACHE_META = {
        groupId: currentGroupId,
        loadedAt: now,
        collections: { players: now, ratings: now, ga: now, winners: now }
    };
}

// ==========================================================
// POZİSYON HARİTALARI
// ==========================================================
const POS_MAP = {
    "ST": "Santrafor",
    "CM": "Merkez Orta",
    "LW": "Sol Kanat",
    "RW": "Sağ Kanat",
    "LB": "Sol Bek",
    "CB": "Stoper",
    "RB": "Sağ Bek",
    "GK": "Kaleci"
};

const POS_MAP_REVERSE = {
    "Kaleci": "GK",
    "Sol Bek": "LB",
    "Stoper": "CB",
    "Sağ Bek": "RB",
    "Sol Kanat": "LW",
    "Sağ Kanat": "RW",
    "Merkez Orta": "CM",
    "Santrafor": "ST"
};

function normalizePos(posName) {
    if (!posName) return null;
    posName = posName.toString().trim().toLowerCase();
    const map = {
        "kaleci": "GK",
        "sol bek": "LB", "solbek": "LB",
        "sağ bek": "RB", "sag bek": "RB", "sağbek": "RB", "sagbek": "RB",
        "stoper": "CB", "defans": "CB",
        "sol kanat": "LW", "solkanat": "LW",
        "sağ kanat": "RW", "sag kanat": "RW", "sağkanat": "RW", "sagkanat": "RW",
        "merkez orta": "CM", "orta saha": "CM", "ortasaha": "CM",
        "santrafor": "ST", "forvet": "ST"
    };
    return map[posName] || posName.toUpperCase();
}

function mapPosition(pos) {
    if (!pos) return "";
    pos = pos.toLowerCase().trim();
    if (pos === "santrafor") return "ST";
    if (pos === "merkez orta") return "CM";
    if (pos === "sol kanat") return "LW";
    if (pos === "sağ kanat") return "RW";
    if (pos === "stoper") return "CB";
    if (pos === "sol bek") return "LB";
    if (pos === "sağ bek") return "RB";
    if (pos === "kaleci") return "GK";
    return pos.toUpperCase();
}

function posTranslate(code) {
    return {
        "GK": "Kaleci",
        "LB": "Sol Bek",
        "CB": "Stoper",
        "CBX": "Stoper",
        "RB": "Sağ Bek",
        "LW": "Sol Kanat",
        "RW": "Sağ Kanat",
        "CM": "Merkez Orta",
        "CMX": "Merkez Orta",
        "ST": "Santrafor",
        "STX": "Santrafor"
    }[code] || "-";
}

// ==========================================================
// BONUS & OVR
// ==========================================================
function applyMatchBonus(player, stats) {
    const pos = mapPosition(player.mainPos);
    let s = { ...stats };
    const boost = (v, percent) => Math.round(v * (1 + percent / 100));

    if (pos === "ST") {
        s.sut = boost(s.sut, 25);
        s.hiz = boost(s.hiz, 15);
        s.kondisyon = boost(s.kondisyon, 15);
    } else if (pos === "LW" || pos === "RW") {
        s.hiz = boost(s.hiz, 25);
        s.kondisyon = boost(s.kondisyon, 15);
        s.sut = boost(s.sut, 15);
    } else if (pos === "CM") {
        s.pas = boost(s.pas, 25);
        s.oyunGorusu = boost(s.oyunGorusu, 20);
        s.fizik = boost(s.fizik, 10);
    } else if (pos === "LB" || pos === "RB") {
        s.defans = boost(s.defans, 15);
        s.fizik = boost(s.fizik, 20);
        s.hiz = boost(s.hiz, 20);
    } else if (pos === "CB") {
        s.defans = boost(s.defans, 25);
        s.fizik = boost(s.fizik, 20);
        s.hiz = boost(s.hiz, 10);
    }
	Object.keys(s).forEach(k => { if (typeof s[k] === "number" && s[k] > 99) s[k] = 99; });
    return s;
}

function getOVR(player) {
    if (!player) return 0;
    const applied = applyMatchBonus(player, player.stats || {});
    return Math.round(
        ((applied.sut || 0) + (applied.pas || 0) + (applied.kondisyon || 0) +
            (applied.hiz || 0) + (applied.fizik || 0) + (applied.oyunGorusu || 0) +
            (applied.defans || 0)) / 7
    );
}

function getOVR_withBonus(player) {
    if (!player) return 0;
    const base = player.stats || {};
    const applied = applyMatchBonus(player, base);
    return Math.round(
        ((applied.sut || 0) + (applied.pas || 0) + (applied.kondisyon || 0) +
            (applied.hiz || 0) + (applied.fizik || 0) + (applied.oyunGorusu || 0) +
            (applied.defans || 0)) / 7
    );
}

function computeOVR(s) {
    return Math.round(
        ((s.sut || 0) + (s.pas || 0) + (s.kondisyon || 0) +
            (s.hiz || 0) + (s.fizik || 0) + (s.defans || 0) +
            (s.oyunGorusu || 0)) / 7
    );
}

// ==========================================================
// MATCH SIZE
// ==========================================================
function getMatchSize() {
    const sel = document.getElementById("matchSizeSelect");
    const fromDom = sel ? Number(sel.value) : null;
    if (fromDom && fromDom >= 6 && fromDom <= 11) return fromDom;
    const fromWeekly = Number(window.lastWeeklyData?.matchSize);
    if (fromWeekly && fromWeekly >= 6 && fromWeekly <= 11) return fromWeekly;
    const fromLs = Number(localStorage.getItem("hsMatchSize"));
    if (fromLs && fromLs >= 6 && fromLs <= 11) return fromLs;
    return 8;
}

function getMatchLimit() {
    return getMatchSize() * 2;
}

function updateMatchLabelUI() {
    const label = document.getElementById("matchPlayersLabel");
    if (label) label.innerText = `Maça Gelecek ${getMatchLimit()} Oyuncu`;
}

function renderOrderText(order, limit) {
    if (!order) return "";
    if (order <= limit) return `Mevcut sıran ${order} / ${limit}`;
    return `Sıran ${order} — Yedek oyuncusun`;
}

function clean(obj) {
    if (Array.isArray(obj)) return obj.filter(v => v !== undefined);
    if (typeof obj === "object" && obj !== null) {
        let out = {};
        for (let k in obj) { if (obj[k] !== undefined) out[k] = obj[k]; }
        return out;
    }
    return obj;
}
async function refreshCachePartial(collections, options = {}) {
    const force = options.force !== false;
    const map = { players: "players", ratings: "ratings", ga: "ga", winners: "winners" };
    const now = Date.now();

    const promises = collections.map(async (key) => {
        if (!force && cacheFresh(key)) return;
        let ref = C(map[key]);
        if (key === "ratings") ref = ref.orderBy("date", "desc").limit(200);
        if (key === "ga" || key === "winners") ref = ref.limit(300);
        const snap = await ref.get();
        CACHE[key] = docsToArray(snap);
        CACHE_META.groupId = currentGroupId;
        CACHE_META.collections[key] = now;
    });

    await Promise.all(promises);
    CACHE_META.loadedAt = now;
}