const prisma = require('../utils/prisma');
const nodemailer = require('nodemailer');
const axios = require('axios');

// 获取所有配置
async function getAllConfigs(req, res) {
  const configs = await prisma.systemConfig.findMany();
  res.json(configs);
}

// 新增或更新配置
async function upsertConfig(req, res) {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ message: '缺少key' });
  const config = await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
  res.json(config);
}

// 删除配置
async function deleteConfig(req, res) {
  const { key, id } = req.params;
  if (id) {
    await prisma.systemConfig.delete({ where: { id: Number(id) } });
    return res.json({ success: true });
  }
  if (key) {
    await prisma.systemConfig.delete({ where: { key } });
    return res.json({ success: true });
  }
  return res.status(400).json({ message: '缺少key或id' });
}

// 邮件服务器测试
async function testMail(req, res) {
  const { host, port, secure, user, pass, from, to } = req.body;
  if (!host || !port || !user || !pass || !to) return res.status(400).json({ message: '参数不完整' });
  try {
    const isSSL = secure === 'ssl';
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: isSSL, // 465端口用true，25/80端口用false
      auth: { user, pass },
      tls: !isSSL ? { rejectUnauthorized: false } : undefined,
      logger: true,
      debug: true
    });
    await transporter.sendMail({
      from: from || user,
      to,
      subject: '【系统测试】邮件服务器配置测试',
      text: '这是一封测试邮件，说明你的邮件服务器配置可用。'
    });
    res.json({ success: true });
  } catch (e) {
    console.error('邮件测试异常:', e);
    res.status(500).json({ message: e.message });
  }
}
// 微信公众号配置测试
async function testWechat(req, res) {
  const { appid, secret, token, aeskey } = req.body;
  if (!appid || !secret) return res.status(400).json({ message: 'AppID和AppSecret是必需的' });
  try {
    // 获取access_token
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
    const wxRes = await axios.get(url);
    
    if (wxRes.data.access_token) {
      res.json({ success: true, message: '微信公众号配置测试成功' });
    } else {
      const errorMsg = wxRes.data.errmsg || '微信接口返回异常';
      console.error('微信API错误:', wxRes.data);
      res.status(400).json({ message: `微信API错误: ${errorMsg}` });
    }
  } catch (e) {
    console.error('微信公众号测试异常:', e);
    res.status(500).json({ message: `测试失败: ${e.message}` });
  }
}

// 工具函数：根据key获取单个配置
async function getConfigByKey(key) {
  const config = await prisma.systemConfig.findUnique({ where: { key } });
  return config ? config.value : null;
}

module.exports = {
  getAllConfigs,
  upsertConfig,
  deleteConfig,
  testMail,
  testWechat,
  getConfigByKey,
}; 