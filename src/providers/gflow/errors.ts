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
  return /No se alcanzó el puente|Ningún Windows remoto|El Windows remoto no contestó|GFLOW_BRIDGE_URL|no está conectado/i.test(
    message,
  );
}

export function isGflowBridgeOfflineError(message: string): boolean {
  return /no está conectado|Ningún Windows remoto|No se alcanzó el puente|El Windows remoto no contestó/i.test(
    message,
  );
}
