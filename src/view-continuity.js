/* Keep navigation controls alive while changing the page they lead to. */
(function(){
 'use strict';
 const markers=new Set();
 function simple(){return window.VocabMotion?.isReduced()??matchMedia('(prefers-reduced-motion:reduce)').matches}
 function position(nav,immediate=false){
  if(!nav.isConnected||!nav.getBoundingClientRect().width)return;
  const active=nav.querySelector('button.active');if(!active)return;
  let plate=nav.querySelector('.navigation-plate');
  if(!plate){plate=document.createElement('span');plate.className='navigation-plate';plate.setAttribute('aria-hidden','true');nav.prepend(plate);immediate=true}
  plate.style.transition=immediate||simple()?'none':'';
  plate.style.width=active.offsetWidth+'px';plate.style.height=active.offsetHeight+'px';
  plate.style.transform='translate('+active.offsetLeft+'px,'+active.offsetTop+'px)';
  for(const button of nav.querySelectorAll('[data-view]')){if(button===active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')}
  markers.add(nav);
 }
 function syncNavigation(old,fresh){
  for(const next of fresh.querySelectorAll('[data-view]')){
   const button=old.querySelector('[data-view="'+next.dataset.view+'"]');if(!button)continue;
   button.className=next.className;
   if(button.innerHTML!==next.innerHTML)button.innerHTML=next.innerHTML;
  }
  if(fresh.hasAttribute('aria-label'))old.setAttribute('aria-label',fresh.getAttribute('aria-label'));
 }
 function mount(app,html,{preserveContent=false,replaceShell=false}={}){
  for(const nav of markers)if(!nav.isConnected)markers.delete(nav);
  const template=document.createElement('template');template.innerHTML=html;
  const next=template.content.firstElementChild,old=app.querySelector('.shell');
  if(!old||replaceShell){app.replaceChildren(next)}else{
   for(const selector of ['.sidebar nav','.mobile-nav'])syncNavigation(old.querySelector(selector),next.querySelector(selector));
   const bottom=old.querySelector('.sidebar-bottom'),newBottom=next.querySelector('.sidebar-bottom');
   if(bottom.innerHTML!==newBottom.innerHTML)bottom.innerHTML=newBottom.innerHTML;
   const main=old.querySelector('.main'),newMain=next.querySelector('.main');
   if(preserveContent){
    main.querySelector('.page-header')?.replaceWith(newMain.querySelector('.page-header'));
    main.querySelector('.save-banner')?.remove();const banner=newMain.querySelector('.save-banner');if(banner)main.querySelector('.page-header').after(banner);
   }else main.replaceChildren(...newMain.childNodes);
  }
  for(const nav of app.querySelectorAll('.sidebar nav,.mobile-nav'))position(nav);
 }
 let resizeFrame=0;
 function refresh(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{for(const nav of markers){if(nav.isConnected)position(nav,true);else markers.delete(nav)}})}
 window.addEventListener('resize',refresh);window.addEventListener('vocab-motionchange',refresh);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(resizeFrame);for(const nav of markers){const p=nav.querySelector('.navigation-plate');if(p)p.style.transition='none'}}else refresh()});
 window.VocabNavigation={mount,refresh};
})();
