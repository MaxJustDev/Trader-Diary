# TRADERDIARY MVP

**Tài liệu kỹ thuật phiên bản 1.0**

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1. Mục tiêu

Xây dựng ứng dụng TraderDiary chạy local để quản lý và giám sát các tài khoản MT5, hỗ trợ thực hiện lệnh hàng loạt với tính năng Position Sizer tự động.

### 1.2. Phạm vi MVP

- Kết nối và giám sát tài khoản MT5 theo thời gian thực
- Phân biệt tài khoản quỹ (Prop Firm) và tài khoản cá nhân
- Vào lệnh hàng loạt với Position Sizer tự động
- Dashboard hiển thị thống kê và biểu đồ
- Chạy hoàn toàn trên local, không cần authentication

---

## 2. KIẾN TRÚC HỆ THỐNG

### 2.1. Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| Backend | Python (FastAPI) |
| Frontend | Next.js 14+ (App Router) |
| UI Framework | shadcn/ui + TailwindCSS |
| Database | SQLite |
| MT5 Integration | MetaTrader5 Python Library |
| Charts | Lightweight Charts / Recharts |

### 2.2. Kiến trúc tổng thể

- **Frontend (Next.js)**: Giao diện web, gọi API đến Backend
- **Backend (FastAPI)**: Xử lý logic, kết nối MT5, quản lý database
- **MT5 Terminal**: Phải được cài đặt và chạy trên máy local
- **SQLite**: Lưu trữ thông tin tài khoản và cấu hình quỹ

---

## 3. CẤU TRÚC DATABASE

### 3.1. Bảng: accounts

Lưu trữ thông tin tài khoản MT5.

| Field | Type | Mô tả |
|-------|------|-------|
| id | INTEGER | Primary key, auto increment |
| account_id | VARCHAR(50) | Account ID từ MT5 |
| password | VARCHAR(255) | Mật khẩu (mã hóa) |
| server | VARCHAR(100) | Server MT5 |
| account_type | VARCHAR(20) | fund hoặc personal |
| fund_id | INTEGER | Foreign key đến bảng funds (nullable) |
| challenge_phase | VARCHAR(50) | Phase 1, Phase 2, Funded... (nullable) |
| created_at | TIMESTAMP | Thời gian tạo |
| updated_at | TIMESTAMP | Thời gian cập nhật |

### 3.2. Bảng: funds

Lưu trữ thông tin về các quỹ (Prop Firms).

| Field | Type | Mô tả |
|-------|------|-------|
| id | INTEGER | Primary key, auto increment |
| fund_name | VARCHAR(100) | Tên quỹ (FTMO, The5ers...) |
| server_pattern | VARCHAR(100) | Pattern để nhận diện server |
| phases | JSON | Danh sách phases (Challenge, Verification, Funded) |
| profit_target | DECIMAL(5,2) | % profit target |
| daily_drawdown | DECIMAL(5,2) | % daily drawdown limit |
| max_drawdown | DECIMAL(5,2) | % max drawdown limit |
| payout_days | INTEGER | Số ngày đến payout (7, 14...) |
| payout_type | VARCHAR(20) | fixed hoặc on_demand |
| created_at | TIMESTAMP | Thời gian tạo |

### 3.3. Bảng: fund_templates

Template mẫu cho các quỹ phổ biến (FTMO, The5ers, FXIFY...).

| Field | Type | Mô tả |
|-------|------|-------|
| id | INTEGER | Primary key |
| fund_name | VARCHAR(100) | Tên quỹ |
| default_config | JSON | Cấu hình mặc định (phases, targets, rules...) |

---

## 4. CHỨC NĂNG CHI TIẾT

### 4.1. Quản lý tài khoản

#### 4.1.1. Thêm tài khoản

- **Input**: Account ID, Password, Server
- Tự động nhận diện fund/personal dựa trên server pattern
- Nếu là tài khoản quỹ, yêu cầu chọn fund và phase
- Lưu vào database với password được mã hóa

#### 4.1.2. Kết nối tài khoản

- Chỉ 1 tài khoản được connect live tại 1 thời điểm
- Khi connect, sử dụng `MetaTrader5.initialize()` và `login()`
- Stream real-time data: Balance, Equity, P&L, Open Positions, Price data
- WebSocket từ Backend gửi updates đến Frontend

#### 4.1.3. Load dữ liệu hàng loạt

- Button "Refresh All Accounts"
- Backend lần lượt: Login → Lấy dữ liệu → Logout cho từng account
- Dữ liệu lấy: Balance, Equity, Margin, P&L hiện tại, Số lệnh đang mở
- **KHÔNG** lưu vào database (chỉ hiển thị tạm thời)
- Account đang live connect sẽ bị skip

#### 4.1.4. Rule Checking & Account Lock

Tài khoản quỹ vi phạm rule sẽ bị **LOCK**:

- Daily Loss vượt daily_drawdown limit
- Total Drawdown vượt max_drawdown limit
- Account bị lock → Không thể connect qua hệ thống
- Hiển thị warning icon và lý do vi phạm

### 4.2. Quản lý quỹ

#### 4.2.1. Template quỹ có sẵn

Hệ thống cung cấp template cho các quỹ phổ biến:

- FTMO
- The5ers
- FXIFY
- E8 Funding

Người dùng có thể chọn template và customize.

#### 4.2.2. Thêm quỹ mới

Input cần thiết:

- Tên quỹ
- Server pattern (ví dụ: 'FTTrading', 'The5ers-Live')
- Phases: Challenge, Verification, Funded
- Profit target %
- Daily drawdown %
- Max drawdown %
- Payout type: Fixed hoặc On-demand
- Payout days: 7, 14... (nếu fixed)

### 4.3. Dashboard

#### 4.3.1. Danh sách tài khoản

Hiển thị dạng bảng với các cột:

| Cột | Mô tả |
|-----|-------|
| Account ID | Account number |
| Server | Server name |
| Type | Fund / Personal |
| Phase | Chỉ hiển thị nếu là fund account |
| Balance | Số dư tài khoản |
| Equity | Equity hiện tại |
| P&L | Profit/Loss (màu xanh/đỏ) |
| Margin | Margin available |
| Status | Connected / Disconnected / Locked |
| Actions | Connect, Refresh, Edit, Delete |

#### 4.3.2. Tổng hợp thống kê

- Tổng số tài khoản
- Tổng P&L (tất cả accounts)
- Win rate: (Số lệnh win / Tổng lệnh) %
- Profit Factor

#### 4.3.3. Biểu đồ

- **Equity Curve**: Biểu đồ line chart theo thời gian
- **Candlestick Chart**: Real-time price của symbol đang xem
- **P&L Distribution**: Biểu đồ cột hiển thị phân bố win/loss

### 4.4. Vào lệnh hàng loạt

#### 4.4.1. Form nhập lệnh

| Field | Mô tả |
|-------|-------|
| Symbol | Cặp tiền (EURUSD, GBPUSD...) |
| Direction | BUY hoặc SELL |
| % Loss | Phần trăm rủi ro trên Balance |
| TP (pips) | Take Profit tính bằng pips |
| Order Type | MARKET (MVP chỉ hỗ trợ Market) |
| Accounts | Chọn danh sách accounts để vào lệnh |
| Preview | Toggle ON/OFF để xem preview |

#### 4.4.2. Position Sizer Logic

**Công thức tính toán:**

1. Risk Amount = Balance × (% Loss / 100)
2. Entry Price = Current Market Price
3. SL Distance (pips) = Tự động tính dựa trên Risk Amount và symbol specs
4. Lot Size = Risk Amount / (SL Distance × Pip Value)
5. TP Price = Entry ± TP (pips)
6. R:R Ratio = TP (pips) / SL Distance (pips)

**Ví dụ:**

- Account Balance: $5,000
- % Loss: 1%
- Risk Amount: $50
- Symbol: EURUSD, Pip Value: $10
- SL Distance: 50 pips (tự động tính)
- Lot Size: $50 / (50 pips × $10) = 0.10 lot
- TP: 100 pips
- R:R = 100/50 = 2:1

#### 4.4.3. Margin Check

Trước khi execute lệnh:

- Kiểm tra Margin Available cho từng account
- Nếu **BẤT KỲ** account nào không đủ margin → **KHÔNG** thực hiện lệnh **NÀO**
- Hiển thị danh sách accounts không đủ margin
- Cho phép người dùng remove account đó và retry

#### 4.4.4. Preview Mode

Khi bật Preview:

- Hiển thị bảng chi tiết:

| Account | Balance | Risk $ | Lot Size | SL Price | TP Price | R:R | Margin OK |
|---------|---------|--------|----------|----------|----------|-----|-----------|
| 123456 | $5,000 | $50 | 0.10 | 1.0850 | 1.0950 | 2:1 | ✓ |
| 789012 | $10,000 | $100 | 0.20 | 1.0850 | 1.0950 | 2:1 | ✓ |

- Button "Execute All" để confirm

#### 4.4.5. Execute Orders

- Backend lần lượt login từng account
- Gửi lệnh market với lot size, SL, TP đã tính
- Log kết quả: Success hoặc Error message
- Hiển thị summary: X/Y orders successful

---

## 5. API ENDPOINTS

### 5.1. Accounts Management

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | /api/accounts | Lấy danh sách tất cả accounts |
| POST | /api/accounts | Thêm account mới |
| PUT | /api/accounts/{id} | Cập nhật account |
| DELETE | /api/accounts/{id} | Xóa account |
| POST | /api/accounts/refresh-all | Load dữ liệu hàng loạt |

### 5.2. MT5 Connection

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | /api/mt5/connect | Connect đến account |
| POST | /api/mt5/disconnect | Disconnect account hiện tại |
| GET | /api/mt5/status | Trạng thái kết nối |
| WS | /ws/mt5/stream | WebSocket stream real-time data |

### 5.3. Funds Management

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | /api/funds | Lấy danh sách funds |
| GET | /api/funds/templates | Lấy fund templates |
| POST | /api/funds | Tạo fund mới |
| PUT | /api/funds/{id} | Cập nhật fund |
| DELETE | /api/funds/{id} | Xóa fund |

### 5.4. Trading

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | /api/trading/calculate-position | Tính Position Sizer |
| POST | /api/trading/preview-orders | Preview lệnh hàng loạt |
| POST | /api/trading/execute-batch | Execute lệnh hàng loạt |

### 5.5. Analytics

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | /api/analytics/summary | Tổng hợp P&L, Win rate... |
| GET | /api/analytics/equity-curve | Dữ liệu equity curve |
| GET | /api/analytics/trade-history | Lịch sử giao dịch |

---

## 6. CẤU TRÚC FRONTEND

### 6.1. Pages/Routes

| Route | Mô tả |
|-------|-------|
| / | Dashboard chính |
| /accounts | Quản lý accounts |
| /accounts/add | Thêm account mới |
| /funds | Quản lý funds |
| /trading | Form vào lệnh hàng loạt |
| /analytics | Thống kê chi tiết |

### 6.2. Components chính

- **AccountList**: Bảng danh sách accounts
- **AccountCard**: Card hiển thị thông tin 1 account
- **AddAccountForm**: Form thêm account
- **FundManager**: Quản lý funds
- **BatchTradingForm**: Form vào lệnh hàng loạt
- **PositionSizerCalculator**: Component tính Position Size
- **OrderPreviewTable**: Bảng preview orders
- **EquityCurveChart**: Biểu đồ equity
- **CandlestickChart**: Real-time price chart
- **StatsCard**: Card hiển thị metrics

---

## 7. CẤU TRÚC BACKEND

### 7.1. Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app entry
│   ├── models/                 # SQLAlchemy models
│   ├── routes/                 # API routes
│   ├── services/               # Business logic
│   │   ├── mt5_service.py     # MT5 connection & trading
│   │   ├── position_sizer.py  # Position size calculator
│   │   └── rule_checker.py    # Fund rules validation
│   ├── database.py             # Database connection
│   └── websocket.py            # WebSocket handlers
├── requirements.txt
└── traderdiary.db              # SQLite database
```

### 7.2. Core Services

#### 7.2.1. MT5Service

Chức năng:

- Initialize MT5 connection
- Login/Logout accounts
- Fetch account info (balance, equity, margin...)
- Fetch positions, orders, deal history
- Get symbol info (pip value, specs...)
- Place market orders
- Stream real-time ticks

#### 7.2.2. PositionSizer

Chức năng:

- Calculate lot size based on % risk
- Calculate SL distance
- Calculate TP price and R:R ratio
- Validate margin requirements

#### 7.2.3. RuleChecker

Chức năng:

- Check daily drawdown limit
- Check max drawdown limit
- Check profit target achievement
- Lock/unlock accounts based on violations

---

## 8. LUỒNG HOẠT ĐỘNG CHÍNH

### 8.1. Thêm tài khoản

1. User nhập Account ID, Password, Server
2. Frontend gửi POST /api/accounts
3. Backend kiểm tra server pattern → Xác định fund/personal
4. Nếu fund → Yêu cầu chọn fund và phase
5. Mã hóa password, lưu vào database
6. Trả về account info cho Frontend

### 8.2. Connect tài khoản

1. User click "Connect" trên 1 account
2. Frontend gửi POST /api/mt5/connect với account_id
3. Backend: Disconnect account hiện tại (nếu có)
4. MT5Service login account mới
5. RuleChecker kiểm tra violations → Nếu locked, reject connection
6. Mở WebSocket connection /ws/mt5/stream
7. Backend stream real-time data qua WebSocket
8. Frontend nhận data, update UI

### 8.3. Load dữ liệu hàng loạt

1. User click "Refresh All Accounts"
2. Frontend gửi POST /api/accounts/refresh-all
3. Backend lấy danh sách tất cả accounts (trừ account đang connected)
4. For each account:
   - Login
   - Fetch balance, equity, margin, P&L, positions count
   - Logout
5. Trả về array of account snapshots
6. Frontend cập nhật bảng accounts (không lưu vào DB)

### 8.4. Vào lệnh hàng loạt

1. User điền form: Symbol, Direction, % Loss, TP, chọn accounts
2. Frontend gửi POST /api/trading/calculate-position
3. Backend PositionSizer tính toán cho từng account:
   - Risk amount
   - Lot size
   - SL price
   - TP price
   - R:R ratio
4. Margin validation cho từng account
5. Trả về preview data
6. Frontend hiển thị OrderPreviewTable (nếu preview ON)
7. User click "Execute"
8. Nếu có account margin không đủ → Show error, không execute
9. Frontend gửi POST /api/trading/execute-batch
10. Backend for each account:
    - Login
    - Place market order với calculated params
    - Log result (success/error)
    - Logout
11. Trả về execution summary
12. Frontend hiển thị kết quả

---

## 9. DEPENDENCIES & INSTALLATION

### 9.1. Backend Requirements

**requirements.txt:**

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
MetaTrader5==5.0.45
python-dotenv==1.0.0
cryptography==41.0.7
websockets==12.0
pydantic==2.5.3
pydantic-settings==2.1.0
```

### 9.2. Frontend Dependencies

**package.json:**

```json
{
  "dependencies": {
    "next": "14.1.0",
    "react": "^18",
    "react-dom": "^18",
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-*": "latest",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "recharts": "^2.10.0",
    "lightweight-charts": "^4.1.0",
    "zustand": "^4.4.7"
  }
}
```

### 9.3. Installation Steps

**1. Cài đặt MT5 Terminal trên máy local**

**2. Clone repository**

```bash
git clone https://github.com/yourusername/traderdiary.git
cd traderdiary
```

**3. Setup Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app/main.py
```

**4. Setup Frontend**

```bash
cd frontend
npm install
npm run dev
```

**5. Access application**

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

---

## 10. ROADMAP & FUTURE FEATURES

### 10.1. MVP (Phiên bản 1.0)

- Kết nối MT5 và giám sát real-time
- Quản lý tài khoản fund/personal
- Position Sizer tự động
- Vào lệnh hàng loạt (Market orders only)
- Dashboard với biểu đồ cơ bản

### 10.2. Version 2.0

- Nhóm tài khoản (Account Groups)
- Pending orders support
- Advanced analytics & reports
- Export dữ liệu (CSV, PDF)
- Journal ghi chú cho từng lệnh

### 10.3. Version 3.0

- MT4 support
- Multi-user support với authentication
- Cloud sync option
- Mobile app (React Native)
- AI-powered trade analysis

---

## 11. BẢO MẬT & LƯU Ý

### 11.1. Mã hóa dữ liệu

- Password tài khoản MT5 được mã hóa bằng Fernet (symmetric encryption)
- Encryption key lưu trong .env file (không commit lên Git)

### 11.2. Local-only

- Ứng dụng chạy hoàn toàn local
- Không gửi dữ liệu ra ngoài Internet
- Database SQLite lưu trên máy người dùng

### 11.3. Best Practices

- Không share file .env
- Backup database định kỳ
- Chỉ sử dụng investor password cho read-only accounts
- Kiểm tra margin trước khi vào lệnh

---

**TraderDiary MVP v1.0**  
*Tài liệu cập nhật: 07/02/2026*