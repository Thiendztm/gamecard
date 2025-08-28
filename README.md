## Touhou FM: Battle Card - Game Thẻ Bài Đối Kháng

### Giới thiệu

Đây là dự án game thẻ bài đối kháng lấy cảm hứng từ Touhou, hỗ trợ cả chế độ PvP (người với người) và PvE (đánh với AI). Game có hệ thống phòng, đăng ký/đăng nhập, xây dựng bộ bài, AI nhiều cấp độ, và nhiều bản đồ chiến đấu.

### Chức năng chính

- **Server Node.js**: Quản lý phòng, người chơi, đăng ký/đăng nhập, xác thực email, socket.io cho realtime, bảo mật Helmet, rate-limit, gửi mail qua Gmail.
- **AI Bot**: Đối thủ máy với nhiều cấp độ khó, tự động xây dựng bộ bài và ra quyết định chiến thuật.
- **Client (HTML/JS)**: Giao diện web, tạo/phòng, chọn nhân vật, xây dựng bộ bài, vào trận, xem profile, chọn avatar, hiệu ứng âm thanh và nhạc nền.
- **Chế độ chơi**:
  - Đánh với máy (AI)
  - Đánh với người (PvP)
  - Chế độ thẻ bài (Card) và chiến đấu kỹ năng (Battle)

### Hướng dẫn cài đặt

#### Server mới (khuyến nghị - MySQL + JWT)

1. **Yêu cầu:** Node.js >= 16, npm, MySQL 8.x
2. **Cài đặt:**
   ```bash
   npm install
   ```
3. **Cấu hình:**
   ```bash
   cp .env.example .env
   ```
   Chỉnh sửa `.env` với thông tin MySQL của bạn.
4. **Khởi tạo database:**
   ```bash
   npm run migrate
   ```
5. **Chạy server:**
   ```bash
   npm run server:dev  # Development
   # hoặc
   npm run server      # Production
   ```
6. **Truy cập:** http://localhost:4000

#### Server cũ (legacy - Map-based)

1. **Chạy server cũ:**
   ```bash
   node index.js
   # hoặc
   npm run dev
   ```
2. **Truy cập:** https://localhost:4000 (với SSL tự ký)

### Cấu trúc thư mục

- **`server/`**: Server mới với MySQL + JWT
  - `server.js`: Main server với card game engine
  - `db/`: Database connection & migration
  - `routes/auth.js`: Authentication endpoints
  - `utils/`: JWT & password utilities
- **`index.js`**: Server cũ (legacy) với Map-based storage
- **`bot.js`**: Logic AI bot và AIBotManager
- **`rules.json`**: Quy tắc game thẻ bài
- **`client/`**: Frontend (HTML/CSS/JS, assets)
- **`DesignHud/`**: Asset UI/ảnh nhân vật
- **`.env`**: Cấu hình môi trường
- **`SERVER_README.md`**: Chi tiết về server architecture

### Hướng dẫn sử dụng nhanh

1. **Chọn server**: Mới (`npm run server:dev`) hoặc cũ (`npm run dev`)
2. **Đăng ký tài khoản** (email thật nếu dùng server mới)
3. **Đăng nhập**, vào menu chính
4. **Tạo phòng** hoặc tham gia phòng
5. **Chọn chế độ**: Card (thẻ bài) hoặc Battle (kỹ năng)
6. **Xây dựng bộ bài** hoặc chọn nhân vật
7. **Sẵn sàng** và bắt đầu trận đấu

### Tính năng nổi bật

- **Dual server architecture**: Legacy (Map-based) & Modern (MySQL + JWT)
- **MySQL integration**: User management, email verification, structured data
- **AI nhiều cấp độ**: Easy, Medium, Hard, Expert với adaptive difficulty
- **Real-time multiplayer**: Socket.io cho lobby & gameplay
- **Card game engine**: Đầy đủ rules, special abilities, curse system
- **Modern security**: Helmet, rate limiting, JWT cookies, password hashing
- **Email verification**: Nodemailer integration với Gmail
- **Asset management**: Avatar system, audio effects, visual themes

### Đóng góp & Liên hệ

- Đóng góp code, ý tưởng: tạo pull request hoặc issue trên GitHub
- Liên hệ: nekohimeken@gmail.com

---

_Dự án cá nhân, phi thương mại. Cảm ơn bạn đã quan tâm!_

# gamecard
