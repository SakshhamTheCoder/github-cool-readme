import { CARDS, type Card, type Config } from '../config.ts';
import type { Model } from '../compute.ts';
import { renderDisplayContributions } from '../display/contributions.ts';
import { look, type Style } from '../display/dmd.ts';
import { renderDisplayLanguages } from '../display/languages.ts';
import { renderDisplaySummary } from '../display/summary.ts';
import { renderDisplayWeekly } from '../display/weekly.ts';
import { renderContributions } from './contributions.ts';
import { renderLanguages } from './languages.ts';
import { renderSummary } from './summary.ts';
import { THEMES, type Mode } from './svg.ts';
import { renderWeekly } from './weekly.ts';

/**
 * File name -> SVG, one light and one dark variant of each card in `config.cards`, in the usual
 * card order. The same names for both styles.
 */
export function renderAll(model: Model, config: Config): Record<string, string> {
  const files: Record<string, string> = {};
  for (const mode of ['light', 'dark'] as Mode[]) {
    let render: Record<Card, () => string>;
    if (config.style === 'oled') {
      const style: Style = { look: look(config.color, mode), dots: config.matrix, animations: config.theme.animations, panel: !config.transparent };
      render = {
        summary: () => renderDisplaySummary(model.summary, style),
        languages: () => renderDisplayLanguages(model.languages, config.languages.title, style),
        contributions: () => renderDisplayContributions(model.contributions, config.contributions.title, style),
        weekly: () => renderDisplayWeekly(model.weekly, config.weekly.title, style),
      };
    } else {
      const theme = THEMES[mode];
      render = {
        summary: () => renderSummary(model.summary, theme, config),
        languages: () => renderLanguages(model.languages, theme, config),
        contributions: () => renderContributions(model.contributions, theme, config),
        weekly: () => renderWeekly(model.weekly, theme, config),
      };
    }
    for (const card of CARDS) if (config.cards.includes(card)) files[`${card}-${mode}.svg`] = render[card]();
  }
  return files;
}

/** The width each card is shown at in a README: 400, so two fit a row. Classic cards are 400 wide; OLED ones are 450, scaled. */
export function cardWidths(_config: Config): Record<string, number> {
  return { summary: 400, languages: 400, contributions: 400, weekly: 400 };
}
