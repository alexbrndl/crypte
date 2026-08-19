// Two wrappers, to show what section 2.5 promises: the config's `wrap` wraps the
// file's, which wraps the component.

export function Panel({ children }: { children?: React.ReactNode }) {
  return <div data-frame="panel">{children}</div>
}

export function Tone({ children, tone }: { children?: React.ReactNode; tone?: string }) {
  return (
    <div data-frame="tone" data-tone={tone}>
      {children}
    </div>
  )
}
