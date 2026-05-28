import { describe, it, expect } from 'vitest';
import { validateMovementIntegrity } from './movement';

/**
 * 運動整合性バリデーションのユニットテスト。
 * 正常な運動データと、不正（チート）とみなされる異常データの判定を検証します。
 */
describe('Movement Integrity Validation', () => {
  
  it('正常な加速度データと歩数の組み合わせを承認すること', () => {
    const normalLog = [
      { x: 0, y: 9.8, z: 0, t: 100 },
      { x: 0.5, y: 10.2, z: -0.2, t: 200 },
    ];
    const result = validateMovementIntegrity(normalLog, 10, 20); // 10m, 20歩
    expect(result.isValid).toBe(true);
  });

  it('極端な加速度（端末の投擲）を検知して拒否すること', () => {
    const abnormalLog = [
      { x: 0, y: 45.0, z: 0, t: 100 }, // 重力加速を大幅に超える加速度
    ];
    const result = validateMovementIntegrity(abnormalLog, 1, 1);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('不自然な加速度');
  });

  it('歩行が伴わない大規模な移動（乗り物利用）を検知して拒否すること', () => {
    // 500m 移動しているのに 0 歩の場合
    const result = validateMovementIntegrity([], 500, 0); 
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('歩行を伴わない');
  });

  it('微小な移動であれば歩数が少なくても許容すること', () => {
    const result = validateMovementIntegrity([], 5, 2); 
    expect(result.isValid).toBe(true);
  });
});
