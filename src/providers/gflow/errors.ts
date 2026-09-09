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
