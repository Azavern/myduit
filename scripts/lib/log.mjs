// Operator script output. Never print credentials: these helpers redact any
// value that looks like a connection string, a hex/64-char secret, or a token.

const REDACTIONS = [
  [/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://<redacted>"],
  [/\b[0-9a-f]{64}\b/gi, "<redacted-hex64>"],
  [/\b[A-Za-z0-9_-]{40,}\b/g, "<redacted-token>"],
];

export function redact(value) {
  let text = String(value);
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  return text;
}

export function info(message) {
  process.stdout.write(`${redact(message)}\n`);
}

export function step(message) {
  process.stdout.write(`\n▸ ${redact(message)}\n`);
}

export function ok(message) {
  process.stdout.write(`  ✓ ${redact(message)}\n`);
}

export function warn(message) {
  process.stdout.write(`  ! ${redact(message)}\n`);
}

export function fail(message) {
  process.stderr.write(`  ✗ ${redact(message)}\n`);
}

/** Prints the error (redacted) and exits with the given code. */
export function die(error, code = 1) {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(code);
}
