document.getElementById('year').textContent=new Date().getFullYear();
const io=new IntersectionObserver((es)=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('vis');io.unobserve(e.target)}}),{threshold:.15});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{
  const t=document.querySelector(a.getAttribute('href'));if(!t)return;
  e.preventDefault();
  // If the click came from the mobile overlay, close it first. setMenu(false)
  // unpins the body and restores scroll, so the rect/scrollY math below is then
  // measured against the real (un-pinned) layout instead of the fixed overlay.
  if(a.closest('.mobile-nav'))setMenu(false);
  window.scrollTo({top:t.getBoundingClientRect().top+scrollY-80,behavior:'smooth'});
}));

const rootEl=document.documentElement;
const burger=document.querySelector('.nav-hamburger'),mob=document.querySelector('.mobile-menu'),themeMeta=document.querySelector('meta[name="theme-color"]');
const cssVar=name=>getComputedStyle(rootEl).getPropertyValue(name).trim();
// iOS Safari tints the status/address bars with theme-color, and overrides it
// with the <html> background colour. Both follow the active theme (read from the
// --theme-color tokens); while the mobile menu is open they switch to the menu
// scrim tone so those bars match the overlay. Re-run on theme switch (below) too.
function syncBars(menuOpen){
  const c=cssVar(menuOpen?'--theme-color-menu':'--theme-color');
  if(themeMeta)themeMeta.setAttribute('content',c);
  rootEl.style.background=menuOpen?c:'';
}
let lockedScrollY=0;
function setMenu(open){
  burger.classList.toggle('is-open',open);burger.setAttribute('aria-expanded',open);
  mob.classList.toggle('is-open',open);mob.setAttribute('aria-hidden',!open);
  syncBars(open);
  const b=document.body;
  if(open){
    // iOS-safe scroll lock: pin the body instead of setting overflow:hidden on
    // <html>, which on iOS Safari breaks position:fixed rendering (the overlay
    // would no longer cover the full viewport).
    lockedScrollY=window.scrollY;
    b.style.position='fixed';b.style.top=-lockedScrollY+'px';b.style.left='0';b.style.right='0';b.style.width='100%';
  }else{
    b.style.position='';b.style.top='';b.style.left='';b.style.right='';b.style.width='';
    window.scrollTo(0,lockedScrollY);
  }
}
burger.addEventListener('click',()=>setMenu(!burger.classList.contains('is-open')));

// Theme switch: cycles Auto -> Light -> Dark on each click. 'Auto' (no
// data-theme attribute) follows prefers-color-scheme; Light/Dark force the
// theme and are persisted in localStorage (re-applied pre-paint by the inline
// script in index.html). All .theme-toggle buttons (header + mobile menu) share
// one handler and stay in sync. On change we keep the theme-color bars and the
// WebGL relief palette aligned with the new theme.
(function(){
  const STORE_KEY='theme';
  const MODES=['auto','light','dark'];
  const LABELS={auto:'Theme: folgt System',light:'Theme: hell',dark:'Theme: dunkel'};
  const btns=[...document.querySelectorAll('.theme-toggle')];
  if(!btns.length)return;
  const systemDark=matchMedia('(prefers-color-scheme: dark)');
  const current=()=>rootEl.getAttribute('data-theme')||'auto';
  function apply(mode){
    if(mode==='auto')rootEl.removeAttribute('data-theme');
    else rootEl.setAttribute('data-theme',mode);
    try{mode==='auto'?localStorage.removeItem(STORE_KEY):localStorage.setItem(STORE_KEY,mode);}catch(e){}
    btns.forEach(b=>{b.dataset.mode=mode;b.setAttribute('aria-label',LABELS[mode]);b.title=LABELS[mode];});
    notifyThemeChanged();
  }
  function notifyThemeChanged(){
    syncBars(mob.classList.contains('is-open'));
    window.dispatchEvent(new CustomEvent('themechange'));
  }
  btns.forEach(b=>b.addEventListener('click',()=>apply(MODES[(MODES.indexOf(current())+1)%MODES.length])));
  // Sync icon/labels with whatever the pre-paint script applied, and prime the
  // theme-color bars + relief shader for the initial theme.
  apply(current());
  // While on 'auto', reflect live OS theme changes in the bars + shader. iOS Safari
  // < 14 has no MediaQueryList.addEventListener (only the deprecated addListener) —
  // calling the missing method would throw, so feature-detect both.
  const onSystemChange=()=>{if(current()==='auto')notifyThemeChanged();};
  if(systemDark.addEventListener)systemDark.addEventListener('change',onSystemChange);
  else if(systemDark.addListener)systemDark.addListener(onSystemChange);
})();

// Asset showcase carousel: cross-fade slides, navigable via the segment bars,
// arrow keys and swipe. Autoplay rides the active bar's CSS fill animation —
// its animationend advances the slide, and CSS pauses the fill on hover.
// Reduced-motion fills instantly (no animationend), so it never auto-advances.
(function(){
  const stage=document.querySelector('.stage');
  if(!stage)return;
  const slides=[...stage.querySelectorAll('.slide')];
  const bars=[...stage.querySelectorAll('.bars button')];
  const fills=bars.map(b=>b.querySelector('.fill'));
  let i=0;
  function go(n){
    i=(n+slides.length)%slides.length;
    slides.forEach((s,k)=>s.classList.toggle('active',k===i));
    bars.forEach((b,k)=>b.classList.toggle('active',k===i));
    // restart the fill animation on the newly active bar
    const f=fills[i];
    if(f){f.style.animation='none';void f.offsetWidth;f.style.animation='';}
  }
  const next=()=>go(i+1),prev=()=>go(i-1);
  fills.forEach(f=>f.addEventListener('animationend',()=>{if(slides.length>1)next();}));
  bars.forEach((b,k)=>b.addEventListener('click',()=>go(k)));
  stage.setAttribute('tabindex','0');
  stage.addEventListener('keydown',e=>{if(e.key==='ArrowRight')next();else if(e.key==='ArrowLeft')prev();});
  let x0=null;
  stage.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
  stage.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40){dx<0?next():prev();}x0=null;},{passive:true});
  // Don't start the autoplay timer until the stage has been scrolled into view —
  // otherwise slide 1's 5s fill elapses (and advances) before the visitor gets
  // here. CSS pauses the fill while .in-view is absent; this arms it on first
  // sight. One-shot (disconnect), mirroring the scroll-cue's arm-once pattern.
  if('IntersectionObserver' in window){
    const vio=new IntersectionObserver(es=>{
      if(es.some(e=>e.isIntersecting)){stage.classList.add('in-view');vio.disconnect();}
    },{threshold:.35});
    vio.observe(stage);
  }else stage.classList.add('in-view');
  go(0);
})();

// "Notify me at launch": prefill a mailto so the visitor only has to hit send.
(function(){
  const nf=document.getElementById('notify-form');
  if(!nf)return;
  nf.addEventListener('submit',e=>{
    e.preventDefault();
    const email=nf.email.value.trim();
    const body='Please notify me when HelioPath launches.%0D%0A%0D%0AMy email: '+encodeURIComponent(email);
    window.location.href='mailto:hello@espressodriven.com?subject='+encodeURIComponent('Notify me: HelioPath')+'&body='+body;
    document.getElementById('notify-ok').classList.add('show');
  });
})();

// Fade the hero scroll cue out for good once the visitor has scrolled a
// meaningful amount (~15% of the viewport). One-shot: the listener removes
// itself so the cue stays gone until the page is reloaded. Runs regardless of
// reduced-motion — CSS (the cueOut keyframes) eases the fade.
(function(){
  const cue=document.querySelector('.scroll-cue');
  if(!cue)return;
  function onScroll(){
    if(window.scrollY>innerHeight*0.15){
      cue.classList.add('is-dismissed');
      removeEventListener('scroll',onScroll);
    }
  }
  addEventListener('scroll',onScroll,{passive:true});
})();

if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
  const pxEls=[...document.querySelectorAll('[data-px]')].map(el=>{
    const r=el.getBoundingClientRect();
    return{el,factor:parseFloat(el.dataset.px),center:r.top+scrollY+r.height/2};
  });
  const bgVel=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-parallax-velocity'))||.3;
  const root=document.documentElement;
  let tick=false;
  function frame(){
    const vh=innerHeight;
    for(const{el,factor,center}of pxEls){
      const off=(center-scrollY-vh/2)/vh;
      el.style.transform='translate3d(0,'+Math.round(off*factor)+'px,0)';
    }
    // Parallax for the static fallback background only — the fixed body::before
    // is shifted slower than the content. Skipped when the shader runs (the
    // fallback is hidden then, and the swirls already react to scroll).
    if(!root.classList.contains('has-webgl')){
      root.style.setProperty('--bg-parallax',Math.round(-scrollY*bgVel)+'px');
    }
    tick=false;
  }
  addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(frame)}},{passive:true});
  frame();
}
