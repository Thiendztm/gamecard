var socket = io();

function hideAllBoxes() {
	document.getElementById('login').style.display = 'none';
	document.getElementById('Register').style.display = 'none';
	document.getElementById('Forgot-Password').style.display = 'none';
	document.getElementById('logged-in').style.display = 'none';
}

function showBox(boxId) {
	hideAllBoxes();
	document.getElementById(boxId).style.display = 'block';
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

document.querySelector('.login-btn').onclick = function(e) {
	e.preventDefault();
	// TODO: Thêm xác thực ở đây
	showBox('logged-in');
	// Hiển thị tên tài khoản
	var username = document.querySelector('.username-txt').value;
	document.getElementById('username-txt').textContent = username;
};

document.querySelector('.logout-btn').onclick = function() {
	showBox('login');
};

document.querySelector('.switch-account-btn').onclick = function() {
	showBox('login');
};

window.onload = function() {
	showBox('login');
};