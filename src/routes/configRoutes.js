const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const authMiddleware = require('../middlewares/authMiddleware');

// 权限校验：仅超级管理员可用
function superAdminOnly(req, res, next) {
  if (!req.user || !req.user.isSuperAdmin) {
    return res.status(403).json({ message: '仅超级管理员可操作' });
  }
  next();
}

router.use(authMiddleware, superAdminOnly);

// 获取所有配置
router.get('/', configController.getAllConfigs);
// 新增或更新配置（支持key唯一约束）
router.post('/', configController.upsertConfig);
// 删除配置（支持key或id）
router.delete('/id/:id', configController.deleteConfig); // 通过id
router.delete('/:key', configController.deleteConfig);   // 通过key
// 邮件服务器测试
router.post('/test-mail', configController.testMail);
// 微信公众号配置测试
router.post('/test-wechat', configController.testWechat);

module.exports = router; 