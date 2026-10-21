// A node of `Tree`: a key, a label, and its children when it has some.
export interface TreeNode {
  key: string
  label: string
  children?: TreeNode[]
  // Drawn at the right of the row, a branch's number of entries for instance.
  count?: number
  // Greyed out, still reachable: a row a filter leaves aside.
  dimmed?: boolean
  // `false`: a click folds the row rather than choosing it, a folder's.
  selectable?: boolean
  // What the row is, set as `data-kind` for the consumer to style or find it.
  kind?: string
}
