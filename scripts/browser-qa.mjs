import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const base=process.env.QA_URL||'http://127.0.0.1:4173';
const out='output/playwright';await mkdir(out,{recursive:true});
const results=[];
try{
for(const viewport of [{width:1440,height:1100},{width:390,height:844}]){
  for(const skin of ['dtek','kyiv'])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<600,hasTouch:viewport.width<600});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',err=>errors.push(err.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
    await page.goto(`${base}/?skin=${skin}&theme=${theme}`);await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow');
    const name=`${skin}-${theme}-${viewport.width}`;
    const overlayBox=await page.locator('#overlay').boundingBox();
    const canvasBox=await page.locator('#game').boundingBox();
    const ready=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
    const gridBottom=Math.max(...ready.outages.map(q=>q.y+q.h));
    if(viewport.width<600) {
      assert.ok(Math.abs((overlayBox.y+overlayBox.height/2)-(canvasBox.y+canvasBox.height/2))<2,'start overlay is not centered');
    } else assert.ok(overlayBox.y>=canvasBox.y+gridBottom,'desktop start overlay hides schedule');
    await page.screenshot({path:`${out}/${name}-ready.png`,fullPage:true});
    await page.locator('#start').click();
    await page.evaluate(()=>window.advanceTime(150));
    let state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(state.mode,'playing');
    const before=state.paddle.x;
    await page.keyboard.down('ArrowRight');await page.evaluate(()=>window.advanceTime(100));await page.keyboard.up('ArrowRight');
    state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.ok(state.paddle.x>before);
    await page.locator('#pause').click();
    const paused=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(paused.mode,'paused');
    await page.evaluate(()=>window.advanceTime(700));assert.deepEqual(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).ball,paused.ball);
    await page.locator('#start').click();await page.evaluate(()=>window.advanceTime(0));
    // Follow the actual ball using real pointer input. No state injection.
    const frameLimit=skin==='dtek'&&viewport.width===1440&&theme==='light'?1800:550;
    const requiredUpdates=frameLimit===1800?2:1;
    for(let frame=0;frame<frameLimit;frame++){
      state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));
      if(state.updates>=requiredUpdates)break;
      if(state.mode==='serve'||state.mode==='paused'){await page.locator('#start').click();await page.evaluate(()=>window.advanceTime(0))}
      if(state.mode==='over')break;
      const box=await page.locator('#game').boundingBox();
      const candidates=state.outages.filter(q=>q.y+q.h===Math.max(...state.outages.map(r=>r.y+r.h)));
      const brick=candidates.sort((a,b)=>Math.abs(a.x+a.w/2-state.ball.x)-Math.abs(b.x+b.w/2-state.ball.x))[0];
      const angle=Math.max(-.9,Math.min(.9,Math.atan2(brick.x+brick.w/2-state.ball.x,state.paddle.y-brick.y-brick.h)));
      const target=state.ball.x-angle/1.05*state.paddle.w/2;
      await page.mouse.move(box.x+Math.max(4,Math.min(state.width-4,target)),box.y+state.height-25);
      await page.evaluate(()=>window.advanceTime(60));
    }
    state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.ok(state.score>0,'no brick collision');
    await writeFile(`${out}/${name}-state.json`,JSON.stringify(state,null,2));
    if(frameLimit===1800)assert.ok(state.updates>=2,`recurring graph update not observed during live play: ${JSON.stringify({score:state.score,mode:state.mode,lives:state.lives,updates:state.updates})}`);
    await page.screenshot({path:`${out}/${name}-playing.png`,fullPage:true});
    // Theme toggle must preserve progress; skin change must safely pause.
    const score=state.score,updatesObserved=state.updates;
    await page.locator('#theme-toggle').click();assert.equal(JSON.parse(await page.evaluate(()=>window.render_game_to_text())).score,score);
    await page.locator(`[data-skin-choice="${skin==='kyiv'?'dtek':'kyiv'}"]`).click();
    state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(state.score,score);assert.equal(state.mode,'paused');
    await page.locator('#restart').click();state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(state.score,0);assert.equal(state.lives,3);assert.equal(state.mode,'ready');
    assert.deepEqual(errors,[]);
    results.push({name,score,updatesObserved,errors});
    await context.close();
  }
}
// True touch events, independent from mouse emulation.
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();await page.goto(`${base}/?skin=kyiv&theme=dark`);await page.locator('#start').tap();await page.evaluate(()=>window.advanceTime(0));
const box=await page.locator('#game').boundingBox();
await page.touchscreen.tap(box.x+55,box.y+box.height-40);
const touch=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.ok(touch.paddle.x<100,'touch paddle did not move');
await context.close();results.push({touch:'passed'});
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
