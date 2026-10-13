import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface AttemptRecord {
  attempts: number;
  firstAttemptTime: number;
  blockedUntil?: number;
}

@Injectable()
export class RateLimiterService {
  private readonly attemptsMap = new Map<string, AttemptRecord>();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 phút
  private readonly BLOCK_DURATION_MS = 15 * 60 * 1000; // Khóa 15 phút

  /**
   * Kiểm tra IP có đang bị tạm khóa hay không
   */
  checkRateLimit(ip: string): void {
    const record = this.attemptsMap.get(ip);
    if (!record) return;

    const now = Date.now();

    // Nếu đang trong thời gian bị khóa
    if (record.blockedUntil && record.blockedUntil > now) {
      const remainingSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      throw new HttpException(
        {
          code: 'TOO_MANY_REQUESTS',
          message: `IP tạm thời bị khóa do đăng nhập sai quá ${this.MAX_FAILED_ATTEMPTS} lần. Vui lòng thử lại sau ${remainingSeconds} giây.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Nếu thời gian khóa đã hết, xóa record cũ
    if (record.blockedUntil && record.blockedUntil <= now) {
      this.attemptsMap.delete(ip);
      return;
    }

    // Nếu quá cửa sổ 15 phút, reset bộ đếm
    if (now - record.firstAttemptTime > this.WINDOW_MS) {
      this.attemptsMap.delete(ip);
    }
  }

  /**
   * Ghi nhận một lần đăng nhập thất bại từ IP
   */
  recordFailedAttempt(ip: string): void {
    const now = Date.now();
    let record = this.attemptsMap.get(ip);

    if (!record || now - record.firstAttemptTime > this.WINDOW_MS) {
      record = { attempts: 1, firstAttemptTime: now };
    } else {
      record.attempts += 1;
    }

    if (record.attempts >= this.MAX_FAILED_ATTEMPTS) {
      record.blockedUntil = now + this.BLOCK_DURATION_MS;
    }

    this.attemptsMap.set(ip, record);
  }

  /**
   * Đăng nhập thành công -> xóa bỏ bộ đếm của IP
   */
  resetAttempts(ip: string): void {
    this.attemptsMap.delete(ip);
  }
}
