# SRT Translator

Ứng dụng Electron dịch phụ đề `.srt` qua ChatGPT (webview).

Repo: [github.com/Shatoshi2001/str-translator](https://github.com/Shatoshi2001/str-translator)

## Chạy dev

```bash
npm install
npm start
```

## Build installer Windows

```bash
npm install
npm run make
```

File cài đặt: `out/make/squirrel.windows/x64/SRT-Translator-Setup.exe`.

| Lệnh | Mô tả |
|------|--------|
| `npm run package` | Đóng gói app (không tạo installer) |
| `npm run make` | Tạo installer + zip |
| `npm run publish` | Build và đăng lên GitHub Releases |

## Phát hành bản mới (từ máy local)

1. Tăng `version` trong `package.json` (vd: `1.0.2` → `1.0.3`)
2. Tạo [GitHub token](https://github.com/settings/tokens) (quyền `repo`)
3. Copy `.env.example` → `.env` và điền token:

```env
GITHUB_TOKEN=ghp_xxxxxxxx
```

4. Chạy:

```bash
npm run publish
```

5. (Tuỳ chọn) Gắn tag cho release:

```bash
git tag v1.0.3
git push origin v1.0.3
```

Tag phải khớp version trong `package.json` (`1.0.3` → `v1.0.3`).

## Cập nhật tự động trong app

- **Bản cài đặt (.exe):** `update-electron-app` — tự kiểm tra GitHub Releases.
- **Chế độ dev (`npm start`):** báo có bản mới và mở trang Releases.

Bấm số version ở thanh trạng thái để kiểm tra thủ công.

## Cấu trúc

| File | Mô tả |
|------|--------|
| `main.js` | Electron main process |
| `renderer.js` | UI |
| `chatgpt-translator.js` | Tự động hóa ChatGPT |
| `update-checker.js` | Kiểm tra cập nhật qua GitHub API |
| `forge.config.js` | Cấu hình Electron Forge |
