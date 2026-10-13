import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProcedureService } from './procedure.service.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mssql',
        host: config.get<string>('database.host', '127.0.0.1'),
        port: config.get<number>('database.port', 14333),
        username: config.get<string>('database.username', 'premixtrack_user'),
        password: config.get<string>('database.password', 'PremixTrack@2026'),
        database: config.get<string>('database.database', 'PremixTrack_DB'),
        synchronize: false,
        logging: config.get<boolean>('database.logging', false),
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
        extra: {
          trustServerCertificate: true,
        },
      }),
    }),
  ],
  providers: [ProcedureService],
  exports: [ProcedureService, TypeOrmModule],
})
export class DatabaseModule {}
