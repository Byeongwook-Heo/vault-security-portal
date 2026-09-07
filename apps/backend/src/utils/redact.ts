const secretKeys = ["token", "password", "secret", "credential", "privateKey", "clientSecret"];

export function maskValue(value: string): string {
  if (value.length <= 8) {
    return "********";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function redact<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => redact(item)) as T;
  }
  if (input && typeof input === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (secretKeys.some((secretKey) => key.toLowerCase().includes(secretKey.toLowerCase()))) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redact(value);
      }
    }
    return output as T;
  }
  return input;
}
