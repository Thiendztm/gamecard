# Hướng dẫn chạy Server mới

## Quick Start

1. **Cài đặt dependencies:**

   ```bash
   npm install
   ```

2. **Cấu hình môi trường:**

   ```bash
   cp .env.example .env  # Linux/Mac
   copy .env.example .env  # Windows
   ```

   Chỉnh sửa file `.env` với thông tin MySQL của bạn.

3. **Khởi tạo database:**

   ```bash
   npm run migrate
   ```

4. **Chạy server mới (khuyến nghị):**

   ```bash
   npm run server:dev  # Development với auto-reload
   # hoặc
   npm run server      # Production
   ```

5. **Chạy server cũ (nếu cần):**
   ```bash
   npm run dev         # index.js cũ
   ```

## Server mới vs Server cũ

### Server mới (`server/server.js`):

- **JWT Authentication** với HTTP-only cookies
- **MySQL schema chính thức** (users, pending_users)
- **Structured routes** (`/api/register`, `/api/verify`, `/api/login`, `/api/logout`, `/api/me`)
- **Password hashing** với bcrypt (đầy đủ)
- **Email verification** qua nodemailer
- **Migration system** cho database
- **Better security** với helmet, rate limiting
- **Card game engine** tích hợp đầy đủ
- **Room system** tương thích với client hiện tại

### Server cũ (`index.js`):

- **Legacy authentication** với Maps trong memory
- **Self-signed SSL** (cert.pem/key.pem)
- **Simple registration** qua session storage
- **Compatible** với client code hiện tại

## Cấu trúc mới

```
server/
├── server.js          # Main server file
├── db/
│   ├── index.js       # Database connection pool
│   ├── migrate.js     # Migration runner
│   └── migrate.sql    # Schema definitions
├── routes/
│   └── auth.js        # Authentication routes
└── utils/
    ├── jwt.js         # JWT helpers
    └── password.js    # Password hashing
```

## Migration từ server cũ

1. Export data từ server cũ (nếu có data quan trọng)
2. Chạy `npm run migrate` để tạo schema mới
3. Chuyển client sang server mới (`PORT=4000`)
4. Test tất cả features

## Environment Variables

| Variable           | Mô tả                 | Default   |
| ------------------ | --------------------- | --------- |
| `PORT`             | Server port           | 4000      |
| `DB_HOST`          | MySQL host            | localhost |
| `DB_PORT`          | MySQL port            | 3306      |
| `DB_USER`          | MySQL user            | root      |
| `DB_PASSWORD`      | MySQL password        | (empty)   |
| `DB_NAME`          | Database name         | cardgame  |
| `JWT_SECRET`       | JWT signing key       | (dev key) |
| `MIGRATE_ON_START` | Auto-migrate on start | false     |

## Troubleshooting

1. **Connection failed**: Kiểm tra MySQL running và .env
2. **Migration failed**: Kiểm tra user có quyền CREATE DATABASE
3. **JWT errors**: Đặt JWT_SECRET dài hơn (>32 chars)
4. **Email not working**: Kiểm tra email-config.js hoặc để console log

Chọn server phù hợp với nhu cầu dự án!
