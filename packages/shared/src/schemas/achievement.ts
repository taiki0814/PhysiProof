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
    description: 'デイリーミッションを累計で 5 回以上クリアした。',
    icon: '🏆',
    requirement: 'ミッションクリア回数5回以上',
  },
  chat_scholar: {
    id: 'chat_scholar',
    title: 'AIとの対話者',
    description: 'AIフィットネスコーチとの対話（チャット送信）が 10 回に達した。',
    icon: '🎓',
    requirement: 'AIコーチへのチャット送信10回以上',
  },
};
