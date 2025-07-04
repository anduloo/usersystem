// 密码显示/隐藏切换
const passwordInput = document.getElementById('login-password');
const togglePassword = document.getElementById('togglePassword');
togglePassword.addEventListener('click', function() {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    const icon = this.querySelector('i');
    if (type === 'text') {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    } else {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    }
});
// 注册弹窗逻辑
const showRegisterModalBtn = document.getElementById('showRegisterModalBtn');
const registerModal = document.getElementById('registerModal');
function closeRegisterModal() {
    registerModal.style.display = 'none';
}
showRegisterModalBtn.onclick = function(e) {
    e.preventDefault();
    registerModal.style.display = 'flex';
    document.getElementById('register-name').focus();
};
// 邮箱格式校验
function validateRegisterForm() {
    const email = document.getElementById('register-email').value.trim();
    const errorDiv = document.getElementById('registerEmailError');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        errorDiv.textContent = '请输入有效的邮箱地址';
        errorDiv.style.display = 'block';
        return false;
    }
    errorDiv.style.display = 'none';
    return true;
}
// ESC关闭弹窗
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeRegisterModal();
});
// 点击遮罩关闭弹窗
registerModal.addEventListener('click', function(e) {
    if (e.target === registerModal) closeRegisterModal();
});

const showForgotPasswordModalBtn = document.getElementById('showForgotPasswordModalBtn');
const forgotPasswordModal = document.getElementById('forgotPasswordModal');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const forgotPasswordTip = document.getElementById('forgotPasswordTip');
const cancelForgotPasswordModal = document.getElementById('cancelForgotPasswordModal');

showForgotPasswordModalBtn.onclick = function(e) {
  e.preventDefault();
  forgotPasswordModal.style.display = 'flex';
  forgotPasswordTip.style.display = 'none';
  forgotPasswordForm.reset();
  document.getElementById('forgot-email').focus();
};
cancelForgotPasswordModal.onclick = function() {
  forgotPasswordModal.style.display = 'none';
};
forgotPasswordForm.onsubmit = async function(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const sendBtn = document.getElementById('forgotSendBtn');
  const sendBtnText = document.getElementById('forgotSendBtnText');
  const sendBtnLoading = document.getElementById('forgotSendBtnLoading');
  forgotPasswordTip.className = 'form-error';
  forgotPasswordTip.style.display = 'none';

  // loading
  sendBtn.disabled = true;
  sendBtnText.style.display = 'none';
  sendBtnLoading.style.display = 'inline-block';

  try {
    const res = await fetch('/api/auth/request-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.success) {
      forgotPasswordTip.textContent = data.message;
      forgotPasswordTip.className = 'form-success';
      forgotPasswordTip.style.display = 'block';
      // 2秒后自动关闭弹窗
      setTimeout(() => {
        forgotPasswordModal.style.display = 'none';
        forgotPasswordForm.reset();
        forgotPasswordTip.style.display = 'none';
        sendBtn.disabled = false;
        sendBtnText.style.display = '';
        sendBtnLoading.style.display = 'none';
      }, 2000);
    } else {
      forgotPasswordTip.textContent = data.message || '发送失败';
      forgotPasswordTip.className = 'form-error';
      forgotPasswordTip.style.display = 'block';
      sendBtn.disabled = false;
      sendBtnText.style.display = '';
      sendBtnLoading.style.display = 'none';
    }
  } catch (err) {
    forgotPasswordTip.textContent = '请求失败';
    forgotPasswordTip.className = 'form-error';
    forgotPasswordTip.style.display = 'block';
    sendBtn.disabled = false;
    sendBtnText.style.display = '';
    sendBtnLoading.style.display = 'none';
  }
}; 