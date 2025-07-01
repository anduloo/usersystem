const adminMiddleware = (req, res, next) => {
  // 此中间件必须在 authMiddleware 之后使用
  if (!req.user || (req.user.role !== 'admin' && !req.user.isSuperAdmin)) {
    // 如果是API请求，返回JSON错误
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ message: '访问被拒绝：需要管理员权限' });
    }
    // 如果是页面请求，重定向到登录页面
    return res.redirect('/login?error=需要管理员权限');
  }
  next();
};

module.exports = adminMiddleware;
