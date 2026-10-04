import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiSuccessResponse<T> {
  statusCode: number;
  data: T;
  message: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T>> {
    const httpCode = this.reflector.get<number>(
      HTTP_CODE_METADATA,
      context.getHandler(),
    );
    const { method } = context.switchToHttp().getRequest<{ method: string }>();
    const defaultCode = method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK;
    const statusCode = httpCode ?? defaultCode;

    return next.handle().pipe(
      map((result) => {
        if (
          result &&
          typeof result === 'object' &&
          'message' in result &&
          typeof (result as { message: unknown }).message === 'string'
        ) {
          const typed = result as { message: string; data?: unknown };
          return {
            statusCode,
            data: 'data' in typed ? (typed.data ?? null) : null,
            message: typed.message,
          } as ApiSuccessResponse<T>;
        }

        return {
          statusCode,
          data: (result ?? null) as T,
          message: 'Success',
        };
      }),
    );
  }
}
