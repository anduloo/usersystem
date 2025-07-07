const express = require('express');
const router = express.Router();
const wechatController = require('../controllers/wechatController');

// 微信二维码相关路由
router.post('/generate-qr', wechatController.generateWechatQRCode);
router.get('/check-status/:qrId', wechatController.checkQRCodeStatus);
router.post('/scan/:qrId', wechatController.handleWechatScan);
router.post('/confirm', wechatController.confirmWechatLogin);
router.post('/complete-info', wechatController.completeUserInfo);

// 错误处理中间件
router.use((error, req, res, next) => {
  console.error('微信路由错误:', error);
  return res.status(400).json({ 
    success: false, 
    message: '请求失败' 
  });
});

module.exports = router; 