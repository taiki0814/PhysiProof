import type {UniformAsset} from '@my-app/shared';
import {getUniformAsset,uniformAccountKey} from '../lib/uniformStudio/client';
import {useUniformResource} from '../lib/uniformStudio/useUniformResource';

export default function UniformAssetThumbnail({asset}:{asset:UniformAsset}){
  const {value,error}=useUniformResource(()=>getUniformAsset(asset,true),[asset.id,asset.revision,uniformAccountKey()]);
  return value?.dataUrl?<img src={value.dataUrl} alt=""/>:<small role="status">{error||'画像を読み込み中…'}</small>;
}
