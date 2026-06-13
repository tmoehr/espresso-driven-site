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

const burger=document.querySelector('.nav-hamburger'),mob=document.querySelector('.mobile-menu'),themeMeta=document.querySelector('meta[name="theme-color"]');
// iOS Safari tints the status/address bar with theme-color; switch it to the
// menu's dark tone while open so those bars match the overlay (web content
// can't paint under them in normal Safari).
const themeDefault='#340f02',themeMenu='#160d08';
let lockedScrollY=0;
function setMenu(open){
  burger.classList.toggle('is-open',open);burger.setAttribute('aria-expanded',open);
  mob.classList.toggle('is-open',open);mob.setAttribute('aria-hidden',!open);
  if(themeMeta)themeMeta.setAttribute('content',open?themeMenu:themeDefault);
  // iOS Safari tints the status/address bars from the <html> background color
  // (it overrides theme-color), so darken it to match the overlay while open.
  document.documentElement.style.background=open?themeMenu:'';
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

// Asset showcase carousel: cross-fade slides with autoplay (paused on hover/
// touch), arrow-key and swipe navigation. Reduced-motion skips the autoplay.
(function(){
  const stage=document.querySelector('.stage');
  if(!stage)return;
  const slides=[...stage.querySelectorAll('.slide')];
  const dots=[...stage.querySelectorAll('.dots button')];
  let i=0,timer=null;
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function go(n){i=(n+slides.length)%slides.length;slides.forEach((s,k)=>s.classList.toggle('active',k===i));dots.forEach((d,k)=>d.classList.toggle('active',k===i));}
  const next=()=>go(i+1),prev=()=>go(i-1);
  function stop(){if(timer){clearInterval(timer);timer=null;}}
  function start(){stop();if(reduce||slides.length<2)return;timer=setInterval(next,5000);}
  stage.querySelector('.next').addEventListener('click',()=>{next();start();});
  stage.querySelector('.prev').addEventListener('click',()=>{prev();start();});
  dots.forEach((d,k)=>d.addEventListener('click',()=>{go(k);start();}));
  stage.addEventListener('mouseenter',stop);
  stage.addEventListener('mouseleave',start);
  stage.setAttribute('tabindex','0');
  stage.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){next();start();}else if(e.key==='ArrowLeft'){prev();start();}});
  let x0=null;
  stage.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;stop();},{passive:true});
  stage.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40){dx<0?next():prev();}x0=null;start();},{passive:true});
  go(0);start();
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
