export class GflowCliError extends Error {
  readonly exitCode: number;
  readonly retryable: boolean;

  constructor(message: string, exitCode = 1, retryable = false) {
    super(message);
    this.name = "GflowCliError";
    this.exitCode = exitCode;
    this.retryable = retryable;
  }
}

export function isGflowBridgeUnreachable(message: string): boolean {
  return /No se alcanzó el puente|Ningún Windows remoto|El Windows remoto no contestó|GFLOW_BRIDGE_URL/i.test(
    message,
  );
}
