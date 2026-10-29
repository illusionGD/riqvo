import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { map } from 'rxjs';
import { apiResponse, codeForStatus } from '@riqvo/contracts';

/** 所有控制器成功结果统一封装。 */
export class HttpResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((data: unknown) => apiResponse(data ?? null)));
  }
}
/** 框架错误及未知异常统一封装，未知异常不回显细节。 */
@Catch()
export class HttpResponseFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const data =
      status === 503 && typeof body === 'object' && body !== null && 'checks' in body ? body : null;
    host
      .switchToHttp()
      .getResponse()
      .status(status)
      .json(apiResponse(data, codeForStatus(status)));
  }
}
