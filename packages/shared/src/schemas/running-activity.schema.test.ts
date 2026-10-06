import { describe, expect, it } from 'vitest';
import {
  completeRunningSessionSchema,
  createRunningTerritorySchema,
  startRunningSessionSchema,
} from './running-activity.schema';

describe('running activity contracts', () => {
  it('allows only the supported activity modes', () => {
    expect(startRunningSessionSchema.safeParse({ activity_mode: 'personal' }).success).toBe(true);
    expect(startRunningSessionSchema.safeParse({ activity_mode: 'team' }).success).toBe(true);
    expect(startRunningSessionSchema.safeParse({ activity_mode: 'offline' }).success).toBe(false);
  });

  it('requires an online session ID to save a territory', () => {
    const territory = {
      user_id: '11111111-1111-4111-8111-111111111111',
      latitude: 35,
      longitude: 139,
      area_sqm: 100,
      time_period: 'morning',
      area_polygon: '[[35,139],[35,139.01],[35.01,139.01]]',
    };

    expect(createRunningTerritorySchema.safeParse(territory).success).toBe(false);
    expect(createRunningTerritorySchema.safeParse({
      ...territory,
      activity_session_id: '22222222-2222-4222-8222-222222222222',
    }).success).toBe(true);
  });

  it('rejects distance without a positive duration', () => {
    expect(completeRunningSessionSchema.safeParse({ distance_m: 100, duration_sec: 0 }).success).toBe(false);
    expect(completeRunningSessionSchema.safeParse({ distance_m: 100, duration_sec: 60 }).success).toBe(true);
  });
});
