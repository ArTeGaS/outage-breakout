import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.png':'image/png'};
createServer(async(req,res)=>{
  try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/sites/outage-breakout/'?'/index.html':new URL(req.url,'http://localhost').pathname.replace(/^\/sites\/outage-breakout/,'')||'/index.html'));
    const target=path===root?resolve(root,'index.html'):path;
    if(!target.startsWith(root+sep)){res.writeHead(403);res.end();return}
    const content=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(content);
  }catch{res.writeHead(404);res.end('Not found')}
}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('http://127.0.0.1:'+(process.env.PORT||4173)));
