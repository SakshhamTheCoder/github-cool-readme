import { CARDS, type Card, type Config } from '../config.ts';
import type { Model } from '../compute.ts';
import { renderDisplayAbout } from '../display/about.ts';
import { renderDisplayContributions } from '../display/contributions.ts';
import { look, type Style } from '../display/dmd.ts';
import { renderDisplayLanguages } from '../display/languages.ts';
import { renderDisplayStreaks } from '../display/streaks.ts';
import { renderDisplaySummary } from '../display/summary.ts';
import { renderDisplayWeekly } from '../display/weekly.ts';
import { renderAbout } from './about.ts';
import { renderContributions } from './contributions.ts';
import { renderLanguages } from './languages.ts';
import { renderSummary } from './summary.ts';
import { renderStreaks } from './streaks.ts';
import { surfaceOf, themeFor, type Mode } from './svg.ts';
import { renderWeekly } from './weekly.ts';

/**
 * File name -> SVG, one light and one dark variant of each card in `config.show`, in the usual
 * card order. The same names for every style.
 */
export function renderAll(model: Model, config: Config): Record<string, string> {
  const files: Record<string, string> = {};
  const bg = config.look.background;
  const colour = bg.startsWith('#') ? bg : null;
  for (const viewer of ['light', 'dark'] as Mode[]) {
    // On a colour of your own, every viewer sees the same card, in the shades that suit the colour.
    const mode = colour ? surfaceOf(colour) : viewer;
    const theme = themeFor(mode, config.look.color);
    let render: Record<Card, () => string>;
    if (config.look.style !== 'classic') {
      // Amber and green go darker only where they'd be on something light: no panel on a light page, or a light colour.
      const l = look(config.look.color, mode, bg === 'solid' || (colour !== null && mode === 'dark'));
      const background = bg === 'none' ? null : bg === 'solid' ? l.panel : colour;
      const style: Style = { look: l, dots: config.look.style === 'dotmatrix', animations: config.look.animations, background };
      render = {
        summary: () => renderDisplaySummary(model.summary, style),
        languages: () => renderDisplayLanguages(model.languages, config.cards.languages.title, style),
        contributions: () => renderDisplayContributions(model.contributions, config.cards.contributions.title, style),
        weekly: () => renderDisplayWeekly(model.weekly, config.cards.weekly.title, style),
        streaks: () => renderDisplayStreaks(model.streaks, model.streakDays, config.cards.streaks.title, style),
        about: () => renderDisplayAbout(config.cards.about, style),
      };
    } else {
      render = {
        summary: () => renderSummary(model.summary, theme, config),
        languages: () => renderLanguages(model.languages, theme, config),
        contributions: () => renderContributions(model.contributions, theme, config),
        weekly: () => renderWeekly(model.weekly, theme, config),
        streaks: () => renderStreaks(model.streaks, model.streakDays, theme, config),
        about: () => renderAbout(theme, config),
      };
    }
    for (const card of CARDS) if (config.show.includes(card)) files[`${card}-${viewer}.svg`] = render[card]();
  }
  return files;
}

/** The width each card is shown at in a README: 400, so two fit a row. Classic cards are 400 wide; OLED ones are 450, scaled. */
export function cardWidths(_config: Config): Record<string, number> {
  return Object.fromEntries(CARDS.map((card) => [card, 400]));
}
