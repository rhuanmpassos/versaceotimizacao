const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const messages = await prisma.whatsAppMessage.findMany({
        where: { phone: '5511961060909' },
        orderBy: { created_at: 'desc' },
        take: 1
    });

    if (messages.length === 0) {
        console.log('No message found');
        return;
    }

    const msg = messages[0];
    console.log('Message Found:', {
        id: msg.id,
        type: msg.message_type,
        status: msg.status,
        send_after: msg.send_after,
    });

    // Modificar send_after para o passado para podermos testar o cron ja
    await prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: { send_after: new Date(Date.now() - 10000) }
    });
    console.log('Updated send_after to the past for testing');
}

check().catch(console.error).finally(() => prisma.$disconnect());
