import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../engine.js';
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
