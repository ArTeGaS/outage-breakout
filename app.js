import {Game} from './engine.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const root=document.documentElement, canvas=$('#game'), ctx=canvas.getContext('2d');
let skin='kyiv',theme='dark',notificationUntil=0,last=0,manual=false;
try{skin=localStorage.getItem('outage-skin')||skin;theme=localStorage.getItem('outage-theme')||theme}catch{}
const params=new URLSearchParams(location.search);
skin=params.get('skin')||skin;theme=params.get('theme')||theme;
if(!['dtek','kyiv'].includes(skin))skin='kyiv';if(!['light','dark'].includes(theme))theme='dark';
let colors={};
const game=new Game({onUpdate:()=>{notificationUntil=performance.now()+2600;$('#notification').textContent='Графік оновлено';updateDate();},onChange:()=>sync()});
// Hooks are observational/deterministic only; no game-state mutation API is exposed.
window.render_game_to_text=()=>JSON.stringify({...game.snapshot(),theme});
window.advanceTime=ms=>{manual=true;game.advance(ms);sync();draw()};

function updateDate(){
  const now=new Date(),tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);
  const date=d=>d.toLocaleDateString('uk-UA',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'Europe/Kyiv'});
  const stamp=now.toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Kyiv'}).replace(',','');
  $$('.updated-at').forEach(el=>el.textContent=stamp);$('#today-date').textContent=date(now);$('#tomorrow-date').textContent=date(tomorrow);
}
function applyAppearance(){
  root.dataset.skin=skin;root.dataset.theme=theme;
  $$('[data-skin-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.skinChoice===skin)));
  const next=theme==='dark'?'світлу':'темну';$('#theme-toggle').setAttribute('aria-label',`Увімкнути ${next} тему`);
  $('#theme-toggle').title=theme==='dark'?'Світла тема':'Темна тема';
  $('#theme-toggle').innerHTML=theme==='dark'?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15A9 9 0 0 1 9 4 9 9 0 1 0 20 15Z"/></svg>';
  const css=getComputedStyle(root);
  for(const key of ['bg','panel','text','muted','line','accent','on','off','possible','ball','paddle'])colors[key]=css.getPropertyValue('--'+key).trim();
  $('meta[name="theme-color"]').content=colors.bg;
  try{localStorage.setItem('outage-skin',skin);localStorage.setItem('outage-theme',theme)}catch{}
  resize();sync();draw();
}
function resize(){
  const w=canvas.parentElement.clientWidth;
  if(w<1)return;
  if(Math.abs(w-game.width)>.5||game.skin!==skin)game.layout(w,skin);
  const dpr=Math.min(3,window.devicePixelRatio||1);
  canvas.style.height=game.height+'px';canvas.width=Math.round(w*dpr);canvas.height=Math.round(game.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);sync();draw();
}
function sync(){
  // Game's constructor can call this before the const binding is initialized.
  if(!window.render_game_to_text)return;
  $('#light-stat').textContent=`${(game.lit/2).toLocaleString('uk-UA')} / 24 год`;
  $('#score-stat').textContent=game.score;$('#lives-stat').textContent=game.lives;
  $('#pause').disabled=!['playing','paused'].includes(game.mode);
  $('#pause').textContent=game.mode==='paused'?'▷':'Ⅱ';
  $('#pause').setAttribute('aria-label',game.mode==='paused'?'Продовжити':'Пауза');
  const overlay=$('#overlay');overlay.hidden=game.mode==='playing';
  const content={ready:['Графік відключень','Відбивайте м’яч і прибирайте відключення з графіка.','Почати гру'],
    serve:['М’яч втрачено',`Залишилось спроб: ${game.lives}.`,'Продовжити'],
    paused:['Пауза','Натисніть «Продовжити», щоб повернутися до гри.','Продовжити'],
    over:['Гру завершено',`Рахунок: ${game.score}.`,'Зіграти ще раз']}[game.mode];
  if(content){$('#overlay-title').textContent=content[0];$('#overlay-copy').textContent=content[1];$('#start').textContent=content[2]}
  $$('[data-day]').forEach(el=>{const selected=Number(el.dataset.day)===game.day;el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected))});
  const hour=new Date().getHours(),idx=hour*2;
  if(!game.outages[idx]&&!game.outages[idx+1])$('#kyiv-status').textContent='зараз є світло';
  else {let next=idx;while(next<48&&game.outages[next])next++;$('#kyiv-status').textContent=next<48?`немає світла до ${String(Math.floor(next/2)).padStart(2,'0')}:${next%2?'30':'00'}`:'немає світла до 00:00'}
}
function round(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke()}}
function bolt(x,y,size,on){
  ctx.save();ctx.translate(x,y);ctx.scale(size/20,size/20);ctx.fillStyle=on?'#ffdf56':colors.text;
  ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(3,11);ctx.lineTo(10,11);ctx.lineTo(8,20);ctx.lineTo(18,7);ctx.lineTo(11,7);ctx.closePath();ctx.fill();
  if(!on){ctx.strokeStyle=colors.off;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(1,1);ctx.lineTo(19,19);ctx.stroke();ctx.strokeStyle=colors.text;ctx.lineWidth=1.8;ctx.stroke()}
  ctx.restore();
}
function draw(){
  if(!colors.panel)return;
  const w=game.width,h=game.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle=colors.panel;ctx.fillRect(0,0,w,h);
  const dtek=skin==='dtek';
  if(dtek){
    const labelW=game.rect(0).x;
    ctx.fillStyle=colors.text;ctx.font=`500 ${w<600?8:13}px Roboto,Arial`;ctx.textAlign='left';
    if(w>=600){ctx.fillText('Часові',10,24);ctx.fillText('проміжки',10,44)}else{ctx.save();ctx.translate(18,53);ctx.rotate(-Math.PI/2);ctx.fillText('Години',0,0);ctx.restore()}
    ctx.strokeStyle=colors.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,65);ctx.lineTo(w,65);ctx.moveTo(0,106);ctx.lineTo(w,106);ctx.stroke();
    for(let hour=0;hour<24;hour++){
      const q=game.rect(hour);ctx.strokeStyle=colors.line;ctx.beginPath();ctx.moveTo(q.x,0);ctx.lineTo(q.x,106);ctx.stroke();
      ctx.save();ctx.translate(q.x+q.w/2,10);ctx.rotate(Math.PI/2);ctx.fillStyle=colors.text;ctx.font=`${w<600?8:13}px Roboto,Arial`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(`${String(hour).padStart(2,'0')}-${String(hour+1).padStart(2,'0')}`,0,0);ctx.restore();
    }
    ctx.fillStyle=colors.muted;ctx.font='11px Roboto,Arial';ctx.textAlign='left';if(w>600)ctx.fillText('Графік',10,90);
  }
  for(let hour=0;hour<24;hour++){
    const q=game.rect(hour),left=game.outages[hour*2],right=game.outages[hour*2+1],on=!left&&!right;
    ctx.save();ctx.beginPath();ctx.roundRect(q.x,q.y,q.w,q.h,dtek?0:10);ctx.clip();
    ctx.fillStyle=left?colors.off:colors.on;ctx.fillRect(q.x,q.y,q.w/2,q.h);
    ctx.fillStyle=right?colors.off:colors.on;ctx.fillRect(q.x+q.w/2,q.y,q.w/2,q.h);
    ctx.restore();
    if(!dtek){
      round(q.x,q.y,q.w,q.h,10,null,colors.line);
      const font=Math.max(12,Math.min(16,w*.039));ctx.font=`400 ${font}px Roboto,Arial`;ctx.textBaseline='middle';
      const label=`${String(hour).padStart(2,'0')}:00`,tw=ctx.measureText(label).width;
      const same=left===right;const group=tw+(same?15:0),start=q.x+(q.w-group)/2;
      if(same)bolt(start-1,q.y+q.h/2-8,15,on);
      ctx.fillStyle=colors.text;ctx.textAlign='left';ctx.fillText(label,start+(same?15:0),q.y+q.h/2+.5);
      const current=new Date().getHours();
      if(hour===current){ctx.strokeStyle=colors.accent;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(q.x-4,q.y-4,q.w+8,q.h+8,14);ctx.stroke()}
    }else{
      ctx.strokeStyle=colors.line;ctx.lineWidth=.8;ctx.strokeRect(q.x,q.y,q.w,q.h);
      if(left&&right)bolt(q.x+q.w/2-Math.min(8,q.w*.35),q.y+13,Math.min(17,q.w*.75),false);
      else if(left||right)bolt(q.x+q.w/2-5,q.y+15,11,true);
    }
  }
  for(const flash of game.flashes){ctx.globalAlpha=flash.life*1.3;ctx.fillStyle=colors.accent;ctx.fillRect(flash.x,flash.y,flash.w,flash.h)}ctx.globalAlpha=1;
  // A subtle line gives the play area a floor without changing the schedule UI.
  ctx.strokeStyle=colors.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(20,h-11);ctx.lineTo(w-20,h-11);ctx.stroke();
  const p=game.paddle,b=game.ball;
  round(p.x-p.w/2,p.y,p.w,p.h,4.5,colors.paddle,dtek?colors.line:null);
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=colors.ball;ctx.fill();
  if(game.mode==='playing'){
    ctx.globalAlpha=.16;ctx.beginPath();ctx.arc(b.x-b.vx*.018,b.y-b.vy*.018,b.r*.65,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  $('#notification').classList.toggle('visible',performance.now()<notificationUntil);
}
function start(){manual=false;game.launch();canvas.focus({preventScroll:true});if(innerWidth<600)$('.schedule').scrollIntoView({block:'start',behavior:'instant'});sync()}
$('#start').addEventListener('click',start);
$('#pause').addEventListener('click',()=>{if(game.mode==='paused')start();else game.pause()});
$('#restart').addEventListener('click',()=>{notificationUntil=0;game.reset();draw()});
$$('[data-skin-choice]').forEach(el=>el.addEventListener('click',()=>{skin=el.dataset.skinChoice;notificationUntil=0;applyAppearance()}));
$('#theme-toggle').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';applyAppearance()});
$$('[data-day]').forEach(el=>el.addEventListener('click',()=>{game.reset(Number(el.dataset.day));notificationUntil=0;draw()}));
const pointer=e=>{const q=canvas.getBoundingClientRect();game.move((e.clientX-q.left)*game.width/q.width)};
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.buttons)pointer(e)});
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);pointer(e);if(game.mode==='serve')start();canvas.focus({preventScroll:true})});
canvas.addEventListener('pointerup',e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)});
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if($('.schedule').requestFullscreen)await $('.schedule').requestFullscreen();else{game.pause();$('#notification').textContent='Повний екран недоступний у цьому браузері';notificationUntil=performance.now()+2500}}catch{game.pause()}}
$('#fullscreen').addEventListener('click',fullscreen);
document.addEventListener('fullscreenchange',()=>{game.pause();resize()});
document.addEventListener('keydown',e=>{
  if($('#about').open)return;
  if(['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();game.keys[e.key==='ArrowLeft'?'left':'right']=true}
  if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();if(!e.repeat){if(game.mode==='playing')game.pause();else start()}}
  if(e.key==='Escape')game.pause();
  if(e.code==='KeyF'&&!e.repeat){e.preventDefault();fullscreen()}
});
document.addEventListener('keyup',e=>{if(e.key==='ArrowLeft')game.keys.left=false;if(e.key==='ArrowRight')game.keys.right=false});
const blur=()=>{game.keys.left=false;game.keys.right=false;game.pause()};
window.addEventListener('blur',blur);document.addEventListener('visibilitychange',()=>{if(document.hidden)blur()});
$('#about-open').addEventListener('click',()=>{game.pause();$('#about').showModal()});$('#about-close').addEventListener('click',()=>$('#about').close());
new ResizeObserver(()=>resize()).observe(canvas.parentElement);
function frame(time){const dt=Math.min(40,time-(last||time));last=time;if(!manual)game.advance(dt);draw();requestAnimationFrame(frame)}
updateDate();applyAppearance();document.fonts.ready.then(draw);requestAnimationFrame(frame);
