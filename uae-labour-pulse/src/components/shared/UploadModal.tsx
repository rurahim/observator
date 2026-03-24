/**
 * UploadModal — drag-and-drop file upload dialog with progress tracking
 * and post-upload pipeline processing display.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Upload, X, FileText, FileSpreadsheet, File, AlertCircle, CheckCircle,
  Loader2, Database, Brain, Zap, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useUploadFile } from '@/api/hooks';
import type { FileUploadResult } from '@/api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '@/api/client';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onNavigateToChat?: (datasetId: string, filename: string, results?: { rows_loaded?: number; occupations_mapped?: number; skills_extracted?: number }) => void;
}

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls')
    return { Icon: FileSpreadsheet, color: 'text-sgi-balanced' };
  if (ext === 'json') return { Icon: File, color: 'text-gold' };
  return { Icon: FileText, color: 'text-navy' };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatRecords(count?: number): string {
  if (!count) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

type ModalPhase = 'select' | 'uploading' | 'pipeline' | 'done';

const PIPELINE_STEPS = [
  { en: 'Validating file format...', ar: 'التحقق من تنسيق الملف...' },
  { en: 'Extracting records...', ar: 'استخراج السجلات...' },
  { en: 'Mapping occupations to ISCO taxonomy...', ar: 'تعيين المهن وفق تصنيف ISCO...' },
  { en: 'Extracting skills from job descriptions...', ar: 'استخراج المهارات من أوصاف الوظائف...' },
  { en: 'Loading into warehouse...', ar: 'التحميل في المستودع...' },
  { en: 'Refreshing materialized views...', ar: 'تحديث العروض المادية...' },
];

const UploadModal = ({ open, onClose, onNavigateToChat }: UploadModalProps) => {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<ModalPhase>('select');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDatasetId, setUploadedDatasetId] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string>('');
  const [pipelineStepIndex, setPipelineStepIndex] = useState(0);
  const [pipelineData, setPipelineData] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useUploadFile();

  const validateFile = useCallback(
    (f: File): string | null => {
      if (f.size > MAX_SIZE) return t('الملف كبير جداً (الحد 100 ميجابايت)', 'File too large (max 100MB)');
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() || '');
      if (!['.csv', '.xlsx', '.xls', '.json', '.parquet'].includes(ext))
        return t('نوع ملف غير مدعوم', 'Unsupported file type');
      return null;
    },
    [t],
  );

  const handleFile = useCallback(
    (f: File) => {
      setError(null);
      const err = validateFile(f);
      if (err) {
        setError(err);
        return;
      }
      setFile(f);
    },
    [validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleUpload = async () => {
    if (!file || phase === 'uploading') return;

    setPhase('uploading');
    setProgress(0);
    setError(null);

    // Simulate progress (backend doesn't support progress natively via fetch)
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + Math.random() * 20, 90));
    }, 300);

    try {
      // Show pipeline processing phase during the synchronous upload+pipeline
      setPhase('pipeline');
      setPipelineStepIndex(0);

      // Animate through step descriptions while waiting
      let stepIdx = 0;
      stepTimerRef.current = setInterval(() => {
        stepIdx++;
        if (stepIdx < PIPELINE_STEPS.length) setPipelineStepIndex(stepIdx);
      }, 3000);

      const result = await uploadMutation.mutateAsync(file) as any;
      clearInterval(progressInterval);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setProgress(100);

      // Upload + pipeline completed synchronously — go directly to done
      const datasetId = result.dataset_id || result.id;
      setUploadedDatasetId(datasetId);
      setUploadedFilename(result.name || file.name);

      // Fetch pipeline results to show detailed agent/results info
      try {
        const token = localStorage.getItem('auth_token');
        const prRes = await fetch(`${API_BASE}/files/${datasetId}/pipeline-results`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (prRes.ok) {
          const prData = await prRes.json();
          // Parse pipeline_runs data from API response
          if (prData?.runs?.length > 0) {
            const latestRun = prData.runs[0];
            const summary = latestRun.result_summary || {};
            const timings = latestRun.step_timings || {};
            const completedAgents = (latestRun.completed_agents || []).map((name: string) => ({
              name,
              duration_seconds: (timings[name] || 0) / 1000,
              status: (latestRun.errors || []).some((e: string) => e.toLowerCase().includes(name.toLowerCase())) ? 'failed' : 'completed',
            }));
            setPipelineData({
              status: latestRun.status === 'completed' || latestRun.status === 'completed_with_errors' ? 'completed' : latestRun.status,
              started_at: latestRun.created_at,
              completed_at: latestRun.finished_at,
              agents_completed: completedAgents,
              results: {
                rows_loaded: summary.rows_loaded,
                occupations_mapped: summary.occupation_mappings_count,
                skills_extracted: summary.skill_extractions_count,
                views_refreshed: summary.views_refreshed,
                errors: latestRun.errors?.length > 0 ? latestRun.errors : undefined,
              },
            });
          }
        }
      } catch (e) {
        console.warn('Could not fetch pipeline results:', e);
      }

      // Also check the upload response status
      if (!pipelineData && result.status) {
        setPipelineData({
          status: result.status === 'processed' ? 'completed' : result.status,
          results: null,
        });
      }

      setPhase('done');
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success(
        result.status === 'failed'
          ? t('فشلت معالجة البيانات', 'Pipeline processing failed')
          : t('تمت المعالجة بنجاح', 'Pipeline completed successfully')
      );
    } catch (err: any) {
      clearInterval(progressInterval);
      setPhase('select');
      setError(err.message || t('فشل الرفع', 'Upload failed'));
      toast.error(t('فشل رفع الملف', 'File upload failed'));
    }
  };

  const resetState = () => {
    setFile(null);
    setProgress(0);
    setError(null);
    setPhase('select');
    setUploadedDatasetId(null);
    setUploadedFilename('');
    setPipelineStepIndex(0);
    setPipelineData(null);
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  const handleClose = () => {
    if (phase === 'uploading') return; // can't close while uploading
    onClose();
    resetState();
  };

  const handleViewInKnowledgeBase = () => {
    queryClient.invalidateQueries({ queryKey: ['files'] });
    onClose();
    resetState();
  };

  const handleAskAI = () => {
    if (onNavigateToChat && uploadedDatasetId) {
      const results = pipelineData?.results;
      onNavigateToChat(
        uploadedDatasetId,
        uploadedFilename,
        results ? {
          rows_loaded: results.rows_loaded,
          occupations_mapped: results.occupations_mapped,
          skills_extracted: results.skills_extracted,
        } : undefined
      );
      onClose();
      resetState();
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
        onClick={e => {
          if (e.target === e.currentTarget && phase !== 'uploading') handleClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          className="bg-card rounded-2xl border border-border-light shadow-dropdown w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-light">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-navy/8 flex items-center justify-center">
                {phase === 'pipeline' ? (
                  <Loader2 className="w-4 h-4 text-navy animate-spin" />
                ) : phase === 'done' ? (
                  <CheckCircle className="w-4 h-4 text-sgi-balanced" />
                ) : (
                  <Upload className="w-4 h-4 text-navy" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary">
                  {phase === 'pipeline'
                    ? t('جاري معالجة البيانات...', 'Processing Pipeline...')
                    : phase === 'done'
                      ? t('اكتملت المعالجة', 'Pipeline Complete')
                      : t('رفع ملف بيانات', 'Upload Data File')}
                </h3>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {phase === 'pipeline'
                    ? t('يتم تحليل ومعالجة بياناتك', 'Your data is being analyzed and processed')
                    : phase === 'done'
                      ? t('تم تحميل بياناتك وجاهزة للاستعلام', 'Your data is loaded and ready to query')
                      : <>CSV, Excel, JSON, Parquet — {t('حتى', 'up to')} 100MB</>}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={phase === 'uploading'}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Phase: Select File */}
            {phase === 'select' && !file && (
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-navy bg-navy/5'
                    : 'border-border hover:border-navy/30'
                }`}
              >
                <Upload
                  className={`w-8 h-8 mx-auto mb-3 ${
                    dragOver ? 'text-navy' : 'text-text-muted'
                  }`}
                />
                <p className="text-sm font-medium text-primary">
                  {t('أسقط الملف هنا أو انقر للاختيار', 'Drop file here or click to browse')}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  .csv, .xlsx, .json, .parquet
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.json,.parquet"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            )}

            {/* File preview (select + uploading phases) */}
            {file && (phase === 'select' || phase === 'uploading') && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-tertiary border border-border-light">
                {(() => {
                  const { Icon, color } = getFileIcon(file.name);
                  return (
                    <div className={`w-10 h-10 rounded-lg bg-card flex items-center justify-center ${color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                {phase === 'select' && (
                  <button
                    onClick={() => {
                      setFile(null);
                      setError(null);
                    }}
                    className="p-1 rounded-md hover:bg-surface-hover text-text-muted"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Upload progress bar */}
            {phase === 'uploading' && (
              <div>
                <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                  <span>{t('جارٍ الرفع...', 'Uploading...')}</span>
                  <span className="tabular-nums">{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-tertiary overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-navy"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Phase: Pipeline Processing */}
            {phase === 'pipeline' && (
              <div className="space-y-3">
                {/* Animated spinner with step descriptions */}
                <div className="flex items-center gap-3 p-4 rounded-xl bg-navy/5 border border-navy/10">
                  <div className="shrink-0">
                    <Loader2 className="w-6 h-6 text-navy animate-spin" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy">
                      {t('جاري معالجة البيانات', 'Processing Data Pipeline')}
                    </p>
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={pipelineStepIndex}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="text-xs text-text-muted mt-0.5"
                      >
                        {t(
                          PIPELINE_STEPS[Math.min(pipelineStepIndex, PIPELINE_STEPS.length - 1)].ar,
                          PIPELINE_STEPS[Math.min(pipelineStepIndex, PIPELINE_STEPS.length - 1)].en,
                        )}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                </div>

                {/* Step progress dots */}
                <div className="flex items-center justify-center gap-1.5">
                  {PIPELINE_STEPS.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                        idx <= pipelineStepIndex ? 'bg-navy' : 'bg-border'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Phase: Done — Results Summary */}
            {phase === 'done' && pipelineData && (
              <div className="space-y-3">
                {/* Status badge */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  pipelineData.status === 'completed'
                    ? 'bg-sgi-balanced/10 text-sgi-balanced'
                    : 'bg-sgi-critical/10 text-sgi-critical'
                }`}>
                  {pipelineData.status === 'completed' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  <span className="text-xs font-medium">
                    {pipelineData.status === 'completed'
                      ? t('اكتملت المعالجة بنجاح', 'Pipeline completed successfully')
                      : t('فشلت المعالجة', 'Pipeline processing failed')}
                  </span>
                </div>

                {/* Results grid */}
                {pipelineData.results && pipelineData.status === 'completed' && (
                  <div className="grid grid-cols-3 gap-2">
                    {pipelineData.results.rows_loaded != null && (
                      <div className="bg-surface-tertiary rounded-lg p-2.5 text-center">
                        <Database className="w-4 h-4 text-navy mx-auto mb-1" />
                        <p className="text-sm font-bold text-primary tabular-nums">
                          {formatRecords(pipelineData.results.rows_loaded)}
                        </p>
                        <p className="text-[10px] text-text-muted">{t('صفوف محملة', 'Rows Loaded')}</p>
                      </div>
                    )}
                    {pipelineData.results.occupations_mapped != null && (
                      <div className="bg-surface-tertiary rounded-lg p-2.5 text-center">
                        <Zap className="w-4 h-4 text-gold mx-auto mb-1" />
                        <p className="text-sm font-bold text-primary tabular-nums">
                          {pipelineData.results.occupations_mapped.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-text-muted">{t('مهن معينة', 'Occupations')}</p>
                      </div>
                    )}
                    {pipelineData.results.skills_extracted != null && (
                      <div className="bg-surface-tertiary rounded-lg p-2.5 text-center">
                        <Brain className="w-4 h-4 text-teal mx-auto mb-1" />
                        <p className="text-sm font-bold text-primary tabular-nums">
                          {pipelineData.results.skills_extracted.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-text-muted">{t('مهارات مستخرجة', 'Skills')}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Agents completed */}
                {pipelineData.agents_completed && pipelineData.agents_completed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pipelineData.agents_completed.map((agent, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${
                          agent.status === 'completed' || agent.status === 'success'
                            ? 'bg-sgi-balanced/10 text-sgi-balanced'
                            : 'bg-sgi-critical/10 text-sgi-critical'
                        }`}
                      >
                        <Zap className="w-2.5 h-2.5" />
                        {agent.name} ({agent.duration_seconds.toFixed(1)}s)
                      </span>
                    ))}
                  </div>
                )}

                {/* Errors */}
                {pipelineData.results?.errors && pipelineData.results.errors.length > 0 && (
                  <div className="bg-sgi-critical/5 rounded-lg p-2.5 space-y-1">
                    {pipelineData.results.errors.map((err, idx) => (
                      <p key={idx} className="text-[11px] text-sgi-critical flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Phase: Done — but no pipeline data (API might not support pipeline results) */}
            {phase === 'done' && !pipelineData && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sgi-balanced/10 text-sgi-balanced">
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs font-medium">
                  {t('تم رفع الملف بنجاح', 'File uploaded successfully')}
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-xs text-sgi-critical bg-sgi-critical/5 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border-light flex items-center justify-end gap-2">
            {/* Select / Uploading phase */}
            {(phase === 'select' || phase === 'uploading') && (
              <>
                <button
                  onClick={handleClose}
                  disabled={phase === 'uploading'}
                  className="h-8 px-3.5 rounded-lg border border-border-light text-xs text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || phase === 'uploading'}
                  className="h-8 px-4 rounded-lg bg-navy text-white text-xs font-medium hover:bg-navy-dark transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {phase === 'uploading' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t('جارٍ الرفع...', 'Uploading...')}
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      {t('رفع الملف', 'Upload File')}
                    </>
                  )}
                </button>
              </>
            )}

            {/* Pipeline phase */}
            {phase === 'pipeline' && (
              <button
                onClick={handleClose}
                className="h-8 px-3.5 rounded-lg border border-border-light text-xs text-text-secondary hover:bg-surface-hover transition-colors"
              >
                {t('المعالجة في الخلفية', 'Process in Background')}
              </button>
            )}

            {/* Done phase */}
            {phase === 'done' && (
              <>
                <button
                  onClick={handleViewInKnowledgeBase}
                  className="h-8 px-3.5 rounded-lg border border-border-light text-xs text-text-secondary hover:bg-surface-hover transition-colors flex items-center gap-1.5"
                >
                  <Database className="w-3.5 h-3.5" />
                  {t('عرض في قاعدة المعرفة', 'View in Knowledge Base')}
                </button>
                {onNavigateToChat && (
                  <button
                    onClick={handleAskAI}
                    className="h-8 px-4 rounded-lg bg-navy text-white text-xs font-medium hover:bg-navy-dark transition-colors flex items-center gap-1.5"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    {t('اسأل الذكاء الاصطناعي عن هذه البيانات', 'Ask AI about this data')}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UploadModal;
