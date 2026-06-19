import { AccelerationData } from '../types/pushup.types';

/**
 * 物理的整合性チェックのコアロジック。
 * 特定のライブラリに依存せず、KMP (Kotlin) への移植が容易な純粋関数。
 */

export const isFreeFallDetected = (sensorLog: AccelerationData[]): boolean => {
  return sensorLog.some(log => {
    const norm = Math.sqrt(log.x ** 2 + log.y ** 2 + log.z ** 2);
    return norm > 30.0; 
  });
};

/**
 * 運動データの整合性を検証する (センサーフュージョン・不正検知)。
 * @param sensorLog 加速度・ジャイロの時系列ログ
 * @param distance 移動距離 (m)
 * @param steps 歩数
 * @param activityType Android の Activity Recognition API による判定 (walking, vehicle, etc.)
 */
export const validateMovementIntegrity = (
  sensorLog: { x: number; y: number; z: number; t: number; gx?: number; gy?: number; gz?: number }[],
  distance: number,
  steps: number,
  activityType?: string
): { isValid: boolean; reason?: string } => {

  // 1. Motion Lock: 開始/終了時に特定の回転を検知したか
  // (簡易実装: ジャイロ値の最大値が一定以上あるかを確認)
  const hasMotionLock = sensorLog.some(s => Math.abs(s.gx || 0) > 5 || Math.abs(s.gy || 0) > 5);
  if (!hasMotionLock && sensorLog.length > 10) {
    return { isValid: false, reason: 'Motion Lock（開始時の回転認証）が確認できません。' };
  }

  // 2. Anti-Cheat: 乗り物利用の検知
  if (activityType === 'vehicle') {
    return { isValid: false, reason: '「乗り物」での移動が検知されたため、記録を無効化しました。' };
  }

  if (distance > 50 && steps === 0) {
    return { isValid: false, reason: '歩行を伴わない大規模な移動（乗り物利用の疑い）が検知されました。' };
  }

  // 時速換算による判定 (15km/h 以上を継続検知した場合)
  const durationInHours = sensorLog.length > 0 
    ? (sensorLog[sensorLog.length - 1].t - sensorLog[0].t) / (1000 * 60 * 60) 
    : 0;
  const speed = durationInHours > 0 ? (distance / 1000) / durationInHours : 0;
  
  if (speed > 15 && steps < (distance * 0.5)) {
    return { isValid: false, reason: '移動速度が速すぎ、かつ歩数が不足しています（乗り物利用の疑い）。' };
  }

  // 3. 筋トレ動作検知: 極端な加速度（投擲）の排除
  for (const s of sensorLog) {
    const norm = Math.sqrt(s.x ** 2 + s.y ** 2 + s.z ** 2);
    if (norm > 40) {
      return { isValid: false, reason: '不自然な加速度（端末の投擲等）が検知されました。' };
    }
  }

  return { isValid: true };
};
