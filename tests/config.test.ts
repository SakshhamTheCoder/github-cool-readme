import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig, repoKey } from '../src/config.ts';

describe('config', () => {
  it('uses the defaults for an empty file', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('merges settings over the defaults', () => {
    const c = parseConfig('include:\n  orgs: false\nlanguages:\n  repoWeights:\n    big: 0.5\n');
    expect(c.include).toEqual({ private: true, orgs: false });
    expect(c.languages.count).toBe(6);
    expect(c.languages.repoWeights).toEqual({ big: 0.5 });
  });

  it('rejects unknown settings, so typos do not pass silently', () => {
    expect(() => parseConfig('languages:\n  exclud: [PHP]\n')).toThrow('unknown setting "languages.exclud"');
  });

  it('rejects wrong types', () => {
    expect(() => parseConfig('languages:\n  count: six\n')).toThrow('"languages.count" must be a positive whole number');
    expect(() => parseConfig('languages:\n  repoWeights:\n    a: -1\n')).toThrow('repoWeights');
    expect(() => parseConfig('theme:\n  background: pink\n')).toThrow('theme.background');
    expect(() => parseConfig('background: pink\n')).toThrow('"background" must be none or a colour like 030506');
    expect(() => parseConfig('background: #030506\n')).toThrow('without #');
    expect(() => parseConfig('summary:\n  ring: octocat\n')).toThrow('"summary.ring" must be "percent" or "github"');
  });

  it('reads the background as written: none, or a colour with or without #', () => {
    const bg = (text: string) => parseConfig(text).background;
    expect(bg('')).toBe('none');
    expect(bg('background: 030506\n')).toBe('#030506'); // YAML alone would make it 30506
    expect(bg('background: 123456\n')).toBe('#123456');
    expect(bg('background: 0D1117\n')).toBe('#0d1117');
    expect(bg('background: "#fff"\n')).toBe('#fff');
    expect(bg('background: none\n')).toBe('none');
    // The settings before it: the oled panel, and classic's solid background.
    expect(bg('style: oled\ntransparent: false\n')).toBe('solid');
    expect(bg('style: oled\ntransparent: true\n')).toBe('none');
    expect(bg('theme:\n  background: solid\n')).toBe('solid');
    expect(bg('style: oled\ntransparent: false\nbackground: none\n')).toBe('none');
  });

  it('chooses the cards, each once, or none', () => {
    expect(parseConfig('').cards).toEqual(['summary', 'languages', 'contributions', 'weekly']);
    expect(parseConfig('cards: [summary, weekly]\n').cards).toEqual(['summary', 'weekly']);
    expect(parseConfig('cards:\n  - languages\n').cards).toEqual(['languages']);
    expect(() => parseConfig('cards: [summary, stars]\n')).toThrow('"cards" has "stars"; the cards are summary, languages, contributions, weekly');
    expect(parseConfig('cards: []\n').cards).toEqual([]);
    expect(() => parseConfig('cards: [weekly, weekly]\n')).toThrow('"cards" names a card twice');
    expect(() => parseConfig('cards: summary\n')).toThrow('"cards" must be a list of strings');
  });

  it('resolves repo references', () => {
    expect(repoKey('Juca', 'PedroCatalao')).toBe('pedrocatalao/juca');
    expect(repoKey('Microsoft/MS-DOS', 'pedrocatalao')).toBe('microsoft/ms-dos');
  });
});
