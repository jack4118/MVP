// 检查用户计划的脚本
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserPlan(email) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        plan: true,
        createdAt: true,
      },
    });

    if (!user) {
      console.log(`用户 ${email} 不存在`);
      return;
    }

    console.log('\n=== 用户信息 ===');
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Plan: ${user.plan}`);
    console.log(`创建时间: ${user.createdAt}`);

    // 检查使用情况
    const leadCount = await prisma.lead.count({
      where: { userId: user.id },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const aiUsage = await prisma.aiLog.count({
      where: {
        userId: user.id,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    console.log('\n=== 使用情况 ===');
    console.log(`潜在客户数量: ${leadCount} / ${user.plan === 'pro' ? '无限' : '5'}`);
    console.log(`本月 AI 使用次数: ${aiUsage} / ${user.plan === 'pro' ? '无限' : '10'}`);

    if (user.plan === 'free') {
      const canCreateLead = leadCount < 5;
      const canUseAi = aiUsage < 10;
      console.log(`\n=== 限制检查 ===`);
      console.log(`可以创建潜在客户: ${canCreateLead}`);
      console.log(`可以使用 AI: ${canUseAi}`);
    }

  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function updateUserPlan(email, newPlan) {
  try {
    if (newPlan !== 'free' && newPlan !== 'pro') {
      console.log('Plan 必须是 "free" 或 "pro"');
      return;
    }

    const user = await prisma.user.update({
      where: { email },
      data: { plan: newPlan },
      select: {
        id: true,
        email: true,
        plan: true,
      },
    });

    console.log(`\n✅ 成功更新用户计划:`);
    console.log(`Email: ${user.email}`);
    console.log(`Plan: ${user.plan}`);
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 从命令行参数获取
const args = process.argv.slice(2);
const command = args[0];
const email = args[1];
const plan = args[2];

if (command === 'check' && email) {
  checkUserPlan(email);
} else if (command === 'update' && email && plan) {
  updateUserPlan(email, plan);
} else {
  console.log('使用方法:');
  console.log('  检查用户计划: node scripts/check-user-plan.js check <email>');
  console.log('  更新用户计划: node scripts/check-user-plan.js update <email> <free|pro>');
  console.log('\n示例:');
  console.log('  node scripts/check-user-plan.js check cheelam@gmail.com');
  console.log('  node scripts/check-user-plan.js update cheelam@gmail.com free');
  process.exit(1);
}

