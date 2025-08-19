const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const nodemailer = require('nodemailer');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'client')));
app.use('/DesignHud', express.static(path.join(__dirname, 'DesignHud')));

let emailConfig;
try {
    emailConfig = require('./email-config.js');
} catch (error) {
    console.warn('Email config file not found. Please create email-config.js from email-config.example.js');
    emailConfig = {
        service: 'gmail',
        auth: {
            user: 'nekohimeken@gmail.com',
            pass: 'rrme sewt tucm cfcu'
        },
        from: 'nekohimeken@gmail.com'
    };
}

const transporter = nodemailer.createTransport(emailConfig);

const verificationCodes = new Map();
const registeredUsers = new Map();

app.get('/healthcheck', (req, res) => {
  res.send('CBG App running...');
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client/index.html');
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password || !email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin' 
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email không hợp lệ' 
            });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        verificationCodes.set(email, {
            code: verificationCode,
            username,
            password,
            expires: Date.now() + 10 * 60 * 1000
        });

        const mailOptions = {
            from: emailConfig.from,
            to: email,
            subject: 'Xác thực tài khoản - Touhou FM: Battle Card',
            html: `
                <h2>Xác thực tài khoản</h2>
                <p>Chào ${username},</p>
                <p>Mã xác thực của bạn là: <strong style="font-size: 24px; color: #007bff;">${verificationCode}</strong></p>
                <p>Mã này sẽ hết hạn sau 10 phút.</p>
                <p>Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.</p>
                <br>
                <p>Trân trọng,<br>Touhou FM: Battle Card Team</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ 
            success: true, 
            message: 'Mã xác thực đã được gửi đến email của bạn' 
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

app.post('/api/verify', (req, res) => {
    try {
        const { email, code } = req.body;
        
        const verification = verificationCodes.get(email);
        
        if (!verification) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực không tồn tại hoặc đã hết hạn' 
            });
        }

        if (Date.now() > verification.expires) {
            verificationCodes.delete(email);
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực đã hết hạn' 
            });
        }

        if (verification.code !== code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Mã xác thực không đúng' 
            });
        }

        verificationCodes.delete(email);
        
        registeredUsers.set(verification.username, {
            username: verification.username,
            password: verification.password,
            email: email,
            registeredAt: new Date()
        });
        
        console.log('User saved to database:', verification.username);
        console.log('Current registered users:', Array.from(registeredUsers.keys()));
        
        res.json({ 
            success: true, 
            message: 'Đăng ký thành công!'
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin' 
            });
        }

        const user = registeredUsers.get(username);
        console.log('Login attempt for username:', username);
        console.log('Available users in database:', Array.from(registeredUsers.keys()));
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản không tồn tại' 
            });
        }

        if (user.password !== password) {
            return res.status(401).json({ 
                success: false, 
                message: 'Mật khẩu không đúng' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!',
            user: {
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Có lỗi xảy ra, vui lòng thử lại' 
        });
    }
});

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

server.listen(4000, () => {
    console.log('Listening on port 4000');
});
