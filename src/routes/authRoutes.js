const express = require('express');
const router = express.Router();
const { register, login, showPortal, getPortalData, confirmEmail, requestResetPassword, resetPassword, verifyResetToken, generateWechatQR, handleWechatCallback, checkWechatLoginStatus, bindWechatUserInfo } = require('../controllers/authController');
const { 
  renderLoginPage, 
  renderAdminPage,
  renderResetPasswordPage,
  renderWechatConfirmPage
} = require('../controllers/pagesController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const configController = require('../controllers/configController');

// === 认证相关 POST 请求 ===
router.post('/api/auth/register', register);
router.post('/api/auth/login', login);
router.post('/api/auth/logout', (req, res) => {
  // 清除token cookie（如果有）
  res.clearCookie('token');
  res.json({ success: true });
});

// === 微信登录相关路由 ===
router.post('/api/auth/wechat/qr', generateWechatQR);
router.get('/api/auth/wechat/callback', handleWechatCallback);
router.get('/api/auth/wechat/status/:qrId', checkWechatLoginStatus);
router.post('/api/auth/wechat/bind', bindWechatUserInfo);

// === 页面渲染 GET 请求 ===
router.get('/login', renderLoginPage);
router.get('/register', renderLoginPage); // 合并页面
router.get('/portal', showPortal);
router.get('/admin', authMiddleware, adminMiddleware, renderAdminPage);
router.get('/reset-password', renderResetPasswordPage);
router.get('/wechat-confirm', renderWechatConfirmPage);

// === 数据 API GET 请求 ===
router.get('/api/portal', authMiddleware, getPortalData);

// 系统配置相关（仅超级管理员）
router.get('/api/admin/configs', authMiddleware, adminMiddleware, async (req, res, next) => {
  if (!req.user.isSuperAdmin) return res.status(403).json({ message: '仅超级管理员可操作' });
  return configController.getAllConfigs(req, res, next);
});
router.post('/api/admin/configs', authMiddleware, adminMiddleware, async (req, res, next) => {
  if (!req.user.isSuperAdmin) return res.status(403).json({ message: '仅超级管理员可操作' });
  return configController.upsertConfig(req, res, next);
});
router.delete('/api/admin/configs/:key', authMiddleware, adminMiddleware, async (req, res, next) => {
  if (!req.user.isSuperAdmin) return res.status(403).json({ message: '仅超级管理员可操作' });
  return configController.deleteConfig(req, res, next);
});

router.get('/api/auth/confirm-email', confirmEmail);

router.post('/api/auth/request-reset-password', requestResetPassword);
router.post('/api/auth/reset-password', resetPassword);
router.post('/api/auth/verify-reset-token', verifyResetToken);

module.exports = router;