import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

interface LockScreenProps {
  correctPassword: string;
  onUnlock: (remember: boolean) => void;
  storeName?: string;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  correctPassword,
  onUnlock,
  storeName = 'Profit Dashboard',
}) => {
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedInput = passwordInput.trim();
    const effectiveCorrect = (correctPassword || 'thiagodj97').trim();

    if (!trimmedInput) {
      setErrorMsg('Por favor, digite a senha de acesso.');
      return;
    }

    if (trimmedInput === effectiveCorrect) {
      toast.success('Acesso liberado com sucesso!', {
        icon: '🔓',
        style: {
          background: '#0F172A',
          color: '#10B981',
          border: '1px solid #059669',
        },
      });
      onUnlock(rememberDevice);
    } else {
      setIsShaking(true);
      setErrorMsg('Senha incorreta. Verifique e tente novamente.');
      setTimeout(() => setIsShaking(false), 600);
      toast.error('Senha incorreta.', {
        style: {
          background: '#0F172A',
          color: '#EF4444',
          border: '1px solid #DC2626',
        },
      });
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070A0F] bg-radial-[at_top] from-slate-900/40 to-[#070A0F] flex items-center justify-center p-4 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background ambient subtle glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div
        className={`relative w-full max-w-md bg-[#0E1420]/90 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/80 transition-transform ${
          isShaking ? 'translate-x-[-8px] transition-none animate-bounce' : ''
        }`}
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="relative mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#0B0F17] rounded-[14px] flex items-center justify-center">
                <Lock className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1 rounded-full shadow">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold mb-2">
            <Sparkles className="w-3 h-3" />
            <span>Painel Financeiro Protegido</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {storeName}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Digite a senha de segurança para acessar o DRE, Lucro Real e Pedidos.
          </p>
        </div>

        {/* Lock Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Senha de Acesso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4 text-emerald-500/70" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Digite a senha..."
                className="w-full pl-10 pr-11 py-2.5 bg-slate-950/80 border border-slate-700/80 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-sm text-slate-100 placeholder-slate-500 transition-all outline-none font-mono tracking-wide"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                title={showPassword ? 'Ocultar senha' : 'Ver senha'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errorMsg && (
              <p className="text-xs text-red-400 font-medium flex items-center gap-1 pt-1">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </p>
            )}
          </div>

          {/* Remember device checkbox */}
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-slate-400 hover:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 cursor-pointer accent-emerald-500"
              />
              <span>Manter conectado neste navegador</span>
            </label>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
          >
            <Lock className="w-4 h-4" />
            <span>Desbloquear Dashboard</span>
          </button>
        </form>

        {/* Footer Info */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>Segurança Ponta a Ponta</span>
          <span className="text-slate-400">Lucro Real E-commerce</span>
        </div>
      </div>
    </div>
  );
};
