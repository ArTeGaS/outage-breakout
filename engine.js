// Half-hour boundaries for the three light periods in each generated schedule.
// An edge period may be one hour; every other period is 1.5–2.5 hours.
export const LIGHT_WINDOWS = [
  [[0,2],[15,20],[32,37]], [[2,6],[18,22],[34,39]],
  [[4,9],[20,24],[46,48]], [[1,4],[17,22],[35,40]],
  [[0,2],[13,17],[29,34]], [[3,8],[20,25],[38,41]],
  [[5,10],[23,26],[46,48]], [[1,6],[17,20],[33,38]]
];
function scheduleFor(index) {
  const windows=LIGHT_WINDOWS[((index%LIGHT_WINDOWS.length)+LIGHT_WINDOWS.length)%LIGHT_WINDOWS.length];
  return Array.from({length:48},(_,slot)=>+!windows.some(([start,end])=>slot>=start&&slot<end));
}
// 1 means an outage, 0 means light; each slot is half an hour.
export const INITIAL = scheduleFor(0);
export class Game {
  constructor({onUpdate = () => {}, onChange = () => {}} = {}) {
    this.onUpdate = onUpdate;
    this.onChange = onChange;
    this.width = 420; this.height = 530; this.skin = 'kyiv'; this.day = 1;
    this.keys = {left:false, right:false};
    this.reset();
  }
  reset(day = this.day) {
    this.day = day;
    this.outages = scheduleFor(day - 1);
    this.mode = 'ready'; this.score = 0; this.lives = 3; this.updates = 0;
    this.elapsed = 0; this.flashes = []; this.trail = []; this.returnFlight = null;
    this.layout(this.width, this.skin); this.onChange();
  }
  layout(width, skin, maxCanvasHeight = this.maxCanvasHeight ?? Infinity) {
    const oldW = this.width, oldH = this.height;
    this.width = width; this.skin = skin;
    this.maxCanvasHeight = maxCanvasHeight;
    this.columns = width >= 570 ? 6 : 4;
    this.pad = width < 570 ? 12 : 20;
    this.gap = width < 570 ? 7 : 9;
    this.tileW = (width - this.pad * 2 - this.gap * (this.columns - 1)) / this.columns;
    this.tileH = Math.min(58, Math.max(38, this.tileW * .56));
    this.gridBottom = 16 + Math.ceil(24 / this.columns) * (this.tileH + this.gap) - this.gap;
    this.height = this.heightForLimit(maxCanvasHeight);
    this.paddle = {x: this.paddle ? this.paddle.x / oldW * width : width / 2,
      y:this.height - 29, w:Math.min(160, Math.max(76, width * .23)), h:9};
    const r = width < 570 ? 5 : 6;
    this.ball = this.ball ? {...this.ball, x:this.ball.x/oldW*width, y:this.ball.y/oldH*this.height, r} : {x:width/2,y:0,vx:0,vy:0,r};
    this.speed = width < 570 ? 270 : 330;
    this.move(this.paddle.x); this.trail = [];
    if (this.mode === 'playing' || this.mode === 'paused') {
      this.mode = 'paused';
      // A resize can change the number of columns, so resume from free space.
      this.dock(); this.ball.vx = this.speed * .31;
      this.ball.vy = -Math.sqrt(this.speed ** 2 - this.ball.vx ** 2);
    }
    if (this.mode === 'ready' || this.mode === 'serve') this.dock();
  }
  heightForLimit(maxCanvasHeight) {
    const preferred = this.width < 570 ? 224 : 220;
    const available = Number.isFinite(maxCanvasHeight) ? maxCanvasHeight - this.gridBottom : preferred;
    return this.gridBottom + Math.max(150, Math.min(preferred, available));
  }
  fitHeight(maxCanvasHeight) {
    this.maxCanvasHeight = maxCanvasHeight;
    const nextHeight = this.heightForLimit(maxCanvasHeight);
    if (Math.abs(nextHeight - this.height) <= .5) return true;
    const nextPaddleY = nextHeight - 29;
    if (['playing','paused'].includes(this.mode) &&
        (this.returnFlight || this.ball.y + this.ball.r >= Math.min(this.paddle.y,nextPaddleY) - 2)) return false;
    // A height-only change moves the platform, never the ball or the score.
    this.height = nextHeight; this.paddle.y = nextPaddleY;
    if (['ready','serve','over'].includes(this.mode)) this.dock();
    return true;
  }
  rect(hour) {
    return {x:this.pad + hour % this.columns * (this.tileW + this.gap),
      y:16 + Math.floor(hour / this.columns) * (this.tileH + this.gap),
      w:this.tileW,h:this.tileH};
  }
  halfRect(index) {
    const rect = this.rect(Math.floor(index / 2));
    return {...rect, x:rect.x + index % 2 * rect.w / 2, w:rect.w/2};
  }
  get lit() {return 48 - this.outages.reduce((sum, n) => sum + n, 0)}
  get ballOpacity() {
    if (!this.returnFlight) return 1;
    const targetY = this.paddle.y - this.ball.r;
    const distance = Math.max(1, targetY - this.returnFlight.startY);
    const progress = Math.max(0, Math.min(1, (this.ball.y - this.returnFlight.startY) / distance));
    // First dim on departure, then brighten continuously until paddle contact.
    return progress < .22 ? 1 - .72 * progress / .22 : .28 + .72 * (progress - .22) / .78;
  }
  dock() {this.returnFlight=null;this.ball.x = this.paddle.x; this.ball.y = this.paddle.y - this.ball.r - 3; this.ball.vx=0;this.ball.vy=0;}
  move(x) {
    this.paddle.x = Math.min(this.width - this.paddle.w/2 - 4, Math.max(this.paddle.w/2 + 4, x));
    if (this.mode === 'ready' || this.mode === 'serve') this.dock();
  }
  launch() {
    if (this.mode === 'over') this.reset();
    if (this.mode === 'paused') {this.mode='playing'; this.onChange(); return;}
    if (this.mode !== 'ready' && this.mode !== 'serve') return;
    this.mode = 'playing';
    this.ball.vx = this.speed * .31 * (this.lives % 2 ? 1 : -1);
    this.ball.vy = -Math.sqrt(this.speed ** 2 - this.ball.vx ** 2);
    this.onChange();
  }
  pause() {if (this.mode === 'playing') {this.mode='paused';this.onChange();}}
  hit(index) {
    if (!this.outages[index]) return;
    this.outages[index] = 0; this.score += 10;
    this.flashes.push({...this.halfRect(index),life:.3});
    // The strict boundary is checked synchronously on every hit, before another
    // frame can expose a completed schedule. 34/48 > 70%, 33/48 <= 70%.
    if (this.lit / 48 > .70) this.updateSchedule();
    this.onChange();
  }
  updateSchedule() {
    this.updates++;
    // Every update supplies a fresh, valid daily schedule, including after repeats.
    this.outages = scheduleFor(this.updates + this.day - 1);
    if(this.mode === 'playing') {
      // Keep the ball where it is: it flies down through the new schedule and
      // cannot collide with cells until the next paddle contact.
      const speed = Math.max(this.speed, Math.hypot(this.ball.vx, this.ball.vy));
      this.ball.vx = Math.max(-speed * .75, Math.min(speed * .75, this.ball.vx));
      this.ball.vy = Math.sqrt(speed ** 2 - this.ball.vx ** 2);
      this.returnFlight = {startY:this.ball.y};
    }
    this.onUpdate();
  }
  step(dt) {
    if (this.mode !== 'playing') return;
    dt = Math.min(dt, 1/120);
    this.elapsed += dt;
    if (this.keys.left || this.keys.right) this.move(this.paddle.x + (Number(this.keys.right)-Number(this.keys.left))*this.width*1.15*dt);
    this.flashes = this.flashes.map(f=>({...f,life:f.life-dt})).filter(f=>f.life>0);
    const b=this.ball, p=this.paddle;
    const oldX=b.x, oldY=b.y;
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    if (b.x < b.r) {b.x=b.r;b.vx=Math.abs(b.vx)}
    if (b.x > this.width-b.r) {b.x=this.width-b.r;b.vx=-Math.abs(b.vx)}
    if (b.y < b.r) {b.y=b.r;b.vy=Math.abs(b.vy)}
    if (b.vy>0 && oldY+b.r<=p.y && b.y+b.r>=p.y && b.x+b.r>p.x-p.w/2 && b.x-b.r<p.x+p.w/2) {
      this.returnFlight=null;
      const angle=Math.max(-1,Math.min(1,(b.x-p.x)/(p.w/2)))*1.05;
      const speed=this.speed + Math.min(70,this.score*.08);
      b.vx=Math.sin(angle)*speed;
      if (Math.abs(b.vx)<speed*.12) b.vx=(b.vx<0?-1:1)*speed*.12;
      b.vy=-Math.sqrt(speed**2-b.vx**2);b.y=p.y-b.r-.1;
    }
    for (let i=0;!this.returnFlight && i<48;i++) {
      if (!this.outages[i]) continue;
      const q=this.halfRect(i);
      const nearX=Math.max(q.x,Math.min(b.x,q.x+q.w));
      const nearY=Math.max(q.y,Math.min(b.y,q.y+q.h));
      if ((b.x-nearX)**2+(b.y-nearY)**2 >= b.r*b.r) continue;
      if (oldY-b.r>=q.y+q.h) {b.y=q.y+q.h+b.r+.1;b.vy=Math.abs(b.vy)}
      else if(oldY+b.r<=q.y) {b.y=q.y-b.r-.1;b.vy=-Math.abs(b.vy)}
      else if(oldX<q.x) {b.x=q.x-b.r-.1;b.vx=-Math.abs(b.vx)}
      else {b.x=q.x+q.w+b.r+.1;b.vx=Math.abs(b.vx)}
      this.hit(i); break;
    }
    if (b.y-b.r>this.height) {
      this.lives--;this.trail=[];
      this.mode=this.lives>0?'serve':'over';this.dock();this.onChange();
    }
  }
  advance(ms) {
    for(let t=0;t<ms;t+=1000/120) this.step(Math.min(1000/120,ms-t)/1000);
  }
  snapshot() {
    return {coordinates:'origin top-left; x right, y down; CSS pixels',mode:this.mode,skin:this.skin,
      width:this.width,height:this.height,columns:this.columns,day:this.day,score:this.score,lives:this.lives,
      lightHours:this.lit/2,updates:this.updates,ball:{...this.ball,returning:!!this.returnFlight,opacity:this.ballOpacity},paddle:{...this.paddle},
      outages:this.outages.map((off,index)=>off?{index,...this.halfRect(index)}:null).filter(Boolean)};
  }
}
