// One-command LOCAL development. Never use remote D1/KV or a production API.
import {spawn,execFile} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function developmentCommands(root){
  const backend=resolve(root,'packages/backend'),frontend=resolve(root,'packages/frontend');
  const wrangler=resolve(root,'node_modules/wrangler/wrangler-dist/cli.js');
  return {
    migrate:{cwd:backend,args:[wrangler,'d1','migrations','apply','DB','--local']},
    backend:{cwd:backend,args:[wrangler,'dev','src/index.ts','--local','--ip','127.0.0.1','--port','8787','--log-level','warn','--show-interactive-dev-session=false']},
    frontend:{cwd:frontend,args:[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5173','--strictPort'],env:{VITE_API_URL:''}},
  };
}
export function ensurePortAvailable(port){
  return new Promise((resolve,reject)=>{
    const server=createServer();
    server.once('error',()=>reject(new Error(`Port ${port} is already in use. Stop that local server before running npm run dev. No existing process was stopped.`)));
    server.listen(port,'127.0.0.1',()=>server.close(resolve));
  });
}
export async function waitForResponse(url,{fetchFn=fetch,alive=()=>true,timeoutMs=30000,intervalMs=250}={}){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
    if(!alive())throw new Error('Local server stopped before it was ready.');
    try{
      const res=await fetchFn(url,{signal:AbortSignal.timeout(1500)});
      if(res.ok){await res.body?.cancel();return;}
      await res.body?.cancel();
    }catch{/* retry bounded local startup failures */}
    await new Promise(resolve=>setTimeout(resolve,intervalMs));
  }
  throw new Error(`Local server did not become ready: ${url}`);
}
export async function stopOwnedChild(child,{platform=process.platform,exec=execFile}={}){
  if(!Number.isInteger(child.pid)||child.pid<=0||child.exitCode!==null||child.signalCode!==null)return;
  if(platform==='win32'){
    // Only process trees returned by our own spawn calls. Never kill by name/port.
    await new Promise(resolve=>exec('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>resolve()));
  }else child.kill('SIGTERM');
}
export async function runDevelopment(root=fileURLToPath(new URL('../',import.meta.url))){
  await ensurePortAvailable(8787);await ensurePortAvailable(5173);
  const commands=developmentCommands(root),children=new Set();let stopping=false;
  const stop=async(code)=>{
    if(stopping)return;stopping=true;process.exitCode=code;
    await Promise.all([...children].map(child=>stopOwnedChild(child)));
  };
  const interrupted=()=>{void stop(0);};
  process.once('SIGINT',interrupted);process.once('SIGTERM',interrupted);
  function launch(command,server=false){
    const child=spawn(process.execPath,command.args,{cwd:command.cwd,env:{...process.env,CI:'1',...command.env},stdio:['ignore','inherit','inherit'],windowsHide:true});
    children.add(child);
    child.once('error',()=>{console.error('Could not start a local development process.');void stop(1);});
    child.once('exit',code=>{children.delete(child);if(server&&!stopping){console.error(`Local server exited (${code??'signal'}). Stopping the other development server.`);void stop(code||1);}});
    return child;
  }
  try{
    console.log('Applying pending migrations to LOCAL D1 only...');
    const migration=launch(commands.migrate);
    await new Promise((resolve,reject)=>{migration.once('error',reject);migration.once('exit',code=>code===0?resolve():reject(new Error('Local migration failed; servers were not started.')));});
    if(stopping)return;
    const backend=launch(commands.backend,true);
    const alive=()=>!stopping&&backend.exitCode===null&&backend.signalCode===null;
    await waitForResponse('http://127.0.0.1:8787/api/health',{alive});
    if(stopping)return;
    const frontend=launch(commands.frontend,true);
    await waitForResponse('http://127.0.0.1:5173/',{alive:()=>alive()&&frontend.exitCode===null&&frontend.signalCode===null});
    if(!stopping)console.log('\nLocal admin: http://127.0.0.1:5173/admin?tab=uniform-templates\nLocal app:   http://127.0.0.1:5173/dashboard\nLocal D1/KV and logins are separate from production. Ctrl+C stops both servers.');
  }catch(error){await stop(1);console.error(error instanceof Error?error.message:'Local startup failed.');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runDevelopment().catch(error=>{console.error(error.message);process.exitCode=1;});
}
