const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTestPixTransaction() {
    console.log('=== Criando transação PIX de teste ===\n');

    // Buscar lead existente
    const testLead = await prisma.lead.findFirst({
        where: { whatsapp: '5511961060909' }
    });

    if (!testLead) {
        console.error('Lead não encontrado com o WhatsApp 5511961060909');
        await prisma.$disconnect();
        return;
    }

    console.log('Lead encontrado:', testLead.nome, testLead.id);

    // Criar transação PIX que "expirou" 17 minutos atrás
    const now = new Date();
    const expiredTime = new Date(now.getTime() - 17 * 60 * 1000); // 17 minutos atrás

    const transaction = await prisma.transaction.create({
        data: {
            lead_id: testLead.id,
            amount_product: 20000,
            amount_affiliate: 6000,
            payment_method: 'pix',
            status: 'processing', // PIX gerado mas não pago
            scheduled_date: new Date('2026-01-10'),
            scheduled_time: new Date('1970-01-01T19:00:00'),
            created_at: expiredTime, // Criado há 17 minutos
        }
    });

    console.log('\n✅ Transação PIX de teste criada:');
    console.log('ID:', transaction.id);
    console.log('Lead:', testLead.nome);
    console.log('WhatsApp:', testLead.whatsapp);
    console.log('Criada em:', transaction.created_at);
    console.log('Status:', transaction.status);
    console.log('\nAgora você pode testar o endpoint check-expired-pix!');

    await prisma.$disconnect();
}

createTestPixTransaction().catch(console.error);
