import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const base=process.env.QA_URL||'http://127.0.0.1:4173',out='output/layout-qa';
await mkdir(out,{recursive:true});
const results=[];
const palettes={
  'kyiv-light':{on:'#ffffff',off:'#15243e'},
  'kyiv-dark':{on:'#10395e',off:'#0d0e13'},
  'dtek-light':{on:'#ffffff',off:'#d2d3d5'},
  'dtek-dark':{on:'#202327',off:'#575b62'}
};
try {
  for(const viewport of [{width:320,height:568},{width:1366,height:768}]) {
    for(const skin of ['dtek','kyiv']) for(const theme of ['light','dark']) {
      const mobile=viewport.width<600;
      const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
      await page.goto(`${base}/?skin=${skin}&theme=${theme}`);await page.evaluate(()=>document.fonts.ready);
      const metrics=await page.evaluate(()=>{
        const s=JSON.parse(render_game_to_text()),canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
        const pad=s.width<570?12:20,gap=s.width<570?7:9,tw=(s.width-pad*2-gap*(s.columns-1))/s.columns,th=Math.min(58,Math.max(38,tw*.56));
        const sample=(hour,part)=>{
          const x=pad+hour%s.columns*(tw+gap)+tw*(part==='left'?.25:.75);
          const y=16+Math.floor(hour/s.columns)*(th+gap)+th*.25;
          const p=ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data;
          return '#'+[...p].slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join('');
        };
        const status=document.querySelector('.status-bar');
        return {width:s.width,columns:s.columns,overflow:document.documentElement.scrollWidth>innerWidth,statusOverflow:status.scrollWidth>status.clientWidth,
          on:sample(0,'left'),off:sample(5,'left'),halfOff:sample(12,'left'),halfOn:sample(12,'right')};
      });
      assert.equal(metrics.overflow,false,'page overflow');assert.equal(metrics.statusOverflow,false,'status overflow');
      assert.equal(metrics.columns,mobile?4:6);
      const palette=palettes[`${skin}-${theme}`];
      assert.equal(metrics.on,palette.on);assert.equal(metrics.off,palette.off);
      assert.equal(metrics.halfOff,palette.off);assert.equal(metrics.halfOn,palette.on);
      await page.screenshot({path:`${out}/${skin}-${theme}-${viewport.width}-ready.png`,fullPage:true});
      await page.locator('#start').click();await page.evaluate(()=>advanceTime(0));
      const before=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(before.mode,'playing');
      if(mobile) {
        const b=await page.locator('#game').boundingBox();await page.touchscreen.tap(b.x+15,b.y+b.height-25);
        const after=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(after.paddle.x<before.paddle.x,'touch paddle');
      } else {
        await page.keyboard.down('ArrowRight');await page.evaluate(()=>advanceTime(100));await page.keyboard.up('ArrowRight');
        const after=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(after.paddle.x>before.paddle.x,'keyboard paddle');
      }
      await page.evaluate(()=>advanceTime(800));
      await page.screenshot({path:`${out}/${skin}-${theme}-${viewport.width}-playing.png`,fullPage:true});
      assert.deepEqual(errors,[]);results.push({viewport,skin,theme,metrics,controls:'passed',errors});await context.close();
    }
  }
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
} finally {await browser.close()}
