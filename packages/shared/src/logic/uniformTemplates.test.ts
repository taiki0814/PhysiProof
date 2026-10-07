import { describe, expect, it } from 'vitest';
import {
  adminUniformTemplateQuerySchema, createDefaultUniform, saveUniformTemplateSchema,
  uniformTemplateListSchema, uniformTemplateMetadataSchema, uniformTemplateQuerySchema,
  uniformTemplateSchema,
} from '@my-app/shared';
import type { UniformTemplate, UniformTemplateMetadata } from '@my-app/shared';

const metadata = (): UniformTemplateMetadata => ({
  name: 'VOLT RUN', category: 'スポーツ', description: '走るためのユニフォーム',
  status: 'draft', sort_order: 10,
});
const save = () => ({ ...metadata(), design: createDefaultUniform(), revision: 0 });
const template = (): UniformTemplate => ({
  ...save(), id: 'template-1', revision: 1,
  created_at: '2026-10-07 01:00:00', updated_at: '2026-10-07 01:00:00',
});

describe('uniform template metadata', () => {
  it('trims user-facing text before validating its length', () => {
    expect(uniformTemplateMetadataSchema.parse({
      ...metadata(), name: '  VOLT RUN  ', category: '  スポーツ  ', description: '  説明  ',
    })).toEqual({ ...metadata(), description: '説明' });
  });

  it.each([
    { field: 'name', min: 1, max: 50 },
    { field: 'category', min: 1, max: 30 },
    { field: 'description', min: 0, max: 160 },
  ] as const)('enforces inclusive text limits for $field', ({ field, min, max }) => {
    for (const length of [min, max]) {
      const text = 'あ'.repeat(length);
      expect(uniformTemplateMetadataSchema.parse({ ...metadata(), [field]: `  ${text}  ` })[field]).toBe(text);
    }
    expect(uniformTemplateMetadataSchema.safeParse({ ...metadata(), [field]: 'あ'.repeat(max + 1) }).success).toBe(false);
    if (min > 0) {
      expect(uniformTemplateMetadataSchema.safeParse({ ...metadata(), [field]: ' \t\n ' }).success).toBe(false);
    }
    for (const value of [null, undefined, 123]) {
      expect(uniformTemplateMetadataSchema.safeParse({ ...metadata(), [field]: value }).success).toBe(false);
    }
  });

  it.each(['draft', 'published', 'hidden'])('accepts status %s', status => {
    expect(uniformTemplateMetadataSchema.parse({ ...metadata(), status }).status).toBe(status);
  });

  it.each(['all', 'public', 'PUBLISHED', '', null, undefined])('rejects invalid or missing status %j', status => {
    expect(uniformTemplateMetadataSchema.safeParse({ ...metadata(), status }).success).toBe(false);
  });

  it.each([0, 1, 999999])('accepts sort order %s', sort_order => {
    expect(uniformTemplateMetadataSchema.parse({ ...metadata(), sort_order }).sort_order).toBe(sort_order);
  });

  it.each([-1, 0.5, 1000000, '0', null, undefined, Number.NaN, Infinity])('rejects invalid sort order %s', sort_order => {
    expect(uniformTemplateMetadataSchema.safeParse({ ...metadata(), sort_order }).success).toBe(false);
  });

  it('does not accept extra metadata or save-envelope fields', () => {
    expect(uniformTemplateMetadataSchema.safeParse({ ...metadata(), thumbnail_url: 'https://example.com/image.svg' }).success).toBe(false);
    for (const extra of [{ user_id: 'admin' }, { id: 'chosen-id' }, { created_at: 'yesterday' }]) {
      expect(saveUniformTemplateSchema.safeParse({ ...save(), ...extra }).success).toBe(false);
    }
  });
});

describe('uniform template design and revision contracts', () => {
  it.each([0, 1, 42])('accepts save revision %s without mutating the input', revision => {
    const value = { ...save(), revision, design: { ...createDefaultUniform(), jersey_name: '  RUNNER  ' } };
    const before = structuredClone(value);
    expect(saveUniformTemplateSchema.parse(value)).toEqual({
      ...value, design: { ...value.design, jersey_name: 'RUNNER' },
    });
    expect(value).toEqual(before);
  });

  it.each([-1, 0.5, '0', null, undefined, Number.NaN, Infinity])('rejects invalid save revision %s', revision => {
    expect(saveUniformTemplateSchema.safeParse({ ...save(), revision }).success).toBe(false);
  });

  it.each([
    { field: 'base_id', value: 'sweatshirt' },
    { field: 'pattern_id', value: 'unknown' },
    { field: 'line_id', value: 'three-stripes' },
    { field: 'emblem_id', value: 'https://example.com/logo.svg' },
    { field: 'emblem_position', value: 'outside' },
    { field: 'font_id', value: 'external-font' },
    { field: 'version', value: 2 },
  ])('rejects an unsupported design $field in saves and records', ({ field, value }) => {
    const design = { ...createDefaultUniform(), [field]: value };
    expect(saveUniformTemplateSchema.safeParse({ ...save(), design }).success).toBe(false);
    expect(uniformTemplateSchema.safeParse({ ...template(), design }).success).toBe(false);
  });

  it('validates nested colors and forbids arbitrary artwork properties', () => {
    for (const design of [
      { ...createDefaultUniform(), colors: { ...createDefaultUniform().colors, body: 'red' } },
      { ...createDefaultUniform(), svg: '<svg onload="alert(1)" />' },
    ]) {
      expect(saveUniformTemplateSchema.safeParse({ ...save(), design }).success).toBe(false);
      expect(uniformTemplateSchema.safeParse({ ...template(), design }).success).toBe(false);
    }
    expect(saveUniformTemplateSchema.safeParse({ ...metadata(), revision: 0 }).success).toBe(false);
  });

  it('requires a nonempty bounded ID and positive persisted revision', () => {
    expect(uniformTemplateSchema.parse(template())).toEqual(template());
    expect(uniformTemplateSchema.parse({ ...template(), id: 'x'.repeat(64), revision: 42 }).revision).toBe(42);
    for (const id of ['', 'x'.repeat(65), null, undefined]) {
      expect(uniformTemplateSchema.safeParse({ ...template(), id }).success).toBe(false);
    }
    for (const revision of [0, -1, 0.5, '1', null, undefined]) {
      expect(uniformTemplateSchema.safeParse({ ...template(), revision }).success).toBe(false);
    }
    for (const field of ['created_at', 'updated_at'] as const) {
      expect(uniformTemplateSchema.safeParse({ ...template(), [field]: undefined }).success).toBe(false);
    }
  });
});

describe('uniform template catalog queries', () => {
  const defaults = { search: '', category: '', page: '1', limit: '12' };

  it('defaults public and admin queries, with all-status access only in the admin contract', () => {
    expect(uniformTemplateQuerySchema.parse({})).toEqual(defaults);
    expect(adminUniformTemplateQuerySchema.parse({})).toEqual({ ...defaults, status: 'all' });
    expect(uniformTemplateQuerySchema.parse({ status: 'all' })).toEqual(defaults);
  });

  it.each(['all', 'draft', 'published', 'hidden'])('accepts admin filter %s', status => {
    expect(adminUniformTemplateQuerySchema.parse({ status }).status).toBe(status);
  });

  it.each(['public', 'deleted', 'ALL', '', null])('rejects invalid admin filter %j', status => {
    expect(adminUniformTemplateQuerySchema.safeParse({ status }).success).toBe(false);
  });

  it('trims search/category without interpreting punctuation or SQL-like text', () => {
    const search = "%_' OR 1=1 --";
    const query = { search: `  ${search}  `, category: '  スポーツ  ', page: '2', limit: '24' };
    const expected = { search, category: 'スポーツ', page: '2', limit: '24' };
    expect(uniformTemplateQuerySchema.parse(query)).toEqual(expected);
    expect(adminUniformTemplateQuerySchema.parse(query)).toEqual({ ...expected, status: 'all' });
  });

  it('enforces trimmed search and category length bounds', () => {
    for (const schema of [uniformTemplateQuerySchema, adminUniformTemplateQuerySchema]) {
      expect(schema.safeParse({ search: ` ${'a'.repeat(80)} `, category: ` ${'あ'.repeat(30)} ` }).success).toBe(true);
      expect(schema.safeParse({ search: 'a'.repeat(81) }).success).toBe(false);
      expect(schema.safeParse({ category: 'あ'.repeat(31) }).success).toBe(false);
    }
  });

  it.each(['1', '2', '99999'])('accepts page %s', page => {
    for (const schema of [uniformTemplateQuerySchema, adminUniformTemplateQuerySchema]) {
      expect(schema.parse({ page }).page).toBe(page);
    }
  });

  it.each(['0', '01', '-1', '1.5', '100000', ' 1 ', '', 1, null])('rejects invalid page %j', page => {
    for (const schema of [uniformTemplateQuerySchema, adminUniformTemplateQuerySchema]) {
      expect(schema.safeParse({ page }).success).toBe(false);
    }
  });

  it.each(['12', '24'])('accepts page size %s', limit => {
    for (const schema of [uniformTemplateQuerySchema, adminUniformTemplateQuerySchema]) {
      expect(schema.parse({ limit }).limit).toBe(limit);
    }
  });

  it.each(['0', '1', '25', '1000', '', 12, null])('rejects invalid page size %j', limit => {
    for (const schema of [uniformTemplateQuerySchema, adminUniformTemplateQuerySchema]) {
      expect(schema.safeParse({ limit }).success).toBe(false);
    }
  });
});

describe('uniform template list responses', () => {
  it('accepts empty and populated catalogs', () => {
    const empty = { templates: [], total: 0, categories: [] };
    const populated = { templates: [template()], total: 42, categories: ['スポーツ', 'インク'] };
    expect(uniformTemplateListSchema.parse(empty)).toEqual(empty);
    expect(uniformTemplateListSchema.parse(populated)).toEqual(populated);
  });

  it('rejects invalid counts, category types, or an invalid nested template', () => {
    const value = { templates: [template()], total: 1, categories: ['スポーツ'] };
    for (const total of [-1, 0.5, '1', undefined]) {
      expect(uniformTemplateListSchema.safeParse({ ...value, total }).success).toBe(false);
    }
    expect(uniformTemplateListSchema.safeParse({ ...value, categories: [1] }).success).toBe(false);
    expect(uniformTemplateListSchema.safeParse({ ...value, templates: [{ ...template(), status: 'unknown' }] }).success).toBe(false);
  });
});
