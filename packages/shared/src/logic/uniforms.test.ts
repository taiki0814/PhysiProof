import { describe, expect, it } from 'vitest';
import {
  UNIFORM_BASES, UNIFORM_EMBLEMS, UNIFORM_FONTS, UNIFORM_LINES,
  UNIFORM_PATTERNS, UNIFORM_POSITIONS, UNIFORM_PRESETS,
  createDefaultUniform, personalizeUniform,
} from './uniforms';
import {
  saveUniformPersonalizationSchema, saveUniformSchema,
  uniformDesignSchema, uniformPersonalizationSchema,
} from '../schemas/uniform.schema';
import type { UniformDesign } from '../schemas/uniform.schema';

const colorKeys = ['body', 'secondary', 'collar', 'pattern', 'line', 'emblem', 'text'] as const;
const numericBounds = [
  ['line_width', 2, 12],
  ['emblem_size', 0.7, 1.5],
  ['emblem_offset_x', -8, 8],
  ['emblem_offset_y', -8, 8],
] as const;

describe('uniform designs and asset catalogs', () => {
  it.each(UNIFORM_PRESETS)('accepts the complete $id preset without dropping fields', ({ design }) => {
    expect(uniformDesignSchema.parse(design)).toEqual(design);
  });

  it('keeps preset IDs unique and provides schema-valid personal and team defaults', () => {
    expect(UNIFORM_PRESETS.length).toBeGreaterThan(0);
    expect(new Set(UNIFORM_PRESETS.map(preset => preset.id)).size).toBe(UNIFORM_PRESETS.length);
    const personal = createDefaultUniform();
    const team = createDefaultUniform(true);
    expect(uniformDesignSchema.parse(personal)).toEqual(personal);
    expect(uniformDesignSchema.parse(team)).toEqual(team);
    expect(team).not.toEqual(personal);
  });

  it('creates independent defaults so editing one cannot change another or a preset', () => {
    const presetSnapshot = structuredClone(UNIFORM_PRESETS);
    const original = createDefaultUniform();
    const edited = createDefaultUniform();
    edited.colors.body = '#010203';
    edited.jersey_name = 'EDITED';
    expect(createDefaultUniform()).toEqual(original);
    expect(UNIFORM_PRESETS).toEqual(presetSnapshot);
  });

  it.each([
    ['base_id', UNIFORM_BASES],
    ['pattern_id', UNIFORM_PATTERNS],
    ['line_id', UNIFORM_LINES],
    ['emblem_id', UNIFORM_EMBLEMS],
    ['emblem_position', UNIFORM_POSITIONS],
    ['font_id', UNIFORM_FONTS],
  ] as const)('accepts every advertised %s asset and rejects unknown or injected IDs', (field, assets) => {
    for (const asset of assets) {
      expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), [field]: asset.id }).success).toBe(true);
    }
    for (const value of ['unknown', '', '../custom.svg', 'https://example.com/logo.svg', '<svg/>', 'javascript:alert(1)']) {
      expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), [field]: value }).success).toBe(false);
    }
  });

  it.each([0, 2, -1, 1.1, '1', null])('rejects unsupported design version %s', version => {
    expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), version }).success).toBe(false);
  });

  it('requires an explicit version', () => {
    const { version: _version, ...unversioned } = createDefaultUniform();
    expect(uniformDesignSchema.safeParse(unversioned).success).toBe(false);
  });

  it.each(colorKeys)('requires a six-digit hexadecimal %s color', key => {
    const design = createDefaultUniform();
    for (const color of ['#000000', '#ffffff', '#A1b2C3']) {
      expect(uniformDesignSchema.safeParse({ ...design, colors: { ...design.colors, [key]: color } }).success).toBe(true);
    }
    for (const color of [
      '#fff', '#12345678', '#gg0000', '123456', 'red', ' #123456', '#123456 ',
      'url(https://example.com/logo.svg)', 'url(javascript:alert(1))',
      '#ffffff;fill:url(#payload)', '<svg onload=alert(1)>', null, 123456,
    ]) {
      expect(uniformDesignSchema.safeParse({ ...design, colors: { ...design.colors, [key]: color } }).success).toBe(false);
    }
  });

  it.each([
    { svg: '<svg onload="alert(1)" />' },
    { image_url: 'https://example.com/logo.svg' },
    { style: 'background:url(javascript:alert(1))' },
    { user_id: 'another-user' },
  ])('rejects arbitrary design properties: %j', extra => {
    expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), ...extra }).success).toBe(false);
  });

  it('rejects extra color properties and missing required colors', () => {
    const design = createDefaultUniform();
    expect(uniformDesignSchema.safeParse({
      ...design, colors: { ...design.colors, background: 'url(javascript:alert(1))' },
    }).success).toBe(false);
    for (const key of colorKeys) {
      const colors: Partial<UniformDesign['colors']> = { ...design.colors };
      delete colors[key];
      expect(uniformDesignSchema.safeParse({ ...design, colors }).success).toBe(false);
    }
  });

  it.each(numericBounds)('enforces inclusive finite numeric bounds for %s', (field, min, max) => {
    for (const value of [min, (min + max) / 2, max]) {
      expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), [field]: value }).success).toBe(true);
    }
    for (const value of [min - 0.01, max + 0.01, Number.NaN, Infinity, -Infinity, String(min), null]) {
      expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), [field]: value }).success).toBe(false);
    }
  });
});

describe('uniform lettering validation', () => {
  it.each([
    ['', ''], ['RUNNER', '0'], ['ABCDEFGHIJKL', '999'], ['山田 太郎', '007'], ['  RUNNER  ', '42'],
  ])('accepts and trims name %j with number %j', (jersey_name, number) => {
    const lettering = { jersey_name, number };
    const expected = { jersey_name: jersey_name.trim(), number };
    expect(uniformPersonalizationSchema.parse(lettering)).toEqual(expected);
    expect(uniformDesignSchema.parse({ ...createDefaultUniform(), ...lettering })).toMatchObject(expected);
  });

  it.each(['ABCDEFGHIJKLM', 'あ'.repeat(13), '<script>alert(1)</script>', 123, null])('rejects invalid name %j', jersey_name => {
    const lettering = { jersey_name, number: '12' };
    expect(uniformPersonalizationSchema.safeParse(lettering).success).toBe(false);
    expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), ...lettering }).success).toBe(false);
  });

  it.each(['1000', '-1', '+1', '1.5', '1e2', ' 12 ', '12\n', '１２', 'abc', 12, null])('rejects invalid number %j', number => {
    const lettering = { jersey_name: 'RUNNER', number };
    expect(uniformPersonalizationSchema.safeParse(lettering).success).toBe(false);
    expect(uniformDesignSchema.safeParse({ ...createDefaultUniform(), ...lettering }).success).toBe(false);
  });

  it.each([{}, { jersey_name: 'RUNNER' }, { number: '42' }])('requires both lettering fields: %j', lettering => {
    expect(uniformPersonalizationSchema.safeParse(lettering).success).toBe(false);
  });

  it.each([
    { colors: { body: '#000000' } }, { base_id: 'tank' }, { font_id: 'mono' },
    { svg: '<svg/>' }, { user_id: 'another-user' },
  ])('rejects design or identity fields in personalization: %j', extra => {
    expect(uniformPersonalizationSchema.safeParse({ jersey_name: 'RUNNER', number: '42', ...extra }).success).toBe(false);
  });
});

describe('uniform save contracts', () => {
  it.each([0, 1, 42])('accepts revision %s for both save contracts', revision => {
    expect(saveUniformSchema.parse({ design: createDefaultUniform(), revision }).revision).toBe(revision);
    expect(saveUniformPersonalizationSchema.parse({
      personalization: { jersey_name: 'RUNNER', number: '007' }, revision,
    }).revision).toBe(revision);
  });

  it.each([-1, 0.5, '0', null, Number.NaN, Infinity, undefined])('rejects invalid or missing revision %s', revision => {
    expect(saveUniformSchema.safeParse({ design: createDefaultUniform(), revision }).success).toBe(false);
    expect(saveUniformPersonalizationSchema.safeParse({
      personalization: { jersey_name: '', number: '' }, revision,
    }).success).toBe(false);
  });

  it('rejects missing payloads, identity spoofing, and a full design in a lettering save', () => {
    expect(saveUniformSchema.safeParse({ revision: 0 }).success).toBe(false);
    expect(saveUniformPersonalizationSchema.safeParse({ revision: 0 }).success).toBe(false);
    expect(saveUniformSchema.safeParse({ design: createDefaultUniform(), revision: 0, user_id: 'victim' }).success).toBe(false);
    expect(saveUniformPersonalizationSchema.safeParse({
      personalization: { jersey_name: '', number: '' }, revision: 0, design: createDefaultUniform(),
    }).success).toBe(false);
  });
});

describe('personalizeUniform', () => {
  it.each(UNIFORM_PRESETS)('changes only lettering and preserves $id artwork and colors', ({ design }) => {
    const source = { ...design, jersey_name: 'COMMON', number: '1' };
    const before = structuredClone(source);
    const personalization = { jersey_name: 'RUNNER', number: '007' };
    const result = personalizeUniform(source, personalization);
    expect(result).toEqual({ ...before, ...personalization });
    expect(result.colors).toEqual(before.colors);
    expect(source).toEqual(before);
    expect(personalization).toEqual({ jersey_name: 'RUNNER', number: '007' });
    expect(result).not.toBe(source);
    expect(uniformDesignSchema.parse(result)).toEqual(result);
  });

  it('allows clearing both lettering fields without reverting the artwork', () => {
    const source = { ...createDefaultUniform(true), jersey_name: 'TEAM', number: '99' };
    expect(personalizeUniform(source, { jersey_name: '', number: '' })).toEqual({
      ...source, jersey_name: '', number: '',
    });
    expect(source).toMatchObject({ jersey_name: 'TEAM', number: '99' });
  });
});
