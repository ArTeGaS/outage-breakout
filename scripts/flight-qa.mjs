import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const base=process.env.QA_URL||'http://127.0.0.1:4173',out='output/flight-qa';
await mkdir(out,{recursive:true});
const results=[];
try {
  for(const scenario of [
    {name:'mobile-kyiv-dark',width:390,height:844,skin:'kyiv',theme:'dark'},
    {name:'desktop-dtek-light',width:1366,height:768,skin:'dtek',theme:'light'}
  ]) {
    const mobile=scenario.width<600;
    const context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.goto(`${base}/?skin=${scenario.skin}&theme=${scenario.theme}`);
    await page.locator('#start').click();
    await page.evaluate(()=>{
      window.advanceTime(0);
      window.testTick=(ms=40)=>{
        const s=JSON.parse(window.render_game_to_text()),canvas=document.querySelector('#game'),r=canvas.getBoundingClientRect();
        if(s.mode==='serve') {document.querySelector('#start').click();window.advanceTime(0)}
        if(s.mode==='over')return s;
        let target=s.ball.x;
        if(!s.ball.returning&&s.outages.length){
          const bottom=Math.max(...s.outages.map(q=>q.y+q.h));
          const brick=s.outages.filter(q=>q.y+q.h===bottom).sort((a,b)=>Math.abs(a.x+a.w/2-s.ball.x)-Math.abs(b.x+b.w/2-s.ball.x))[0];
          const angle=Math.max(-.9,Math.min(.9,Math.atan2(brick.x+brick.w/2-s.ball.x,s.paddle.y-brick.y-brick.h)));
          target=s.ball.x-angle/1.05*s.paddle.w/2;
        }
        target=Math.max(4,Math.min(s.width-4,target));
        canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.left+target*r.width/s.width,clientY:r.top+r.height-25}));
        window.advanceTime(ms);
        return JSON.parse(window.render_game_to_text());
      };
    });
    const update=await page.evaluate(()=>{
      let before=JSON.parse(render_game_to_text());
      for(let i=0;i<6500;i++) {
        const after=window.testTick(40);
        if(after.updates>0)return {before,after,frames:i+1};
        if(after.mode==='over')return {before,after,frames:i+1};
        before=after;
      }
      return {before,after:JSON.parse(render_game_to_text()),frames:6500};
    });
    assert.equal(update.after.updates,1,`${scenario.name}: no update during play`);
    assert.equal(update.after.mode,'playing');assert.equal(update.after.ball.returning,true);assert.ok(update.after.ball.vy>0);
    const delta=Math.hypot(update.after.ball.x-update.before.ball.x,update.after.ball.y-update.before.ball.y);
    assert.ok(delta<45,`${scenario.name}: unexpected position jump ${delta}`);
    const lightSlots=Array.from({length:48},(_,i)=>!update.after.outages.some(q=>q.index===i));
    const periods=[];
    for(let i=0;i<48;) {if(!lightSlots[i]){i++;continue}const start=i;while(i<48&&lightSlots[i])i++;periods.push([start,i])}
    assert.equal(periods.length,3);
    for(const [a,b] of periods)assert.ok(b-a>=3&&b-a<=5 || b-a===2&&(a===0||b===48));
    const dim=await page.evaluate(()=>{
      const samples=[];
      for(let i=0;i<300;i++) {
        const s=JSON.parse(render_game_to_text());samples.push({y:s.ball.y,opacity:s.ball.opacity,returning:s.ball.returning,score:s.score,lives:s.lives});
        if(s.ball.returning&&s.ball.opacity<.36)return {state:s,samples};
        if(!s.ball.returning)return {state:s,samples};
        window.testTick(8);
      }
      return {state:JSON.parse(render_game_to_text()),samples};
    });
    assert.equal(dim.state.ball.returning,true);assert.ok(dim.state.ball.opacity<.36);
    assert.equal(dim.state.score,update.after.score);assert.equal(dim.state.lives,update.after.lives);
    await page.screenshot({path:`${out}/${scenario.name}-dim.png`});
    // Pause and resume in mid-flight must not change position or opacity.
    await page.locator('#pause').click();const paused=JSON.parse(await page.evaluate(()=>render_game_to_text()));
    assert.equal(paused.mode,'paused');await page.evaluate(()=>advanceTime(500));
    const still=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.deepEqual(still.ball,paused.ball);
    await page.locator('#start').click();await page.evaluate(()=>advanceTime(0));
    const bright=await page.evaluate(()=>{
      const samples=[];
      for(let i=0;i<500;i++) {
        const s=JSON.parse(render_game_to_text());samples.push({y:s.ball.y,opacity:s.ball.opacity,returning:s.ball.returning,score:s.score,lives:s.lives});
        if(s.ball.returning&&s.ball.opacity>.88)return {state:s,samples};
        if(!s.ball.returning)return {state:s,samples};
        window.testTick(8);
      }
      return {state:JSON.parse(render_game_to_text()),samples};
    });
    assert.equal(bright.state.ball.returning,true);assert.ok(bright.state.ball.opacity>.88);
    assert.equal(bright.state.score,update.after.score);assert.equal(bright.state.lives,update.after.lives);
    await page.screenshot({path:`${out}/${scenario.name}-bright.png`});
    const bounce=await page.evaluate(()=>{
      for(let i=0;i<300;i++) {const s=window.testTick(8);if(!s.ball.returning)return s}
      return JSON.parse(render_game_to_text());
    });
    assert.equal(bounce.mode,'playing');assert.equal(bounce.ball.returning,false);assert.equal(bounce.ball.opacity,1);
    assert.ok(bounce.ball.vy<0);assert.equal(bounce.score,update.after.score);assert.equal(bounce.lives,update.after.lives);
    await page.screenshot({path:`${out}/${scenario.name}-bounce.png`});
    assert.deepEqual(errors,[]);
    results.push({scenario:scenario.name,framesToUpdate:update.frames,positionDelta:delta,
      initial: {y:update.after.ball.y,opacity:update.after.ball.opacity},
      dim:{y:dim.state.ball.y,opacity:dim.state.ball.opacity},
      bright:{y:bright.state.ball.y,opacity:bright.state.ball.opacity},
      bounce:{y:bounce.ball.y,opacity:bounce.ball.opacity,vy:bounce.ball.vy},periods,pause:'passed',errors});
    await context.close();
  }
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
} finally {await browser.close()}
