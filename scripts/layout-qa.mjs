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
  for(const viewport of [{width:320,height:568},{width:360,height:689},{width:375,height:667},{width:390,height:720},{width:390,height:844},{width:1366,height:768}]) {
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
        const title=document.querySelector('.heading h1').getBoundingClientRect();
        const toggle=document.querySelector('#theme-toggle').getBoundingClientRect();
        const picker=document.querySelector('.skin-picker').getBoundingClientRect();
        const overlay=document.querySelector('#overlay').getBoundingClientRect();
        const gameBox=canvas.getBoundingClientRect();
        const footer=document.querySelector('footer').getBoundingClientRect();
        const legend=document.querySelector('.below-game').getBoundingClientRect();
        const eyebrow=getComputedStyle(document.querySelector('.heading p')).display;
        return {width:s.width,columns:s.columns,overflow:document.documentElement.scrollWidth>innerWidth,statusOverflow:status.scrollWidth>status.clientWidth,
          playSpace:s.height-(16+Math.ceil(24/s.columns)*(th+gap)-gap),
          overlayCenter:overlay.top+overlay.height/2,gameCenter:gameBox.top+gameBox.height/2,footerBottom:footer.bottom,legendBottom:legend.bottom,
          title:{top:title.top,bottom:title.bottom},toggle:{top:toggle.top,bottom:toggle.bottom},picker:{top:picker.top,height:picker.height},eyebrow,
          on:sample(0,'left'),off:sample(5,'left'),halfOff:sample(7,'left'),halfOn:sample(7,'right')};
      });
      assert.equal(metrics.overflow,false,'page overflow');assert.equal(metrics.statusOverflow,false,'status overflow');
      assert.equal(metrics.columns,mobile?4:6);
      if(mobile) assert.ok(metrics.playSpace>=150&&metrics.playSpace<=224);
      else assert.equal(metrics.playSpace,220);
      if(mobile) {
        assert.equal(metrics.eyebrow,'none');
        assert.ok(Math.abs(metrics.overlayCenter-metrics.gameCenter)<2,'start control must be centered in the field');
        assert.ok(metrics.toggle.top<metrics.title.bottom&&metrics.toggle.bottom>metrics.title.top,'theme toggle must align with title');
        assert.ok(metrics.picker.top>=metrics.toggle.bottom&&metrics.picker.height<=38,'skin picker must be below title and compact');
        if(viewport.width===360&&viewport.height===689)assert.ok(metrics.footerBottom<=viewport.height-8&&metrics.legendBottom<=viewport.height-8,'custom-tab viewport must show lower content');
      }
      const palette=palettes[`${skin}-${theme}`];
      assert.equal(metrics.on,palette.on);assert.equal(metrics.off,palette.off);
      assert.equal(metrics.halfOff,palette.off);assert.equal(metrics.halfOn,palette.on);
      const name=`${skin}-${theme}-${viewport.width}x${viewport.height}`;
      await page.screenshot({path:`${out}/${name}-ready.png`,fullPage:true});
      await page.locator('#start').click();await page.evaluate(()=>advanceTime(0));
      const before=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.equal(before.mode,'playing');
      if(mobile) {
        const shell=await page.locator('.game-shell').boundingBox();
        assert.ok(shell.y>=-1&&shell.y+shell.height<=viewport.height+1,`the entire game should fit after starting: ${JSON.stringify({shell,viewport})}`);
        const legend=await page.locator('.below-game').boundingBox(),footer=await page.locator('footer').boundingBox();
        assert.ok(legend.y+legend.height<=viewport.height-1&&footer.y+footer.height<=viewport.height-1,'legend and footer must be visible after starting');
        await page.screenshot({path:`${out}/${name}-viewport.png`});
        const b=await page.locator('#game').boundingBox();await page.touchscreen.tap(b.x+15,b.y+b.height-25);
        const after=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(after.paddle.x<before.paddle.x,'touch paddle');
      } else {
        await page.keyboard.down('ArrowRight');await page.evaluate(()=>advanceTime(100));await page.keyboard.up('ArrowRight');
        const after=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert.ok(after.paddle.x>before.paddle.x,'keyboard paddle');
      }
      await page.evaluate(()=>advanceTime(800));
      await page.screenshot({path:`${out}/${name}-playing.png`,fullPage:true});
      assert.deepEqual(errors,[]);results.push({viewport,skin,theme,metrics,controls:'passed',errors});await context.close();
    }
  }
  await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
} finally {await browser.close()}
