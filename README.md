# TikTok Video Optimizer [Clean Master 2026]

> **Công cụ tối ưu video trực tiếp trên trình duyệt (Client-Side), giúp hạn chế việc bị nén giảm chất lượng khi đăng tải video lên TikTok mà không làm hỏng tính năng tua video.**

🌐 **Trang web:** [https://datgaming1305.github.io/tiktok-quality-tool/](https://datgaming1305.github.io/tiktok-quality-tool/)

---

## Cập Nhật Mới (Clean Master 2026)

* **Sửa triệt để lỗi tua video (Seeking / Timeline Desync)**: Loại bỏ hoàn toàn phương pháp nhồi Track 3 dummy audio padding và thời lượng giả của chuẩn cũ. Video sau khi xử lý tua mượt 100%, đồng bộ khung hình hoàn hảo.
* **Chuẩn sạch 2-Track (Video + Audio)**: Bảo toàn 100% thời lượng thực tế của clip trong `mvhd`, `mdhd` và `tkhd`.
* **Zero-Copy Blob Splicing**: Tối ưu hóa bộ nhớ, không nạp gigabyte dữ liệu vào RAM, xử lý file lớn (500MB – 1.5GB) chỉ mất dưới 0.5 giây.
* **FourCC Chuẩn hóa**: Ép tag `hvc1` cho H.265 (giúp điện thoại Android/iOS kích hoạt phần cứng giải mã) và `avc1` High Profile cho H.264.
* **Tiện ích Userscript Hỗ trợ TikTok Studio (`tiktok-studio-helper.user.js`)**: Hook tự động tắt bộ nén Cloud Canvas trên web TikTok Studio, đảm bảo video được tải lên ở dạng Direct Raw Master.

---

## Tính Năng Chính

* **Xử lý trực tiếp trên trình duyệt (Client-Side)**: Video được xử lý ngay trong máy tính của bạn thông qua trình duyệt web. Video hoàn toàn không tải lên bất kỳ máy chủ bên ngoài nào.
* **Tối ưu nhanh (FastStart 0.1 giây)**: Đưa `moov` lên đầu file, giữ nguyên 100% chất lượng hình ảnh và âm thanh gốc của clip.
* **Hỗ trợ nén giảm dung lượng (FFmpeg WebAssembly)**: Cung cấp tùy chọn nén lại clip về mức bitrate mong muốn nếu video xuất ra có dung lượng quá lớn kèm bộ lọc khử nhiễu `hqdn3d` và làm nét `unsharp`.

---

## Khuyến Nghị Khi Xuất Video (CapCut / Premiere)

1. **Độ phân giải**: 
   * **1080x1920 (Dọc 9:16)** hoặc **1920x1080 (Ngang 16:9)** tùy theo video gốc.
   * Tránh xuất chiều ngang lớn hơn 1920px để tránh bị hệ thống tự co nhỏ lại.
2. **Tốc độ khung hình (FPS)**: Khuyến nghị **60 fps** cho video mượt mà.
3. **Bitrate & Codec**:
   * Khuyến nghị xuất **HEVC / H.265** với Bitrate khoảng **10,000 – 17,000 kbps** (rất nét và nhẹ).
4. **Phương thức tải lên TikTok**:
   * Tải qua **TikTok Studio Web** ([tiktok.com/tiktokstudio](https://www.tiktok.com/tiktokstudio)) trên PC và cài thêm file `tiktok-studio-helper.user.js` vào Tampermonkey để bỏ qua cơ chế Cloud Canvas.

---

## Công Nghệ Sử Dụng

* **Vanilla JavaScript (ES6+)**: `DataView`, `Uint8Array`, `Blob`, `File API`
* **ISO Base Media File Format Parser**: Trình phân giải và tái cấu trúc container MP4
* **WebAssembly (WASM)**: `@ffmpeg/ffmpeg` cho chế độ nén bitrate
* **HTML5 & CSS3**: Giao diện tối giản, tương thích máy tính và thiết bị di động
