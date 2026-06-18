# SRT Translator

Ứng dụng Electron dịch phụ đề `.srt` qua ChatGPT (webview).

Repo: [github.com/Shatoshi2001/str-translator](https://github.com/Shatoshi2001/str-translator)

## Chạy dev

```bash
npm install
npm start
```

## Build installer Windows (local)

```bash
npm install
npm run build
```

File cài đặt nằm trong thư mục `dist/`.

## Phát hành bản mới (GitHub Actions)

GitHub tự build app Windows khi bạn push tag `v*`. Có thêm workflow **Build** chạy mỗi lần push/PR lên `main` (tải file `.exe` trong tab Actions → Artifacts).

### Lần đầu — đẩy code lên GitHub

```bash
cd srt-translator-app
git init
git add .
git commit -m "Initial release: SRT Translator v1.0.0"
git branch -M main
git remote add origin https://github.com/Shatoshi2001/str-translator.git
git push -u origin main
```

### Build thử (không tạo Release)

- Push lên nhánh `main` → workflow **Build** chạy tự động.
- Hoặc vào repo → **Actions** → **Build** → **Run workflow**.

Tải installer: mở run thành công → phần **Artifacts** → `srt-translator-windows`.

### Phát hành bản chính thức (Release + auto-update)

1. **Tăng version** trong `package.json` (vd: `1.0.0` → `1.0.1`)
2. Commit và push:
   ```bash
   git add package.json
   git commit -m "Bump version to 1.0.1"
   git push
   ```
3. **Tạo tag** (phải khớp version, có tiền tố `v`):
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. Workflow **Release** build và đăng file `.exe` lên [Releases](https://github.com/Shatoshi2001/str-translator/releases).

**Chạy Release thủ công:** Actions → **Release** → Run workflow → nhập tag (vd `v1.0.1`).

### Release thủ công từ máy local

Cần [GitHub token](https://github.com/settings/tokens) với quyền `repo`:

```bash
set GH_TOKEN=ghp_xxxxxxxx
npm run release
```

## Cập nhật tự động trong app

- **Bản cài đặt (.exe):** app dùng `electron-updater` — tự kiểm tra GitHub Releases, tải và hỏi khởi động lại.
- **Chế độ dev (`npm start`):** chỉ báo có bản mới và mở trang Releases.

Bấm `v1.0.0` ở thanh trạng thái để kiểm tra thủ công.

## Cấu trúc

| File | Mô tả |
|------|--------|
| `main.js` | Electron main process |
| `renderer.js` | UI |
| `chatgpt-translator.js` | Tự động hóa ChatGPT |
| `update-checker.js` | Kiểm tra / tải cập nhật |
| `.github/workflows/build.yml` | CI build Windows (push/PR) |
| `.github/workflows/release.yml` | Release khi push tag `v*` |
