(function(){
  const MOBILE_MAX = 768;
  const POSITIONS = ["Santrafor","Merkez Orta","Sol Kanat","Sağ Kanat","Sol Bek","Stoper","Sağ Bek","Kaleci"];
  const DEFAULT = "./img/profil.png";

  let state = {
    view:"profile",
    tab:"genel",
    groupTab:"list",
    user:null,
    player:null,
    groups:[],
    mainPos:"",
    subPos:"",
    loading:false,
    groupsLoaded:false
  };

  function isMobile(){ return window.matchMedia(`(max-width:${MOBILE_MAX}px)`).matches; }
  function el(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function app(){ return el("mobileProfileApp"); }

  function authUser(){
    try {
      if (typeof currentFirebaseUser !== "undefined" && currentFirebaseUser) return currentFirebaseUser;
    } catch (_) {}
    try {
      if (window.auth && auth.currentUser) return auth.currentUser;
    } catch (_) {}
    try {
      if (window.firebase && firebase.auth && firebase.auth().currentUser) return firebase.auth().currentUser;
    } catch (_) {}
    return null;
  }

  function displayName(){
    const u = authUser();
    try {
      if (typeof currentDisplayName !== "undefined" && currentDisplayName) return currentDisplayName;
    } catch (_) {}
    return state.user?.displayName || state.player?.name || u?.displayName || u?.email?.split("@")[0] || "Oyuncu";
  }

  function mobileProfileHost(){
    const profil = el("profilim");
    const dash = el("dashboard");
    if (profil && profil.classList.contains("active") && profil.style.display !== "none") return profil;
    if (dash && dash.classList.contains("active") && dash.style.display !== "none") return dash;
    return profil || dash || document.body;
  }

  function ensureApp(){
    const host = mobileProfileHost();
    if (!host) return null;
    let box = app();
    if (!box){
      box = document.createElement("div");
      box.id = "mobileProfileApp";
      box.style.display = "none";
    }
    if (box.parentElement !== host) {
      host.insertBefore(box, host.firstChild);
    }
    return box;
  }

  function syncVisibility(){
    const dash = el("dashboard");
    const profil = el("profilim");
    const box = ensureApp();
    const authPage = el("authPage");
    const setupPage = el("profileSetup");
    const authVisible = (authPage && authPage.style.display !== "none" && authPage.classList.contains("active")) ||
                        (setupPage && setupPage.style.display !== "none" && setupPage.classList.contains("active"));

    const profilActive = !!(profil && profil.style.display !== "none" && profil.classList.contains("active"));
    const dashboardActive = !!(dash && dash.style.display !== "none" && dash.classList.contains("active"));
    const hasGroup = (() => {
      try { if (typeof currentGroupId !== "undefined" && currentGroupId) return true; } catch(_){}
      try { if (window.activeGroup && window.activeGroup.groupId) return true; } catch(_){}
      try {
        const raw = sessionStorage.getItem("hsActiveGroup") || localStorage.getItem("hsActiveGroup");
        if (raw && JSON.parse(raw)?.groupId) return true;
      } catch(_){}
      return false;
    })();

    // Mobil profil tasarımı şu iki durumda açılır:
    // 1) Kullanıcı Profilim sayfasındaysa
    // 2) Giriş sonrası grup seçimi/dash akışındaysa ve henüz aktif grup yoksa
    const active = !!(isMobile() && authUser() && !authVisible && ((profilActive) || (dashboardActive && !hasGroup)));

    document.body.classList.toggle("mobile-profile-v2-active", !!active);
    document.body.classList.toggle("mobile-dashboard-profile", !!active && dashboardActive && !profilActive);
    document.body.classList.toggle("mobile-profilim-profile", !!active && profilActive);

    if (box) box.style.display = active ? "block" : "none";
    if (active) setTimeout(render, 0);
  }

  async function loadUser(){
    const u = authUser();
    if (!u || !window.db) return null;

    try{
      const doc = await db.collection("users").doc(u.uid).get();
      const userData = doc.exists ? doc.data() : {};
      state.user = userData || {};

      if (!state.groupsLoaded) await loadGroups();

      let playerData = await findOwnPlayerData(u, state.groups);
      state.player = playerData || null;

      const merged = Object.assign({}, state.user || {}, playerData || {});
      state.mainPos = merged.mainPos || merged.primaryPos || merged.position1 || "";
      state.subPos = merged.subPos || merged.secondaryPos || merged.position2 || "";
      state.user = Object.assign({}, state.user || {}, {
        mainPos: state.mainPos,
        subPos: state.subPos,
        selfStats: merged.selfStats || merged.stats || state.user?.selfStats || {},
        displayStats: merged.displayStats || merged.stats || state.user?.displayStats || {},
        photo: merged.photo || state.user?.photo || DEFAULT,
        number: merged.number || merged.formaNo || state.user?.number || state.user?.formaNo || ""
      });
      return state.user;
    }catch(e){
      console.warn("mobile profile user", e);
      return null;
    }
  }

  async function findOwnPlayerData(u, groups){
    const names = new Set();
    names.add(displayName());
    if (u.email) names.add(u.email.split("@")[0]);

    (groups || []).forEach(g => {
      const md = g.memberData || {};
      if (md.username) names.add(md.username);
      if (md.displayName) names.add(md.displayName);
      if (md.name) names.add(md.name);
    });

    for (const g of (groups || [])){
      const gid = g.groupId;
      const md = g.memberData || {};
      const candidates = [u.uid, md.username, md.displayName, displayName()].filter(Boolean);

      for (const id of candidates){
        try{
          const pd = await db.collection("groups").doc(gid).collection("players").doc(id).get();
          if (pd.exists) return { id: pd.id, groupId: gid, ...pd.data() };
        }catch(_){}
      }

      for (const n of names){
        try{
          const qs = await db.collection("groups").doc(gid).collection("players").where("name","==",n).limit(1).get();
          if (!qs.empty) return { id: qs.docs[0].id, groupId: gid, ...qs.docs[0].data() };
        }catch(_){}
      }
    }

    return null;
  }

  async function loadGroups(){
    const u = authUser();
    if (!u || !window.db) return [];

    try{
      const uid = u.uid;
      const groupsMap = new Map();

      const membersSnap = await db.collectionGroup("members").where("uid","==",uid).get();
      membersSnap.docs.forEach(m => {
        const groupId = m.ref.parent.parent.id;
        groupsMap.set(groupId, { groupId, memberData: m.data() });
      });

      // Eski kayıtlarda uid yoksa e-posta ile de yakala.
      if (u.email){
        try {
          const emailSnap = await db.collectionGroup("members").where("email","==",u.email).get();
          emailSnap.docs.forEach(m => {
            const groupId = m.ref.parent.parent.id;
            groupsMap.set(groupId, { groupId, memberData: Object.assign({}, m.data(), { uid }) });
            // Sessiz migration: bundan sonra hızlı çalışsın.
            m.ref.set({ uid }, { merge:true }).catch(()=>{});
          });
        } catch (_) {}
      }

      // users/{uid}.groups alanı varsa fallback olarak kullan.
      try {
        const userDoc = await db.collection("users").doc(uid).get();
        const userGroups = userDoc.exists && Array.isArray(userDoc.data().groups) ? userDoc.data().groups : [];
        userGroups.forEach(groupId => {
          if (!groupsMap.has(groupId)) groupsMap.set(groupId, { groupId, memberData:{ uid, username:displayName(), displayName:displayName(), role:"member" } });
        });
      } catch (_) {}

      const list = await Promise.all(Array.from(groupsMap.values()).map(async item => {
        try {
          const gd = await db.collection("groups").doc(item.groupId).get();
          if (!gd.exists) return null;
          return { groupId:item.groupId, groupData:gd.data(), memberData:item.memberData || {} };
        } catch (_) {
          return null;
        }
      }));

      state.groups = list.filter(Boolean);
      state.groupsLoaded = true;
      return state.groups;
    }catch(e){
      console.warn("mobile profile groups", e);
      state.groups = [];
      state.groupsLoaded = true;
      return [];
    }
  }

  function title(){
    if (state.view === "groups") return state.groupTab === "list" ? "Gruplarım" : state.groupTab === "join" ? "Grup Katıl" : "Grup Oluştur";
    if (state.view === "photo") return "Fotoğraf Değiştir";
    return "Profil";
  }

  function back(){
    if (state.view === "profile") return "";
    return `<button class="mp-icon-btn" onclick="MobileProfileV2.showProfile()">‹</button>`;
  }

  function shell(content){
    const box = ensureApp();
    if (!box) return;
    box.innerHTML = `<div class="mp-shell">
      <div class="mp-top">${back() || `<span></span>`}<div class="mp-title">${title()}</div><button class="mp-icon-btn" onclick="MobileProfileV2.showProfile()">⚙</button></div>
      ${content}
    </div>`;
  }

  function render(){
    if (!isMobile()) return;
    ensureApp();

    const u = authUser();
    if (!u){
      shell(`<div class="mp-card"><div class="mp-empty">Profilini görmek için giriş yapmalısın.</div></div>`);
      return;
    }

    if (!state.user && !state.loading){
      state.loading = true;
      shell(`<div class="mp-card"><div class="mp-empty">Profil bilgilerin yükleniyor...</div></div>`);
      loadUser().then(()=>{ state.loading=false; render(); }).catch(()=>{ state.loading=false; render(); });
      return;
    }

    if (state.view === "groups") renderGroups();
    else if (state.view === "photo") renderPhoto();
    else renderProfile();
  }

  function stats(){
    const s = state.user?.displayStats || state.user?.selfStats || state.player?.stats || {};
    return s || {};
  }

  function profileContent(){
    if (state.tab === "genel"){
      return `<div class="mp-panel">
        <div class="mp-row"><span>Yaş</span><b>${esc(state.user?.age || state.user?.yas || "-")}</b></div>
        <div class="mp-row"><span>Boy</span><b>${esc(state.user?.height || state.user?.boy || "-")}</b></div>
        <div class="mp-row"><span>Kilo</span><b>${esc(state.user?.weight || state.user?.kilo || "-")}</b></div>
        <div class="mp-row"><span>Ayak</span><b>${esc(state.user?.foot || state.user?.ayak || "-")}</b></div>
        <div class="mp-row"><span>Piyasa Değeri</span><b>${marketText()}</b></div>
        <div class="mp-row"><span>Form Durumu</span><b>${formText()}</b></div>
        <div class="mp-row"><span>Sözleşme</span><b>-</b></div>
      </div>`;
    }

    if (state.tab === "mevki"){
      return `<div class="mp-panel">
        <div class="mp-row"><span>Asıl Mevki</span><b>${esc(state.mainPos || "Seçilmedi")}</b></div>
        <div class="mp-row"><span>Yedek Mevki</span><b>${esc(state.subPos || "Seçilmedi")}</b></div>
        <div class="mp-pos-grid">${POSITIONS.map(p => `<button class="mp-pos-btn ${state.mainPos===p?'main':state.subPos===p?'sub':''}" onclick="MobileProfileV2.pickPos('${esc(p)}')">${esc(p)}</button>`).join("")}</div>
        <button class="mp-action mp-green" onclick="MobileProfileV2.savePositions()">Mevkileri Kaydet</button>
      </div>`;
    }

    return `<div class="mp-panel">
      <div class="mp-stat-grid">
        ${statBox("HIZ","hiz")}${statBox("ŞUT","sut")}${statBox("PAS","pas")}${statBox("KON","kondisyon")}${statBox("DEF","defans")}${statBox("FİZ","fizik")}
      </div>
      <div class="mp-empty">Profil analizin burada özetlenecek.<br>Mevki, stats ve maç verileri arttıkça daha net sonuç oluşur.</div>
    </div>`;
  }

  function statBox(label,key){
    const s = stats();
    return `<div class="mp-stat"><b>${Number(s[key] || 0)}</b><span>${label}</span></div>`;
  }

  function ovr(){
    try{
      const s = stats();
      if (typeof getOVR_withBonus === "function") return getOVR_withBonus({mainPos:state.mainPos,stats:s});
      const vals = ["hiz","sut","pas","kondisyon","defans","fizik"].map(k=>Number(s[k]||0));
      const filled = vals.filter(Boolean);
      return Math.round(vals.reduce((a,b)=>a+b,0) / Math.max(filled.length,1));
    }catch(e){ return 0; }
  }

  function marketText(){
    try {
      if (typeof calculateMarketValue === "function"){
        return "₺ " + Number(calculateMarketValue({stats:stats(), mainPos:state.mainPos, name:displayName()})||0).toLocaleString("tr-TR");
      }
      if (typeof calculatePlayerMarketValue === "function"){
        return "₺ " + Number(calculatePlayerMarketValue({stats:stats(), mainPos:state.mainPos, name:displayName()})||0).toLocaleString("tr-TR");
      }
    } catch(e){}
    return "-";
  }

  function formText(){
    return state.user?.formStatus || state.user?.form || state.player?.formStatus || state.player?.form || "-";
  }

  function renderProfile(){
    state.view = state.view === "groups" || state.view === "photo" ? state.view : "profile";
    if (state.view !== "profile") return render();

    const photo = state.user?.photo || state.player?.photo || DEFAULT;
    const pos = [state.mainPos, state.subPos].filter(Boolean).join(" / ") || "Mevki seçilmedi";

    shell(`<div class="mp-card mp-hero">
      <div class="mp-photo-wrap" onclick="MobileProfileV2.showPhoto()"><img class="mp-photo" src="${esc(photo)}"><span class="mp-camera">📷</span></div>
      <div class="mp-ovr"><span>${ovr()}</span><small>STATS</small></div>
      <div class="mp-name">${esc(displayName())}</div>
      <div class="mp-number">#${esc((state.user?.number || state.user?.formaNo || state.player?.number || state.player?.formaNo || "" ) || "--")}</div>
      <div class="mp-pos">${esc(pos)}</div>
    </div>

    <div class="mp-card">
      <div class="mp-tabs">
        ${tabBtn("genel","GENEL")}${tabBtn("mevki","MEVKİ SEÇİMİ")}${tabBtn("analiz","PROFİL ANALİZİ")}
      </div>
      ${profileContent()}
    </div>

    <button class="mp-action" onclick="MobileProfileV2.showGroups('list')"><span>Gruplarım</span><b>›</b></button>
    <button class="mp-action mp-logout" onclick="logoutUser()">Çıkış Yap</button>
    <input id="mobileProfilePhotoInput" type="file" accept="image/*" hidden onchange="MobileProfileV2.uploadPhoto(this)">`);
  }

  function tabBtn(id,label){
    return `<button class="mp-tab ${state.tab===id?'active':''}" onclick="MobileProfileV2.setTab('${id}')">${label}</button>`;
  }

  function renderGroups(){
    const inner = state.groupTab === "join" ? joinHtml() : state.groupTab === "create" ? createHtml() : listHtml();
    shell(`<div class="mp-card"><div class="mp-seg">
      <button class="${state.groupTab==='list'?'active':''}" onclick="MobileProfileV2.showGroups('list')">Gruplarım</button>
      <button class="${state.groupTab==='join'?'active':''}" onclick="MobileProfileV2.showGroups('join')">Grup Katıl</button>
      <button class="${state.groupTab==='create'?'active':''}" onclick="MobileProfileV2.showGroups('create')">Grup Oluştur</button>
    </div>${inner}</div>
    <button class="mp-action" onclick="MobileProfileV2.showProfile()"><span>Profil Analizim</span><b>›</b></button>
    <button class="mp-action mp-logout" onclick="logoutUser()">Çıkış Yap</button>`);
  }

  function listHtml(){
    if (!state.groupsLoaded) return `<div class="mp-empty">Gruplar yükleniyor...</div>`;
    if (!state.groups.length) return `<div class="mp-empty">Henüz bir gruba üye değilsin.<br>Grup Katıl veya Grup Oluştur ile başlayabilirsin.</div>`;
    return `<div class="mp-group-list">${state.groups.map(g=>`<div class="mp-group" onclick="MobileProfileV2.enter('${g.groupId}')"><div class="mp-group-ico">🏟️</div><div><div class="mp-group-name">${esc(g.groupData.name||'Halı Saha')}</div><div class="mp-group-role">${g.memberData.role==='admin'?'Yönetici':'Üye'}</div></div><div class="mp-pill">Gir ›</div></div>`).join("")}</div>`;
  }

  function joinHtml(){
    return `<div class="mp-empty" style="min-height:70px">Grup adı veya kodu yazıp arayabilirsin.</div><input id="mpSearch" class="mp-input" placeholder="Grup adı veya kodu"><button class="mp-action mp-green" onclick="MobileProfileV2.searchGroups()">Ara</button><div id="mpResults" class="mp-group-list" style="margin-top:12px"></div>`;
  }

  function createHtml(){
    return `<div class="mp-empty" style="min-height:70px">Kendi halı saha grubunu oluştur.</div><input id="mpCreateName" class="mp-input" placeholder="Grup adı"><button class="mp-action mp-green" onclick="MobileProfileV2.createGroup()">Oluştur</button>`;
  }

  function renderPhoto(){
    const photo = state.user?.photo || state.player?.photo || DEFAULT;
    shell(`<div class="mp-card mp-hero" style="padding-top:34px"><img class="mp-photo" style="width:150px;height:150px" src="${esc(photo)}"></div>
      <button class="mp-action" onclick="document.getElementById('mobileProfilePhotoInput').click()"><span>Galeriden Seç</span><b>›</b></button>
      <button class="mp-action" onclick="document.getElementById('mobileProfilePhotoInput').click()"><span>Fotoğraf Çek</span><b>›</b></button>
      <button class="mp-action mp-logout" onclick="MobileProfileV2.removePhoto()">Fotoğrafı Kaldır</button>
      <input id="mobileProfilePhotoInput" type="file" accept="image/*" hidden onchange="MobileProfileV2.uploadPhoto(this)">`);
  }

  async function savePlayerProfileToGroups(patch){
    const u = authUser();
    if (!u) return;
    if (!state.groupsLoaded) await loadGroups();

    const names = new Set([displayName(), state.player?.name, state.player?.id].filter(Boolean));
    const writes = [];
    for (const g of state.groups){
      const gid = g.groupId;
      const md = g.memberData || {};
      const candidates = [u.uid, md.username, md.displayName, displayName(), state.player?.id].filter(Boolean);
      let saved = false;

      for (const id of candidates){
        try{
          const ref = db.collection("groups").doc(gid).collection("players").doc(id);
          const doc = await ref.get();
          if (doc.exists){
            writes.push(ref.set(patch, { merge:true }));
            saved = true;
            break;
          }
        }catch(_){}
      }

      if (!saved){
        for (const n of names){
          try{
            const qs = await db.collection("groups").doc(gid).collection("players").where("name","==",n).limit(1).get();
            if (!qs.empty){
              writes.push(qs.docs[0].ref.set(patch, { merge:true }));
              saved = true;
              break;
            }
          }catch(_){}
        }
      }
    }

    await Promise.allSettled(writes);
  }

  window.MobileProfileV2 = {
    async refresh(){
      state.user = null;
      state.player = null;
      state.groupsLoaded = false;
      state.groups = [];
      await loadUser();
      render();
    },
    showProfile(){ state.view="profile"; state.tab = state.tab || "genel"; render(); },
    setTab(t){ state.view="profile"; state.tab=t; renderProfile(); },
    showGroups(tab="list"){
      state.view="groups";
      state.groupTab = tab === "menu" ? "list" : tab;
      if (!state.groupsLoaded){
        loadGroups().then(renderGroups);
        renderGroups();
      } else {
        renderGroups();
      }
    },
    showPhoto(){ state.view="photo"; renderPhoto(); },
    pickPos(p){
      if (state.mainPos === p) state.mainPos = "";
      else if (state.subPos === p) state.subPos = "";
      else if (!state.mainPos) state.mainPos = p;
      else if (!state.subPos) state.subPos = p;
      else { state.subPos = p; }
      renderProfile();
    },
    async savePositions(){
      if (!state.mainPos) return notify ? notify("Ana mevki seç!") : alert("Ana mevki seç!");
      const u = authUser();
      if (!u) return;

      const patch = { mainPos:state.mainPos, subPos:state.subPos };
      await db.collection("users").doc(u.uid).set(patch, { merge:true });
      await savePlayerProfileToGroups(patch);

      const dm = el("dashMainPos"), ds = el("dashSubPos");
      if (dm) dm.value = state.mainPos;
      if (ds) ds.value = state.subPos;

      notify ? notify("Mevkiler kaydedildi") : alert("Kaydedildi");
      await loadUser();
      renderProfile();
    },
    async uploadPhoto(input){
      const file = input.files && input.files[0];
      if (!file) return;
      try{
        let url = null;
        if (typeof uploadImageToStorage === "function") {
          url = await uploadImageToStorage(file, "profile_photos");
        } else {
          const u = authUser();
          const ref = storage.ref(`profile_photos/${u.uid}_${Date.now()}_${file.name}`);
          await ref.put(file);
          url = await ref.getDownloadURL();
        }

        const u = authUser();
        if (!u) return;
        await db.collection("users").doc(u.uid).set({ photo:url }, { merge:true });
        await savePlayerProfileToGroups({ photo:url });

        const dashImg = el("dashProfilePhoto");
        if (dashImg) dashImg.src = url;

        state.user = Object.assign({}, state.user, { photo:url });
        state.player = Object.assign({}, state.player || {}, { photo:url });
        notify ? notify("Fotoğraf güncellendi") : null;
        renderPhoto();
      }catch(e){
        console.warn(e);
        alert("Fotoğraf yüklenemedi.");
      }
    },
    async removePhoto(){
      const u = authUser();
      if (!u) return;
      await db.collection("users").doc(u.uid).set({ photo: firebase.firestore.FieldValue.delete() }, { merge:true });
      await savePlayerProfileToGroups({ photo: firebase.firestore.FieldValue.delete() });
      state.user = Object.assign({}, state.user, { photo:DEFAULT });
      state.player = Object.assign({}, state.player || {}, { photo:DEFAULT });
      renderPhoto();
    },
    enter(groupId){
      const g = state.groups.find(x=>x.groupId===groupId);
      if (g && typeof enterGroup === "function") enterGroup(g.groupId,g.groupData,g.memberData);
    },
    async searchGroups(){
      const input = el("mpSearch");
      const res = el("mpResults");
      if (!input || !res) return;

      const q = input.value.trim().toLowerCase();
      if (!q) return;

      res.innerHTML = `<div class="mp-empty" style="min-height:60px">Aranıyor...</div>`;
      try {
        if (typeof initSearchCache === "function") await initSearchCache();
        const all = typeof _allGroups !== "undefined" ? (_allGroups || []) : [];
        const mine = typeof _myGroupIds !== "undefined" ? _myGroupIds : new Set();
        const pending = typeof _myPendingIds !== "undefined" ? _myPendingIds : new Set();

        const matches = all.filter(g =>
          (g.name||"").toLowerCase().includes(q) ||
          (g.code||"").toLowerCase().includes(q)
        ).slice(0,12);

        res.innerHTML = matches.length ? matches.map(g=>`<div class="mp-group"><div class="mp-group-ico">🏟️</div><div><div class="mp-group-name">${esc(g.name||'Halı Saha')}</div><div class="mp-group-role">Kod: ${esc(g.code||'-')}</div></div><button class="mp-icon-btn" ${mine.has(g.id)||pending.has(g.id)?'disabled':''} onclick="sendJoinRequest('${g.id}','${esc(g.name||'')}',this)">${mine.has(g.id)?'✓':pending.has(g.id)?'⏳':'+'}</button></div>`).join("") : `<div class="mp-empty" style="min-height:60px">Sonuç bulunamadı.</div>`;
      } catch(e) {
        console.warn(e);
        res.innerHTML = `<div class="mp-empty" style="min-height:60px">Arama yapılamadı.</div>`;
      }
    },
    async createGroup(){
      const name = (el("mpCreateName")?.value || "").trim();
      if (!name) return alert("Grup adı yaz!");

      const original = el("newGroupName");
      if (original) original.value = name;

      if (typeof createGroup === "function") {
        await createGroup();
        state.groupsLoaded = false;
        await loadGroups();
        renderGroups();
      }
    }
  };

  // Bu dosya artık ana login/openDashboard akışlarını sarmalamaz.
  // Böylece mobilde giriş yaparken donma veya sonsuz tetiklenme oluşmaz.
  function resetAndSync(){
    state.user = null;
    state.player = null;
    state.groups = [];
    state.groupsLoaded = false;
    setTimeout(syncVisibility, 0);
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureApp();
    setTimeout(syncVisibility, 300);
    setTimeout(syncVisibility, 1200);

    if (window.auth && auth.onAuthStateChanged) {
      auth.onAuthStateChanged(() => {
        resetAndSync();
      });
    }
  });

  window.addEventListener("resize", () => setTimeout(syncVisibility, 0), { passive:true });
  window.addEventListener("pageshow", () => setTimeout(syncVisibility, 0), { passive:true });

  // Sayfa geçişlerinden sonra mobil profil görünürlüğünü güncelle.
  setInterval(() => {
    if (isMobile()) syncVisibility();
  }, 800);

})();
