/**
 * カロリー消費量などの計算ロジック。
 * 将来的な Kotlin Multiplatform (KMP) への移植を考慮し、純粋な関数として定義します。
 */

/**
 * 運動の種類と回数/距離に基づき、消費カロリーの概算を計算する
 */
export const calculateCaloriesBurned = (
  type: 'pushup' | 'running' | 'walking',
  amount: number, // 回数または距離(m)
  weightKg: number = 70
): number => {
  const METS = {
    pushup: 3.8,
    running: 8.3,
    walking: 3.5,
  };

  const mets = METS[type] || 1.0;
  
  if (type === 'pushup') {
    // 簡易計算: 1回あたり 0.5 kcal 程度と仮定
    return amount * 0.5;
  } else {
    // METs 法: 1.05 * METs * 時間(h) * 体重(kg)
    // 速度を 8km/h (running), 4km/h (walking) と仮定して時間に変換
    const speedKmh = type === 'running' ? 8 : 4;
    const hours = (amount / 1000) / speedKmh;
    return 1.05 * mets * hours * weightKg;
  }
};
