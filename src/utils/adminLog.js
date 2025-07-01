const prisma = require('../utils/prisma');

async function logAdminAction(adminId, action, targetType, targetId, detail) {
  await prisma.adminLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      detail,
    }
  });
}

module.exports = { logAdminAction }; 