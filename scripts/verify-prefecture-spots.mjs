/** Read-only external verification. Catalogue lives in :memory: SQLite only.
 * Run with Node >=22; never opens the application's local/production database.
 */
import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
const bundle = await build({entryPoints:['packages/backend/src/services/prefectureSpots.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const module = {exports:{}};
new Function('module','exports',bundle.outputFiles[0].text)(module,module.exports);
const {locatePrefecture,preparePrefectureCandidates,createPrefecturePlacement}=module.exports;
const database=new DatabaseSync(':memory:');
database.exec('CREATE TABLE battle_prefecture_candidates(prefecture_code TEXT PRIMARY KEY,candidates_json TEXT,fetched_at_ms INTEGER NOT NULL DEFAULT 0,lease_until_ms INTEGER NOT NULL DEFAULT 0,retry_after_ms INTEGER NOT NULL DEFAULT 0)');
function statement(sql,values=[]) { return {
  bind(...next){return statement(sql,next)},
  async first(){return database.prepare(sql).get(...values)??null},
  async run(){return {meta:{changes:Number(database.prepare(sql).run(...values).changes)}}},
};}
const db={prepare:sql=>statement(sql)};
const originalFetch=globalThis.fetch;
let queries=0;
globalThis.fetch=async(...args)=>{
  const started=Date.now();queries++;const response=await originalFetch(...args);
  console.log(JSON.stringify({provider:new URL(args[0]).hostname,status:response.status,elapsed_ms:Date.now()-started}));
  if(response.ok){const data=await response.clone().json();console.log(JSON.stringify({nodes:data.elements?.filter(e=>e.type==='node').length,remark:data.remark??null}));}
  return response;
};
// Ueno Park is a public verification coordinate, never the user's location.
const latitude=35.7148,longitude=139.773,located_at=new Date().toISOString();
const region=locatePrefecture(latitude,longitude,located_at);
const started=Date.now(),points=await preparePrefectureCandidates(db,region);
const {spots,bounds}=await createPrefecturePlacement(db,latitude,longitude,located_at,region.code);
await preparePrefectureCandidates(db,region); // must reuse stored candidates
console.log(JSON.stringify({prefecture:region.name,candidates:points.length,spots:spots.length,bounds,queries,elapsed_ms:Date.now()-started,storage:'in-memory only'}));
if(region.code!=='JP-13'||!spots.length||spots.length>512||bounds[2]-bounds[0]<.1)throw new Error('Prefecture-wide placement verification failed');
database.close();
