const express = require('express');
const router = express.Router();
const { getMe, getAllUsers, getUserProjects, resetPassword, activateUser, deactivateUser, setAdmin, unsetAdmin, updateUser, deleteUser } = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const prisma = require('../utils/prisma');
const { getCityByIp } = require('../controllers/authController');

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

// 删除用户 (仅管理员)
router.delete('/:id', authMiddleware, adminMiddleware, deleteUser);

// 管理员操作日志查询 (仅管理员)
router.get('/admin-logs', authMiddleware, adminMiddleware, async (req, res) => {
  // 先查日志
  const logs = await prisma.adminLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  // 批量查管理员、项目、用户
  const adminIds = Array.from(new Set(logs.map(l => l.adminId))).filter(Boolean);
  const userIds = Array.from(new Set(logs.filter(l => l.targetType === 'User').map(l => l.targetId))).filter(Boolean);
  const projectIds = Array.from(new Set(logs.filter(l => l.targetType === 'Project').map(l => l.targetId))).filter(Boolean);
  const [admins, users, projects] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: adminIds } } }),
    prisma.user.findMany({ where: { id: { in: userIds } } }),
    prisma.project.findMany({ where: { id: { in: projectIds } } })
  ]);
  const adminMap = Object.fromEntries(admins.map(a => [a.id, a.name || a.email]));
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name || u.email]));
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  // 字段兼容前端
  const result = logs.map(log => ({
    ...log,
    adminName: adminMap[log.adminId] || log.adminId,
    objectType: log.targetType || '',
    objectId: log.targetId != null ? String(log.targetId) : '',
    objectName: log.targetType === 'Project' ? (projectMap[log.targetId] || log.targetId) : (log.targetType === 'User' ? (userMap[log.targetId] || log.targetId) : log.targetId),
    details: log.detail || ''
  }));
  res.json(result);
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
  // 联表查出项目名称
  const logs = await prisma.userProjectAccessLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { project: true }
  });
  const result = logs.map(log => ({
    ...log,
    projectName: log.project ? log.project.name : log.projectId
  }));
  res.json(result);
});

// 用户访问项目日志记录接口
router.post('/visit-project', authMiddleware, async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ message: '缺少projectId' });
  let ip = req.headers['x-forwarded-for'] || req.ip;
  if (ip && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // 异步写入访问日志，不阻塞主流程
  getCityByIp(ip).then(city => {
    prisma.userProjectAccessLog.create({
      data: {
        userId: req.user.id,
        projectId: Number(projectId),
        ip,
        userAgent: req.headers['user-agent'] || '',
        city
      }
    }).catch(() => {});
  });
  res.json({ success: true });
});

// 仪表盘统计接口
router.get('/admin/dashboard-stats', authMiddleware, adminMiddleware, async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // 构建时间筛选条件
  const dateFilter = {};
  if (startDate && endDate) {
    dateFilter.createdAt = {
      gte: new Date(startDate),
      lte: new Date(endDate + 'T23:59:59.999Z')
    };
  }
  
  const [projectAccess, userLogin, userCount, projectCount, projects, users, cityLogin] = await Promise.all([
    prisma.userProjectAccessLog.groupBy({
      by: ['projectId'],
      where: dateFilter,
      _count: { projectId: true },
      orderBy: { _count: { projectId: 'desc' } },
      take: 10
    }),
    prisma.userLoginLog.groupBy({
      by: ['userId'],
      where: dateFilter,
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 10
    }),
    prisma.user.count(),
    prisma.project.count(),
    prisma.project.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.userLoginLog.groupBy({
      by: ['city'],
      where: dateFilter,
      _count: { city: true },
      orderBy: { _count: { city: 'desc' } },
      take: 10
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
  await prisma.user.update({ where: { id: user.id }, data: { password: hashed, tokenVersion: { increment: 1 }, currentSession: null } });
  res.json({ success: true });
});

// 管理员/用户发送消息
router.post('/messages', authMiddleware, async (req, res) => {
  const { title, content, toUserIds } = req.body;
  if (!title || !content) return res.status(400).json({ message: '标题和内容不能为空' });

  if (req.user.role === 'admin' || req.user.isSuperAdmin) {
    // 管理员可群发/全体用户
    if (Array.isArray(toUserIds) && toUserIds.length) {
      // 群发
      const msgs = await Promise.all(toUserIds.map(uid =>
        prisma.message.create({
          data: { title, content, fromUserId: req.user.id, toUserId: uid ? Number(uid) : null }
        })
      ));
      return res.json({ success: true, messages: msgs });
    } else {
      // 全体用户
      const msg = await prisma.message.create({
        data: { title, content, fromUserId: req.user.id, toUserId: null }
      });
      return res.json({ success: true, message: msg });
    }
  } else {
    // 普通用户只能发给所有管理员
    const admins = await prisma.user.findMany({ where: { OR: [{ role: 'admin' }, { isSuperAdmin: true }] } });
    if (!admins.length) return res.status(400).json({ message: '没有可用的管理员' });
    const msgs = await Promise.all(admins.map(admin =>
      prisma.message.create({
        data: { title, content, fromUserId: req.user.id, toUserId: admin.id }
      })
    ));
    return res.json({ success: true, messages: msgs });
  }
});

// 用户获取消息列表（含全体用户消息）
router.get('/messages', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { toUserId: userId },
        { toUserId: null }
      ]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      fromUser: { select: { id: true, name: true, email: true } }
    }
  });
  const result = messages.map(msg => ({
    ...msg,
    fromUserName: msg.fromUser ? msg.fromUser.name : '',
    fromUserEmail: msg.fromUser ? msg.fromUser.email : ''
  }));
  res.json(result);
});

// 获取单个消息详情
router.get('/messages/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.user.id;
  
  // 查找消息，联表查发件人
  const msg = await prisma.message.findUnique({
    where: { id },
    include: { fromUser: { select: { id: true, name: true, email: true } } }
  });
  if (!msg) {
    return res.status(404).json({ message: '消息不存在' });
  }
  
  // 检查权限：只能查看发给自己的消息或全体用户消息
  if (msg.toUserId && msg.toUserId !== userId) {
    return res.status(403).json({ message: '无权查看此消息' });
  }
  
  res.json({
    ...msg,
    fromUserName: msg.fromUser ? msg.fromUser.name : '',
    fromUserEmail: msg.fromUser ? msg.fromUser.email : ''
  });
});

// 标记消息为已读
router.post('/messages/:id/read', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.user.id;
  // 只允许标记属于自己的消息
  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg || (msg.toUserId && msg.toUserId !== userId)) {
    return res.status(403).json({ message: '无权操作' });
  }
  await prisma.message.update({ where: { id }, data: { isRead: true } });
  res.json({ success: true });
});

// 删除消息
router.delete('/messages/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.user.id;
  
  // 查找消息
  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg) {
    return res.status(404).json({ message: '消息不存在' });
  }
  
  // 检查权限：只能删除发给自己的消息或自己发送的消息
  if (msg.toUserId && msg.toUserId !== userId && msg.fromUserId !== userId) {
    return res.status(403).json({ message: '无权删除此消息' });
  }
  
  // 删除消息
  await prisma.message.delete({ where: { id } });
  res.json({ success: true });
});

module.exports = router;
