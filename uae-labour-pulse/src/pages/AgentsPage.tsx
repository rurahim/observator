import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import { SkeletonKPICard, SkeletonChart } from '@/components/shared/Skeletons';
import PageHeader from '@/components/shared/PageHeader';
import ChartTooltip from '@/components/charts/ChartTooltip';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartInsight from '@/components/charts/ChartInsight';
import { Cpu, Activity, AlertTriangle, Clock, Layers, ArrowRight } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

// Placeholder data — will be replaced when agent monitoring API is built
const phases = [
  { name: { en: 'Ingestion', ar: 'الاستيعاب' }, count: 4, color: 'bg-navy' },
  { name: { en: 'Processing', ar: 'المعالجة' }, count: 5, color: 'bg-teal' },
  { name: { en: 'Analysis', ar: 'التحليل' }, count: 5, color: 'bg-gold' },
  { name: { en: 'Output', ar: 'الإخراج' }, count: 4, color: 'bg-sgi-balanced' },
];

type AgentStatus = 'Running' | 'Idle' | 'Error' | 'Completed' | 'Queued';

const agents: { name: string; ar: string; phase: number; status: AgentStatus; lastRun: string; duration: string; success: number; tokens: number; queue: number }[] = [
  { name: 'File Ingestion', ar: 'استيعاب الملفات', phase: 0, status: 'Running', lastRun: '2m ago', duration: '12.4s', success: 99.2, tokens: 45200, queue: 3 },
  { name: 'Web Scraper', ar: 'كاشط الويب', phase: 0, status: 'Running', lastRun: '1m ago', duration: '8.1s', success: 96.5, tokens: 38100, queue: 5 },
  { name: 'API Connector', ar: 'موصل API', phase: 0, status: 'Idle', lastRun: '15m ago', duration: '3.2s', success: 99.8, tokens: 12400, queue: 0 },
  { name: 'PII Scrubbing', ar: 'تنقية البيانات', phase: 0, status: 'Running', lastRun: '3m ago', duration: '5.6s', success: 100, tokens: 28900, queue: 4 },
  { name: 'JD Parser', ar: 'محلل الوصف', phase: 1, status: 'Running', lastRun: '5m ago', duration: '15.2s', success: 97.8, tokens: 62300, queue: 8 },
  { name: 'CV Parser', ar: 'محلل السير', phase: 1, status: 'Idle', lastRun: '20m ago', duration: '18.3s', success: 95.1, tokens: 71200, queue: 0 },
  { name: 'Occupation Norm.', ar: 'تطبيع المهن', phase: 1, status: 'Completed', lastRun: '10m ago', duration: '4.1s', success: 99.5, tokens: 15600, queue: 0 },
  { name: 'Skill Norm.', ar: 'تطبيع المهارات', phase: 1, status: 'Completed', lastRun: '10m ago', duration: '3.8s', success: 99.3, tokens: 14200, queue: 0 },
  { name: 'Data Quality', ar: 'جودة البيانات', phase: 1, status: 'Running', lastRun: '1m ago', duration: '6.7s', success: 98.9, tokens: 22100, queue: 2 },
  { name: 'Course-Skill Map', ar: 'خريطة المهارات', phase: 2, status: 'Idle', lastRun: '1h ago', duration: '22.5s', success: 94.2, tokens: 89400, queue: 0 },
  { name: 'Gap Calculator', ar: 'حاسب الفجوة', phase: 2, status: 'Completed', lastRun: '30m ago', duration: '8.9s', success: 99.7, tokens: 31500, queue: 0 },
  { name: 'Trend Forecast', ar: 'توقع الاتجاه', phase: 2, status: 'Queued', lastRun: '2h ago', duration: '45.2s', success: 92.1, tokens: 124000, queue: 1 },
  { name: 'AI Impact Model', ar: 'نموذج تأثير AI', phase: 2, status: 'Error', lastRun: '45m ago', duration: '—', success: 87.3, tokens: 156000, queue: 0 },
  { name: 'Policy Recommend.', ar: 'توصيات السياسة', phase: 2, status: 'Idle', lastRun: '3h ago', duration: '32.1s', success: 91.5, tokens: 98700, queue: 0 },
  { name: 'Report Gen.', ar: 'إنشاء التقارير', phase: 3, status: 'Running', lastRun: '5m ago', duration: '28.4s', success: 96.8, tokens: 112000, queue: 2 },
  { name: 'NL Query', ar: 'استعلام طبيعي', phase: 3, status: 'Idle', lastRun: '8m ago', duration: '2.1s', success: 98.4, tokens: 8900, queue: 0 },
  { name: 'Orchestrator', ar: 'المنسق', phase: 3, status: 'Running', lastRun: 'Now', duration: '—', success: 99.9, tokens: 5200, queue: 0 },
  { name: 'Alert Monitor', ar: 'مراقب التنبيهات', phase: 3, status: 'Idle', lastRun: '12m ago', duration: '1.4s', success: 100, tokens: 3100, queue: 0 },
];

const statusDot = (s: AgentStatus) => {
  const map: Record<AgentStatus, string> = {
    Running: 'bg-sgi-balanced animate-pulse',
    Idle: 'bg-border',
    Error: 'bg-sgi-critical',
    Completed: 'bg-sgi-surplus',
    Queued: 'bg-sgi-shortage',
  };
  return map[s];
};

const statusText = (s: AgentStatus) => {
  const map: Record<AgentStatus, string> = {
    Running: 'text-sgi-balanced', Idle: 'text-text-muted', Error: 'text-sgi-critical', Completed: 'text-sgi-surplus', Queued: 'text-sgi-shortage',
  };
  return map[s];
};

const tokenData = agents
  .sort((a, b) => b.tokens - a.tokens)
  .slice(0, 8)
  .map(a => ({ name: a.name, tokens: Math.round(a.tokens / 1000) }));

const throughputData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  items: Math.floor(Math.random() * 80 + 40),
}));

const AgentsPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(600);

  const running = agents.filter(a => a.status === 'Running').length;
  const errors = agents.filter(a => a.status === 'Error').length;
  const totalQueue = agents.reduce((sum, a) => sum + a.queue, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div>
          <div className="h-6 w-48 mb-2 animate-pulse bg-surface-tertiary rounded" />
          <div className="h-3.5 w-40 animate-pulse bg-surface-tertiary rounded" />
        </div>
        {/* Pipeline Flow */}
        <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
          <div className="flex items-center justify-between gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-1 rounded-xl p-3 bg-surface-tertiary animate-pulse" style={{ height: 64 }} />
            ))}
          </div>
        </div>
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonKPICard key={i} />
          ))}
        </div>
        {/* Agent Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border-light shadow-card p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 w-24 animate-pulse bg-surface-tertiary rounded" />
                <div className="h-3 w-14 animate-pulse bg-surface-tertiary rounded" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-3 animate-pulse bg-surface-tertiary rounded" />
                ))}
              </div>
              <div className="mt-2 h-1.5 rounded-full animate-pulse bg-surface-tertiary" />
            </div>
          ))}
        </div>
        {/* Two charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={220} />
          <SkeletonChart height={220} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('خط أنابيب الوكلاء', 'Agent Pipeline')}
        subtitle={t('مراقبة 18 وكيلاً', '18-agent monitoring')}
      />

      {/* Pipeline Flow */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
        <div className="flex items-center justify-between gap-2 overflow-x-auto">
          {phases.map((phase, i) => (
            <div key={i} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex-1 rounded-xl p-3 ${phase.color} bg-opacity-10 text-center`}>
                <div className={`text-lg font-bold ${phase.color === 'bg-navy' ? 'text-navy' : phase.color === 'bg-teal' ? 'text-teal' : phase.color === 'bg-gold' ? 'text-gold-dark' : 'text-sgi-balanced'}`}>{phase.count}</div>
                <div className="text-xs text-text-secondary font-medium">{t(phase.name.ar, phase.name.en)}</div>
              </div>
              {i < phases.length - 1 && <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />}
            </div>
          ))}
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: t('إجمالي الوكلاء', 'Total Agents'), value: '18', icon: Cpu, color: 'text-navy' },
          { label: t('قيد التشغيل', 'Running'), value: String(running), icon: Activity, color: 'text-sgi-balanced' },
          { label: t('أخطاء', 'Errors'), value: String(errors), icon: AlertTriangle, color: 'text-sgi-critical' },
          { label: t('عمق القائمة', 'Queue Depth'), value: String(totalQueue), icon: Layers, color: 'text-sgi-shortage' },
          { label: t('متوسط التأخير', 'Avg Latency'), value: '340ms', icon: Clock, color: 'text-teal' },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl border border-border-light shadow-card p-3 text-center">
            <kpi.icon className={`w-5 h-5 mx-auto mb-1 ${kpi.color}`} />
            <div className="text-lg font-bold text-primary tabular-nums">{kpi.value}</div>
            <div className="text-[10px] text-text-muted">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.02 }} className="bg-card rounded-xl border border-border-light shadow-card p-3 hover:shadow-card-hover transition-shadow cursor-pointer group">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-primary group-hover:text-navy transition-colors">{t(agent.ar, agent.name)}</h4>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusDot(agent.status)}`} />
                <span className={`text-[10px] font-medium ${statusText(agent.status)}`}>{agent.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="text-text-muted">{t('آخر تشغيل:', 'Last run:')}</span> <span className="text-text-secondary">{agent.lastRun}</span></div>
              <div><span className="text-text-muted">{t('المدة:', 'Duration:')}</span> <span className="text-text-secondary tabular-nums">{agent.duration}</span></div>
              <div><span className="text-text-muted">{t('النجاح:', 'Success:')}</span> <span className="text-text-secondary tabular-nums">{agent.success}%</span></div>
              <div><span className="text-text-muted">{t('التوكن:', 'Tokens:')}</span> <span className="text-text-secondary tabular-nums">{(agent.tokens / 1000).toFixed(1)}K</span></div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${agent.success >= 98 ? 'bg-sgi-balanced' : agent.success >= 92 ? 'bg-sgi-shortage' : 'bg-sgi-critical'}`} style={{ width: `${agent.success}%` }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar title={t('استخدام التوكن — أعلى 8', 'Token Usage — Top 8 Agents')} data={tokenData}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tokenData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#718096' }} unit="K" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#718096' }} width={100} />
                <Tooltip content={<ChartTooltip unit="K tokens" />} />
                <Bar dataKey="tokens" fill="#003366" radius={[0, 4, 4, 0]} name="Tokens (K)" animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </ChartToolbar>
          <ChartInsight
            text={t(
              'نموذج تأثير AI يستهلك أعلى عدد توكنات (156K) — المرشح الأول للتحسين',
              'AI Impact Model consumes most tokens (156K) — top optimization candidate'
            )}
            severity="shortage"
          />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar title={t('الإنتاجية — 24 ساعة', 'Pipeline Throughput — 24h')} data={throughputData}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={throughputData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#718096' }} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: '#718096' }} />
                <Tooltip content={<ChartTooltip unit=" items/hr" />} />
                <ReferenceLine y={80} stroke="#00875A" strokeDasharray="4 4" strokeWidth={1} label={{ value: t('هدف', 'Target'), position: 'right', fill: '#00875A', fontSize: 9 }} />
                <Line type="monotone" dataKey="items" stroke="#007DB5" strokeWidth={2} dot={false} name="Items/hour" animationDuration={800} />
              </LineChart>
            </ResponsiveContainer>
          </ChartToolbar>
          <ChartInsight
            text={t(
              'متوسط الإنتاجية ~80 عنصر/ساعة — الأداء ضمن الحدود الطبيعية',
              'Average throughput ~80 items/hr — performance within normal bounds'
            )}
            severity="balanced"
          />
        </motion.div>
      </div>
    </div>
  );
};

export default AgentsPage;
