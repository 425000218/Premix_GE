import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  type: 'mssql' as const,
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '14333', 10),
  username: process.env.DB_USERNAME || 'premixtrack_user',
  password: process.env.DB_PASSWORD || 'PremixTrack@2026',
  database: process.env.DB_NAME || 'PremixTrack_DB',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
  extra: {
    trustServerCertificate: true,
  },
}));
