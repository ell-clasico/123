(function(){
  function mobile(){ return window.matchMedia && window.matchMedia('(max-width:768px)').matches; }
  function id(x){ return document.getElementById(x); }
  function user(){
    try { if (typeof currentFirebaseUser !== 'undefined' && currentFirebaseUser) return currentFirebaseUser; } catch(e){}
    try { if (window.auth && auth.currentUser) return auth.currentUser; } catch(e){}
    return null;
  }
  function authOpen(){
    const a=id('authPage'), s=id('profileSetup');
    return !!((a && a.classList.contains('active') && a.style.display !== 'none') || (s && s.classList.contains('active') && s.style.display !== 'none'));
  }
  function group(){
    try { if (typeof currentGroupId !== 'undefined' && currentGroupId) return true; } catch(e){}
    try { if (window.activeGroup && window.activeGroup.groupId) return true; } catch(e){}
    try { const raw=sessionStorage.getItem('hsActiveGroup'); if(raw && JSON.parse(raw).groupId) return true; } catch(e){}
    return false;
  }
  function ensureCss(){
    if(id('mps-css')) return;
    const st=document.createElement('style');
    st.id='mps-css';
    st.textContent='@media(max-width:768px){body.mps-active #dashboard{display:block!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;min-height:100dvh!important}body.mps-active #dashboard>:not(#mobileProfileApp){display:none!important}body.mps-active #profilim{display:none!important}body.mps-hide-nav #mobileNav{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}}';
    document.head.appendChild(st);
  }
  function clearOldGroup(){
    if(!mobile()) return;
    try { sessionStorage.removeItem('hsActiveGroup'); localStorage.removeItem('hsActiveGroup'); } catch(e){}
    try { sessionStorage.removeItem('hsPage'); localStorage.removeItem('hsPage'); } catch(e){}
    try { window.activeGroup=null; } catch(e){}
    try { if(typeof currentGroupId !== 'undefined') currentGroupId=null; } catch(e){}
  }
  function activate(){
    ensureCss();
    const show = mobile() && !!user() && !authOpen() && !group();
    document.body.classList.toggle('mps-active', show);
    document.body.classList.toggle('mps-hide-nav', mobile() && (!user() || authOpen() || !group()));
    if(!show) return;
    const dash=id('dashboard');
    if(dash){
      document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
      dash.style.display='block'; dash.classList.add('active');
    }
    const nav=id('navbar'); if(nav) nav.style.display='none';
    const mn=id('mobileNav'); if(mn) mn.style.setProperty('display','none','important');
    if(window.MobileProfileV2){
      if(typeof window.MobileProfileV2.showProfile==='function') window.MobileProfileV2.showProfile();
      if(typeof window.MobileProfileV2.refresh==='function') setTimeout(()=>window.MobileProfileV2.refresh(),150);
    }
  }
  clearOldGroup();
  function boot(){
    ensureCss();
    activate();
    [100,300,700,1400,2400].forEach(t=>setTimeout(activate,t));
    if(window.auth && auth.onAuthStateChanged) auth.onAuthStateChanged(function(u){ if(u) clearOldGroup(); [0,250,700].forEach(t=>setTimeout(activate,t)); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  window.addEventListener('pageshow',()=>setTimeout(activate,0));
  window.addEventListener('resize',()=>setTimeout(activate,0));
})();
