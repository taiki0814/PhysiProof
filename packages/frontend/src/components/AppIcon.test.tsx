import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppIcon, { LegacyIcon, legacyIconName, type AppIconName } from './AppIcon';

// Keep the registry private while checking that every supported name renders on the server.
const ICON_NAMES = [
  'home', 'map', 'run', 'team', 'ranking', 'uniform', 'predict', 'meal', 'chat', 'friends',
  'admin', 'bell', 'logout', 'navigation', 'info', 'activity', 'flame', 'timer', 'footprints',
  'battle', 'medal', 'award', 'goal', 'settings', 'search', 'chevron', 'success', 'warning',
  'error', 'loading', 'energy', 'user', 'heart', 'exercise', 'calendar', 'send', 'plus',
  'close', 'edit', 'delete', 'bot', 'globe', 'offline', 'pin', 'compass', 'gauge', 'target',
  'download', 'document', 'announcement', 'eye', 'hidden', 'lock', 'arrow', 'play', 'stop',
  'pause', 'locate', 'layers', 'menu', 'back', 'copy', 'check', 'refresh', 'ban', 'key',
  'weight', 'monitor', 'radio', 'filter', 'handshake', 'sound', 'mute',
  'palette', 'education', 'castle', 'mountain',
] as const satisfies readonly AppIconName[];

const allNamesCovered: Exclude<AppIconName, (typeof ICON_NAMES)[number]> extends never ? true : never = true;

describe('AppIcon SSR', () => {
  it('covers the complete public icon-name union', () => {
    expect(allNamesCovered).toBe(true);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it.each(ICON_NAMES)('renders %s as a decorative, non-focusable SVG', (name) => {
    const markup = renderToStaticMarkup(<AppIcon name={name} />);
    expect(markup).toMatch(/^<svg\b/);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toContain('role="img"');
    expect(markup).not.toContain('aria-label=');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('stroke-width="2"');
    expect(markup).toContain('width="1em"');
    expect(markup).toContain('height="1em"');
    expect(markup).toMatch(/class="[^"]*\bpp-icon\b/);
  });

  it('exposes a labeled icon as an image instead of hiding it', () => {
    const markup = renderToStaticMarkup(<AppIcon name="info" label="説明" />);
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="説明"');
    expect(markup).not.toContain('aria-hidden=');
    expect(markup).toContain('focusable="false"');
  });

  it('keeps an empty label decorative', () => {
    const markup = renderToStaticMarkup(<AppIcon name="close" label="" />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role="img"');
  });

  it.each([20, 24, 28, '2em', '100%'])('passes through size %s for both dimensions', (size) => {
    const markup = renderToStaticMarkup(<AppIcon name="team" size={size} />);
    expect(markup).toContain(`width="${size}"`);
    expect(markup).toContain(`height="${size}"`);
  });

  it('preserves custom classes and inline styles without losing common icon styling', () => {
    const markup = renderToStaticMarkup(
      <AppIcon name="loading" className="status-icon pp-icon-spin" style={{ color: '#00ff88', marginRight: 4 }} />,
    );
    expect(markup).toMatch(/class="[^"]*\bpp-icon\b[^\"]*\bstatus-icon\b[^\"]*\bpp-icon-spin\b/);
    expect(markup).toContain('color:#00ff88');
    expect(markup).toContain('margin-right:4px');
    expect(markup).toContain('stroke="currentColor"');
  });

  it('escapes a label rather than injecting markup', () => {
    const markup = renderToStaticMarkup(<AppIcon name="warning" label={'<script>alert("icon")</script>'} />);
    expect(markup).toContain('aria-label="&lt;script&gt;alert(&quot;icon&quot;)&lt;/script&gt;"');
    expect(markup).not.toContain('<script>');
  });
});

describe('LegacyIcon SSR', () => {
  const knownIcons: readonly (readonly [string, AppIconName])[] = [
    ['🏠', 'home'], ['🗺️', 'map'], ['🗺', 'map'], ['🏃', 'run'], ['🏃‍♂️', 'run'],
    ['👥', 'team'], ['🛡️', 'admin'], ['🏆', 'ranking'], ['👕', 'uniform'], ['💬', 'chat'],
    ['⚔️', 'battle'], ['🏅', 'award'], ['🥇', 'medal'], ['🔥', 'flame'], ['⏱️', 'timer'],
    ['🔑', 'key'], ['⚠️', 'warning'], ['✅', 'success'], ['🔍', 'search'], ['🤝', 'handshake'],
    ['🎨', 'palette'], ['🎓', 'education'], ['🏰', 'castle'], ['🏔️', 'mountain'],
  ];

  it.each(knownIcons)('maps %s to %s without rendering its original glyph', (glyph, name) => {
    expect(legacyIconName(glyph)).toBe(name);
    const markup = renderToStaticMarkup(<LegacyIcon glyph={glyph} />);
    expect(markup).toBe(renderToStaticMarkup(<AppIcon name={name} />));
    expect(markup).not.toContain(glyph);
  });

  it.each(['unknown-icon', '', '🦄', '🏠 user text'])('uses the default fallback for unknown metadata %j', (glyph) => {
    expect(legacyIconName(glyph)).toBe('award');
    expect(renderToStaticMarkup(<LegacyIcon glyph={glyph} />))
      .toBe(renderToStaticMarkup(<AppIcon name="award" />));
  });

  it('uses a requested fallback and forwards accessibility, size, class and style props', () => {
    const props = { label: '通知', size: 28, className: 'notice-icon', style: { color: '#00d4ff' } };
    expect(legacyIconName('new-metadata', 'bell')).toBe('bell');
    expect(renderToStaticMarkup(<LegacyIcon glyph="new-metadata" fallback="bell" {...props} />))
      .toBe(renderToStaticMarkup(<AppIcon name="bell" {...props} />));
  });

  it('prefers a known mapping over a requested fallback', () => {
    expect(legacyIconName('👥', 'warning')).toBe('team');
    expect(renderToStaticMarkup(<LegacyIcon glyph="👥" fallback="warning" />))
      .toBe(renderToStaticMarkup(<AppIcon name="team" />));
  });

  it.each([
    '<script>alert("icon")</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg onload=alert(1)>',
    'javascript:alert(1)',
  ])('never renders unsafe metadata %j as markup or text', (glyph) => {
    const markup = renderToStaticMarkup(<LegacyIcon glyph={glyph} />);
    expect(markup).toBe(renderToStaticMarkup(<AppIcon name="award" />));
    expect(markup).not.toContain(glyph);
    expect(markup).not.toMatch(/<script|<img|onerror=|onload=|javascript:/i);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('treats inherited object key %s as unknown metadata', (glyph) => {
    expect(legacyIconName(glyph)).toBe('award');
    expect(renderToStaticMarkup(<LegacyIcon glyph={glyph} />))
      .toBe(renderToStaticMarkup(<AppIcon name="award" />));
  });
});
