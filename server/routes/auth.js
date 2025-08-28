const express = require('express');
const { pool } = require('../db');
const { hashPassword, comparePassword } = require('../utils/password');
const { signJwt, verifyJwt } = require('../utils/jwt');
const nodemailer = require('nodemailer');

const router = express.Router();

// Load email config
let emailConfig;
try {
  emailConfig = require('../../email-config.js');
} catch (error) {
  console.warn('Email config not found, email features disabled');
}

// Generate 6-digit verification code
function generateVerifyCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, code) {
  if (!emailConfig) {
    console.log(`[DEV] Verification code for ${email}: ${code}`);
    return;
  }

  const transporter = nodemailer.createTransport(emailConfig);
  
  await transporter.sendMail({
    from: emailConfig.auth.user,
    to: email,
    subject: 'Game Account Verification',
    html: `
      <h2>Welcome to Game!</h2>
      <p>Your verification code is: <strong>${code}</strong></p>
      <p>This code will expire in 10 minutes.</p>
    `
  });
}

// POST /api/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    // Basic validation
    if (!username || !password || !email) {
      return res.json({ success: false, message: 'All fields required' });
    }

    if (username.length < 3) {
      return res.json({ success: false, message: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({ success: false, message: 'Invalid email format' });
    }

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existingUsers.length > 0) {
      return res.json({ success: false, message: 'Email or username already exists' });
    }

    // Check pending users
    const [pendingUsers] = await pool.execute(
      'SELECT id FROM pending_users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (pendingUsers.length > 0) {
      // Remove old pending registration
      await pool.execute(
        'DELETE FROM pending_users WHERE email = ? OR username = ?',
        [email, username]
      );
    }

    // Hash password and generate code
    const passwordHash = await hashPassword(password);
    const verifyCode = generateVerifyCode();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Insert pending user
    await pool.execute(
      'INSERT INTO pending_users (email, username, password_hash, verify_code, expire_at) VALUES (?, ?, ?, ?, ?)',
      [email, username, passwordHash, verifyCode, expireAt]
    );

    // Send verification email
    try {
      await sendVerificationEmail(email, verifyCode);
    } catch (emailError) {
      console.error('Email send failed:', emailError);
      // Continue anyway for dev purposes
    }

    res.json({ success: true, message: 'Verification code sent to email' });

  } catch (error) {
    console.error('Register error:', error);
    res.json({ success: false, message: 'Registration failed' });
  }
});

// POST /api/verify
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.json({ success: false, message: 'Email and code required' });
    }

    // Find pending user
    const [pendingUsers] = await pool.execute(
      'SELECT * FROM pending_users WHERE email = ? AND verify_code = ? AND expire_at > NOW()',
      [email, code]
    );

    if (pendingUsers.length === 0) {
      return res.json({ success: false, message: 'Invalid or expired verification code' });
    }

    const pendingUser = pendingUsers[0];

    // Create actual user
    await pool.execute(
      'INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)',
      [pendingUser.email, pendingUser.username, pendingUser.password_hash]
    );

    // Remove pending user
    await pool.execute(
      'DELETE FROM pending_users WHERE id = ?',
      [pendingUser.id]
    );

    res.json({ success: true, message: 'Account verified successfully' });

  } catch (error) {
    console.error('Verify error:', error);
    res.json({ success: false, message: 'Verification failed' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ success: false, message: 'Username and password required' });
    }

    // Find user by username or email
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (users.length === 0) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    const user = users[0];

    // Check password
    const passwordValid = await comparePassword(password, user.password_hash);
    if (!passwordValid) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = signJwt({ userId: user.id });

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user info
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar || null
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.json({ success: false, message: 'Login failed' });
  }
});

// POST /api/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Middleware to verify JWT token
function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const decoded = verifyJwt(token);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// GET /api/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, username, email, created_at FROM users WHERE id = ?',
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: users[0]
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user info' });
  }
});

module.exports = router;
