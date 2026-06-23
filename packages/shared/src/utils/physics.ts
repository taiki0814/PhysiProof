import { Prediction, PredictionRequest } from '../schemas/prediction';

/**
 * 物理・生理学的な計算に基づく目標達成予測 (AI 障害時のフォールバック用)。
 * ハリス・ベネディクト方程式の考え方をベースに、標準的な代謝計算を行います。
 */
export const calculatePhysicsFallback = (data: PredictionRequest): Prediction => {
  
  const weightChange = data.targetWeight - data.currentWeight; // 正なら増量、負なら減量
  const isGain = weightChange > 0;
  const absWeightChange = Math.abs(weightChange);

  // 体重を 1kg 増減させるのに必要なエネルギー (約7200kcal)
  const totalEnergyNeeded = absWeightChange * 7200;

  // 1日あたりの推奨カロリー変化量
  // 減量（isGain=false）: +500 kcal 不足（Deficit）
  // 増量（isGain=true） : -500 kcal 不足（＝500 kcal 余剰/Surplus）
  const recommendedDailyChange = isGain ? -500 : 500;

  // 目標達成までの日数を算出
  const daysToTarget = absWeightChange > 0 
    ? Math.ceil(totalEnergyNeeded / 500) 
    : 0;

  const adviceText = isGain
    ? "【システム通知】AIによる高精度予測が現在利用できないため、物理計算モデルによる概算を表示しています。1日あたり 500kcal の余剰（摂取 > 消費）を目標とした標準的な増量ペースです。"
    : "【システム通知】AIによる高精度予測が現在利用できないため、物理計算モデルによる概算を表示しています。1日あたり 500kcal の不足を目標とした標準的な減量ペースです。";

  return {
    daysToTarget: daysToTarget,
    advice: adviceText,
    dailyCalorieDeficit: recommendedDailyChange,
    confidenceScore: 0.6,
    source: 'fallback'
  };
};
