import type { UniformDesign, UniformPersonalization } from '../schemas/uniform.schema';

export const UNIFORM_BASES = [
  { id: 'classic', name: '半袖' }, { id: 'raglan', name: 'ラグラン' }, { id: 'tank', name: 'ノースリーブ' },
] as const;
export const UNIFORM_PATTERNS = [
  { id: 'plain', name: '無地' }, { id: 'diagonal', name: '斜め帯' }, { id: 'chevron', name: 'Vライン' },
  { id: 'split', name: 'ツートン' }, { id: 'gradient', name: 'グラデーション' }, { id: 'ink', name: 'インク' },
  { id: 'grid', name: '格子' }, { id: 'lightning', name: '稲妻' },
] as const;
export const UNIFORM_LINES = [
  { id: 'none', name: 'なし' }, { id: 'shoulder', name: '肩ライン' }, { id: 'side', name: 'サイド' },
  { id: 'sleeve', name: '袖口' }, { id: 'arc', name: 'アーチ' }, { id: 'slash', name: 'スラッシュ' },
] as const;
export const UNIFORM_EMBLEMS = [
  { id: 'none', name: 'なし' }, { id: 'shield', name: '盾' }, { id: 'flame', name: '炎' },
  { id: 'bolt', name: '稲妻' }, { id: 'wing', name: '翼' }, { id: 'star', name: '星' },
  { id: 'mountain', name: '山' }, { id: 'wave', name: '波' }, { id: 'paw', name: '足跡' },
] as const;
export const UNIFORM_POSITIONS = [
  { id: 'chest_left', name: '左胸' }, { id: 'chest_center', name: '胸中央' },
  { id: 'sleeve_left', name: '左肩' }, { id: 'back', name: '背面下部' },
] as const;
export const UNIFORM_FONTS = [
  { id: 'block', name: 'スポーツ' }, { id: 'rounded', name: '丸文字' }, { id: 'mono', name: 'モノスペース' },
] as const;

export function createDefaultUniform(team = false): UniformDesign {
  return {
    version: 1, base_id: 'classic', pattern_id: team ? 'chevron' : 'diagonal',
    line_id: 'side', emblem_id: team ? 'shield' : 'bolt',
    colors: { body: team ? '#123043' : '#151c2c', secondary: '#253449', collar: '#ffffff',
      pattern: team ? '#00d4ff' : '#a8ff3e', line: '#ffffff', emblem: '#ffffff', text: '#ffffff' },
    line_width: 5, emblem_position: 'chest_left', emblem_size: 1,
    emblem_offset_x: 0, emblem_offset_y: 0, font_id: 'block', jersey_name: '', number: '',
  };
}

export function personalizeUniform(design: UniformDesign, personalization: UniformPersonalization): UniformDesign {
  return { ...design, ...personalization };
}

// Original designs only; no third-party brand logos or copied brand motifs.
export const UNIFORM_PRESETS: readonly { id: string; name: string; design: UniformDesign }[] = [
  { id: 'volt', name: 'VOLT RUN', design: createDefaultUniform() },
  { id: 'tide', name: 'TIDE CREW', design: createDefaultUniform(true) },
  { id: 'ink', name: 'INK DASH', design: { ...createDefaultUniform(), pattern_id: 'ink', emblem_id: 'paw',
    colors: { ...createDefaultUniform().colors, body: '#291742', pattern: '#ff53c7', line: '#ffd166' } } },
  { id: 'sunrise', name: 'SUNRISE', design: { ...createDefaultUniform(), base_id: 'tank', pattern_id: 'gradient',
    line_id: 'arc', emblem_id: 'mountain', colors: { ...createDefaultUniform().colors, body: '#ff7348', pattern: '#ffcc33', line: '#241e37' } } },
  { id: 'storm', name: 'STORM', design: { ...createDefaultUniform(), base_id: 'raglan', pattern_id: 'lightning',
    line_id: 'shoulder', emblem_id: 'wing', colors: { ...createDefaultUniform().colors, body: '#192531', pattern: '#8faaff', secondary: '#384d63' } } },
  { id: 'grid', name: 'CITY GRID', design: { ...createDefaultUniform(), pattern_id: 'grid', line_id: 'slash',
    emblem_id: 'star', colors: { ...createDefaultUniform().colors, body: '#123929', pattern: '#40e7ad', line: '#ffdb70' } } },
];
