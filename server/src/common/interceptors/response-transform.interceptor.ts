import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PaginationMeta } from '../dto/pagination.dto.js';

export interface ApiResponseEnvelope<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, ApiResponseEnvelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseEnvelope<T>> {
    return next.handle().pipe(
      map((result) => {
        // Nếu kết quả trả về đã có cấu trúc data và meta
        if (result && typeof result === 'object' && 'data' in result && 'meta' in result) {
          return {
            success: true,
            message: result.message ?? 'Thao tác thành công',
            data: result.data,
            meta: result.meta,
          };
        }

        // Nếu kết quả có message tùy chỉnh
        if (result && typeof result === 'object' && 'message' in result && 'data' in result) {
          return {
            success: true,
            message: result.message,
            data: result.data,
            meta: result.meta,
          };
        }

        return {
          success: true,
          message: 'Thao tác thành công',
          data: result,
        };
      }),
    );
  }
}
