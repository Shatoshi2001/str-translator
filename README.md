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

## Phát hành bản mới (Release)

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

### Mỗi bản release mới

1. **Tăng version** trong `package.json` (vd: `1.0.0` → `1.0.1`)
2. Commit thay đổi:
   ```bash
   git add package.json
   git commit -m "Bump version to 1.0.1"
   git push
   ```
3. **Tạo tag** và push (GitHub Actions sẽ tự build + upload installer):
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. Vào [Releases](https://github.com/Shatoshi2001/str-translator/releases) kiểm tra file `.exe` đã được đính kèm.

### Release thủ công (không dùng Actions)

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
| `.github/workflows/release.yml` | CI build Windows khi push tag `v*` |
