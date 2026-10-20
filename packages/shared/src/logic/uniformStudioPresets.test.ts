import { describe, expect, it } from 'vitest';
import { STUDIO_UNIFORM_COLLECTION, STUDIO_PATTERN_CHOICES, STUDIO_EMBLEM_CHOICES,
  studioPatternSchema, studioEmblemSchema, uniformDesignSchema, saveUniformTemplateSchema,
  builtinUniformAsset, uniformAssetReferences, personalizeUniform } from '../index';

describe('original Studio collection', () => {
  it('adds six distinct named patterns without reusing old catalog identities', () => {
    expect(STUDIO_UNIFORM_COLLECTION).toHaveLength(6);
    expect(new Set(STUDIO_UNIFORM_COLLECTION.map(p => p.id)).size).toBe(6);
    expect(new Set(STUDIO_UNIFORM_COLLECTION.map(p => p.design.front_pattern)).size).toBe(6);
    expect(STUDIO_UNIFORM_COLLECTION.every(p => p.id.startsWith('studio-'))).toBe(true);
  });
  it.each(STUDIO_UNIFORM_COLLECTION)('accepts $name as an editable version-2 template with bundled model only', p => {
    expect(uniformDesignSchema.parse(p.design)).toEqual(p.design);
    const { id: _id, ...metadata } = p;
    expect(saveUniformTemplateSchema.parse({ ...metadata, status: 'published', revision: 0 }).design).toEqual(p.design);
    expect(uniformAssetReferences(p.design)).toEqual([{ kind: 'model', ref: p.design.model }]);
    expect(builtinUniformAsset(p.design.model)?.status).toBe('published');
    expect(p.design.jersey_name).toBe(''); expect(p.design.number).toBe('');
    const personalized = personalizeUniform(p.design, { jersey_name: 'RUNNER', number: '012' });
    expect(personalized).toMatchObject({ colors: p.design.colors, jersey_name: 'RUNNER', number: '012' });
    expect(p.design.number).toBe('');
  });
  it('keeps UI choices valid and rejects arbitrary drawing/markup strings', () => {
    for (const [code] of STUDIO_PATTERN_CHOICES) expect(studioPatternSchema.parse(code)).toBe(code);
    for (const [code] of STUDIO_EMBLEM_CHOICES) expect(studioEmblemSchema.parse(code)).toBe(code);
    for (const bad of ['<svg onload=evil>', '__proto__', 'constructor', 'unknown']) {
      expect(studioPatternSchema.safeParse(bad).success).toBe(false);
      expect(studioEmblemSchema.safeParse(bad).success).toBe(false);
    }
  });
});
