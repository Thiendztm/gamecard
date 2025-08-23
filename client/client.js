// Socket will be initialized by main_menu.js
// var socket = io();

function hideAllBoxes() {
	const loginBox = document.getElementById('login');
	const registerBox = document.getElementById('Register');
	const verificationBox = document.getElementById('Verification');
	const forgotPasswordBox = document.getElementById('Forgot-Password');
	const loggedInBox = document.getElementById('logged-in');
	
	if (loginBox) loginBox.style.display = 'none';
	if (registerBox) registerBox.style.display = 'none';
	if (verificationBox) verificationBox.style.display = 'none';
	if (forgotPasswordBox) forgotPasswordBox.style.display = 'none';
	if (loggedInBox) loggedInBox.style.display = 'none';
}

function hideAllScreens() {
	hideAllBoxes();
	const mainMenu = document.getElementById('main-menu');
	if (mainMenu) mainMenu.style.display = 'none';
}

function showBox(boxId) {
	hideAllBoxes();
	const boxElement = document.getElementById(boxId);
	if (boxElement) {
		boxElement.style.display = 'block';
	}
	
	if (boxId === 'Verification') {
		const email = sessionStorage.getItem('registrationEmail');
		if (email) {
			const descText = document.querySelector('#Verification .desc-txt');
			if (descText) {
				descText.innerHTML = `Mã xác thực đã được gửi đến <strong>${email}</strong>.<br>Vui lòng kiểm tra hộp thư và nhập mã 6 số bên dưới:`;
			}
		}
	}
}

function showMessage(message, isError = false) {
	const existingAlert = document.querySelector('.alert-message');
	if (existingAlert) {
		existingAlert.remove();
	}

	const alertDiv = document.createElement('div');
	alertDiv.className = `alert-message ${isError ? 'error' : 'success'}`;
	alertDiv.textContent = message;
	alertDiv.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		padding: 15px 20px;
		border-radius: 5px;
		color: white;
		font-weight: bold;
		z-index: 1000;
		animation: slideIn 0.3s ease-out;
		background-color: ${isError ? '#dc3545' : '#28a745'};
	`;

	document.body.appendChild(alertDiv);

	setTimeout(() => {
		alertDiv.remove();
	}, 5000);
}

// Add null checks for DOM elements before setting onclick properties
const registerLb = document.querySelector('.register-lb');
if (registerLb) {
    registerLb.onclick = function() {
        showBox('Register');
    };
}

const forgotPasswordLb = document.querySelector('.forgot-password-lb');
if (forgotPasswordLb) {
    forgotPasswordLb.onclick = function() {
        showBox('Forgot-Password');
    };
}

const backBtns = document.querySelectorAll('.back-btn');
if (backBtns.length > 0) {
    backBtns.forEach(function(btn) {
        btn.onclick = function() {
            showBox('login');
        };
    });
}

const registerBtn = document.querySelector('.register-btn');
if (registerBtn) {
    registerBtn.onclick = async function(e) {
        e.preventDefault();
        
        const usernameField = document.querySelector('#Register .username-txt');
        const passwordField = document.querySelector('#Register .password-txt');
        const emailField = document.querySelector('#Register .email-txt');
        
        if (!usernameField || !passwordField || !emailField) {
            showMessage('Không thể tìm thấy các trường nhập liệu', true);
            return;
        }
        
        const username = usernameField.value.trim();
        const password = passwordField.value.trim();
        const email = emailField.value.trim();

        if (!username || !password || !email) {
            showMessage('Vui lòng điền đầy đủ thông tin', true);
            return;
        }

        if (username.length < 3) {
            showMessage('Tên tài khoản phải có ít nhất 3 ký tự', true);
            return;
        }

        if (password.length < 6) {
            showMessage('Mật khẩu phải có ít nhất 6 ký tự', true);
            return;
        }

        const registerBtn = this;
        const originalText = registerBtn.value;
        registerBtn.disabled = true;
        registerBtn.value = 'Đang xử lý...';
        registerBtn.style.opacity = '0.6';

        try {
            showMessage('Đang gửi mã xác thực đến email...', false);
            
            sessionStorage.setItem('registrationEmail', email);
            sessionStorage.setItem('pendingRegistration', JSON.stringify({ username, password, email }));
            showBox('Verification');
            
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, email })
            });

            // Check if response is JSON or HTML
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                // If it's HTML (rate limit page), treat as error
                const text = await response.text();
                data = { 
                    success: false, 
                    message: response.status === 429 ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' : 'Có lỗi xảy ra từ server.'
                };
            }

            if (data.success) {
                showMessage('Mã xác thực đã được gửi đến email của bạn!');
            } else {
                showMessage(data.message, true);
                showBox('Register');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showMessage('Có lỗi xảy ra, vui lòng thử lại', true);
            showBox('Register');
        } finally {
            registerBtn.disabled = false;
            registerBtn.value = originalText;
            registerBtn.style.opacity = '1';
        }
    };
}

const verifyBtn = document.querySelector('.verify-btn');
if (verifyBtn) {
    verifyBtn.onclick = async function(e) {
        e.preventDefault();
        
        const codeField = document.querySelector('.verification-txt');
        if (!codeField) {
            showMessage('Không thể tìm thấy trường nhập mã xác thực', true);
            return;
        }
        
        const code = codeField.value.trim();
        
        if (!code) {
            showMessage('Vui lòng nhập mã xác thực', true);
            return;
        }
        
        const email = sessionStorage.getItem('registrationEmail');
        if (!email) {
            showMessage('Không tìm thấy thông tin đăng ký', true);
            showBox('Register');
            return;
        }
        
        const verifyBtn = this;
        const originalText = verifyBtn.value;
        verifyBtn.disabled = true;
        verifyBtn.value = 'Đang xử lý...';
        verifyBtn.style.opacity = '0.6';
        
        try {
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, code })
            });
            
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = { 
                    success: false, 
                    message: response.status === 429 ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' : 'Có lỗi xảy ra từ server.'
                };
            }
            
            if (data.success) {
                showMessage('Đăng ký thành công! Bạn có thể đăng nhập ngay bây giờ.');
                sessionStorage.removeItem('registrationEmail');
                sessionStorage.removeItem('pendingRegistration');
                showBox('login');
            } else {
                showMessage(data.message, true);
            }
        } catch (error) {
            console.error('Verification error:', error);
            showMessage('Có lỗi xảy ra, vui lòng thử lại', true);
        } finally {
            verifyBtn.disabled = false;
            verifyBtn.value = originalText;
            verifyBtn.style.opacity = '1';
        }
    };
}

const loginBtn = document.querySelector('.login-btn');
if (loginBtn) {
    loginBtn.onclick = async function(e) {
        e.preventDefault();
        
        const usernameField = document.querySelector('#login .username-txt');
        const passwordField = document.querySelector('#login .password-txt');
        
        if (!usernameField || !passwordField) {
            showMessage('Không thể tìm thấy các trường nhập liệu', true);
            return;
        }
        
        const username = usernameField.value.trim();
        const password = passwordField.value.trim();

        if (!username || !password) {
            showMessage('Vui lòng điền đầy đủ thông tin', true);
            return;
        }

        const loginBtn = this;
        const originalText = loginBtn.value;
        loginBtn.disabled = true;
        loginBtn.value = 'Đang đăng nhập...';
        loginBtn.style.opacity = '0.6';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = { 
                    success: false, 
                    message: response.status === 429 ? 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' : 'Có lỗi xảy ra từ server.'
                };
            }

            if (data.success) {
                sessionStorage.setItem('user', JSON.stringify(data.user));
                
                window.location.href = 'main_menu.html';
            } else {
                showMessage(data.message, true);
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('Có lỗi xảy ra, vui lòng thử lại', true);
        } finally {
            loginBtn.disabled = false;
            loginBtn.value = originalText;
            loginBtn.style.opacity = '1';
        }
    };
}


window.onload = function() {
	const user = sessionStorage.getItem('user');
	console.log('User in storage:', user);
	
	if (user) {
		window.location.href = 'main_menu.html';
	} else {
		hideAllBoxes();
		document.getElementById('login').style.display = 'block';
	}
	
	// Setup button handlers after DOM is loaded
	const logoutBtn = document.querySelector('.logout-btn');
	if (logoutBtn) {
		logoutBtn.onclick = function() {
			sessionStorage.removeItem('user');
			window.location.href = 'index.html';
		};
	}

	const switchAccountBtn = document.querySelector('.switch-account-btn');
	if (switchAccountBtn) {
		switchAccountBtn.onclick = function() {
			sessionStorage.removeItem('user');
			window.location.href = 'index.html';
		};
	}
};
