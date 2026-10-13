/**
 * Tiện ích quản lý ngày giờ chuẩn hệ thống theo DEC-19 và BR-Timezone
 */
export class AppDateUtil {
  public static readonly DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

  /**
   * Lấy ngày hiện tại (YYYY-MM-DD) theo múi giờ ứng dụng (mặc định Asia/Ho_Chi_Minh)
   * Tuyệt đối không dùng trực tiếp new Date() của server vì server có thể chạy UTC
   */
  public static getAppToday(timeZone: string = process.env.APP_TIMEZONE || this.DEFAULT_TIMEZONE): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  }

  /**
   * Lấy thời điểm hiện tại dạng UTC ISO String
   */
  public static getUtcNow(): string {
    return new Date().toISOString();
  }

  /**
   * Tính chênh lệch số ngày giữa hai ngày (dạng YYYY-MM-DD)
   */
  public static diffDays(dateA: string, dateB: string): number {
    const d1 = new Date(dateA);
    const d2 = new Date(dateB);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
}
