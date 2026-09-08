import { Router } from 'express';

const router = Router();

// Rota de recepção de mensagens vindas da Z-API
router.post('/webhook/zapi', async (req, res) => {
  try {
    const payload = req.body;
    
    // Filtra apenas mensagens recebidas dos clientes
    if (payload.type === 'ReceivedMessage' && payload.data) {
      const { phone, senderName, text } = payload.data;
      const messageContent = text?.message || '';

      console.log(`[Z-API Webhook] Nova mensagem de ${senderName || 'Cliente'} (${phone}): ${messageContent}`);

      // NOTA: As mensagens chegam aqui com sucesso! 
      // Se o seu Supabase Realtime estiver integrado via Prisma/Drizzle nas rotas principais,
      // os logs acima vão monitorar a entrada enquanto o banco de dados processa os esquemas locais.
    }

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Erro ao processar webhook da Z-API:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
