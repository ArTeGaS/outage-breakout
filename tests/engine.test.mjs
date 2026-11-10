import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,LIGHT_WINDOWS} from '../engine.js';
function lightPeriods(outages) {
  const periods=[];
  for(let i=0;i<outages.length;) {
    if(outages[i]) {i++;continue}
    const start=i;while(i<outages.length&&!outages[i])i++;
    periods.push([start,i]);
  }
  return periods;
}
test('every new daily schedule has exactly three valid periods of light',()=>{
  const distinct=new Set();let early=false,late=false;
  for(let day=1;day<=LIGHT_WINDOWS.length;day++) {
    const g=new Game();g.reset(day);
    for(let i=0;i<24;i++) {
      const periods=lightPeriods(g.outages);assert.equal(periods.length,3);
      for(const [start,end] of periods) {
        const length=end-start;
        assert.ok(length>=3&&length<=5 || length===2&&(start===0||end===48),`invalid light period ${start}-${end}`);
        early ||= length===2&&start===0;late ||= length===2&&end===48;
      }
      distinct.add(JSON.stringify(periods));g.updateSchedule();
    }
  }
  assert.ok(early&&late);assert.equal(distinct.size,LIGHT_WINDOWS.length);
});
test('strictly more than 70% triggers a recurring update, with no winning state',()=>{
  const g=new Game();let notifications=0;g.onUpdate=()=>notifications++;
  // Drive only through public hit behavior, never mutate the schedule.
  for(let cycle=0;cycle<100;cycle++){
    while(g.lit<33)g.hit(g.outages.findIndex(Boolean));
    assert.equal(g.updates,cycle);assert.equal(g.lit,33);
    g.hit(g.outages.findIndex(Boolean));
    assert.equal(g.updates,cycle+1);assert.ok(g.lit/48<=.7);assert.notEqual(g.mode,'won');
  }
  assert.equal(notifications,100);assert.ok(g.score>10000);
});
test('half-hour hits score once; clearing one half leaves the other intact',()=>{
  const g=new Game();g.hit(10);assert.equal(g.outages[10],0);assert.equal(g.outages[11],1);assert.equal(g.score,10);g.hit(10);assert.equal(g.score,10);
});
test('real ball collision clears a half-hour and bounces down',()=>{
  for(const skin of ['kyiv','dtek']){const g=new Game();g.layout(skin==='kyiv'?390:900,skin);g.launch();const index=42;const q=g.halfRect(index);
    g.ball.x=q.x+q.w/2;g.ball.y=q.y+q.h+g.ball.r+1;g.ball.vx=0;g.ball.vy=-300;
    g.advance(20);assert.equal(g.outages[index],0);assert.equal(g.score,10);assert.ok(g.ball.vy>0);
  }
});
test('paddle bounce, wall bounce, pause, miss and restart',()=>{
  const g=new Game();g.launch();g.ball.x=g.paddle.x;g.ball.y=g.paddle.y-g.ball.r-1;g.ball.vy=300;g.advance(20);assert.ok(g.ball.vy<0);
  g.ball.x=1;g.ball.y=g.gridBottom+25;g.ball.vx=-100;g.ball.vy=0;g.advance(20);assert.ok(g.ball.vx>0);
  g.pause();const x=g.ball.x;g.advance(1000);assert.equal(g.ball.x,x);g.launch();
  for(let lives=2;lives>=0;lives--){g.ball.x=1;g.ball.y=g.height+10;g.ball.vy=300;g.advance(20);assert.equal(g.lives,lives);assert.equal(g.mode,lives?'serve':'over');if(lives)g.launch()}
  g.launch();assert.equal(g.lives,3);assert.equal(g.score,0);assert.equal(g.mode,'playing');
});
test('appearance changes preserve progress, pause and keep mobile collisions in bounds',()=>{
  const g=new Game();g.launch();g.hit(10);g.layout(320,'dtek');assert.equal(g.score,10);assert.equal(g.mode,'paused');g.move(-500);assert.ok(g.paddle.x-g.paddle.w/2>=0);g.move(5000);assert.ok(g.paddle.x+g.paddle.w/2<=320);
  for(let i=0;i<48;i++){const r=g.halfRect(i);assert.ok(r.x>=0&&r.x+r.w<=320&&r.y+r.h<g.height)}
  assert.ok(g.ball.y-g.ball.r>g.gridBottom);assert.ok(g.ball.vy<0);
  g.launch();g.advance(10);assert.equal(g.score,10);
});
test('all 24 hours are laid out inside the field on phone and desktop for both skins',()=>{
  for(const skin of ['kyiv','dtek']) for(const [width,columns] of [[320,4],[390,4],[620,6],[800,6]]){
    const g=new Game();g.layout(width,skin);assert.equal(g.columns,columns);
    const tiles=Array.from({length:24},(_,hour)=>g.rect(hour));
    assert.equal(new Set(tiles.map(r=>`${r.x},${r.y}`)).size,24);
    for(const r of tiles)assert.ok(r.x>=0&&r.x+r.w<=width&&r.y>=0&&r.y+r.h<=g.gridBottom);
    assert.ok(tiles[columns].y>tiles[0].y);assert.ok(g.paddle.y>g.gridBottom);
  }
});
test('a height-only viewport change preserves a live ball and waits if the paddle would cross it',()=>{
  const g=new Game();g.layout(334,'kyiv');g.launch();
  const initialHeight=g.height,desiredLimit=g.gridBottom+150;
  g.ball.y=g.gridBottom+20;g.ball.x=160;g.ball.vx=80;g.ball.vy=200;
  const before={...g.ball},score=g.score,lives=g.lives;
  assert.equal(g.fitHeight(desiredLimit),true);
  assert.ok(g.height<initialHeight);assert.deepEqual(g.ball,before);
  assert.equal(g.mode,'playing');assert.equal(g.score,score);assert.equal(g.lives,lives);
  assert.equal(g.fitHeight(Infinity),true);
  g.ball.y=g.paddle.y-10;const nearPaddle={...g.ball};
  assert.equal(g.fitHeight(desiredLimit),false);assert.equal(g.height,initialHeight);assert.deepEqual(g.ball,nearPaddle);
  g.ball.y=g.gridBottom+20;const safe={...g.ball};
  assert.equal(g.fitHeight(desiredLimit),true);assert.deepEqual(g.ball,safe);assert.equal(g.mode,'playing');
});
test('height changes wait until a fading ball has returned',()=>{
  const g=new Game();g.layout(334,'kyiv');g.launch();g.ball.y=g.gridBottom+20;g.updateSchedule();
  const before={...g.ball},height=g.height;
  assert.equal(g.fitHeight(g.gridBottom+150),false);assert.equal(g.height,height);assert.deepEqual(g.ball,before);assert.ok(g.returnFlight);
});
test('after a real updating hit the ball flies through new cells, fades, relights and bounces',()=>{
  for(const [width,skin] of [[390,'kyiv'],[800,'dtek']]) {
    const g=new Game();g.layout(width,skin);g.launch();
    const target=10;assert.equal(g.outages[target],1);
    while(g.lit<33)g.hit(g.outages.findIndex((off,i)=>off&&i!==target));
    const q=g.halfRect(target);
    g.ball.x=q.x+q.w/2;g.ball.y=q.y+q.h+g.ball.r+1;g.ball.vx=0;g.ball.vy=-300;
    const beforeY=g.ball.y;g.advance(8);
    assert.equal(g.updates,1);assert.equal(g.mode,'playing');assert.ok(g.returnFlight);
    assert.ok(Math.abs(g.ball.y-beforeY)<5,'the ball should not teleport');
    assert.ok(g.ball.vy>0);assert.equal(g.ballOpacity,1);
    const score=g.score,lives=g.lives,opacities=[];let overlapped=false;
    for(let i=0;i<500&&g.returnFlight;i++) {
      const b=g.ball;
      for(let index=0;index<48;index++)if(g.outages[index]) {
        const r=g.halfRect(index),x=Math.max(r.x,Math.min(b.x,r.x+r.w)),y=Math.max(r.y,Math.min(b.y,r.y+r.h));
        overlapped ||= (b.x-x)**2+(b.y-y)**2<b.r*b.r;
      }
      opacities.push(g.ballOpacity);const previousY=b.y;g.move(b.x);g.advance(8);
      if(g.returnFlight) {assert.ok(g.ball.y>previousY);assert.ok(g.ball.vy>0)}
      assert.equal(g.score,score,'cells must not be hit on the way down');
    }
    assert.ok(overlapped,'the test must exercise a flight through an outage cell');
    assert.equal(g.returnFlight,null);assert.equal(g.ballOpacity,1);assert.ok(g.ball.vy<0);
    assert.equal(g.lives,lives);assert.ok(Math.min(...opacities)<.35);
    assert.ok(opacities.at(-1)>.95,'the ball should be almost fully lit before contact');
  }
});
test('losing or resetting during a return clears the fade state',()=>{
  const g=new Game();g.launch();g.updateSchedule();assert.ok(g.returnFlight);
  g.ball.y=g.height+10;g.ball.vy=300;g.advance(20);
  assert.equal(g.mode,'serve');assert.equal(g.lives,2);assert.equal(g.returnFlight,null);assert.equal(g.ballOpacity,1);
  g.launch();g.updateSchedule();g.reset();assert.equal(g.mode,'ready');assert.equal(g.returnFlight,null);assert.equal(g.ballOpacity,1);
});
