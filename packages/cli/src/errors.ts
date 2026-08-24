// The error the CLI shows a user, with no stack trace.
// The original cause is kept: it is not printed, but it stays reachable for
// whoever looks for where a failure three levels down came from.

export class ConfigError extends Error {}

// What to show for a value thrown from somewhere we do not control: a plugin's
// hook, a file read. Shared rather than copied, two copies having already
// diverged once in this repository.
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
