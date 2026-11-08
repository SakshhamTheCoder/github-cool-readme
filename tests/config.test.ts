import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig, repoKey, usesOldLayout } from '../src/config.ts';

describe('config', () => {
  it('uses the defaults for an empty file', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
    expect(usesOldLayout(parseConfig(''))).toBe(false);
  });

  it('merges settings over the defaults', () => {
    const c = parseConfig('count:\n  orgs: false\ncards:\n  languages:\n    repos:\n      big: 0.5\n');
    expect(c.count).toEqual({ private: true, orgs: false });
    expect(c.cards.languages.count).toBe(6);
    expect(c.cards.languages.repos).toEqual({ big: 0.5 });
    expect(c.look).toEqual(DEFAULT_CONFIG.look);
  });

  it('rejects unknown settings, so typos do not pass silently', () => {
    expect(() => parseConfig('cards:\n  languages:\n    hid: [PHP]\n')).toThrow('unknown setting "cards.languages.hid"');
    expect(() => parseConfig('look:\n  matrix: false\n')).toThrow('unknown setting "look.matrix"');
  });

  it('rejects wrong types and values', () => {
    expect(() => parseConfig('cards:\n  languages:\n    count: six\n')).toThrow('"cards.languages.count" must be a positive whole number');
    expect(() => parseConfig('cards:\n  languages:\n    repos:\n      a: -1\n')).toThrow('cards.languages.repos');
    expect(() => parseConfig('look:\n  style: fancy\n')).toThrow('"look.style" must be "classic", "oled" or "dotmatrix"');
    expect(() => parseConfig('look:\n  color: pink\n')).toThrow('"look.color" must be "github", "amber", "green", "purple", "cyan", "red" or "blue"');
    expect(() => parseConfig('look:\n  background: pink\n')).toThrow('"look.background" must be none or a colour like 030506');
    expect(() => parseConfig('look:\n  background: #030506\n')).toThrow('without #');
    expect(() => parseConfig('cards:\n  summary:\n    ring: octocat\n')).toThrow('"cards.summary.ring" must be "percent" or "github"');
  });

  it('reads the background as written: none, or a colour with or without #', () => {
    const bg = (value: string) => parseConfig(`look:\n  background: ${value}\n`).look.background;
    expect(parseConfig('').look.background).toBe('none');
    expect(bg('030506')).toBe('#030506'); // YAML alone would make it 30506
    expect(bg('123456')).toBe('#123456');
    expect(bg('0D1117')).toBe('#0d1117');
    expect(bg('"#fff"')).toBe('#fff');
    expect(bg('none')).toBe('none');
  });

  it('chooses the cards, each once, or none', () => {
    expect(parseConfig('').show).toEqual(['summary', 'languages', 'contributions', 'weekly']);
    expect(parseConfig('show: [summary, weekly]\n').show).toEqual(['summary', 'weekly']);
    expect(parseConfig('show:\n  - languages\n').show).toEqual(['languages']);
    expect(() => parseConfig('show: [summary, stars]\n')).toThrow('"show" has "stars"; the cards are summary, languages, contributions, weekly');
    expect(parseConfig('show: []\n').show).toEqual([]);
    expect(() => parseConfig('show: [weekly, weekly]\n')).toThrow('"show" names a card twice');
    expect(() => parseConfig('show: summary\n')).toThrow('"show" must be a list of strings');
  });

  it('resolves repo references', () => {
    expect(repoKey('Juca', 'PedroCatalao')).toBe('pedrocatalao/juca');
    expect(repoKey('Microsoft/MS-DOS', 'pedrocatalao')).toBe('microsoft/ms-dos');
  });
});

describe('the settings from before v1.5', () => {
  const old = (text: string) => {
    const c = parseConfig(text);
    expect(usesOldLayout(c)).toBe(true);
    return c;
  };

  it('still work, moved to the new layout', () => {
    const c = old(
      'user: octo\ncards: [weekly, summary]\ninclude:\n  orgs: false\ntheme:\n  border: true\n  animations: false\n' +
        'summary:\n  ring: github\n' +
        'languages:\n  exclude: [PHP]\n  excludeRepos: [juca]\n  repoWeights: { big: 0.5, juca: 3 }\n  other: false\n' +
        'contributions:\n  includeOpen: false\n  pin: [a/b]\n',
    );
    expect(c.user).toBe('octo');
    expect(c.show).toEqual(['weekly', 'summary']);
    expect(c.count).toEqual({ private: true, orgs: false });
    expect(c.look).toEqual({ style: 'classic', color: 'github', animations: false, background: 'none', border: true });
    expect(c.cards.summary.ring).toBe('github');
    // Left out was the same as a weight of 0, and wins over a weight.
    expect(c.cards.languages).toMatchObject({ hide: ['PHP'], repos: { big: 0.5, juca: 0 }, other: false });
    expect(c.cards.contributions).toMatchObject({ open: false, pin: ['a/b'] });
    expect(old('cards: []\n').show).toEqual([]);
  });

  it('keep the displays looking the same', () => {
    const look = (text: string) => old(text).look;
    // oled was the round LEDs, now dotmatrix; with matrix: false, the square pixels, now oled.
    expect(look('style: oled\n')).toMatchObject({ style: 'dotmatrix', color: 'amber', background: 'none' });
    expect(look('style: oled\nmatrix: false\n').style).toBe('oled');
    expect(look('style: oled\ncolor: theme\n').color).toBe('github'); // github's old name
    expect(look('style: oled\ncolor: green\n').color).toBe('green');
    expect(look('color: amber\n').color).toBe('amber');
    // The dark panel, and classic's solid background, before background.
    expect(look('style: oled\ntransparent: false\n').background).toBe('solid');
    expect(look('style: oled\ntransparent: true\n').background).toBe('none');
    expect(look('theme:\n  background: solid\n').background).toBe('solid');
    expect(look('style: oled\ntransparent: false\nbackground: none\n').background).toBe('none');
    expect(look('background: 030506\n').background).toBe('#030506');
  });

  it('check their values as before', () => {
    expect(() => parseConfig('style: fancy\n')).toThrow('"style" must be "classic" or "oled"');
    expect(() => parseConfig('theme:\n  background: pink\n')).toThrow('theme.background');
    expect(() => parseConfig('languages:\n  exclud: [PHP]\n')).toThrow('unknown setting "languages.exclud"');
    expect(() => parseConfig('background: #030506\n')).toThrow('without #');
  });

  it('are not mixed with the new layout', () => {
    expect(() => parseConfig('style: oled\nlook:\n  color: amber\n')).toThrow('"look" is in the new layout of the settings, "style" in the old one');
    expect(() => parseConfig('cards: [summary]\nshow: [weekly]\n')).toThrow('"show" is in the new layout');
  });
});
