import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const routes = {'/journal-ui.js':['src/journal-ui.ts','text/javascript'],'/':['public/index.html','text/html'],'/style.css':['public/style.css','text/css'],'/app.js':['src/app.ts','text/javascript'],'/case.js':['src/case.ts','text/javascript'],'/investigation.js':['src/investigation.ts','text/javascript']};
export const server = createServer(async (req,res)=>{
 const route=routes[new URL(req.url,'http://localhost').pathname];
 if(!route){res.writeHead(404);res.end('Not found');return;}
 try {let body=await readFile(new URL(route[0],import.meta.url),'utf8');if(route[0].endsWith('.ts'))body=stripTypeScriptTypes(body);res.writeHead(200,{'Content-Type':route[1]+'; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(body);}catch{res.writeHead(500);res.end('Unable to load application');}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('AFTERHOURS ready at http://localhost:'+ (process.env.PORT||3000)));

