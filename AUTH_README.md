# Game Auth System - Test Guide

## Quick Setup

1. **Environment Setup**

```bash
# Copy environment template
copy .env.example .env
```

2. **Configure .env**

```env
PORT=4000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=game_app
JWT_SECRET=your-super-secret-jwt-key-change-this-to-something-random
```

3. **Database Setup**

```bash
# Create database and tables
npm run db:migrate
```

4. **Start Server**

```bash
# Production mode
npm start

# Development mode (auto-restart)
npm run dev
```

## Test Flow

1. **Register Account**

   - Go to http://localhost:4000
   - Click "Đăng ký tài khoản mới"
   - Fill: username (3+ chars), password (6+ chars), email
   - Click "Đăng ký"

2. **Verify Email**

   - Check console for verification code (if no email config)
   - Or check email inbox
   - Enter 6-digit code
   - Click "Xác thực"

3. **Login**

   - Use username/email + password
   - Click "Đăng nhập"
   - Should redirect to main_menu.html

4. **Session Persistence**
   - Refresh page - should stay logged in
   - Close/reopen browser - should stay logged in (7 days)

## API Endpoints

- `POST /api/register` - Register new account
- `POST /api/verify` - Verify email code
- `POST /api/login` - Login user
- `POST /api/logout` - Logout user
- `GET /api/me` - Get current user info
- `GET /api/health` - Server health check

## Database Tables

**users**

- id (BIGINT, PRIMARY KEY)
- email (VARCHAR(191), UNIQUE)
- username (VARCHAR(191), UNIQUE)
- password_hash (VARCHAR(255))
- created_at, updated_at (TIMESTAMP)

**pending_users**

- id (BIGINT, PRIMARY KEY)
- email, username, password_hash
- verify_code (VARCHAR(6))
- expire_at (TIMESTAMP)
- created_at (TIMESTAMP)

## Security Features

- ✅ Password hashing (bcrypt)
- ✅ JWT tokens (HTTP-only cookies)
- ✅ Rate limiting (auth endpoints)
- ✅ Input validation
- ✅ SQL injection protection
- ✅ Helmet security headers
- ✅ Email verification

## Test Commands

```bash
# Health check
curl http://localhost:4000/api/health

# Register (replace with real data)
curl -X POST http://localhost:4000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123","email":"test@example.com"}'

# Login
curl -X POST http://localhost:4000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' \
  -c cookies.txt

# Get user info (with cookies)
curl http://localhost:4000/api/me -b cookies.txt
```

## Troubleshooting

**Database Connection Issues:**

- Ensure MySQL is running
- Check DB credentials in .env
- User needs CREATE DATABASE permission for first run

**Email Issues:**

- Verification codes logged to console if no email config
- Configure email-config.js for production

**Rate Limiting:**

- 10 auth requests per 15 minutes per IP
- 100 general API requests per 15 minutes per IP

**Session Issues:**

- JWT stored in HTTP-only cookie (7 days)
- Client uses sessionStorage for immediate UI state
- Clear browser cookies to reset auth state
