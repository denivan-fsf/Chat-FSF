import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema } from '@workspace/api-zod';

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginInputSchema)
  });

  const onSubmit = async (data: any) => {
    try {
      const response = await fetch('https://onrender.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) throw new Error();
      
      alert("Autenticação realizada com sucesso!");
      window.location.href = '/dashboard';
    } catch (err) {
      alert("Erro no login: Confira seu e-mail e senha.");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900" style={{ backgroundColor: '#0d231d', display: 'flex', width: '100vw', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', width: '100%', maxWidth: '850px', backgroundColor: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', minHeight: '480px' }}>
        
        {/* Lado Esquerdo - Branding */}
        <div style={{ width: '50%', backgroundColor: '#0d231d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: '40px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>💬</div>
          <h2 style={{ fontSize: '24px', margin: '0 0 10px 0', fontWeight: 'bold' }}>Multi Chat FSF</h2>
          <p style={{ color: '#6ee7b7', margin: '0', fontSize: '14px' }}>Um inbox, todo o cuidado.</p>
        </div>

        {/* Lado Direito - Form */}
        <div style={{ width: '50%', padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: '#fff' }}>
          <div style={{ marginBottom: '30px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 8px 0' }}>Seu time na mesma conversa</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0' }}>Insira suas credenciais para acessar o painel.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>E-mail</label>
              <input type="email" placeholder="seu-email@empresa.com" {...register('email')} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>Senha</label>
              <input type="password" placeholder="••••••••" {...register('password')} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>

            <button type="submit" disabled={isSubmitting} style={{ width: '100%', backgroundColor: '#059669', color: '#fff', fontWeight: 'bold', padding: '12px', borderRadius: '6px', border: 'none', cursor: 'pointer', marginTop: '10px', fontSize: '15px' }}>
              {isSubmitting ? "Carregando..." : "Entrar no workspace →"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
