import {Game} from './engine.js';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const root=document.documentElement, canvas=$('#game'), ctx=canvas.getContext('2d');
let skin='kyiv',theme='dark',notificationUntil=0,last=0,manual=false;
try {skin=localStorage.getItem('outage-skin')||skin;theme=localStorage.getItem('outage-theme')||theme} catch {}
const params=new URLSearchParams(location.search);
skin=params.get('skin')||skin;theme=params.get('theme')||theme;
if(!['dtek','kyiv'].includes(skin)) skin='kyiv';
if(!['light','dark'].includes(theme)) theme='dark';
let colors={};
const game=new Game({
  onUpdate:()=>{notificationUntil=performance.now()+2600;$('#notification').textContent='Графік оновлено'},
  onChange:()=>sync()
});
// Read-only state and deterministic clock are used by browser tests.
window.render_game_to_text=()=>JSON.stringify({...game.snapshot(),theme,palette:{on:colors.on,off:colors.off}});
window.advanceTime=ms=>{manual=true;game.advance(ms);sync();draw()};

function applyAppearance() {
  root.dataset.skin=skin;root.dataset.theme=theme;
  $$('[data-skin-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.skinChoice===skin)));
  const next=theme==='dark'?'світлу':'темну';
  $('#theme-toggle').setAttribute('aria-label',`Увімкнути ${next} тему`);
  $('#theme-toggle').title=theme==='dark'?'Світла тема':'Темна тема';
  $('#theme-toggle').innerHTML=theme==='dark'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15A9 9 0 0 1 9 4 9 9 0 1 0 20 15Z"/></svg>';
  const css=getComputedStyle(root);
  for(const key of ['bg','panel','text','muted','line','accent','on','off','tile-line','tile-on-text','tile-off-text','ball','paddle','bolt-on']) colors[key]=css.getPropertyValue('--'+key).trim();
  $('meta[name="theme-color"]').content=colors.bg;
  try {localStorage.setItem('outage-skin',skin);localStorage.setItem('outage-theme',theme)} catch {}
  resize();sync();draw();
}
function resize() {
  const width=canvas.parentElement.clientWidth;
  if(width<1) return;
  if(Math.abs(width-game.width)>.5||game.skin!==skin) game.layout(width,skin);
  const dpr=Math.min(3,window.devicePixelRatio||1);
  canvas.style.height=game.height+'px';
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(game.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);sync();draw();
}
function sync() {
  // The constructor can call this before the game binding is initialized.
  if(!window.render_game_to_text) return;
  $('#light-stat').textContent=`${(game.lit/2).toLocaleString('uk-UA')} / 24 год`;
  $('#score-stat').textContent=game.score;$('#lives-stat').textContent=game.lives;
  $('#pause').disabled=!['playing','paused'].includes(game.mode);
  $('#pause').textContent=game.mode==='paused'?'▷':'Ⅱ';
  $('#pause').setAttribute('aria-label',game.mode==='paused'?'Продовжити':'Пауза');
  $('#overlay').hidden=game.mode==='playing';
  const content={
    ready:['','Відбивайте м’яч і вмикайте світло.','Почати гру'],
    serve:['М’яч втрачено',`Залишилось спроб: ${game.lives}.`,'Продовжити'],
    paused:['Пауза','','Продовжити'],
    over:['Гру завершено',`Рахунок: ${game.score}.`,'Зіграти ще раз']
  }[game.mode];
  if(content) {
    $('#overlay-title').textContent=content[0];$('#overlay-title').hidden=!content[0];
    $('#overlay-copy').textContent=content[1];$('#overlay-copy').hidden=!content[1];
    $('#start').textContent=content[2];
  }
}
function round(x,y,w,h,r,fill,stroke) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill) {ctx.fillStyle=fill;ctx.fill()}
  if(stroke) {ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}
}
function bolt(x,y,size,on) {
  ctx.save();ctx.translate(x,y);ctx.scale(size/20,size/20);
  ctx.fillStyle=on?colors['bolt-on']:colors['tile-off-text'];
  ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(3,11);ctx.lineTo(10,11);ctx.lineTo(8,20);ctx.lineTo(18,7);ctx.lineTo(11,7);ctx.closePath();ctx.fill();
  if(!on) {
    ctx.strokeStyle=colors.off;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(1,1);ctx.lineTo(19,19);ctx.stroke();
    ctx.strokeStyle=colors['tile-off-text'];ctx.lineWidth=1.8;ctx.stroke();
  }
  ctx.restore();
}
function drawTile(hour) {
  const q=game.rect(hour),left=game.outages[hour*2],right=game.outages[hour*2+1];
  const radius=skin==='kyiv'?9:2;
  ctx.save();ctx.beginPath();ctx.roundRect(q.x,q.y,q.w,q.h,radius);ctx.clip();
  ctx.fillStyle=left?colors.off:colors.on;ctx.fillRect(q.x,q.y,q.w,q.h);
  if(left!==right) {
    ctx.fillStyle=right?colors.off:colors.on;ctx.fillRect(q.x+q.w/2,q.y,q.w/2,q.h);
  }
  ctx.restore();round(q.x,q.y,q.w,q.h,radius,null,colors['tile-line']);
  const font=Math.max(12,Math.min(16,q.w*.19));
  ctx.font=`400 ${font}px Roboto,Arial`;ctx.textBaseline='middle';ctx.textAlign='left';
  const label=`${String(hour).padStart(2,'0')}:00`,textWidth=ctx.measureText(label).width;
  const same=left===right,iconSize=Math.min(15,font+1),iconSpace=same?iconSize+3:0;
  const x=q.x+(q.w-textWidth-iconSpace)/2;
  if(same) bolt(x,q.y+q.h/2-iconSize/2,iconSize,!left);
  // Half-hour cells can have different backgrounds; clip the label by half so
  // each side remains legible in both official Kyiv palettes.
  for(const [n,off] of [left,right].entries()) {
    ctx.save();ctx.beginPath();ctx.rect(q.x+n*q.w/2,q.y,q.w/2,q.h);ctx.clip();
    ctx.fillStyle=off?colors['tile-off-text']:colors['tile-on-text'];
    ctx.fillText(label,x+iconSpace,q.y+q.h/2+.5);ctx.restore();
  }
}
function draw() {
  if(!colors.panel)return;
  const w=game.width,h=game.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle=colors.panel;ctx.fillRect(0,0,w,h);
  for(let hour=0;hour<24;hour++) drawTile(hour);
  for(const flash of game.flashes) {
    ctx.globalAlpha=flash.life*1.3;ctx.fillStyle=colors.accent;ctx.fillRect(flash.x,flash.y,flash.w,flash.h);
  }
  ctx.globalAlpha=1;
  const p=game.paddle,b=game.ball;
  round(p.x-p.w/2,p.y,p.w,p.h,4.5,colors.paddle);
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=colors.ball;ctx.fill();
  if(game.mode==='playing') {
    ctx.globalAlpha=.16;ctx.beginPath();ctx.arc(b.x-b.vx*.018,b.y-b.vy*.018,b.r*.65,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  $('#notification').classList.toggle('visible',performance.now()<notificationUntil);
}
function start() {
  manual=false;game.launch();canvas.focus({preventScroll:true});
  if(innerWidth<600 && $('.game-shell').getBoundingClientRect().bottom>innerHeight) $('.game-shell').scrollIntoView({block:'start',behavior:'instant'});
  sync();
}
$('#start').addEventListener('click',start);
$('#pause').addEventListener('click',()=>{if(game.mode==='paused')start();else game.pause()});
$('#restart').addEventListener('click',()=>{notificationUntil=0;game.reset();draw()});
$$('[data-skin-choice]').forEach(el=>el.addEventListener('click',()=>{skin=el.dataset.skinChoice;notificationUntil=0;applyAppearance()}));
$('#theme-toggle').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';applyAppearance()});
const pointer=e=>{const q=canvas.getBoundingClientRect();game.move((e.clientX-q.left)*game.width/q.width)};
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.buttons)pointer(e)});
canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);pointer(e);if(game.mode==='serve')start();canvas.focus({preventScroll:true})});
canvas.addEventListener('pointerup',e=>{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)});
async function fullscreen() {
  try {
    if(document.fullscreenElement) await document.exitFullscreen();
    else if($('.game-shell').requestFullscreen) await $('.game-shell').requestFullscreen();
    else {game.pause();$('#notification').textContent='Повний екран недоступний у цьому браузері';notificationUntil=performance.now()+2500}
  } catch {game.pause()}
}
$('#fullscreen').addEventListener('click',fullscreen);
document.addEventListener('fullscreenchange',()=>{game.pause();resize()});
document.addEventListener('keydown',e=>{
  if($('#about').open||['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight') {e.preventDefault();game.keys[e.key==='ArrowLeft'?'left':'right']=true}
  if(e.code==='Space'&&e.target.tagName!=='BUTTON') {e.preventDefault();if(!e.repeat){if(game.mode==='playing')game.pause();else start()}}
  if(e.key==='Escape')game.pause();
  if(e.code==='KeyF'&&!e.repeat) {e.preventDefault();fullscreen()}
});
document.addEventListener('keyup',e=>{if(e.key==='ArrowLeft')game.keys.left=false;if(e.key==='ArrowRight')game.keys.right=false});
const blur=()=>{game.keys.left=false;game.keys.right=false;game.pause()};
window.addEventListener('blur',blur);document.addEventListener('visibilitychange',()=>{if(document.hidden)blur()});
$('#about-open').addEventListener('click',()=>{game.pause();$('#about').showModal()});
$('#about-close').addEventListener('click',()=>$('#about').close());
new ResizeObserver(resize).observe(canvas.parentElement);
function frame(time) {
  const dt=Math.min(40,time-(last||time));last=time;
  if(!manual) game.advance(dt);
  draw();requestAnimationFrame(frame);
}
applyAppearance();document.fonts.ready.then(draw);requestAnimationFrame(frame);
