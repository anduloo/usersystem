const express = require('express');
const router = express.Router();
const { getMe, getAllUsers, getUserProjects, resetPassword, activateUser, deactivateUser, setAdmin, unsetAdmin, updateUser } = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const prisma = require('../utils/prisma');

// 这个路由受到 authMiddleware 的保护
// 任何对 /me 的 GET 请求都会先经过 authMiddleware 的检查
router.get('/me', authMiddleware, getMe);

// 获取所有用户列表 (仅管理员)
router.get('/', authMiddleware, adminMiddleware, getAllUsers);

// 获取指定用户已分配的所有项目 (仅管理员)
router.get('/:id/projects', authMiddleware, adminMiddleware, getUserProjects);

// 更新用户信息 (仅管理员)
router.put('/:id', authMiddleware, adminMiddleware, updateUser);

// 重置用户密码 (仅管理员)
router.post('/:id/reset-password', authMiddleware, adminMiddleware, resetPassword);

// 启用用户 (仅管理员)
router.patch('/:id/activate', authMiddleware, adminMiddleware, activateUser);

// 禁用用户 (仅管理员)
router.patch('/:id/deactivate', authMiddleware, adminMiddleware, deactivateUser);

// 设置为管理员 (仅管理员)
router.patch('/:id/set-admin', authMiddleware, adminMiddleware, setAdmin);

// 取消管理员 (仅管理员)
router.patch('/:id/unset-admin', authMiddleware, adminMiddleware, unsetAdmin);

// 管理员操作日志查询 (仅管理员)
router.get('/admin-logs', authMiddleware, adminMiddleware, async (req, res) => {
  const logs = await prisma.adminLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  res.json(logs);
});

// 用户登录日志查询（仅本人）
router.get('/login-logs', authMiddleware, async (req, res) => {
  const logs = await prisma.userLoginLog.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  res.json(logs);
});

// 用户访问项目日志查询（仅本人）
router.get('/project-access-logs', authMiddleware, async (req, res) => {
  const logs = await prisma.userProjectAccessLog.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  res.json(logs);
});

// 管理员查询所有用户的登录日志
router.get('/admin/user-login-logs', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.query;
  const where = userId ? { userId: Number(userId) } : {};
  const logs = await prisma.userLoginLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  res.json(logs);
});

// 管理员查询所有用户的访问项目日志
router.get('/admin/user-project-access-logs', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.query;
  const where = userId ? { userId: Number(userId) } : {};
  const logs = await prisma.userProjectAccessLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  res.json(logs);
});

// 用户访问项目日志记录接口
router.post('/visit-project', authMiddleware, async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ message: '缺少projectId' });
  await prisma.userProjectAccessLog.create({
    data: {
      userId: req.user.id,
      projectId: Number(projectId),
      ip: req.headers['x-forwarded-for'] || req.ip,
      userAgent: req.headers['user-agent'] || ''
    }
  });
  res.json({ success: true });
});

// 仪表盘统计接口
router.get('/admin/dashboard-stats', authMiddleware, adminMiddleware, async (req, res) => {
  const [projectAccess, userLogin, userCount, projectCount, projects, users, cityLogin] = await Promise.all([
    prisma.userProjectAccessLog.groupBy({
      by: ['projectId'],
      _count: { projectId: true }
    }),
    prisma.userLoginLog.groupBy({
      by: ['userId'],
      _count: { userId: true }
    }),
    prisma.user.count(),
    prisma.project.count(),
    prisma.project.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.userLoginLog.groupBy({
      by: ['city'],
      _count: { city: true }
    })
  ]);
  res.json({
    projectAccess,
    userLogin,
    userCount,
    projectCount,
    projects,
    users,
    cityLogin
  });
});

// 当前用户自助修改密码
router.post('/me/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ message: '参数不完整' });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ message: '用户不存在' });
  const valid = await require('bcryptjs').compare(oldPassword, user.password);
  if (!valid) return res.status(400).json({ message: '当前密码错误' });
  if (newPassword.length < 6) return res.status(400).json({ message: '新密码不能少于6位' });
  const hashed = await require('bcryptjs').hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
  res.json({ success: true });
});

module.exports = router;
