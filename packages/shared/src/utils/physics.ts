import { Prediction, PredictionRequest } from '../schemas/prediction';

/**
 * 物理・生理学的な計算に基づく目標達成予測 (AI 障害時のフォールバック用)。
 * ハリス・ベネディクト方程式の考え方をベースに、標準的な代謝計算を行います。
 */
export const calculatePhysicsFallback = (data: PredictionRequest): Prediction => {
  
  // 1. 必要な減量エネルギーの計算 (脂肪 1kg = 約7200kcal)
  const weightToLose = data.currentWeight - data.targetWeight;
  const totalEnergyNeeded = weightToLose * 7200;

  // 2. 推奨される 1 日あたりのカロリー不足量 (安全な範囲: 500kcal)
  const recommendedDailyDeficit = 500;

  // 3. 目標達成までの日数を算出
  const daysToTarget = weightToLose > 0 
    ? Math.ceil(totalEnergyNeeded / recommendedDailyDeficit) 
    : 0;

  return {
    daysToTarget: daysToTarget,
    advice: "【システム通知】AIによる高精度予測が現在利用できないため、物理計算モデルによる概算を表示しています。1日あたり 500kcal の不足を目標とした標準的なペースです。",
    dailyCalorieDeficit: recommendedDailyDeficit,
    confidenceScore: 0.6,
    source: 'fallback'
  };
};
