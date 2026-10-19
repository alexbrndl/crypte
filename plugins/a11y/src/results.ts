// What the preview sends after each analysis: only what the panel shows, since an
// axe result carries the HTML of every node it looked at. The shell's health
// audit reads it too (section 5.4): renaming or removing a field breaks the
// audit, which then names every story as unread.
export type Results = {
  type: 'a11y:results'
  // The story analysed. The panel shows nothing for another one: an analysis
  // can come back after the next story is on display.
  id: string
  passes: number
  violations: Violation[]
}

export type Violation = {
  rule: string
  impact: Impact
  help: string
  helpUrl: string
  // One CSS selector per element at fault.
  targets: string[]
}

export type Impact = 'critical' | 'serious' | 'moderate' | 'minor'
