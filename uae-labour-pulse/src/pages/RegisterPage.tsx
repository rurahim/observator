/**
 * RegisterPage — create a new account, matching LoginPage styling.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Globe, Hexagon, Shield, Lock, Mail, User } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const RegisterPage = () => {
  const navigate = useNavigate();
  const { t, toggleLang, lang } = useLanguage();
  const { register, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error(t('كلمات المرور غير متطابقة', 'Passwords do not match'));
      return;
    }
    try {
      await register(email, password, displayName);
      toast.success(t('تم إنشاء الحساب بنجاح', 'Account created successfully'));
      navigate('/');
    } catch (err: any) {
      toast.error(err?.detail || err?.message || t('فشل إنشاء الحساب', 'Registration failed'));
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Branding Panel */}
      <div className="hidden lg:flex lg:w-[55%] relative navy-gradient overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gold" />

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

            <h2 className="text-xl font-bold text-primary mb-1">{t('إنشاء حساب', 'Create Account')}</h2>
            <p className="text-sm text-text-muted mb-6">{t('أدخل بياناتك لإنشاء حساب جديد', 'Enter your details to get started')}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('الاسم الكامل', 'Full Name')}</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder={t('أدخل اسمك', 'Enter your name')}
                    required
                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-border-light bg-card text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('البريد الإلكتروني', 'Email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@mohre.gov.ae"
                    required
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
                    required
                    minLength={6}
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

              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">{t('تأكيد كلمة المرور', 'Confirm Password')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full h-10 pl-9 pr-4 rounded-xl border border-border-light bg-card text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/30"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors disabled:opacity-50"
              >
                {isLoading ? t('جارٍ الإنشاء...', 'Creating account...') : t('إنشاء حساب', 'Create Account')}
              </button>
            </form>

            <p className="text-center text-xs text-text-muted mt-5">
              {t('لديك حساب بالفعل؟', 'Already have an account?')}{' '}
              <Link to="/login" className="text-teal font-medium hover:underline">
                {t('تسجيل الدخول', 'Sign In')}
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

export default RegisterPage;
