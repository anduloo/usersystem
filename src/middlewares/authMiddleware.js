const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

const authMiddleware = async (req, res, next) => {
  let token = null;

  // 1. 优先从 cookie 获取 token
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. 其次从请求头获取 token
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // 3. 最后从 query 参数获取 token
  else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    // 页面请求重定向到登录，API请求返回401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ message: '认证失败：缺少Token' });
    }
    return res.redirect('/login?error=请先登录');
  }

  try {
    // 4. 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 5. 在数据库中查找用户，确保用户存在
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, isSuperAdmin: true }
    });

    if (!user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ message: '认证失败：用户不存在' });
      }
      return res.redirect('/login?error=用户不存在');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ message: '认证失败：Token已过期' });
      }
      return res.redirect('/login?error=Token已过期');
    }
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ message: '认证失败：无效的Token' });
    }
    return res.redirect('/login?error=无效的Token');
  }
};

module.exports = authMiddleware;


