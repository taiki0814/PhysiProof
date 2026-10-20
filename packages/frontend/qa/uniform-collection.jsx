// Read-only Vite preview of the real collection and renderer; never writes data.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {STUDIO_UNIFORM_COLLECTION,personalizeUniform} from '@my-app/shared';
import UniformPreview from '../src/components/UniformPreview';
import './uniform-collection.css';

function App(){
  return <main className="collection"><header><div><p className="eyebrow">PHYSIPROOF / STUDIO COLLECTION</p><h1>走るスタイルを、選ぼう。</h1><p className="intro">新作6種 · 配色・表裏の柄・名前・背番号を編集可能</p></div><a href="/admin?tab=uniform-templates">管理画面で編集 →</a></header>
    <div className="collection-grid">{STUDIO_UNIFORM_COLLECTION.map((preset,index)=><article key={preset.id}>
      <div className="kit-art"><UniformPreview design={preset.design} label={preset.name+' 正面'}/><UniformPreview design={personalizeUniform(preset.design,{jersey_name:'RUNNER',number:'24'})} view="back" label={preset.name+' 背面の文字例'}/></div>
      <div className="kit-caption"><p className="eyebrow">0{index+1} / {preset.category}</p><h2>{preset.name}</h2><p>{preset.description}</p><div className="swatches" aria-label="配色">{Object.values(preset.design.colors).map((color,i)=><span key={i} style={{background:color}} title={color}/>)}</div></div>
    </article>)}</div><footer>ローカル確認用 · 背面の RUNNER / 24 は表示例です。保存デザインの名前・背番号は空欄です。このページからデータ保存や公開は行いません。</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
