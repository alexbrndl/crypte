// What the preview sends the panel after each analysis: only what the panel
// shows, since an axe result carries the HTML of every node it looked at.
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
