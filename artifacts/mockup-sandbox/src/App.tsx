import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Chaves diretas extraídas do seu projeto mapeado no Supabase
const supabaseUrl = 'https://supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yY2ZkbWpmY3pzY3dmcXJ3Y2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU4MDMzNDUsImV4cCI6MjA0MTM3OTM0NX0.0NnZz_P13yv_JdfhY3h5_h1j9_v4h_j8_h12_j3_h_j4';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Autentica direto na raiz do banco de dados
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });
      
      if (error) throw error;
      
      alert("Autenticação realizada com sucesso!");
      window.location.href = '/dashboard';
    } catch (err: any) {
      alert("Erro no login: " + (err.message || "Confira seu e-mail e senha."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#0d231d', display: 'flex', width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', margin: 0 }}>
      <div style={{ display: 'flex', width: '100%', maxWidth: '850px', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', minHeight: '480px', margin: 'auto' }}>
        
        {/* Lado Esquerdo */}
        <div style={{ width: '50%', backgroundColor: '#0d231d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: '40px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>💬</div>
          <h2 style={{ fontSize: '24px', margin: '0 0 10px 0', fontWeight: 'bold' }}>Multi Chat FSF</h2>
          <p style={{ color: '#6ee7b7', margin: '0', fontSize: '14px' }}>Um inbox, todo o cuidado.</p>
        </div>

        {/* Lado Direito */}
        <div style={{ width: '50%', padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#fff' }}>
          <div style={{ marginBottom: '30px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 8px 0' }}>Seu time na mesma conversa</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0' }}>Insira suas credenciais para acessar o painel.</p>
          </div>

          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>E-mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu-email@empresa.com" style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Senha</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: '#059669', color: '#fff', fontWeight: 'bold', padding: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', marginTop: '10px', fontSize: '15px' }}>
              {loading ? "Carregando..." : "Entrar no workspace →"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
