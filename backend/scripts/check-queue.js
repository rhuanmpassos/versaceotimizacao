const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMessages() {
    console.log('=== Verificando mensagens na fila ===\n');

    const allMessages = await prisma.whatsAppMessage.findMany({
        orderBy: { created_at: 'desc' },
        take: 10,
        include: {
            lead: {
                select: { nome: true, whatsapp: true }
            }
        }
    });

    console.log(`Total de mensagens (últimas 10): ${allMessages.length}\n`);

    allMessages.forEach(msg => {
        console.log(`ID: ${msg.id}`);
        console.log(`Lead: ${msg.lead.nome} (${msg.lead.whatsapp})`);
        console.log(`Tipo: ${msg.message_type}`);
        console.log(`Status: ${msg.status}`);
        console.log(`Enviar após: ${msg.send_after}`);
        console.log(`Criado em: ${msg.created_at}`);
        if (msg.sent_at) console.log(`Enviado em: ${msg.sent_at}`);
        if (msg.error) console.log(`Erro: ${msg.error}`);
        console.log('---\n');
    });

    const pending = await prisma.whatsAppMessage.count({
        where: { status: 'PENDING' }
    });

    console.log(`\nMensagens PENDENTES: ${pending}`);

    await prisma.$disconnect();
}

checkMessages().catch(console.error);
