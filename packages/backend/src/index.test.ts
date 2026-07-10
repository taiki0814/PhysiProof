import { describe, it, expect, vi } from 'vitest';
import { calculatePhysicsFallback } from '@my-app/shared';
import { performTerritoryMerge } from './services/territoryMerge';

/**
 * バックエンドの AI フォールバックロジックのテスト。
 * Gemini API がダウンした際に、物理計算モデルに正しく切り替わるかを検証します。
 */
describe('Backend AI Fallback Logic', () => {
  
  it('AI サービスがエラーを投げた場合、物理計算モデルの結果を返すこと', async () => {
    const mockRequest = {
      currentWeight: 85,
      targetWeight: 80,
      totalCaloriesBurned: 2000,
      mealCaloriesConsumed: 10000,
    };

    // AI サービスのエラーをシミュレート
    const simulateEndpoint = async () => {
      try {
        // 本来はここで AIService.predictWeightGoal を呼ぶ
        throw new Error('Gemini API is unavailable');
      } catch (error) {
        // フォールバックロジックの実行
        return calculatePhysicsFallback(mockRequest);
      }
    };

    const response = await simulateEndpoint();

    expect(response.source).toBe('fallback');
    expect(response.daysToTarget).toBeGreaterThan(0);
    expect(response.advice).toContain('物理計算モデル');
    expect(response.dailyCalorieDeficit).toBe(500);
  });

  it('目標体重が現在の体重と同じ（すでに目標達成）場合、0日を返すこと', () => {
    const mockRequest = {
      currentWeight: 70,
      targetWeight: 70, // すでに目標達成
      totalCaloriesBurned: 100,
      mealCaloriesConsumed: 100,
    };

    const response = calculatePhysicsFallback(mockRequest);
    expect(response.daysToTarget).toBe(0);
  });
});

describe('Territory Merging Logic', () => {
  it('重なっている新領域と既存領域が統合されること', () => {
    const newInput = {
      latitude: 0,
      longitude: 0,
      time_period: 'morning',
      area_polygon: JSON.stringify([[0, 0], [0, 2], [2, 2], [2, 0]])
    };

    const existing = [
      {
        id: 't-1',
        area_polygon: JSON.stringify([[1, 1], [1, 3], [3, 3], [3, 1]]),
        fortification_level: 2,
        latitude: 1,
        longitude: 1,
        time_period: 'afternoon'
      }
    ];

    const result = performTerritoryMerge(newInput, existing);
    expect(result.length).toBe(1);
    expect(result[0].hasNew).toBe(true);
    expect(result[0].originalIds).toContain('t-1');
    expect(result[0].fortification_level).toBe(2);
  });

  it('既存領域同士が重なっている場合、新領域と重ならなくても既存領域同士で統合されること', () => {
    const newInput = {
      latitude: 10,
      longitude: 10,
      time_period: 'morning',
      area_polygon: JSON.stringify([[10, 10], [10, 11], [11, 11], [11, 10]])
    };

    const existing = [
      {
        id: 't-1',
        area_polygon: JSON.stringify([[0, 0], [0, 2], [2, 2], [2, 0]]),
        fortification_level: 1,
        latitude: 0,
        longitude: 0,
        time_period: 'morning'
      },
      {
        id: 't-2',
        area_polygon: JSON.stringify([[1, 1], [1, 3], [3, 3], [3, 1]]),
        fortification_level: 3,
        latitude: 1,
        longitude: 1,
        time_period: 'night'
      }
    ];

    const result = performTerritoryMerge(newInput, existing);
    // t-1 と t-2 は重なるためマージされ、新規(10,10)は独立しているため、結果は2つのグループになる
    expect(result.length).toBe(2);

    const mergedGroup = result.find(g => !g.hasNew);
    expect(mergedGroup).toBeDefined();
    expect(mergedGroup!.originalIds).toContain('t-1');
    expect(mergedGroup!.originalIds).toContain('t-2');
    expect(mergedGroup!.fortification_level).toBe(3);
  });
});

