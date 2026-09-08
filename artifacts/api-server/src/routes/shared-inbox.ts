import { Router } from 'express';
import { supabase } from '../lib/realtime';

const router = Router();

// Rota de recepção de mensagens vindas da Z-API
router.post('/webhook/zapi', async (req, res) => {
  try {
    const payload = req.body;
    
    // Filtra apenas mensagens recebidas dos clientes
    if (payload.type === 'ReceivedMessage' && payload.data) {
      const { phone, senderName, text } = payload.data;
      const messageContent = text?.message || '';

      // Atualiza ou cria a lista de conversas ativas
      await supabase.from('conversations').upsert({
        id: phone,
        name: senderName || 'Cliente WhatsApp',
        updated_at: new Date().toISOString()
      });

      // Insere o registro na tabela de histórico de mensagens
      await supabase.from('messages').insert({
        conversation_id: phone,
        direction: 'INBOUND',
        text: messageContent,
        created_at: new Date().toISOString()
      });
    }

    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Erro ao processar webhook da Z-API:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
