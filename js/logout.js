console.log('logout.js loaded');
// 通用退出登录模块，兼容admin和portal页面
(function(){
  const logoutBtn = document.getElementById('logout-btn');
  console.log('logoutBtn:', logoutBtn);
  if (!logoutBtn) return;
  logoutBtn.onclick = function() {
    localStorage.removeItem('jwt_token');
    window.location.href = '/login';
  };
})(); 