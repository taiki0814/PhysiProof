import { z } from 'zod';

export const achievementSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  achievement_id: z.string(),
  unlocked_at: z.string(),
});

export type Achievement = z.infer<typeof achievementSchema>;

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  requirement: string;
  retired?: boolean;
}

export const ACHIEVEMENT_DEFINITIONS: Record<string, AchievementDefinition> = {
  first_close: {
    id: 'first_close',
    title: '境界線の開拓者',
    description: '初めてマップ上で領域を囲み、土地を支配した。',
    icon: '🗺️',
    requirement: '初めてのテリトリー獲得',
  },
  calorie_burst: {
    id: 'calorie_burst',
    title: 'カロリーバースト',
    description: '1日の総消費カロリーが 1,000 kcal を突破した。',
    icon: '🔥',
    requirement: '1日累計消費カロリー1,000kcal以上',
  },
  customizer: {
    id: 'customizer',
    title: '自己の証明',
    description: 'アバターにカスタムプロフィール画像をアップロードして設定した。',
    icon: '🎨',
    requirement: 'カスタムアバター画像の設定',
  },
  conqueror: {
    id: 'conqueror',
    title: 'サイバー侵略者',
    description: '他プレイヤーの支配領域と重なるエリアを走ることで、土地を削り取った。',
    icon: '⚔️',
    requirement: '他人の領地を上書き・浸食',
  },
  pushup_master: {
    id: 'pushup_master',
    title: '筋鉄の意志',
    description: '累計の腕立て伏せ計測回数が 100 回を突破した。',
    icon: '💪',
    requirement: '腕立て伏せ累計100回達成',
    retired: true,
  },
  territory_monarch: {
    id: 'territory_monarch',
    title: 'テリトリーキング',
    description: '支配領域の保有数が 10 箇所を突破した。',
    icon: '👑',
    requirement: '支配領域の保有数が10箇所以上',
  },
  mission_champion: {
    id: 'mission_champion',
    title: 'ミッションコレクター',
    description: 'ランニングのデイリーミッションを累計で 5 回以上クリアした。',
    icon: '🏆',
    requirement: 'ランニングミッションクリア回数5回以上',
  },
  chat_scholar: {
    id: 'chat_scholar',
    title: 'AIとの対話者',
    description: 'AIフィットネスコーチとの対話（チャット送信）が 10 回に達した。',
    icon: '🎓',
    requirement: 'AIコーチへのチャット送信10回以上',
  },
  calorie_champion: {
    id: 'calorie_champion',
    title: 'カロリーマネージャー',
    description: '食事の画像解析・記録を累計で 10 回以上行った。',
    icon: '🥗',
    requirement: '食事解析記録10回以上',
    retired: true,
  },
  first_fortress: {
    id: 'first_fortress',
    title: '要塞の守護者',
    description: '支配領域のいずれかの防衛レベルを 3 以上に強化した。',
    icon: '🏰',
    requirement: '防衛レベル3以上の領土保有',
    retired: true,
  },
  world_traveler: {
    id: 'world_traveler',
    title: 'ワールドトラベラー',
    description: '支配領域の移動距離が累計で 10,000 メートル（10km）を突破した。',
    icon: '🏃',
    requirement: '累計移動距離10km以上',
  },
  active_streak: {
    id: 'active_streak',
    title: 'テリトリーオーバーロード',
    description: '支配領域の総占有面積が累計で 1,000 ㎡ を突破した。',
    icon: '🏔️',
    requirement: '累計支配面積1,000㎡以上',
  },
};
