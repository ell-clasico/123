/* ==========================================================
   UI.JS — showPage, notify, custom select
========================================================= */
const PAGE_URLS = {
    "oyuncular":       "/oyuncular",
    "haftaninKadro":   "/haftalik-kadro",
    "kadro":           "/kadro",
    "gecmis":          "/puan-gecmisi",
    "admin":           "/admin",
    "gaYonetim":       "/gol-yonetimi",
    "kazananYonetim":  "/kazanan-yonetimi",
    "profilim":        "/profilim",
    "dashboard":       "/dashboard",
    "formAnalizi":     "/form-analizi",
    "chemistry":       "/chemistry",
    "market":          "/market",
    "karsilastirma":   "/oyuncu-karsilastirma",
    "eliteMerkez":      "/elite-merkez",
    "attendanceTahmin":"/katilim-tahmini",
    "proLigMotoru":    "/pro-lig-motoru",
    "sosyalPro":       "/sosyal-pro",
    "pushMerkezi":     "/push-merkezi",
	"join": "/join"
};

const URL_PAGES = Object.fromEntries(
    Object.entries(PAGE_URLS).map(([id, url]) => [url, id])
);

function getPageIdFromUrl() {
    const path = window.location.pathname;
    if (path === "/" || path === "/index.html" || path === "/landing.html") {
        const params = new URLSearchParams(window.location.search);
        const oldPage = params.get("sayfa");
        if (oldPage) return oldPage;
        return null;
    }
    return URL_PAGES[path] || null;
}

function notify(msg = "Kaydedildi") {
    const n = document.getElementById("notify");
    n.innerText = msg;
    n.style.display = "block";
    setTimeout(() => (n.style.display = "none"), 2000);
}

function hideAuthPages() {
    ["login", "register", "forgot", "join"].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = "none";
        el.classList.remove("active");
    });
}

function showAdminButtons() {
    document.getElementById("adminBtn").style.display = "inline-block";
    document.getElementById("gaBtn").style.display = "inline-block";
    document.getElementById("winBtn").style.display = "inline-block";
    const ma = document.getElementById("mobAdminBtn");
    const mg = document.getElementById("mobGaBtn");
    const mw = document.getElementById("mobWinBtn");
    const mk = document.getElementById("mobKadroBtn");
    if (ma) ma.style.display = "block";
    if (mg) mg.style.display = "block";
    if (mw) mw.style.display = "block";
    if (mk) mk.style.display = "block";
}

function hideAdminButtons() {
    document.getElementById("adminBtn").style.display = "none";
    document.getElementById("gaBtn").style.display = "none";
    document.getElementById("winBtn").style.display = "none";
    const ma = document.getElementById("mobAdminBtn");
    const mg = document.getElementById("mobGaBtn");
    const mw = document.getElementById("mobWinBtn");
    const mk = document.getElementById("mobKadroBtn");
    if (ma) ma.style.display = "none";
    if (mg) mg.style.display = "none";
    if (mw) mw.style.display = "none";
    if (mk) mk.style.display = "none";
}

// ==========================================================
// PAGE SYSTEM
// ==========================================================
function hasActiveGroupContext() {
    if (currentGroupId) return true;
    if (window.activeGroup && window.activeGroup.groupId) return true;
    try {
        const raw = sessionStorage.getItem("hsActiveGroup");
        const saved = raw ? JSON.parse(raw) : null;
        return !!(saved && saved.groupId);
    } catch (_) {
        return false;
    }
}

function showGroupRequiredScreen() {
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
    let warn = document.getElementById("groupSelectWarning");
    if (!warn) {
        warn = document.createElement("div");
        warn.id = "groupSelectWarning";
        warn.className = "group-select-warning";
        warn.innerHTML = `
            <div class="group-select-warning-card">
                <div class="group-select-warning-icon">🏟️</div>
                <h2>Grup seçmelisin</h2>
                <p>Oyuncular, kadro ve istatistik sayfaları için önce bir halı saha grubuna giriş yap.</p>
                <button class="btn" onclick="goToDashboard()">Gruplarıma Git</button>
            </div>`;
        document.body.appendChild(warn);
    }
    warn.style.display = "flex";
    const mobileNav = document.getElementById("mobileNav");
    if (mobileNav) mobileNav.style.display = "none";
}

function showPage(id) {
    const restrictedPages = [
        "oyuncular", "haftaninKadro", "kadro", "gecmis", "profilim",
        "formAnalizi", "chemistry", "market", "karsilastirma",
        "attendanceTahmin", "proLigMotoru", "sosyalPro", "pushMerkezi",
        "admin", "gaYonetim", "kazananYonetim"
    ];
    if (restrictedPages.includes(id) && !hasActiveGroupContext()) {
        showGroupRequiredScreen();
        return;
    }
    const warn=document.getElementById("groupSelectWarning"); if(warn) warn.style.display="none";
    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
if (id !== "haftaninKadro" && window._comingListInterval) {
    clearInterval(window._comingListInterval);
    window._comingListInterval = null;
    window._comingListListenerAdded = false;
}
    const analizBox = document.getElementById("takimAnalizBox");
    if (analizBox && id !== "haftaninKadro") {
        analizBox.style.display = "none";
        const analizContent = document.getElementById("analizContent");
        if (analizContent) analizContent.innerHTML = "<span style='color:#aaa; font-style:italic;'>Kadro oluşturulduktan sonra \"Analiz Et\" butonuna tıkla.</span>";
        const analizBtn = document.getElementById("analizBtn");
        if (analizBtn) { analizBtn.disabled = false; analizBtn.textContent = "🤖 Analiz Et"; }
    }

    const page = document.getElementById(id);
    if (!page) {
        console.warn("Sayfa bulunamadı, oyunculara yönlendirildi:", id);
        return showPage("oyuncular");
    }
    page.style.display = "block";
    page.classList.add("active");

    if (typeof window.renderAdvancedPage === "function") {
        try { window.renderAdvancedPage(id); } catch(e) { console.warn("advanced render error:", e); }
    }
    if (typeof window.renderElitePage === "function") {
        try { window.renderElitePage(id); } catch(e) { console.warn("elite render error:", e); }
    }



    if (id === "profilim") loadProfil();
    if (id === "admin") { loadLoginLogs(); loadGuestListForConvert(); loadInviteLink(); }
    if (id === "kazananYonetim") loadWinnerPlayerGrid();
    if (id === "gaYonetim") setupSelects();

    if (id === "kadro") {
        loadKadroPlayerGrid();
        if (window.clearKadroUIPending) {
            clearKadroUI();
            window.clearKadroUIPending = false;
        }
    }

   if (id === "haftaninKadro") {
        (async () => {
            await loadHaftaninKadro();


            if (currentUser) {
                const status = document.getElementById("comingStatus");
                const attSnap = await C("attendance").orderBy("timestamp", "asc").get();
                let index = 1;
                let myOrder = null;
                attSnap.forEach(a => {
                    const data = a.data();
                    if (data.coming) {
                        if (data.user === currentUser) myOrder = index;
                        index++;
                    }
                });
                status.innerText = renderOrderText(myOrder, getMatchLimit());
                status.style.color = (myOrder > getMatchLimit() ? "#ff4d4d" : "#ffffff");
            }
        })();

        // onSnapshot yerine polling — iOS uyumlu
if (!window._comingListListenerAdded) {
    window._comingListListenerAdded = true;

    window._refreshComingList = async function() {
        try {
            if (!currentGroupId) return;
            const attSnap2 = await C("attendance").orderBy("timestamp", "asc").get();
            const listDiv = document.getElementById("comingList");
            if (!listDiv) return;
            let html = "";
            let index = 1;
            attSnap2.forEach(doc => {
                const data = doc.data();
                if (data.coming) {
                    html += `${index}. ${data.user}<br>`;
                    index++;
                }
            });
            listDiv.innerHTML = html;
        } catch(e) { console.warn("comingList refresh error:", e); }
    };

    window._refreshComingList();
    window._comingListInterval = setInterval(window._refreshComingList, 5000);
}

        const saveBtn = document.getElementById("comingSaveBtn");
        if (saveBtn && !saveBtn._eventAdded) {
            saveBtn._eventAdded = true;
            saveBtn.addEventListener("click", async () => {
                const check = document.getElementById("comingCheck");
                const status = document.getElementById("comingStatus");
                if (currentUser) {
                    if (check.checked) {
                        await C("attendance").doc(currentUser).set({
                            user: currentUser,
                            coming: true,
                            timestamp: new Date().toISOString()
                        });
                        const attSnap = await C("attendance").orderBy("timestamp", "asc").get();
                        let index = 1;
                        let myOrder = null;
                        attSnap.forEach(a => {
                            const data = a.data();
                            if (data.coming) {
                                if (data.user === currentUser) myOrder = index;
                                index++;
                            }
                        });
                        status.innerText = renderOrderText(myOrder, getMatchLimit());
                        status.style.color = (myOrder > getMatchLimit() ? "#ff4d4d" : "#ffffff");
                    } else {
                        await C("attendance").doc(currentUser).delete();
                        status.innerText = "";
                    }
                }
                notify("Kaydedildi!");
            });
        }
    }
	const mobileNav = document.getElementById("mobileNav");
if (mobileNav) {
    const hideMobNav = AUTH_PAGES.includes(id) || id === "authPage" || id === "profileSetup" || id === "dashboard";
    mobileNav.style.display = hideMobNav ? "none" : "flex";
}
closeMobileMenus();
    const nav = document.getElementById("navbar");
    if (nav) nav.style.display = AUTH_PAGES.includes(id) ? "none" : "flex";

  if (!AUTH_PAGES.includes(id) && id !== "authPage" && id !== "profileSetup" && id !== "dashboard") {
    const cleanUrl = PAGE_URLS[id] || ("/" + id);
    sessionStorage.setItem("hsPage", id);
    if (location.protocol !== "file:" && window.location.pathname !== cleanUrl) {
        history.pushState({ page: id }, "", cleanUrl);
    } else if (location.protocol === "file:") {
        window.location.hash = id;
    }
}
}

// ==========================================================
// CUSTOM SELECT ENGINE
// ==========================================================
document.addEventListener("click", e => {
    document.querySelectorAll(".custom-options").forEach(opt => {
        if (!opt.parentElement.contains(e.target)) opt.style.display = "none";
    });
});

function buildSingleSelect(wrapper, items) {
    const display = wrapper.querySelector(".custom-display");
    const options = wrapper.querySelector(".custom-options");

    options.innerHTML = "";
    let selected = null;

    items.forEach(name => {
        let div = document.createElement("div");
        div.className = "custom-option";
        div.innerText = name;
        div.onclick = () => {
            selected = name;
            display.innerText = name;
            options.style.display = "none";
        };
        options.appendChild(div);
    });

    display.onclick = () => {
        options.style.display = options.style.display === "block" ? "none" : "block";
    };

    return {
        get value() { return selected; },
        reset() { selected = null; display.innerText = "Seç"; }
    };
}

function initCustomSelects() {
    document.querySelectorAll(".custom-select").forEach(sel => {
        const display = sel.querySelector(".custom-display");
        const options = sel.querySelector(".custom-options");
        if (!display || !options) return;

        display.onclick = () => {
            let isOpen = options.style.display === "block";
            document.querySelectorAll(".custom-options").forEach(o => o.style.display = "none");
            options.style.display = isOpen ? "none" : "block";
        };

        options.querySelectorAll(".option").forEach(opt => {
            opt.onclick = () => {
                display.innerText = opt.innerText;
                sel.dataset.value = opt.dataset.id;
                options.style.display = "none";
                if (sel.id === "gkASelect") selectGKA(opt.dataset.id, opt.innerText);
                if (sel.id === "gkBSelect") selectGKB(opt.dataset.id, opt.innerText);
            };
        });
    });
}

async function setupSelects() {
    const list = CACHE.players.map(d => d.name);

    selects["puanTarget"] = buildSingleSelect(document.querySelector('[data-id="puanTarget"]'), list);
    selects["deleteUser"] = buildSingleSelect(document.querySelector('[data-id="deleteUser"]'), list);
    selects["gaPlayer"] = buildSingleSelect(document.querySelector('[data-id="gaPlayer"]'), list);
    if (typeof adminPopulateTraitPlayerSelect === "function") adminPopulateTraitPlayerSelect();
    
}

function mobileTabToggle(menuId) {
    document.querySelectorAll(".mob-submenu").forEach(m => {
        m.classList.toggle("open", m.id === menuId && !m.classList.contains("open"));
    });
}

function closeMobileMenus() {
    document.querySelectorAll(".mob-submenu").forEach(m => m.classList.remove("open"));
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".mob-tab") && !e.target.closest(".mob-submenu")) {
        closeMobileMenus();
    }
});
window.addEventListener("popstate", (e) => {
    if (e.state && e.state.page) {
        showPage(e.state.page);
    } else {
        const pageId = getPageIdFromUrl();
        if (pageId && !AUTH_PAGES.includes(pageId)) {
            showPage(pageId);
        }
    }
});