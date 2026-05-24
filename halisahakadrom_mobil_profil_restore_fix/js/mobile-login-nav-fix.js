/* MOBİL LOGIN / PROFİL ROUTE KESİN FIX
   Hedef:
   - Login ekranında alt menü asla görünmez.
   - Mobilde girişten sonra otomatik eski grup/FIFA profil ekranına gidilmez.
   - Giriş sonrası yeni mobil profil/grup akışı açılır.
   - Web tarafına dokunulmaz.
*/
(function(){
  const MOBILE_QUERY = '(max-width: 768px)';
  let lastKey = '';
  let openDashboardPatched = false;

  function isMobile(){
    return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  }

  function byId(id){ return document.getElementById(id); }

  function isVisible(node){
    if (!node) return false;
    const cs = window.getComputedStyle(node);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function loggedIn(){
    try { if (typeof currentFirebaseUser !== 'undefined' && currentFirebaseUser) return true; } catch(_){}
    try { if (window.auth && auth.currentUser) return true; } catch(_){}
    try { if (window.firebase && firebase.auth && firebase.auth().currentUser) return true; } catch(_){}
    return false;
  }

  function activeGroupId(){
    try { if (typeof currentGroupId !== 'undefined' && currentGroupId) return currentGroupId; } catch(_){}
    try { if (window.activeGroup && window.activeGroup.groupId) return window.activeGroup.groupId; } catch(_){}
    try {
      const raw = sessionStorage.getItem('hsActiveGroup');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.groupId) return parsed.groupId;
      }
    } catch(_){}
    return '';
  }

  function onAuthScreen(){
    return isVisible(byId('authPage')) || isVisible(byId('profileSetup'));
  }

  function clearMobileAutoGroupOnce(){
    if (!isMobile()) return;
    // Mobilde kullanıcı her girişte önce profil/grup seçimi akışına gelsin.
    // Eski hsActiveGroup kalırsa main.js otomatik enterGroup çalıştırıp eski FIFA profilini açıyordu.
    try { sessionStorage.removeItem('hsActiveGroup'); } catch(_){}
    try { localStorage.removeItem('hsActiveGroup'); } catch(_){}
    try { sessionStorage.removeItem('hsPage'); } catch(_){}
    try { localStorage.removeItem('hsPage'); } catch(_){}
    try { window.activeGroup = null; } catch(_){}
    try { if (typeof currentGroupId !== 'undefined') currentGroupId = null; } catch(_){}
  }

  // Script defer ile DOMContentLoaded'dan önce çalıştığı için main.js auth handler'ından önce eski grup temizlenir.
  clearMobileAutoGroupOnce();

  function shouldHideNav(){
    if (!isMobile()) return false;
    if (onAuthScreen()) return true;
    if (!loggedIn()) return true;
    if (!activeGroupId()) return true;
    return false;
  }

  function applyNav(){
    const nav = byId('mobileNav');
    const hide = shouldHideNav();
    const key = (hide ? '1' : '0') + '|' + (activeGroupId() || '') + '|' + (loggedIn() ? '1' : '0') + '|' + (onAuthScreen() ? '1' : '0');
    if (key === lastKey) return;
    lastKey = key;

    document.documentElement.classList.toggle('hs-mobile-nav-hidden', hide);
    document.body.classList.toggle('hs-mobile-nav-hidden', hide);
    document.body.classList.toggle('hs-mobile-has-group', !hide);

    if (!nav) return;
    if (hide) {
      nav.style.setProperty('display', 'none', 'important');
      nav.style.setProperty('visibility', 'hidden', 'important');
      nav.style.setProperty('pointer-events', 'none', 'important');
      nav.setAttribute('aria-hidden', 'true');
    } else {
      nav.style.setProperty('display', 'grid', 'important');
      nav.style.removeProperty('visibility');
      nav.style.removeProperty('pointer-events');
      nav.setAttribute('aria-hidden', 'false');
    }
  }

  function forceMobileProfileHome(){
    if (!isMobile()) return;
    if (!loggedIn()) return;
    if (onAuthScreen()) return;
    if (activeGroupId()) return;

    const dash = byId('dashboard');
    if (!dash) return;

    // Dashboard aktif değilse aktif hale getir; bu sadece mobilde ve grup seçili değilken yapılır.
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    dash.style.display = 'block';
    dash.classList.add('active');

    const navbar = byId('navbar');
    if (navbar) navbar.style.display = 'none';

    document.body.classList.add('mobile-profile-v2-active', 'mobile-dashboard-profile');
    document.body.classList.remove('mobile-profilim-profile');

    if (window.MobileProfileV2 && typeof window.MobileProfileV2.showProfile === 'function') {
      window.MobileProfileV2.showProfile();
    }

    applyNav();
  }

  function patchOpenDashboard(){
    if (openDashboardPatched || typeof window.openDashboard !== 'function') return;
    openDashboardPatched = true;
    const originalOpenDashboard = window.openDashboard;
    window.openDashboard = async function(){
      const result = await originalOpenDashboard.apply(this, arguments);
      if (isMobile()) {
        setTimeout(forceMobileProfileHome, 0);
        setTimeout(forceMobileProfileHome, 250);
      }
      return result;
    };
  }

  function patchEnterGroup(){
    if (window.__mobileEnterGroupNavPatch || typeof window.enterGroup !== 'function') return;
    window.__mobileEnterGroupNavPatch = true;
    const originalEnterGroup = window.enterGroup;
    window.enterGroup = async function(){
      const result = await originalEnterGroup.apply(this, arguments);
      if (isMobile()) {
        document.body.classList.remove('mobile-profile-v2-active', 'mobile-dashboard-profile', 'mobile-profilim-profile');
        lastKey = '';
        applyNav();
      }
      return result;
    };
  }

  function installCss(){
    if (document.getElementById('mobile-auth-profile-final-css')) return;
    const style = document.createElement('style');
    style.id = 'mobile-auth-profile-final-css';
    style.textContent = `
      @media (max-width: 768px){
        html.hs-mobile-nav-hidden #mobileNav,
        body.hs-mobile-nav-hidden #mobileNav,
        #mobileNav.hs-nav-hidden,
        #authPage.active ~ #mobileNav,
        #profileSetup.active ~ #mobileNav{
          display:none !important;
          visibility:hidden !important;
          opacity:0 !important;
          pointer-events:none !important;
        }

        body.mobile-dashboard-profile #dashboard{
          display:block !important;
          width:100% !important;
          max-width:100% !important;
          margin:0 !important;
          padding:0 !important;
          border:0 !important;
          background:transparent !important;
          box-shadow:none !important;
          min-height:100dvh !important;
          overflow-x:hidden !important;
        }

        body.mobile-dashboard-profile #dashboard > :not(#mobileProfileApp){
          display:none !important;
        }

        body.mobile-dashboard-profile #mobileProfileApp{
          display:block !important;
          width:100% !important;
          min-height:100dvh !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function scheduleAll(){
    setTimeout(() => {
      patchOpenDashboard();
      patchEnterGroup();
      applyNav();
      forceMobileProfileHome();
    }, 0);
  }

  window.__fixMobileAuthNav = scheduleAll;
  window.__forceMobileProfileHome = forceMobileProfileHome;

  document.addEventListener('DOMContentLoaded', function(){
    installCss();
    patchOpenDashboard();
    patchEnterGroup();
    applyNav();

    // Başlangıç ve auth sonrası kısa, sınırlı kontroller. Sonsuz interval/observer yok.
    [80, 250, 600, 1200, 2200].forEach(ms => setTimeout(() => {
      patchOpenDashboard();
      patchEnterGroup();
      applyNav();
      forceMobileProfileHome();
    }, ms));

    if (window.auth && auth.onAuthStateChanged) {
      auth.onAuthStateChanged(function(user){
        lastKey = '';
        if (user && isMobile()) clearMobileAutoGroupOnce();
        [0, 200, 700, 1400].forEach(ms => setTimeout(() => {
          applyNav();
          forceMobileProfileHome();
        }, ms));
      });
    }
  });

  window.addEventListener('resize', scheduleAll, { passive:true });
  window.addEventListener('pageshow', scheduleAll, { passive:true });
})();
