import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. Bảo mật Security Headers bằng Helmet
  app.use(helmet());

  // 2. Kích hoạt CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  // 3. Tiền tố đường dẫn toàn cục /api/v1 (GV-06)
  app.setGlobalPrefix('api/v1');

  // 4. Validation Pipe toàn cục kiểm tra DTO (GV-05)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // 5. Interceptor đóng gói phản hồi & Ghi log truy cập (GV-07, GV-10)
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseTransformInterceptor(),
  );

  // 6. Exception Filter chuẩn hóa cấu trúc lỗi (GV-07)
  app.useGlobalFilters(new HttpExceptionFilter());

  // 7. Cấu hình Swagger OpenAPI 3.0.3 tại /api/docs (GV-12)
  const config = new DocumentBuilder()
    .setTitle('PremixTrack API')
    .setDescription('Tài liệu giao diện lập trình ứng dụng hệ thống PremixTrack')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập JWT Token xác thực',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'PremixTrack API Docs',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 PremixTrack Server đang chạy tại: http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger Documentation sẵn sàng tại: http://localhost:${port}/api/docs`);
}

await bootstrap();
