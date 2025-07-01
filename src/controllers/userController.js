const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const { logAdminAction } = require('../utils/adminLog');

// 获取当前登录用户的信息
const getMe = async (req, res) => {
  try {
    // 从 authMiddleware 附加的 req.user 中获取用户 ID
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      // 排除密码字段
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        wechatOpenId: true
      },
    });

    if (!user) {
      return res.status(404).json({ message: '未找到用户' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 获取所有用户列表 (仅管理员)
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        isSuperAdmin: true,
      },
      orderBy: {
        createdAt: 'desc',
      }
    });
    res.status(200).json(users);
  } catch (error) {
    console.error('获取所有用户列表失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 获取指定用户已分配的所有项目 (仅管理员)
const getUserProjects = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const assignments = await prisma.projectAssignment.findMany({
      where: { userId },
      include: { project: true }
    });
    const projects = assignments.map(a => a.project);
    res.status(200).json(projects);
  } catch (error) {
    console.error('获取用户项目失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 重置用户密码 (仅管理员)
const resetPassword = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: '新密码不能为空且长度不少于6位' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed }
    });
    await logAdminAction(req.user.id, '重置密码', 'User', userId, `重置用户邮箱: ${userId}`);
    res.status(200).json({ message: '密码已重置' });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 启用用户 (仅管理员)
const activateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: true }
    });
    await logAdminAction(req.user.id, '启用用户', 'User', userId, '');
    res.status(200).json({ message: '用户已启用' });
  } catch (error) {
    console.error('启用用户失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 禁用用户 (仅管理员)
const deactivateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user.isSuperAdmin) {
      return res.status(403).json({ message: '主管理员账号不可禁用' });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false }
    });
    await logAdminAction(req.user.id, '禁用用户', 'User', userId, '');
    res.status(200).json({ message: '用户已禁用' });
  } catch (error) {
    console.error('禁用用户失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 设置为管理员
const setAdmin = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'admin' }
    });
    await logAdminAction(req.user.id, '设为管理员', 'User', userId, '');
    res.status(200).json({ message: '已设为管理员' });
  } catch (error) {
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 取消管理员
const unsetAdmin = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { role: 'user' }
    });
    await logAdminAction(req.user.id, '取消管理员', 'User', userId, '');
    res.status(200).json({ message: '已取消管理员' });
  } catch (error) {
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 更新用户信息 (仅管理员)
const updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name } = req.body;
    
    // 验证输入
    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({ message: '用户姓名不能为空' });
    }
    
    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
    }
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        isActive: true,
        isSuperAdmin: true,
      }
    });
    
    await logAdminAction(req.user.id, '更新用户信息', 'User', userId, `更新用户姓名: ${updatedUser.name}`);
    res.status(200).json(updatedUser);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: '用户不存在' });
    }
    console.error('更新用户信息失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

module.exports = {
  getMe,
  getAllUsers,
  getUserProjects,
  resetPassword,
  activateUser,
  deactivateUser,
  setAdmin,
  unsetAdmin,
  updateUser,
};
