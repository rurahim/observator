import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Globe, Hexagon, Shield, Lock, Mail } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const LoginPage = () => {
  const navigate = useNavigate();
  const { t, toggleLang, lang } = useLanguage();
  const { login, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      toast.error(err?.detail || err?.message || t('خطأ في تسجيل الدخول', 'Login failed'));
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-[55%] relative navy-gradient overflow-hidden">
        {/* Gold accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gold" />
        
        {/* Concentric circles pattern */}
        <div className="absolute inset-0 opacity-[0.04]">
          {[300, 500, 700, 900].map(size => (
            <div
              key={size}
              className="absolute rounded-full border-2 border-primary-foreground"
              style={{
                width: size, height: size,
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 py-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="w-16 h-16 rounded-2xl bg-primary-foreground/10 border border-primary-foreground/20 flex items-center justify-center mb-8">
              <Hexagon className="w-8 h-8 text-gold" strokeWidth={1.5} />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-4xl font-bold text-primary-foreground mb-3"
          >
            Observator
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-lg text-gold font-medium mb-4"
          >
            {t('مرصد سوق العمل والمهارات في الإمارات', 'UAE Labour Market & Skills Intelligence Observatory')}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="text-sm text-primary-foreground/60 max-w-md mb-10 leading-relaxed"
          >
            {t(
              'خط أنابيب ذكاء اصطناعي مكون من 18 وكيلاً يراقب ويقيس ويتوقع سوق العمل الإماراتي على مدار الساعة.',
              'An 18-agent AI pipeline that continuously monitors, measures, and forecasts the UAE labour market 24/7.'
            )}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="flex gap-8"
          >
            {[
              { value: '18', label: t('وكيل ذكاء اصطناعي', 'AI Agents') },
              { value: '13.8K', label: t('مهارة ESCO', 'ESCO Skills') },
              { value: '24/7', label: t('مستمر', 'Continuous') },
            ].map(stat => (
              <div key={stat.label}>
                <div className="text-2xl font-bold text-gold tabular-nums">{stat.value}</div>
                <div className="text-xs text-primary-foreground/50 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            className="absolute bottom-8 left-16 text-xs text-primary-foreground/30 flex items-center gap-2"
          >
            <Shield className="w-3.5 h-3.5" />
            {t('منتج حكومة الإمارات — سيادة البيانات 100%', 'UAE Government Product — 100% Data Sovereignty')}
          </motion.div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="w-full lg:w-[45%] bg-surface-secondary flex flex-col">
        <div className="flex justify-end p-4">
          <button
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border-light bg-card hover:bg-surface-hover transition-colors text-text-secondary"
          >
            <Globe className="w-4 h-4" />
            {lang === 'en' ? 'عربي' : 'English'}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm"
          >
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-navy flex items-center justify-center">
                <Hexagon className="w-5 h-5 text-gold" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-lg font-bold text-primary">Observator</div>
                <div className="text-xs text-text-muted">{t('مرصد سوق العمل', 'Labour Market Observatory')}</div>
              </div>
            </div>

            <h2 className="text-xl font-bold text-primary mb-1">{t('تسجيل الدخول', 'Sign In')}</h2>
            <p className="text-sm text-text-muted mb-6">{t('أدخل بيانات الاعتماد الخاصة بك', 'Enter your credentials to continue')}</p>

            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors mb-4">
              <Shield className="w-4 h-4 text-gold" />
              {t('تسجيل الدخول بـ UAE PASS', 'Sign in with UAE PASS')}
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-text-muted">{t('أو', 'or')}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('البريد الإلكتروني', 'Email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@mohre.gov.ae"
                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-border-light bg-card text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('كلمة المرور', 'Password')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 pl-9 pr-10 rounded-xl border border-border-light bg-card text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-border accent-navy" />
                  <span className="text-xs text-text-secondary">{t('تذكرني', 'Remember me')}</span>
                </label>
                <button type="button" className="text-xs text-teal hover:underline">{t('نسيت كلمة المرور؟', 'Forgot password?')}</button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors disabled:opacity-50"
              >
                {isLoading ? t('جارٍ التحميل...', 'Signing in...') : t('تسجيل الدخول', 'Sign In')}
              </button>
            </form>

            <p className="text-center text-xs text-text-muted mt-5">
              {t('ليس لديك حساب؟', "Don't have an account?")}{' '}
              <Link to="/register" className="text-teal font-medium hover:underline">
                {t('إنشاء حساب', 'Create one')}
              </Link>
            </p>

            <div className="flex items-center justify-center gap-2 mt-4 text-xs text-text-muted">
              <Lock className="w-3 h-3" />
              {t('مشفر — TLS 1.3 — سيادة بيانات الإمارات', 'Encrypted — TLS 1.3 — UAE Data Sovereignty')}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
