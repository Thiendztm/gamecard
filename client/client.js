var socket = io();

function hideAllBoxes() {
	document.getElementById('login').style.display = 'none';
	document.getElementById('Register').style.display = 'none';
	document.getElementById('Verification').style.display = 'none';
	document.getElementById('Forgot-Password').style.display = 'none';
	document.getElementById('logged-in').style.display = 'none';
}

function hideAllScreens() {
	hideAllBoxes();
	document.getElementById('main-menu').style.display = 'none';
}

function showBox(boxId) {
	hideAllBoxes();
	document.getElementById(boxId).style.display = 'block';
	
	if (boxId === 'Verification') {
		const email = sessionStorage.getItem('registrationEmail');
		if (email) {
			const descText = document.querySelector('#Verification .desc-txt');
			descText.innerHTML = `Mã xác thực đã được gửi đến <strong>${email}</strong>.<br>Vui lòng kiểm tra hộp thư và nhập mã 6 số bên dưới:`;
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

document.querySelector('.register-lb').onclick = function() {
	showBox('Register');
};

document.querySelector('.forgot-password-lb').onclick = function() {
	showBox('Forgot-Password');
};

document.querySelectorAll('.back-btn').forEach(function(btn) {
	btn.onclick = function() {
		showBox('login');
	};
});

document.querySelector('.register-btn').onclick = async function(e) {
	e.preventDefault();
	
	const username = document.querySelector('#Register .username-txt').value.trim();
	const password = document.querySelector('#Register .password-txt').value.trim();
	const email = document.querySelector('#Register .email-txt').value.trim();

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

document.querySelector('.verify-btn').onclick = async function(e) {
	e.preventDefault();
	
	const code = document.querySelector('.verification-txt').value.trim();
	const email = sessionStorage.getItem('registrationEmail');

	if (!code) {
		showMessage('Vui lòng nhập mã xác thực', true);
		return;
	}

	if (code.length !== 6) {
		showMessage('Mã xác thực không hợp lệ', true);
		return;
	}

	const verifyBtn = this;
	const originalText = verifyBtn.value;
	verifyBtn.disabled = true;
	verifyBtn.value = 'Đợi một chút...';
	verifyBtn.style.opacity = '0.6';

	try {
		const response = await fetch('/api/verify', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ email, code })
		});

		const data = await response.json();

		if (data.success) {
			showMessage('Đăng kí tài khoản thành công!');
			sessionStorage.removeItem('registrationEmail');
			sessionStorage.removeItem('pendingRegistration');
			
			document.querySelector('#Register .username-txt').value = '';
			document.querySelector('#Register .password-txt').value = '';
			document.querySelector('#Register .email-txt').value = '';
			document.querySelector('.verification-txt').value = '';
			
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

document.querySelector('.login-btn').onclick = async function(e) {
	e.preventDefault();
	
	const username = document.querySelector('#login .username-txt').value.trim();
	const password = document.querySelector('#login .password-txt').value.trim();

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

		const data = await response.json();

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
