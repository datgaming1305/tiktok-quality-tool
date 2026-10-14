# TikTok Video Container Optimizer

> **Công cụ tối ưu hóa cấu trúc container MP4 trực tiếp trên trình duyệt (Client-Side), giúp hạn chế việc bị nén giảm chất lượng khi đăng tải video lên TikTok.**

🌐 **Trang web:** [https://datgaming1305.github.io/tiktok-quality-tool/](https://datgaming1305.github.io/tiktok-quality-tool/)

---

## Mục Đích Sử Dụng

Khi tải video lên TikTok (đặc biệt là video game có chuyển động nhanh, 60fps), hệ thống của TikTok thường tự động nén lại (re-encode), dễ dẫn đến:
* Tốc độ khung hình bị giảm từ 60fps xuống 30fps.
* Giảm bitrate khiến hình ảnh bị vỡ hạt, mờ khi có chuyển động nhanh.
* Giảm độ phân giải nếu kích thước tệp vượt chuẩn.

Công cụ hỗ trợ chuẩn hóa container MP4 (ISO Base Media File Format) và căn chỉnh metadata phù hợp với cơ chế tiếp nhận của TikTok mà **không làm suy hao chất lượng video gốc**.

---

## Tính Năng Chính

* **Xử lý trực tiếp trên trình duyệt (Client-Side)**: Video được xử lý trong RAM máy tính của bạn thông qua JavaScript `ArrayBuffer` & `DataView`. Video hoàn toàn không tải lên bất kỳ máy chủ bên ngoài nào.
* **Tốc độ nhanh (khoảng 1 giây)**: Chỉ can thiệp cấu trúc container và metadata, không giải mã/mã hóa lại luồng video gốc ở chế độ mặc định.
* **Chuẩn hóa Container & FastStart**: Đưa atom `moov` lên trước `mdat` và đồng bộ chunk offset để video sẵn sàng phát ngay khi tải lên.
* **Hỗ trợ nén Bitrate tùy chỉnh (FFmpeg WebAssembly)**: Cung cấp tùy chọn nén lại luồng video về mức bitrate mong muốn nếu tệp video gốc xuất ra có dung lượng quá lớn.

---

## Khuyến Nghị Khi Xuất Video (CapCut / Premiere)

Để đạt chất lượng hình ảnh và độ mượt tốt nhất:

1. **Độ phân giải**: 
   * **1080x1920 (Dọc 9:16)** hoặc **1920x1080 (Ngang 16:9)** tùy theo video gốc.
   * Tránh xuất chiều ngang lớn hơn 1920px để tránh bị hệ thống tự co nhỏ lại.
2. **Tốc độ khung hình (FPS)**: Giữ nguyên theo video gốc (khuyến nghị **60 fps** cho video mượt).
3. **Bitrate**:
   * Khi xuất file, có thể chọn Bitrate **Tùy chỉnh (VBR)** khoảng **10,000 – 12,000 kbps**.
   * Mức này vừa tối ưu độ nét chuyển động, vừa giữ tệp ở kích thước hợp lý (~90–100 MB cho clip khoảng 1 phút).
4. **Phương thức tải lên TikTok**:
   * **Nên tải lên qua TikTok Web**: Sử dụng trình duyệt máy tính truy cập [tiktok.com/creator](https://www.tiktok.com/creator-center/upload) để đăng tải. Trình duyệt truyền tải file gốc trực tiếp lên hệ thống, hạn chế tối đa việc bị nén giảm chất lượng.
   * **Không nên tải video lên bằng ứng dụng TikTok / TikTok Studio trên điện thoại**: Ứng dụng di động thường tự động nén video trên thiết bị trước khi tải lên, điều này làm giảm đáng kể độ nét và không đảm bảo giữ được chất lượng video như mong muốn.

---

## Công Nghệ Sử Dụng

* **Vanilla JavaScript (ES6+)**: `DataView`, `Uint8Array`, `Blob`, `File API`
* **ISO Base Media File Format Parser**: Trình phân giải và tái cấu trúc container MP4
* **WebAssembly (WASM)**: `@ffmpeg/ffmpeg` cho chế độ nén bitrate
* **HTML5 & CSS3**: Giao diện tối giản, tương thích máy tính và thiết bị di động
