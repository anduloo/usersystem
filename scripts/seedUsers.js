const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.createMany({
    data: [
      {
        email: 'admin@test.com',
        password: bcrypt.hashSync('admin123', 10),
        name: '管理员',
        role: 'admin',
        isActive: true,
        isSuperAdmin: true,
        wechatOpenId: null
      },
      {
        email: 'user1@test.com',
        password: bcrypt.hashSync('user123', 10),
        name: '普通用户1',
        role: 'user',
        isActive: true,
        isSuperAdmin: false,
        wechatOpenId: null
      },
      {
        email: 'user2@test.com',
        password: bcrypt.hashSync('user123', 10),
        name: '普通用户2',
        role: 'user',
        isActive: true,
        isSuperAdmin: false,
        wechatOpenId: null
      }
    ],
    skipDuplicates: true
  });
  console.log('测试用户已插入');
}

main().finally(() => prisma.$disconnect());
