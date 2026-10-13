import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Đã xảy ra lỗi nội bộ hệ thống';
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        errorCode = this.mapStatusToErrorCode(status);
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        errorCode = resObj.error || this.mapStatusToErrorCode(status);
        message = resObj.message || message;
        details = resObj.details || (Array.isArray(resObj.message) ? resObj.message : null);

        if (Array.isArray(resObj.message)) {
          message = 'Dữ liệu đầu vào không hợp lệ';
          errorCode = 'VALIDATION_FAILED';
          details = resObj.message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
      // Không để lộ chi tiết lỗi SQL ra ngoài client
      message = 'Lỗi xử lý yêu cầu hệ thống';
    }

    response.status(status).json({
      success: false,
      error: {
        code: errorCode,
        message,
        details,
      },
    });
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
