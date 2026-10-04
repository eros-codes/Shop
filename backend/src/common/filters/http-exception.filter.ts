import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { ErrorCodes, STATUS_FALLBACK_CODES } from '../errors/error-codes';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let code: string = ErrorCodes.INTERNAL_ERROR;
    let details: Record<string, unknown> | undefined;

    if (isHttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const payload = body as {
          message?: string | string[];
          code?: string;
          details?: Record<string, unknown>;
        };
        if (payload.message !== undefined) message = payload.message;
        if (payload.code) code = payload.code;
        if (payload.details) details = payload.details;
      }

      // Nothing more specific was thrown: fall back to the status, and
      // treat the array of messages a failed DTO produces as what it is.
      if (code === ErrorCodes.INTERNAL_ERROR) {
        code = Array.isArray(message)
          ? ErrorCodes.VALIDATION_FAILED
          : (STATUS_FALLBACK_CODES[statusCode] ?? ErrorCodes.INTERNAL_ERROR);
      }
    }

    if (!isHttpException) {
      this.logger.error(this.describe(exception, request));
      Sentry.captureException(exception);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const safeMessage =
      !isHttpException && isProduction ? 'Internal server error' : message;

    response.status(statusCode).json({
      statusCode,
      // A stable name for what went wrong. Clients switch on this; the
      // message is for developers and logs.
      code,
      data: null,
      message: safeMessage,
      ...(details ? { details } : {}),
      ...(Array.isArray(message) ? { errors: message } : {}),
    });
  }

  private describe(exception: unknown, request?: Request): string {
    const error = exception as {
      name?: string;
      message?: string;
      stack?: string;
      code?: string;
      driverError?: { code?: string };
    };
    const where = request
      ? `${request.method} ${request.url}`
      : 'unknown route';
    const name = error?.name ?? typeof exception;
    const driverCode = error?.driverError?.code ?? error?.code;

    const isDatabaseError = name === 'QueryFailedError' || !!error?.driverError;
    const detail = isDatabaseError
      ? `database error${driverCode ? ` [${driverCode}]` : ''}`
      : (error?.message ?? 'no message');

    const stack = error?.stack ?? '';
    const frames = isDatabaseError
      ? stack.split('\n').slice(1).join('\n')
      : stack;

    return `${where} -> ${name}: ${detail}\n${frames}`;
  }
}
