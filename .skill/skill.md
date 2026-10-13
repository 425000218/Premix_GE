# AI Skill và phạm vi kỹ thuật 

## 0. Mục đích và mức ưu tiên

Đây là tài liệu chỉ dẫn cho AI khi phân tích, thiết kế, viết code, sửa lỗi hoặc đề xuất thay đổi cho dự án. AI phải tuân thủ tài liệu này cùng với yêu cầu cụ thể của người dùng.

Thứ tự ưu tiên khi có mâu thuẫn:

1. Yêu cầu mới nhất và rõ ràng của người dùng.
2. Quy định pháp lý, bảo mật và dữ liệu của hệ thống.
3. Các quy tắc bắt buộc (`MUST` và `MUST NOT`) trong tài liệu này.
4. Convention và cấu trúc hiện có của repository.
5. Các quy tắc khuyến nghị (`SHOULD` và `SHOULD NOT`).

Nếu yêu cầu mới có thể làm vi phạm mục 2 hoặc 3, AI phải dừng triển khai phần đó, nêu rủi ro và hỏi xác nhận.

## 1. Nguyên tắc làm việc của AI

- `MUST` đọc các tài liệu và code liên quan trước khi thay đổi.
- `MUST` xác định module, luồng xử lý, dữ liệu đầu vào/đầu ra và ảnh hưởng của thay đổi.
- `MUST` thay đổi nhỏ, đúng phạm vi; không tự ý refactor hoặc đổi kiến trúc toàn hệ thống.
- `MUST` giữ tương thích với API, schema và quy trình hiện có trừ khi người dùng yêu cầu phá vỡ tương thích.
- `MUST` kiểm tra lỗi, chạy test hoặc lệnh kiểm tra phù hợp sau mỗi thay đổi.
- `MUST` báo rõ giả định, file đã sửa, kiểm tra đã chạy và vấn đề còn tồn tại.
- `MUST NOT` tự bịa API, bảng dữ liệu, quyền nghiệp vụ, secret, thông tin kết nối hoặc quy định pháp lý.
- `MUST NOT` đánh dấu một việc là hoàn thành khi chưa kiểm chứng.

## 2. Phạm vi công nghệ được phép

### 2.1 Công nghệ chuẩn

- Backend: ưu tiên framework và runtime đã có trong repository; không tự thay framework.
- Frontend: ưu tiên framework, TypeScript/JavaScript và thư viện UI đã có; không thêm thư viện chỉ để giải quyết một việc nhỏ.
- Database: sử dụng hệ quản trị và phiên bản đã được dự án phê duyệt.
- API: ưu tiên REST theo convention hiện tại; chỉ dùng GraphQL, message broker hoặc microservice khi đã có nền tảng hoặc được phê duyệt.
- Hạ tầng: ưu tiên Docker, CI/CD, reverse proxy, logging và monitoring đang được dự án sử dụng.

### 2.2 Giới hạn thay đổi công nghệ

- `MUST` kiểm tra `README`, package manifest, file cấu hình và code hiện có trước khi chọn thư viện hoặc framework.
- `MUST` giải thích lý do, chi phí vận hành, rủi ro bảo mật và phương án rollback khi đề xuất công nghệ mới.
- `MUST NOT` tự ý đổi ngôn ngữ, framework, hệ quản trị database, kiến trúc monolith/microservice hoặc giao thức API.
- `MUST NOT` thêm dependency chưa được duyệt, dependency không rõ nguồn gốc hoặc package đã lỗi thời nghiêm trọng.
- Khi chưa có quyết định công nghệ, AI phải đưa tối đa hai phương án ngắn gọn và chờ người dùng chọn trước khi triển khai.

## 3. Quy tắc system design

- Thiết kế theo module nghiệp vụ: Authentication & Authorization, CMS content, Citizen Feedback, Public Services, Search & FAQ, Administration & Auditing.
- Mỗi module phải có boundary rõ ràng, trách nhiệm đơn nhất và interface xác định.
- Ưu tiên kiến trúc đơn giản, dễ vận hành; không tạo microservice, event bus hoặc abstraction mới nếu chưa có nhu cầu đo được.
- Mọi thay đổi cross-module phải mô tả luồng dữ liệu, dependency, tác động hiệu năng và khả năng rollback.
- API phải có validation, mã lỗi nhất quán, phân trang cho danh sách lớn và không trả thừa dữ liệu nhạy cảm.
- Workflow nội dung phải bảo toàn trạng thái và lịch sử: bản nháp, chờ duyệt, từ chối, xuất bản, hết hạn và lưu trữ.
- Thao tác quan trọng phải có tính idempotent hoặc cơ chế chống xử lý lặp.
- `MUST NOT` đưa business rule chỉ vào UI; rule phải được kiểm soát ở backend.

## 4. Quy tắc database

- `MUST` dùng migration/versioning cho thay đổi schema; không sửa thủ công production database.
- `MUST` dùng parameterized query hoặc ORM an toàn; tuyệt đối không nối chuỗi input người dùng vào SQL.
- `MUST` định nghĩa khóa chính, khóa ngoại, constraint, kiểu dữ liệu, nullability và index theo nhu cầu truy vấn.
- `MUST` dùng transaction cho nghiệp vụ cập nhật nhiều bảng cần tính toàn vẹn.
- `MUST` đánh giá query plan và tác động hiệu năng khi thêm index hoặc thay đổi truy vấn lớn.
- `MUST` có chiến lược backup, restore, retention và rollback trước migration có rủi ro.
- Không xóa hoặc đổi tên cột/bảng đang được sử dụng nếu chưa có kế hoạch tương thích và di trú dữ liệu.
- Dữ liệu audit, phản ánh, tài khoản và hồ sơ phải giữ lịch sử cần thiết; không hard-delete nếu nghiệp vụ hoặc pháp lý không cho phép.
- `MUST NOT` ghi password, token, secret hoặc dữ liệu nhạy cảm nguyên bản vào database log, seed data, fixture hoặc commit.
- `MUST` Use store procedure for all action data in project (Sử dụng thủ tục lưu trữ (stored procedure) cho mọi thao tác dữ liệu trong dự án)

## 5. Quy tắc security

- Áp dụng nguyên tắc least privilege và deny by default cho API, UI, database và file storage.
- Kiểm tra quyền ở server cho mọi request; không tin role, user id, file path hoặc giá trị từ client.
- Mật khẩu phải được hash bằng thuật toán password hashing phù hợp; token và secret không được hard-code.
- Bảo vệ chống SQL injection, XSS, CSRF, SSRF, IDOR, upload file độc hại, brute force và privilege escalation.
- Validate input theo allowlist, giới hạn kích thước và loại file; lưu file ngoài web root khi phù hợp.
- Dùng HTTPS/TLS, cookie an toàn, timeout phiên, rate limiting và security headers theo môi trường triển khai.
- Audit log phải ghi ai, khi nào, hành động gì, đối tượng nào và kết quả; không ghi dữ liệu bí mật.
- Khi phát hiện lỗ hổng, ưu tiên chặn khai thác, đánh giá phạm vi ảnh hưởng, viết test hồi quy và ghi nhận cách khắc phục.

## 6. Quy trình xử lý yêu cầu

1. Xác định yêu cầu, module bị ảnh hưởng, tiêu chí hoàn thành và các điểm chưa rõ.
2. Đọc code/tài liệu gần nhất và lập giả thuyết về nguyên nhân hoặc điểm cần thay đổi.
3. Chọn giải pháp nhỏ nhất phù hợp convention, đồng thời nêu rủi ro nếu thay đổi có ảnh hưởng rộng.
4. Thực hiện thay đổi theo từng bước; không trộn refactor không liên quan.
5. Cập nhật test, tài liệu hoặc migration khi contract/hành vi thay đổi.
6. Chạy kiểm tra hẹp trước, sau đó chạy kiểm tra rộng hơn nếu thay đổi ảnh hưởng nhiều module.
7. Báo cáo kết quả, kiểm tra đã chạy, giới hạn và việc cần người dùng xác nhận.

## 7. Khi phải hỏi lại hoặc dừng

AI phải hỏi người dùng trước khi tiếp tục nếu thiếu một trong các thông tin sau:

- Business rule, trạng thái workflow hoặc quyền của vai trò chưa được xác nhận.
- Công nghệ, phiên bản, database hoặc thư viện chưa được quy định.
- Thay đổi có thể phá vỡ API, schema, dữ liệu production hoặc tương thích ngược.
- Yêu cầu liên quan đến dữ liệu cá nhân, bảo mật, pháp lý hoặc xóa dữ liệu.
- Cần credential, secret, quyền truy cập hệ thống hoặc thông tin môi trường thật.
- Có nhiều cách triển khai với trade-off đáng kể về chi phí, hiệu năng hoặc vận hành.

## 8. Tiêu chí hoàn thành

- Code đúng phạm vi, theo convention và không có lỗi kiểm tra mới.
- Luồng thành công, lỗi, quyền truy cập và dữ liệu biên đã được xem xét.
- Test hoặc kiểm tra phù hợp đã chạy và kết quả được báo cáo.
- Migration, API contract, tài liệu hoặc cấu hình liên quan đã được cập nhật.
- Không để lại secret, debug code, dữ liệu mẫu nhạy cảm hoặc dependency không cần thiết.
- trên tất cả các list (table) quản lý danh sách Hãy luôn thực hiện (phân trang (tất cả, 50, 20, 10), sắp xếp, fillter, tìm kiếm)
