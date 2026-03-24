import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  LayoutDashboard, BarChart3, Brain, TrendingUp, MessageSquare,
  Database, FileText, ChevronRight, ChevronLeft, X, Sparkles, Rocket
} from 'lucide-react';

const STORAGE_KEY = 'observator_onboarding_completed';

interface TourStep {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  icon: typeof LayoutDashboard;
  color: string;
  path: string;
}

const steps: TourStep[] = [
  {
    title: 'Executive Dashboard',
    titleAr: 'لوحة القيادة التنفيذية',
    description: 'Your central command center — KPI tiles, supply/demand trends, sector distribution, and an interactive UAE map. Toggle the Research Brief panel for AI-generated insights.',
    descriptionAr: 'مركز القيادة الخاص بك — بلاط المؤشرات، اتجاهات العرض والطلب، توزيع القطاعات، وخريطة إمارات تفاعلية.',
    icon: LayoutDashboard,
    color: '#003366',
    path: '/',
  },
  {
    title: 'Skill Gap Analysis',
    titleAr: 'تحليل فجوة المهارات',
    description: 'Deep-dive into occupation-level skill gaps with SGI trending, horizontal bar comparisons, and filterable data tables across emirates and sectors.',
    descriptionAr: 'تعمق في فجوات المهارات على مستوى المهنة مع اتجاه المؤشر والمقارنات وجداول البيانات القابلة للتصفية.',
    icon: BarChart3,
    color: '#DE350B',
    path: '/skill-gap',
  },
  {
    title: 'AI Impact Explorer',
    titleAr: 'مستكشف تأثير الذكاء الاصطناعي',
    description: 'Assess automation exposure scores (AIOE) across occupations, view sector risk heatmaps, and access upgrade playbooks with reskilling recommendations.',
    descriptionAr: 'تقييم درجات التعرض للأتمتة عبر المهن وعرض خرائط المخاطر القطاعية والوصول لخطط إعادة التأهيل.',
    icon: Brain,
    color: '#7B1F2C',
    path: '/ai-impact',
  },
  {
    title: 'Forecasts & Scenarios',
    titleAr: 'التوقعات والسيناريوهات',
    description: 'Run scenario simulations with adjustable parameters — forecast demand/supply trajectories and view confidence intervals up to 36 months ahead.',
    descriptionAr: 'قم بتشغيل محاكاة السيناريوهات مع معلمات قابلة للتعديل — توقع مسارات العرض والطلب لمدة تصل إلى 36 شهرًا.',
    icon: TrendingUp,
    color: '#C9A84C',
    path: '/forecast',
  },
  {
    title: 'AI Query Chat',
    titleAr: 'استعلام الذكاء الاصطناعي',
    description: 'Ask questions in natural language, get cited answers with evidence sources, inline visualizations, and SQL query disclosure for full transparency.',
    descriptionAr: 'اطرح أسئلة باللغة الطبيعية واحصل على إجابات مُستشهد بها مع مصادر الأدلة والرسوم البيانية المضمنة.',
    icon: MessageSquare,
    color: '#007DB5',
    path: '/chat',
  },
  {
    title: 'Knowledge Base',
    titleAr: 'قاعدة المعرفة',
    description: 'Manage your datasets — upload CSV, Excel, PDF, JSON, or Parquet files. Track processing status, versions, and select evidence sources for chat queries.',
    descriptionAr: 'إدارة مجموعات البيانات الخاصة بك — رفع ملفات CSV و Excel و PDF و JSON. تتبع حالة المعالجة والإصدارات.',
    icon: Database,
    color: '#00875A',
    path: '/knowledge-base',
  },
  {
    title: 'Automated Reports',
    titleAr: 'التقارير الآلية',
    description: 'Generate executive summaries, skill gap reports, Emiratisation trackers, and AI risk assessments. Schedule recurring reports for automated delivery.',
    descriptionAr: 'إنشاء ملخصات تنفيذية وتقارير فجوة المهارات ومتتبعات التوطين وتقييمات مخاطر الذكاء الاصطناعي.',
    icon: FileText,
    color: '#0052CC',
    path: '/reports',
  },
];

const OnboardingTour = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed && location.pathname === '/') {
      const timer = setTimeout(() => setActive(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const complete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setActive(false);
  }, []);

  const next = useCallback(() => {
    if (step < steps.length - 1) {
      const nextStep = step + 1;
      setStep(nextStep);
      navigate(steps[nextStep].path);
    } else {
      complete();
      navigate('/');
    }
  }, [step, navigate, complete]);

  const prev = useCallback(() => {
    if (step > 0) {
      const prevStep = step - 1;
      setStep(prevStep);
      navigate(steps[prevStep].path);
    }
  }, [step, navigate]);

  if (!active) return null;

  const current = steps[step];
  const Icon = current.icon;
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[60]"
            onClick={complete}
          />

          {/* Tour Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-[61] w-[92%] max-w-lg"
          >
            <div className="bg-card rounded-2xl border border-border-light shadow-dropdown overflow-hidden">
              {/* Progress Bar */}
              <div className="h-1 bg-surface-tertiary">
                <motion.div
                  className="h-full bg-navy"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Header */}
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${current.color}15` }}
                    >
                      <Icon className="w-5.5 h-5.5" style={{ color: current.color }} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-0.5">
                        {t('الخطوة', 'Step')} {step + 1} / {steps.length}
                      </p>
                      <h3 className="text-base font-bold text-primary">
                        {t(current.titleAr, current.title)}
                      </h3>
                    </div>
                  </div>
                  <button
                    onClick={complete}
                    className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-muted transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 pb-4">
                <p className="text-sm text-text-secondary leading-relaxed">
                  {t(current.descriptionAr, current.description)}
                </p>
              </div>

              {/* Step Dots */}
              <div className="flex items-center justify-center gap-1.5 pb-3">
                {steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setStep(i); navigate(steps[i].path); }}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === step ? 'w-6 bg-navy' : i < step ? 'w-1.5 bg-navy/40' : 'w-1.5 bg-border'
                    }`}
                  />
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t border-border-light bg-surface-secondary/50">
                <button
                  onClick={complete}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  {t('تخطي الجولة', 'Skip tour')}
                </button>
                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <button
                      onClick={prev}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-tertiary text-text-secondary text-xs font-medium hover:bg-surface-hover transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      {t('السابق', 'Back')}
                    </button>
                  )}
                  <button
                    onClick={next}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-navy text-primary-foreground text-xs font-medium hover:bg-navy-dark transition-colors"
                  >
                    {step === steps.length - 1 ? (
                      <>
                        <Rocket className="w-3.5 h-3.5" />
                        {t('ابدأ الاستكشاف', 'Start Exploring')}
                      </>
                    ) : (
                      <>
                        {t('التالي', 'Next')}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTour;
