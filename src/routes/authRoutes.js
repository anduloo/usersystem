const express = require('express');
const router = express.Router();
const { register, login, showPortal, getPortalData } = require('../controllers/authController');
const { 
  renderLoginPage, 
  renderAdminPage
} = require('../controllers/pagesController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// === 认证相关 POST 请求 ===
router.post('/api/auth/register', register);
router.post('/api/auth/login', login);
router.post('/api/auth/logout', (req, res) => {
  // 清除token cookie（如果有）
  res.clearCookie('token');
  res.json({ success: true });
});

// === 页面渲染 GET 请求 ===
router.get('/login', renderLoginPage);
router.get('/register', renderLoginPage); // 合并页面
router.get('/portal', showPortal);
router.get('/admin', authMiddleware, adminMiddleware, renderAdminPage);

// === 数据 API GET 请求 ===
router.get('/api/portal', authMiddleware, getPortalData);

module.exports = router;