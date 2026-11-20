'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { User, Lock, Save, Mail, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function ProfilePage() {
  const sp = useSearchParams();
  const initialTab = sp?.get('tab') === 'password' ? 'password' : 'profile';
  const [tab, setTab] = useState<'profile' | 'password'>(initialTab as any);
  const { update } = useSession() || ({} as any);
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
      setUser(d.user);
      setName(d.user?.name || '');
      setEmail(d.user?.email || '');
    });
  }, []);

  async function saveProfile() {
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast.error(d.error === 'email_in_use' ? 'Ese email ya está en uso' : 'Error al guardar');
      return;
    }
    toast.success('Perfil actualizado');
    if (update) await update();
  }

  async function savePassword() {
    if (newPassword !== confirm) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 4) {
      toast.error('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) {
      const msgs: any = {
        invalid_password: 'Contraseña actual incorrecta',
        current_password_required: 'Introduce tu contraseña actual',
        password_too_short: 'La nueva contraseña es demasiado corta',
      };
      toast.error(msgs[d.error] || 'Error al cambiar la contraseña');
      return;
    }
    toast.success('Contraseña actualizada');
    setCurrentPassword(''); setNewPassword(''); setConfirm('');
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold text-xl">
          {(user?.name || user?.email || 'U')?.[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user?.name || 'Mi perfil'}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Mail className="w-3.5 h-3.5" /> {user?.email}
            {user?.role === 'admin' && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-sky-500/10 text-sky-600"><Shield className="w-3 h-3" /> Admin</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border mb-6">
        <button onClick={() => setTab('profile')} className={`px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === 'profile' ? 'border-sky-500 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <User className="w-4 h-4" /> Datos personales
        </button>
        <button onClick={() => setTab('password')} className={`px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-2 ${tab === 'password' ? 'border-sky-500 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Lock className="w-4 h-4" /> Contraseña
        </button>
      </div>

      {tab === 'profile' ? (
        <div className="space-y-4 bg-card border border-border rounded-xl p-6">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Nombre</label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Tu nombre" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email</label>
            <Input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="tu@email.com" />
          </div>
          <Button onClick={saveProfile} disabled={saving} className="flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 bg-card border border-border rounded-xl p-6">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Contraseña actual</label>
            <Input type="password" value={currentPassword} onChange={(e: any) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Nueva contraseña</label>
            <Input type="password" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)} placeholder="Mínimo 4 caracteres" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Confirmar nueva contraseña</label>
            <Input type="password" value={confirm} onChange={(e: any) => setConfirm(e.target.value)} placeholder="Repite la nueva contraseña" />
          </div>
          <Button onClick={savePassword} disabled={saving || !currentPassword || !newPassword} className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> {saving ? 'Guardando...' : 'Cambiar contraseña'}
          </Button>
        </div>
      )}
    </div>
  );
}
