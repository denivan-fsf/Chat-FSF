import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema } from '@workspace/api-zod';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';

export default function LoginPage() {
  const { toast } = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginInputSchema)
  });

  const onSubmit = async (data: any) => {
    try {
      // Lógica de autenticação com o servidor / Supabase
      toast({ title: "Sucesso", description: "Autenticação realizada com sucesso." });
    } catch (err) {
      toast({ variant: "destructive", title: "Erro no login", description: "Credenciais inválidas." });
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <Card className="w-full max-w-md p-4">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Caixa de Entrada WhatsApp</CardTitle>
          <CardDescription className="text-center">Insira suas credenciais corporativas para acessar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Input type="email" placeholder="E-mail profissional" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{String(errors.email.message)}</p>}
            </div>
            <div>
              <Input type="password" placeholder="Sua senha" {...register('password')} />
              {errors.password && <p className="text-xs text-red-500 mt-1">{String(errors.password.message)}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Entrando..." : "Acessar Painel"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
