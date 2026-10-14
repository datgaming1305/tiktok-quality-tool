# ⚡ TikTok Ultra Quality Bypass Web Tool

> **Công cụ web tối ưu hóa nhị phân MP4 Container chạy hoàn toàn trên trình duyệt (Client-Side). Giúp vượt qua thuật toán nén re-encode của TikTok, bảo toàn 100% chất lượng đồ họa và độ mượt mà 60 FPS!**

🌐 **Trang web chính thức:** [https://datgaming1305.github.io/tiktok-quality-tool/](https://datgaming1305.github.io/tiktok-quality-tool/)

---

## 🎯 Vấn Đề & Giải Pháp

Khi tải video lên TikTok (đặc biệt là video game hành động, drift xe, highlight 60fps), thuật toán máy chủ của TikTok thường tự động nén (re-encode) khiến:
* Tốc độ khung hình bị bóp từ **60fps xuống 30fps**.
* Bitrate bị ép giảm mạnh dẫn đến hiện tượng **vỡ hạt (macroblocking), mờ nhòe** khi chuyển động nhanh.
* Tự động giảm độ phân giải nếu kích thước tệp vượt chuẩn.

**TikTok Quality Bypass Engine** giải quyết triệt để vấn đề này bằng cách can thiệp trực tiếp vào cấu trúc container nhị phân ISO Base Media File Format (MP4) mà **không làm suy hao bất kỳ pixel nào của video gốc**.

---

## ✨ Tính Năng Nổi Bật

* 🔒 **100% Client-Side & Bảo Mật Tuyệt Đối**: Video được đọc và xử lý trực tiếp trên bộ nhớ RAM của trình duyệt thông qua JavaScript `ArrayBuffer` & `DataView`. Video **không bao giờ được tải lên bất kỳ máy chủ nào**.
* ⚡ **Xử Lý Siêu Tốc (0.2 – 1 Giây)**: Thao tác can thiệp nhị phân tức thì, không tốn thời gian chờ đợi.
* 👻 **Ghost Frames Injection (x10)**: Bơm các gói khung hình NALU padding x10 để đánh lừa bộ phân tích nén của máy chủ TikTok.
* 🚀 **High Profile (0x64) & `btrt` Box**: Nâng cấp thông số codec `avcC` lên chuẩn High Profile cao cấp.
* ⏱️ **64-bit Max Duration**: Chuẩn hóa container header `mvhd` Version 1 64-bit duration (`0xFFFFFFFFFFFFFFFF`).
* 📦 **FastStart Web-Optimized**: Tự động đưa box `moov` lên trước `mdat` và tính bù chunk offset `stco` / `co64` để video phát ngay lập tức trên TikTok mà không cần chờ tải hết file.
* 🎛️ **Tích Hợp FFmpeg WebAssembly (Tùy Chọn)**: Cho phép nén bitrate về mức chuẩn 10,000 kbps trực tiếp trong trình duyệt nếu lỡ xuất file quá nặng.

---

## 💡 Quy Trình Xuất Video Tối Ưu Từ CapCut

Để đạt độ nét căng tràn viền và mượt mà nhất trên TikTok:

1. **Độ phân giải (Resolution)**:
   * **1080x1920 (Dọc 9:16)**: Chuẩn tối ưu nhất cho màn hình điện thoại.
   * Hoặc **1920x1080 (Ngang 16:9)**.
   * *Lưu ý*: Tránh xuất chiều ngang > 1920px (như 2400x1080) vì TikTok sẽ tự nén thu nhỏ.
2. **Tốc độ khung hình (Frame rate)**: Chọn đúng **60 fps**.
3. **Bitrate**:
   * Chọn **Tùy chỉnh (Custom)** > Nhập **`12000` Kbps**.
   * Tích chọn **VBR (Variable Bit Rate)**.
   * *(File xuất ra sẽ chỉ nặng khoảng ~95 – 100 MB cho clip 80 giây)*.
4. **Xử lý Bypass**:
   * Truy cập [Web Bypass Tool](https://datgaming1305.github.io/tiktok-quality-tool/), kéo thả file video vào.
   * Chọn **Chế độ Siêu Tốc** > Bấm **Bắt Đầu Bypass TikTok**.
   * Tải file đã xử lý về máy và đăng thẳng lên TikTok!

---

## 🛠️ Công Nghệ Sử Dụng

* **Vanilla JavaScript (ES6+)**: `DataView`, `Uint8Array`, `Blob`, `File API`
* **ISO Base Media File Format Parser**: Bộ phân giải cấu trúc nhị phân MP4 tùy biến
* **WebAssembly (WASM)**: `@ffmpeg/ffmpeg` cho chế độ nén Client-Side
* **HTML5 & CSS3 Modern UI**: Glassmorphism, Dark Theme, Responsive Mobile/Desktop

---

## 📄 Bản Quyền & Giấy Phép

Phát hành theo giấy phép [MIT License](LICENSE). Dự án mã nguồn mở phục vụ cộng đồng Content Creator & Gamer.
