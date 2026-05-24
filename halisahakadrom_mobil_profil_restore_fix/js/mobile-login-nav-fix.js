/* MOBİL LOGIN/NAV SAFE FIX v5
   Kesin hedef:
   - Login/register/profil kurulum ekranında mobil alt menü görünmez.
   - Grup seçilmeden mobil alt menü görünmez.
   - Hiçbir ana fonksiyonu wrap etmez, MutationObserver kullanmaz.
   - Login akışını bloklamaz/dondurmaz.
*/
(function(){
  const MOBILE_QUERY = '(max-width: 768px)';
  let lastKey = '';

  function isMobile(){
    return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  }

  function byId(id){ return document.getElementById(id); }

  function isVisible(el){
    if (!el) return false;
    const cs = window.getComputedStyle(el);
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
      const raw = sessionStorage.getItem('hsActiveGroup') || sessionStorage.getItem('hsSession');
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

  function shouldHideNav(){
    if (!isMobile()) return true;
    if (onAuthScreen()) return true;
    if (!loggedIn()) return true;
    if (!activeGroupId()) return true;
    return false;
  }

  function apply(){
    const nav = byId('mobileNav');
    if (!nav) return;

    const hide = shouldHideNav();
    const key = (hide?'1':'0') + '|' + (activeGroupId() || '') + '|' + (loggedIn()?'1':'0') + '|' + (onAuthScreen()?'1':'0');
    if (key === lastKey) return;
    lastKey = key;

    document.documentElement.classList.toggle('hs-mobile-nav-hidden', hide);
    document.body.classList.toggle('hs-mobile-nav-hidden', hide);
    document.body.classList.toggle('hs-mobile-has-group', !hide);

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

  function installCss(){
    if (document.getElementById('mobile-auth-nav-safe-css')) return;
    const style = document.createElement('style');
    style.id = 'mobile-auth-nav-safe-css';
    style.textContent = `
      @media (max-width: 768px){
        html.hs-mobile-nav-hidden #mobileNav,
        body.hs-mobile-nav-hidden #mobileNav,
        #authPage.active ~ #mobileNav,
        #profileSetup.active ~ #mobileNav{
          display:none !important;
          visibility:hidden !important;
          pointer-events:none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function schedule(){
    // Ana akışları bekletmemek için senkron ağır iş yok.
    setTimeout(apply, 0);
  }

  window.__fixMobileAuthNav = schedule;

  document.addEventListener('DOMContentLoaded', function(){
    installCss();
    apply();
    setTimeout(apply, 100);
    setTimeout(apply, 500);
    setTimeout(apply, 1500);

    if (window.auth && auth.onAuthStateChanged) {
      auth.onAuthStateChanged(function(){
        lastKey = '';
        setTimeout(apply, 0);
        setTimeout(apply, 300);
        setTimeout(apply, 1000);
      });
    }

    // Kısa süreli hafif kontrol: login/grup geçişlerinde diğer kodlar style değiştirirse geri kapatır.
    let ticks = 0;
    const timer = setInterval(function(){
      apply();
      ticks += 1;
      if (ticks > 40) clearInterval(timer);
    }, 250);
  });

  window.addEventListener('resize', schedule, { passive:true });
  window.addEventListener('pageshow', schedule, { passive:true });
})();
