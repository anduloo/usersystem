
// 通用修改密码模块，兼容admin和portal页面
(function(){
  const changePwdBtn = document.getElementById('change-password-btn');
  const changePwdModal = document.getElementById('change-password-modal');
  const changePwdForm = document.getElementById('change-password-form');
  const changePwdError = document.getElementById('change-password-error');
  const cancelChangePwd = document.getElementById('cancel-change-password-modal');
   if (!changePwdBtn || !changePwdModal || !changePwdForm) return;
  changePwdBtn.onclick = function() {
    changePwdModal.style.display = 'flex';
    document.getElementById('old-password').focus();
  };
  cancelChangePwd.onclick = function() {
    changePwdModal.style.display = 'none';
    changePwdForm.reset();
    changePwdError.style.display = 'none';
  };
  changePwdForm.onsubmit = async function(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('old-password').value.trim();
    const newPassword = document.getElementById('new-password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();
    if (newPassword.length < 6) {
      changePwdError.textContent = '新密码不能少于6位';
      changePwdError.style.display = 'block';
      return;
    }
    if (newPassword !== confirmPassword) {
      changePwdError.textContent = '两次输入的新密码不一致';
      changePwdError.style.display = 'block';
      return;
    }
    try {
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      if (res.ok) {
        changePwdError.textContent = '密码修改成功，请重新登录';
        changePwdError.style.display = 'block';
        setTimeout(() => {
          localStorage.removeItem('jwt_token');
          window.location.href = '/login';
        }, 1000);
      } else {
        const data = await res.json();
        changePwdError.textContent = data.message || '密码修改失败';
        changePwdError.style.display = 'block';
      }
    } catch (err) {
      changePwdError.textContent = '请求失败，请重试';
      changePwdError.style.display = 'block';
    }
  };
})(); 