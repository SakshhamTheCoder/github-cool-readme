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
    expect(() => parseConfig('summary:\n  ring: octocat\n')).toThrow('"summary.ring" must be "percent" or "github"');
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
