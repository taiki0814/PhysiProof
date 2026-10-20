import { createStudioUniform } from './uniformStudio';
import type { StudioUniformDesign } from '../schemas/uniform-studio.schema';

export const STUDIO_UNIFORM_COLLECTION: readonly {
  id: string; name: string; category: string; description: string; sort_order: number; design: StudioUniformDesign;
}[] = [
  { id: 'studio-vector-edge', name: 'VECTOR EDGE', category: 'スポーツ', sort_order: 100,
    description: 'チャコールにライムの非対称エッジ。動きのあるサイドパネルと流星エンブレム。',
    design: { ...createStudioUniform(), model: { id: 'builtin-model-sport', revision: 1 },
      front_pattern: 'velocity', back_pattern: 'velocity', fabric: 'mesh', emblem: 'comet',
      colors: { body: '#162027', accent: '#c6f44a', detail: '#e9f2df', text: '#f5f8ed' } } },
  { id: 'studio-tidal-flow', name: 'TIDAL FLOW', category: 'スポーツ', sort_order: 110,
    description: '深いネイビーとシアンの波。裾から流れる曲線で軽快なランニングスタイルに。',
    design: { ...createStudioUniform(), model: { id: 'builtin-model-raglan', revision: 1 },
      front_pattern: 'tidal', back_pattern: 'tidal', fabric: 'knit', emblem: 'orbit',
      colors: { body: '#102d46', accent: '#47dbdd', detail: '#e2f7f1', text: '#edf9f7' } } },
  { id: 'studio-dusk-run', name: 'DUSK RUN', category: 'スポーツ', sort_order: 120,
    description: 'プラムとコーラルの夕焼けグラデーション。落ち着きと鮮やかさを両立した一着。',
    design: { ...createStudioUniform(), front_pattern: 'horizon', back_pattern: 'horizon', fabric: 'pique', emblem: 'spark',
      colors: { body: '#472b47', accent: '#f49a7c', detail: '#f7ead6', text: '#fff1df' } } },
  { id: 'studio-terrain-club', name: 'TERRAIN CLUB', category: 'アウトドア', sort_order: 130,
    description: 'フォレストグリーンに静かな等高線。山の稜線エンブレムを添えたアウトドアテイスト。',
    design: { ...createStudioUniform(), model: { id: 'builtin-model-raglan', revision: 1 },
      front_pattern: 'contour', back_pattern: 'contour', fabric: 'pique', emblem: 'summit',
      colors: { body: '#234b40', accent: '#b5cc99', detail: '#ece8d2', text: '#faf2db' } } },
  { id: 'studio-mono-pace', name: 'MONO PACE', category: 'ミニマル', sort_order: 140,
    description: 'アイボリーの生地に細い縦線。ダークな襟とワンポイントで仕上げるミニマルなクラブキット。',
    design: { ...createStudioUniform(), front_pattern: 'pinstripe', back_pattern: 'pinstripe', fabric: 'knit', emblem: 'orbit',
      name_font: 'sans', number_font: 'sans', colors: { body: '#eeeade', accent: '#5a6466', detail: '#25343c', text: '#25343c' } } },
  { id: 'studio-pixel-rush', name: 'PIXEL RUSH', category: 'ストリート', sort_order: 150,
    description: 'ナイトパープルにマゼンタのピクセル。裾に向かって広がるブロックで遊び心をプラス。',
    design: { ...createStudioUniform(), model: { id: 'builtin-model-sport', revision: 1 },
      front_pattern: 'pixel', back_pattern: 'pixel', fabric: 'mesh', emblem: 'spark',
      colors: { body: '#292344', accent: '#e78ec8', detail: '#b9edf0', text: '#f5edf7' } } },
];
