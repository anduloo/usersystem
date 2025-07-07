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

// 微信登录相关逻辑
let currentQRId = null;
let qrCheckInterval = null;
let qrGenerated = false; // 标记是否已生成二维码
let qrHoverTimeout = null; // 防抖定时器

// 页面加载时强制清理所有状态
clearQRCode();

// 登录方式切换
const passwordLoginBtn = document.getElementById('password-login-btn');
const wechatLoginBtn = document.getElementById('wechat-login-btn');
const passwordLoginForm = document.getElementById('password-login-form');
const wechatLoginForm = document.getElementById('wechat-login-form');

// 生成微信授权链接
async function generateWechatAuth() {

  // 如果已经生成过二维码，直接返回
  if (qrGenerated) {
    return;
  }
  
  // 先清理之前的状态
  clearQRCode();
  
  const qrLoading = document.getElementById('qr-loading');
  const qrCode = document.getElementById('qr-code');
  const qrExpired = document.getElementById('qr-expired');
  
  // 显示加载状态
  qrLoading.style.display = 'flex';
  qrCode.style.display = 'none';
  qrExpired.style.display = 'none';
  
  try {
    const response = await fetch('/api/auth/wechat/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (data.success) {
      currentQRId = data.qrId;
      qrGenerated = true; // 标记已生成二维码
      
      // 生成二维码图片
      const qrImage = document.getElementById('qr-image');
      qrImage.innerHTML = ''; // 清空之前的内容
      
      // 使用阿里云qrcode库生成二维码
      new QRCode(qrImage, {
        text: data.authUrl,
        width: 180,
        height: 180,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
      
      // 显示二维码
      qrLoading.style.display = 'none';
      qrCode.style.display = 'flex';
      
      // 开始检查登录状态
      startQRStatusCheck();
    } else {
      throw new Error(data.message || '生成微信授权链接失败');
    }
  } catch (error) {
    console.error('生成微信授权链接失败:', error);
    qrLoading.style.display = 'none';
    qrExpired.style.display = 'flex';
  }
}

// 开始检查二维码状态
function startQRStatusCheck() {
  if (qrCheckInterval) {
    clearInterval(qrCheckInterval);
  }
  
  
  qrCheckInterval = setInterval(async () => {
    if (!currentQRId) {
      return;
    }
    
    try {
      const response = await fetch(`/api/auth/wechat/status/${currentQRId}`);
      const data = await response.json();
      
      // 检查二维码状态
      if (data.status === 'incomplete' && data.needBind) {
        // 显示补全信息弹窗，但继续检查状态
        showBindInfoModal(data.qrId || currentQRId, data.nickname || '');
      } else if (data.status === 'unverified' && data.needBind) {
        // 对于unverified状态，显示补全信息弹窗，让用户填写邮箱
        showBindInfoModal(data.qrId || currentQRId, data.nickname || '');
      } else if (data.status === 'confirmed' && data.token) {
        // 已绑定，直接登录
        clearQRCode();
        handleWechatLoginSuccess(data.token);
      } else if (data.status === 'expired') {
        // 二维码过期
        clearQRCode();
        showQRExpired();
      } else {
    }
    } catch (error) {
      console.error('检查二维码状态失败:', error);
    }
  }, 2000);
}

// 清理二维码状态
function clearQRCode() {
  if (qrCheckInterval) {
    clearInterval(qrCheckInterval);
    qrCheckInterval = null;
  }
  currentQRId = null;
  qrGenerated = false; // 重置生成标记
}

// 停止二维码状态检查（鼠标离开时调用）
function stopQRStatusCheck() {
  if (qrCheckInterval) {
    clearInterval(qrCheckInterval);
    qrCheckInterval = null;
  }
}

// 显示二维码过期
function showQRExpired() {
  const qrLoading = document.getElementById('qr-loading');
  const qrCode = document.getElementById('qr-code');
  const qrExpired = document.getElementById('qr-expired');
  
  qrLoading.style.display = 'none';
  qrCode.style.display = 'none';
  qrExpired.style.display = 'flex';
}

// 处理微信登录成功
function handleWechatLoginSuccess(token) {
  // 先停止轮询，避免继续生成新二维码
  clearQRCode();
  
  // 显示成功提示
  const qrContainer = document.querySelector('.qr-container');
  if (qrContainer) {
    qrContainer.innerHTML = `
      <div class="wechat-success">
        <i class="fa fa-check-circle"></i>
        <p>登录成功！正在跳转...</p>
      </div>
    `;
  }
  
  // 获取重定向URL
  const redirectUri = new URLSearchParams(window.location.search).get('redirect_uri');
  let destinationUrl;
  
  if (redirectUri) {
    destinationUrl = redirectUri;
  } else {
    destinationUrl = '/portal';
  }
  
  // 确保localStorage中的token是最新的
  localStorage.setItem('jwt_token', token);
  
  setTimeout(() => {
    window.location.href = destinationUrl;
  }, 1500);
}

// 微信绑定信息弹窗修复：只绑定一次onsubmit，避免输入内容消失
const bindInfoForm = document.getElementById('bindInfoForm');
const bindInfoModal = document.getElementById('bindInfoModal');
const bindInfoError = document.getElementById('bindInfoError');
let currentBindQrId = null;
let bindInfoModalOpened = false;

bindInfoForm.onsubmit = async function(e) {
  e.preventDefault();
  const email = document.getElementById('bind-email').value.trim();
  const name = document.getElementById('bind-name').value.trim();
  if (!email || !name) {
    bindInfoError.textContent = '请填写完整信息';
    bindInfoError.style.display = 'block';
    return;
  }
  try {
    await completeUserInfo(currentBindQrId, email, name);
  } catch (err) {
    bindInfoError.textContent = '请求失败';
    bindInfoError.style.display = 'block';
  }
};

function showBindInfoModal(qrId, nickname) {
  if (!bindInfoModal) return;
  if (!bindInfoModalOpened) {
    bindInfoError.style.display = 'none';
    document.getElementById('bind-name').value = nickname || '';
    document.getElementById('bind-email').value = '';
    currentBindQrId = qrId;
    bindInfoModalOpened = true;
  }
  bindInfoModal.style.display = 'flex';
}

// 补全用户信息
async function completeUserInfo(qrId, email, name) {
  try {
    const response = await fetch('/api/auth/wechat/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrId, email, name })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // 信息补全成功，显示邮箱验证提示
      showEmailVerificationModal(email);
      
      // 重新开始轮询
      currentQRId = qrId;
      startQRStatusCheck();
      closeBindInfoModal();
    } else {
      throw new Error(data.message || '补全信息失败');
    }
  } catch (error) {
    console.error('补全用户信息失败:', error);
    const errorDiv = document.getElementById('bindInfoError');
    errorDiv.textContent = error.message || '补全信息失败，请重试';
    errorDiv.style.display = 'block';
  }
}

// 显示邮箱验证提示弹窗
function showEmailVerificationModal(email) {
  // 创建提示弹窗
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.zIndex = '9999';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px; text-align: center; padding: 2rem;">
      <div style="margin-bottom: 1rem;">
        <i class="fa fa-envelope" style="font-size: 3rem; color: var(--accent);"></i>
      </div>
      <h3 style="margin-bottom: 1rem; color: #333;">请验证邮箱</h3>
      <p style="margin-bottom: 1.5rem; color: #666; line-height: 1.5;">
        我们已向 <strong>${email}</strong> 发送了验证邮件，<br>
        请前往邮箱完成验证后即可登录。
      </p>
      <div style="margin-bottom: 1rem;">
        <button type="button" class="login-btn" onclick="closeEmailVerificationModal()" style="margin-right: 0.5rem;">
          知道了
        </button>
        <button type="button" class="btn btn-secondary" onclick="resendVerificationEmail('${email}')">
          重新发送
        </button>
      </div>
      <p style="font-size: 0.9rem; color: #999; margin-top: 1rem;">
        验证邮件24小时内有效
      </p>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 点击遮罩关闭
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeEmailVerificationModal();
    }
  });
  
  // ESC键关闭
  document.addEventListener('keydown', function closeOnEsc(e) {
    if (e.key === 'Escape') {
      closeEmailVerificationModal();
      document.removeEventListener('keydown', closeOnEsc);
    }
  });
}

// 关闭邮箱验证提示弹窗
function closeEmailVerificationModal() {
  const modal = document.querySelector('.modal');
  if (modal && modal.querySelector('.fa-envelope')) {
    modal.remove();
  }
}

// 重新发送验证邮件
async function resendVerificationEmail(email) {
  try {
    const response = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('验证邮件已重新发送，请查收邮箱');
    } else {
      alert(data.message || '发送失败，请稍后重试');
    }
  } catch (error) {
    console.error('重新发送验证邮件失败:', error);
    alert('发送失败，请稍后重试');
  }
}

// 关闭绑定信息弹窗
function closeBindInfoModal() {
  if (bindInfoModal) {
    bindInfoModal.style.display = 'none';
    bindInfoModalOpened = false;
  }
}

// 刷新二维码按钮事件
document.getElementById('refresh-qr-btn').onclick = () => {
  clearQRCode(); // 清理状态
  generateWechatAuth();
};
document.getElementById('refresh-expired-btn').onclick = () => {
  clearQRCode(); // 清理状态
  generateWechatAuth();
};

// 微信扫码登录按钮悬停时生成二维码（带防抖）
if (wechatLoginBtn) {
  wechatLoginBtn.addEventListener('mouseenter', () => {
    // 清除之前的防抖定时器
    if (qrHoverTimeout) {
      clearTimeout(qrHoverTimeout);
    }
    
    // 设置防抖延迟
    qrHoverTimeout = setTimeout(() => {
      generateWechatAuth();
    }, 300); // 300ms 防抖延迟
  });
  
  wechatLoginBtn.addEventListener('mouseleave', () => {
    // 清除防抖定时器
    if (qrHoverTimeout) {
      clearTimeout(qrHoverTimeout);
      qrHoverTimeout = null;
    }
    
    // 延迟停止状态检查，给状态检查一些时间来处理
    setTimeout(() => {
      // 只有在没有检测到需要处理的状态时才停止检查
      // 检查是否有弹窗显示，如果有则不停止检查
      const bindModal = document.getElementById('bindInfoModal');
      const emailModal = document.querySelector('.modal');
      
      if (qrCheckInterval && !bindModal?.style.display === 'flex' && !emailModal) {
        stopQRStatusCheck();
      }
    }, 2000); // 延迟2秒停止检查，给更多时间处理状态
  });
} 