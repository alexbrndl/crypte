// The error the CLI shows a user, with no stack trace.
// The original cause is kept: it is not printed, but it stays reachable for
// whoever looks for where a failure three levels down came from.

export class ConfigError extends Error {}
