const prisma = require('../utils/prisma');
const { logAdminAction } = require('../utils/adminLog');

// 创建新项目 (仅管理员)
const createProject = async (req, res) => {
  try {
    const { name, description, url } = req.body;
    if (!name) {
      return res.status(400).json({ message: '项目名称不能为空' });
    }

    const newProject = await prisma.project.create({
      data: { name, description, url },
    });

    res.status(201).json(newProject);
  } catch (error) {
    if (error.code === 'P2002') { // 唯一约束失败
      return res.status(409).json({ message: '该项目名称已存在' });
    }
    console.error('创建项目失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 为用户分配项目 (仅管理员)
const assignProjectToUser = async (req, res) => {
  try {
    const { userId, projectId } = req.body;

    // 查询用户姓名
    const targetUser = await prisma.user.findUnique({ where: { id: parseInt(userId, 10) } });
    const targetUserName = targetUser ? (targetUser.name || targetUser.email) : `ID:${userId}`;

    const assignment = await prisma.projectAssignment.create({
      data: {
        userId: parseInt(userId, 10),
        projectId: parseInt(projectId, 10),
        assignedBy: req.user.email, // 记录由谁分配
      },
    });
    await logAdminAction(req.user.id, '分配项目权限', 'Project', parseInt(projectId, 10), `分配给用户: ${targetUserName}`);
    res.status(201).json(assignment);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: '该用户已被分配此项目' });
    }
    if (error.code === 'P2003') { // 外键约束失败
      return res.status(404).json({ message: '指定的用户或项目不存在' });
    }
    console.error('分配项目失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 获取所有项目列表 (登录即可)
const getProjects = async (req, res) => {
  try {
    // 只查询项目，不再记录projectId为0的访问日志
    const projects = await prisma.project.findMany();
    res.status(200).json(projects);
  } catch (error) {
    console.error('获取项目列表失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 检查用户对特定项目的访问权限
const checkProjectAccess = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: parseInt(projectId, 10) }
    });

    if (!project) {
      return res.status(404).json({ 
        hasAccess: false, 
        message: '项目不存在' 
      });
    }

    // 检查用户是否有访问权限
    const assignment = await prisma.projectAssignment.findUnique({
      where: {
        userId_projectId: {
          userId: userId,
          projectId: parseInt(projectId, 10)
        }
      }
    });

    const hasAccess = !!assignment;

    res.status(200).json({
      hasAccess,
      project: {
        id: project.id,
        name: project.name,
        description: project.description
      },
      message: hasAccess ? '有访问权限' : '无访问权限'
    });

  } catch (error) {
    console.error('检查项目访问权限失败:', error);
    res.status(500).json({ 
      hasAccess: false, 
      message: '服务器内部错误' 
    });
  }
};

// 更新项目 (仅管理员)
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, url } = req.body;
    
    const updatedProject = await prisma.project.update({
      where: { id: parseInt(id, 10) },
      data: { name, description, url },
    });
    
    res.status(200).json(updatedProject);
  } catch (error) {
    if (error.code === 'P2025') { // 记录未找到
      return res.status(404).json({ message: '要更新的项目不存在' });
    }
    console.error('更新项目失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 删除项目 (仅管理员)
const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.project.delete({
      where: { id: parseInt(id, 10) },
    });
    
    res.status(204).send(); // 204 No Content 表示成功删除
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: '要删除的项目不存在' });
    }
    console.error('删除项目失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

// 从用户身上撤销项目 (仅管理员)
const revokeProjectFromUser = async (req, res) => {
  try {
    const { userId, projectId } = req.body;

    // 查询用户姓名
    const targetUser = await prisma.user.findUnique({ where: { id: parseInt(userId, 10) } });
    const targetUserName = targetUser ? (targetUser.name || targetUser.email) : `ID:${userId}`;

    await prisma.projectAssignment.delete({
      where: {
        userId_projectId: {
          userId: parseInt(userId, 10),
          projectId: parseInt(projectId, 10),
        },
      },
    });
    await logAdminAction(req.user.id, '撤销项目权限', 'Project', parseInt(projectId, 10), `撤销用户: ${targetUserName}`);
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: '要撤销的权限分配记录不存在' });
    }
    console.error('撤销项目权限失败:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
};

module.exports = {
  createProject,
  assignProjectToUser,
  getProjects,
  checkProjectAccess,
  updateProject,
  deleteProject,
  revokeProjectFromUser,
};
