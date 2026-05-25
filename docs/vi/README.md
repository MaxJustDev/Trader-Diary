# TraderDiary — Hướng dẫn nhanh

Công cụ quản lý nhiều tài khoản MetaTrader 5 và đặt lệnh batch cho prop firm trader. Dữ liệu lưu cục bộ trong SQLite, không sync cloud.

> Tài liệu chi tiết bằng tiếng Anh: [README.md](../../README.md), [ARCHITECTURE.md](../../ARCHITECTURE.md), [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Yêu cầu

- Windows 10/11
- MetaTrader 5 đã cài sẵn
- (Chế độ build từ source) Python 3.10+, Node.js 18+

## Cài bản đóng gói sẵn (nhanh nhất)

1. Tải `TraderDiary.zip` ở mục [Releases](../../../releases)
2. Giải nén ra thư mục bất kỳ
3. Chạy `TraderDiary.exe` — trình duyệt tự mở ở `http://localhost:8001`

Lần chạy đầu tự tạo file `.env` (khóa mã hóa ngẫu nhiên) và `traderdiary.db`. **Backup `.env`** — mất khóa = mất tất cả mật khẩu MT5 đã lưu.

## Chạy từ source (cho dev)

```powershell
git clone https://github.com/<user>/TraderDiary.git
cd TraderDiary

# Backend
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
copy .env.example .env
# Mở .env, set ENCRYPTION_KEY (xem comment trong file)
python run.py                          # chạy ở cổng 8001

# Frontend (mở terminal khác)
cd ..\frontend
npm install
npm run dev                            # chạy ở cổng 3000
```

Mở `http://localhost:3000`.

## Lệnh thường dùng

| Mục đích | Lệnh |
|----------|------|
| Chạy backend dev | `cd backend && .\venv\Scripts\activate && python run.py` |
| Chạy frontend dev | `cd frontend && npm run dev` |
| Test backend | `cd backend && pytest -v` |
| Test frontend | `cd frontend && npm test` |
| Build production (Windows portable) | `.\build.bat` |

## Cấu trúc thư mục

Xem [ARCHITECTURE.md](../../ARCHITECTURE.md) cho sơ đồ chi tiết. Tóm tắt:

- `backend/app/routes/` — endpoint HTTP + WebSocket
- `backend/app/services/` — logic nghiệp vụ (MT5, sizing, rule check, encryption)
- `backend/app/models/` — bảng SQLAlchemy
- `frontend/app/` — page Next.js App Router
- `frontend/components/` — component UI

## Thêm template fund mới

Mở `backend/app/data/fund_templates.json`, copy 1 entry có sẵn (vd `FTMO`), chỉnh tên + rule. Restart backend → vào Funds page → Refresh Templates.

## Lỗi thường gặp

| Triệu chứng | Fix |
|------------|-----|
| `ImportError: python-multipart` | `pip install python-multipart` (đã có trong requirements.txt mới — chạy lại `pip install -r requirements.txt`) |
| MT5 không connect | Kiểm tra `MT5_BASE_PATH` trong `.env`, đúng đường dẫn `terminal64.exe` |
| `Failed to decrypt password` | `.env` đã đổi `ENCRYPTION_KEY`, phải dùng đúng key đã tạo account |

## Đóng góp

Xem [CONTRIBUTING.md](../../CONTRIBUTING.md). Tóm tắt: branch riêng, commit theo Conventional Commits (`feat:`, `fix:`, `perf:` …), chạy test trước khi PR.
