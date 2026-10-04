export class PaymentGatewayUnavailableError extends Error {
  constructor(message = 'Payment gateway is unreachable') {
    super(message);
    this.name = 'PaymentGatewayUnavailableError';
  }
}

export class PaymentVerificationFailedError extends Error {
  constructor(
    message = 'Payment verification failed',
    readonly gatewayCode?: number,
  ) {
    super(message);
    this.name = 'PaymentVerificationFailedError';
  }
}
