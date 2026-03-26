export const SCHEMA_COVERAGE_LABEL = 'Pflichtfelder'

export const SCHEMA_COVERAGE_EXPLANATION =
  'Misst nur die im Schema als Pflicht definierten Felder. Optionale Review-Felder zählen hier nicht mit.'

export function formatSchemaCoverage(score: number): string {
  return `${Math.round(score * 100)}%`
}

export function formatSchemaCoverageSummary(score: number): string {
  return `${formatSchemaCoverage(score)} der Pflichtfelder ausgefüllt`
}
