const REPLACEMENT_PATTERN = /requires replacement/i;

export function detectsTableReplacement(cdkDiffOutput: string): boolean {
  return REPLACEMENT_PATTERN.test(cdkDiffOutput);
}
