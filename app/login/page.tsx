'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Plane, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!isLogin) {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data?.error ?? 'Error al registrar'); setLoading(false); return; }
      }
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) { setError('Credenciales incorrectas'); setLoading(false); return; }
      router.replace('/dashboard');
    } catch {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2744] via-[#1e3a5f] to-[#0c1929]">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur mb-4">
            <Plane className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Localizador Drones</h1>
          <p className="text-sky-200/70 mt-2">Monitorización de licitaciones públicas</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xl rounded-xl p-8 shadow-lg border border-white/10">
          <div className="flex gap-2 mb-6">
            <button onClick={() => { setIsLogin(true); setError(''); }} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${isLogin ? 'bg-sky-500 text-white' : 'text-sky-200/70 hover:text-white'}`}>Iniciar Sesión</button>
            <button onClick={() => { setIsLogin(false); setError(''); }} className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${!isLogin ? 'bg-sky-500 text-white' : 'text-sky-200/70 hover:text-white'}`}>Registrarse</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-300/50" />
                <Input value={name} onChange={(e: any) => setName(e?.target?.value ?? '')} placeholder="Nombre" className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-sky-200/40" />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-300/50" />
              <Input type="email" value={email} onChange={(e: any) => setEmail(e?.target?.value ?? '')} placeholder="Email" required className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-sky-200/40" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-300/50" />
              <Input type={showPw ? 'text' : 'password'} value={password} onChange={(e: any) => setPassword(e?.target?.value ?? '')} placeholder="Contraseña" required className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-sky-200/40" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-300/50 hover:text-white">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-sky-500 hover:bg-sky-600 text-white">
              {loading ? 'Cargando...' : isLogin ? 'Entrar' : 'Crear Cuenta'}
            </Button>
          </form>
        </div>
        <div className="mt-6 text-center text-sm text-sky-200/60 flex items-center justify-center gap-1.5">
          <span>Designed with</span>
          <span className="text-red-400 inline-block animate-heartbeat">❤</span>
          <span>by</span>
          <span className="text-sky-300 font-medium">Jose Mora</span>
        </div>
      </div>
    </div>
  );
}
