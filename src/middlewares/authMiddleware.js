const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

const authMiddleware = async (req, res, next) => {
  // 1. 从请求头获取 token
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '认证失败：请求头缺少 Token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 2. 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. 在数据库中查找用户，确保用户存在
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true } // 只选择需要的信息
    });

    if (!user) {
      return res.status(401).json({ message: '认证失败：用户不存在' });
    }

    // 4. 将用户信息附加到请求对象上
    req.user = user;

    // 5. 放行
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '认证失败：Token 已过期' });
    }
    res.status(401).json({ message: '认证失败：无效的 Token' });
  }
};

module.exports = authMiddleware;
