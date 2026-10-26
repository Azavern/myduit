// Test-only stub for the `server-only` bundler marker.
//
// `server-only` throws when imported outside a React Server Component bundle.
// Node-based unit tests import server modules directly, so vitest.config.ts
// aliases the marker to this empty module.
export {};
