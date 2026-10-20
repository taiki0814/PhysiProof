import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {developmentCommands,ensurePortAvailable,waitForResponse,stopOwnedChild} from './dev.mjs';

describe('safe local development entry point',()=>{
  it('always migrates local D1 and runs the real backend with local bindings',()=>{
    const commands=developmentCommands(resolve('workspace with spaces'));
    expect(commands.migrate.args.slice(1)).toEqual(['d1','migrations','apply','DB','--local']);
    expect(commands.backend.args).toContain('--local');
    expect(commands.backend.args).toContain('src/index.ts');
    expect(commands.backend.args.slice(-3)).toEqual(['--log-level','warn','--show-interactive-dev-session=false']);
    expect(JSON.stringify(commands)).not.toContain('--remote');
  });
  it('uses the real Vite app on the advertised fixed loopback port, never a fixture or production API',()=>{
    const {frontend}=developmentCommands(resolve('workspace with spaces'));
    expect(frontend.args.slice(1)).toEqual(['--host','127.0.0.1','--port','5173','--strictPort']);
    expect(frontend.env).toEqual({VITE_API_URL:''});
    expect(frontend.cwd).toBe(resolve('workspace with spaces/packages/frontend'));
    expect(JSON.stringify(frontend)).not.toMatch(/qa\/|pages\.dev|workers\.dev/);
  });
  it('waits for a successful readiness response and releases response bodies',async()=>{
    const cancel=vi.fn(),fetchFn=vi.fn().mockRejectedValueOnce(new Error('not listening yet')).mockResolvedValueOnce({ok:false,body:{cancel}}).mockResolvedValueOnce({ok:true,body:{cancel}});
    await waitForResponse('http://127.0.0.1:8787/api/health',{fetchFn,intervalMs:0});
    expect(fetchFn).toHaveBeenCalledTimes(3);expect(cancel).toHaveBeenCalledTimes(2);
  });
  it('stops waiting when the owned server has exited',async()=>{
    const fetchFn=vi.fn();await expect(waitForResponse('http://127.0.0.1:8787/api/health',{alive:()=>false,fetchFn})).rejects.toThrow('stopped');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('bounds startup failures instead of pretending a dead API is ready',async()=>{
    const fetchFn=vi.fn().mockRejectedValue(new Error('not listening'));
    await expect(waitForResponse('http://127.0.0.1:8787/api/health',{fetchFn,intervalMs:1,timeoutMs:10})).rejects.toThrow('did not become ready');
  });
  it('refuses an occupied port without killing or taking over its owner',async()=>{
    const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{const {port}=server.address();await expect(ensurePortAvailable(port)).rejects.toThrow('No existing process was stopped');expect(server.listening).toBe(true);}
    finally{await new Promise(resolve=>server.close(resolve));}
  });
  it('releases its port probe without starting a persistent service',async()=>{
    await ensurePortAvailable(0);
  });
  it('stops only an owned Windows process tree with an explicit valid PID',async()=>{
    const exec=vi.fn((name,args,options,done)=>done());
    await stopOwnedChild({pid:12345,exitCode:null,signalCode:null},{platform:'win32',exec});
    expect(exec).toHaveBeenCalledWith('taskkill',['/PID','12345','/T','/F'],{windowsHide:true},expect.any(Function));
  });
  it('does not act on invalid or already exited process handles',async()=>{
    const exec=vi.fn();
    for(const child of [{pid:undefined,exitCode:null,signalCode:null},{pid:-1,exitCode:null,signalCode:null},{pid:12345,exitCode:0,signalCode:null}])
      await stopOwnedChild(child,{platform:'win32',exec});
    expect(exec).not.toHaveBeenCalled();
  });
  it('uses a graceful signal for an owned non-Windows process',async()=>{
    const kill=vi.fn();await stopOwnedChild({pid:12345,exitCode:null,signalCode:null,kill},{platform:'linux'});
    expect(kill).toHaveBeenCalledWith('SIGTERM');
  });
});
