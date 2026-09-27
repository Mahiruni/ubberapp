export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error('Missing required server environment variable: ' + name);
  }
  return value.trim();
}

export function optionalServerEnv(name: string): string {
  return process.env[name]?.trim() || '';
}

export function requireServiceEnv(enabledFlag: string, names: string[]) {
  if (process.env[enabledFlag] !== 'true') return;
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error('NexRide service configuration is incomplete: ' + missing.join(', '));
  }
}
