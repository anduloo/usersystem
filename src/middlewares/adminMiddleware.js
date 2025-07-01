const adminMiddleware = (req, res, next) => {
  // 此中间件必须在 authMiddleware 之后使用
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: '访问被拒绝：需要管理员权限' });
  }
  next();
};

module.exports = adminMiddleware;
