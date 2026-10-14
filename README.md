# ⚡ TikTok Ultra Quality Bypass Web Tool

Trang web Client-Side mã nguồn mở giúp tối ưu hóa cấu trúc nhị phân MP4 container (bơm Ghost Frames x10, FastStart moov, nâng cấp High Profile 0x64 và mvhd 64-bit max duration) để vượt qua thuật toán nén của TikTok, bảo toàn 100% độ nét 60fps!

---

## 🚀 Hướng Dẫn Deploy Miễn Phí Lên GitHub Pages (3 Bước)

### Bước 1: Tạo Repository mới trên GitHub
1. Đăng nhập vào [GitHub](https://github.com/).
2. Bấm nút **New** (Tạo repo mới).
3. Đặt tên repository (ví dụ: `tiktok-quality-tool`).
4. Chọn chế độ **Public**, sau đó bấm **Create repository**.

### Bước 2: Push mã nguồn lên GitHub
Mở terminal trong thư mục `tiktok-quality-web` và chạy các lệnh:

```bash
git init
git add .
git commit -m "Initial commit TikTok Quality Bypass Web"
git branch -M main
git remote add origin https://github.com/<tai-khoan-cua-ban>/tiktok-quality-tool.git
git push -u origin main
```

*(Thay `<tai-khoan-cua-ban>` bằng username GitHub của bạn)*

### Bước 3: Kích hoạt GitHub Pages
1. Trong giao diện repository trên GitHub, bấm vào thẻ **Settings** (Cài đặt).
2. Ở thanh menu bên trái, chọn **Pages**.
3. Tại mục **Build and deployment > Branch**:
   * Chọn nhánh: `main`
   * Chọn thư mục: `/ (root)`
   * Bấm nút **Save**.
4. Chờ khoảng 1–2 phút, trang web sẽ online tại địa chỉ:
   ```text
   https://<tai-khoan-cua-ban>.github.io/tiktok-quality-tool/
   ```

---

## ✨ Tính Năng Nổi Bật

* **100% Client-Side & Bảo Mật**: Video được xử lý trực tiếp trên RAM trình duyệt của người dùng (ArrayBuffer / WebAssembly), tuyệt đối không gửi video lên bất kỳ máy chủ nào.
* **Siêu Tốc (1–2 giây)**: Chế độ can thiệp nhị phân tức thời giữ nguyên chất lượng gốc từ CapCut.
* **Tùy chọn FFmpeg WebAssembly**: Tự động tải thư viện nén ngầm nếu cần hạ bitrate xuống 10,000 kbps.
* **Giao diện Responsive**: Tương thích tốt trên cả máy tính lẫn điện thoại di động.
