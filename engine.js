// A day is 48 half-hour intervals. 1 means an outage; 0 means power.
export const INITIAL = Array.from({length:48}, (_, i) => {
  const hour = i / 2;
  return +(hour >= 5 && hour < 12.5 || hour >= 14 && hour < 22.5);
});
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
    const shift = ((day - 1) * 4 + 48) % 48;
    this.outages = INITIAL.map((_, i) => INITIAL[(i + shift) % 48]);
    this.mode = 'ready'; this.score = 0; this.lives = 3; this.updates = 0;
    this.elapsed = 0; this.flashes = []; this.trail = [];
    this.layout(this.width, this.skin); this.onChange();
  }
  layout(width, skin) {
    const oldW = this.width, oldH = this.height;
    this.width = width; this.skin = skin;
    this.pad = skin === 'kyiv' ? 20 : Math.max(28, width * .09);
    this.tileH = Math.min(53, Math.max(35, width * .12));
    this.gridBottom = skin === 'kyiv' ? 18 + 6 * (this.tileH + 9) - 9 : 106;
    this.height = skin === 'kyiv' ? this.gridBottom + 230 : (width < 600 ? 380 : 370);
    this.paddle = {x: this.paddle ? this.paddle.x / oldW * width : width / 2,
      y:this.height - 29, w:Math.min(160, Math.max(76, width * .23)), h:9};
    const r = skin === 'dtek' ? Math.max(4, Math.min(6, width * .009)) : 5.5;
    this.ball = this.ball ? {...this.ball, x:this.ball.x/oldW*width, y:this.ball.y/oldH*this.height, r} : {x:width/2,y:0,vx:0,vy:0,r};
    this.speed = skin === 'kyiv' ? 300 : 330;
    this.move(this.paddle.x); this.trail = [];
    if (this.mode === 'playing' || this.mode === 'paused') {
      this.mode = 'paused';
      // The two skins have different geometry: serve from free space after resize.
      this.dock(); this.ball.vx = this.speed * .31;
      this.ball.vy = -Math.sqrt(this.speed ** 2 - this.ball.vx ** 2);
    }
    if (this.mode === 'ready' || this.mode === 'serve') this.dock();
  }
  rect(hour) {
    if (this.skin === 'kyiv') {
      const gap = 9, w = (this.width - 40 - 3 * gap) / 4;
      return {x:20 + hour % 4 * (w + gap), y:18 + Math.floor(hour/4) * (this.tileH + gap), w, h:this.tileH};
    }
    const labelW = this.width < 600 ? 29 : 91;
    const w = (this.width - labelW - 1) / 24;
    return {x:labelW + hour*w,y:65,w,h:41};
  }
  halfRect(index) {
    const rect = this.rect(Math.floor(index / 2));
    return {...rect, x:rect.x + index % 2 * rect.w / 2, w:rect.w/2};
  }
  get lit() {return 48 - this.outages.reduce((sum, n) => sum + n, 0)}
  dock() {this.ball.x = this.paddle.x; this.ball.y = this.paddle.y - this.ball.r - 3; this.ball.vx=0;this.ball.vy=0;}
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
    // Rotate the same 24-hour pattern. Always reapply it, never a one-shot event.
    const shift = (this.updates * 7 + (this.day-1)*4) % 48;
    this.outages = INITIAL.map((_,i)=>INITIAL[(i+shift+48)%48]);
    if(this.mode === 'playing') {
      this.ball.y = this.gridBottom + this.ball.r + 10;
      this.ball.vy = Math.abs(this.ball.vy);
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
    const ceiling = this.skin === 'dtek' ? 64 : b.r;
    if (b.y < ceiling+b.r) {b.y=ceiling+b.r;b.vy=Math.abs(b.vy)}
    if (b.vy>0 && oldY+b.r<=p.y && b.y+b.r>=p.y && b.x+b.r>p.x-p.w/2 && b.x-b.r<p.x+p.w/2) {
      const angle=Math.max(-1,Math.min(1,(b.x-p.x)/(p.w/2)))*1.05;
      const speed=this.speed + Math.min(70,this.score*.08);
      b.vx=Math.sin(angle)*speed;
      if (Math.abs(b.vx)<speed*.12) b.vx=(b.vx<0?-1:1)*speed*.12;
      b.vy=-Math.sqrt(speed**2-b.vx**2);b.y=p.y-b.r-.1;
    }
    for (let i=0;i<48;i++) {
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
      width:this.width,height:this.height,day:this.day,score:this.score,lives:this.lives,
      lightHours:this.lit/2,updates:this.updates,ball:{...this.ball},paddle:{...this.paddle},
      outages:this.outages.map((off,index)=>off?{index,...this.halfRect(index)}:null).filter(Boolean)};
  }
}
