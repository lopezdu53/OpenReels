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

/** gflow-cli DEBUGGING.md — fail immediately, no mp4 wait / no WAF retry loop. */
export const GFLOW_FAIL_FAST_CODES = new Set([3, 5, 10, 23, 31, 36]);

const GFLOW_EXIT_HINT: Record<number, string> = {
  3: "La sesión de Flow caducó (gflow exit 3). En el Puente pulsa Entrar a Flow.",
  5: "Flow bloqueó el prompt por política de contenido (gflow exit 5). No se encoló el clip.",
  7: "gflow no pudo bajar el clip (exit 7). Si ya se cobró, usa gflow data download.",
  10: "Google rechazó el envío: actividad inusual (gflow exit 10). No se cobró. El Puente pausa la cola.",
  23: "gflow no encontró un control de Flow (exit 23). Actualiza gflow-cli.",
  31: "Flow mandó la cuenta a /about (gflow exit 31). Confirma la cuenta en Chrome.",
  36: "Esta cuenta está en flow.google.com (gflow exit 36). No se encoló el clip.",
};

export function isGflowFailFast(exitCode: number): boolean {
  return GFLOW_FAIL_FAST_CODES.has(exitCode);
}

export function gflowFriendlyExit(exitCode: number, fallback?: string): string {
  return GFLOW_EXIT_HINT[exitCode] ?? fallback ?? `gflow exit ${exitCode}`;
}
