import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

// An error that says what went wrong in a form a client can act on:
// a stable code, plus whatever numbers the message mentions (how many
// are left, which minimum applies) so the storefront can build its own
// sentence in its own language.
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: Record<string, unknown>,
  ) {
    super({ message, code, details }, status);
  }

  static badRequest(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static notFound(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(code, message, HttpStatus.NOT_FOUND, details);
  }

  static conflict(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }

  static unauthorized(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(code, message, HttpStatus.UNAUTHORIZED, details);
  }
}
