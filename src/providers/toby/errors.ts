export class TobyError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "TobyError";
    this.retryable = retryable;
  }
}
