const express = require('express');
const router = express.Router();
const { createProject, assignProjectToUser, getProjects, checkProjectAccess, updateProject, deleteProject, revokeProjectFromUser } = require('../controllers/projectController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// 获取所有项目列表 - 只需要登录
router.get('/', authMiddleware, getProjects);

// 检查项目访问权限 - 需要登录
router.get('/:projectId/check-access', authMiddleware, checkProjectAccess);

// 创建新项目 - 需要登录且是管理员
router.post('/', authMiddleware, adminMiddleware, createProject);

// 为用户分配项目 - 需要登录且是管理员
router.post('/assign', authMiddleware, adminMiddleware, assignProjectToUser);

// 从用户身上撤销项目 - 需要登录且是管理员
router.post('/revoke', authMiddleware, adminMiddleware, revokeProjectFromUser);

// 更新项目 - 需要登录且是管理员
router.put('/:id', authMiddleware, adminMiddleware, updateProject);

// 删除项目 - 需要登录且是管理员
router.delete('/:id', authMiddleware, adminMiddleware, deleteProject);

module.exports = router;
