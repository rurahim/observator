/**
 * PageChat — condensed AI chat panel for split-page layout.
 * Domain-scoped: sends pageContext to backend for scoped system prompt.
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useStreamChat } from '@/api/useStreamChat';
import ChatVisualization from './ChatVisualization';
import { parseVisualization, stripChartBlock, type VisualizationSpec } from './parseVisualization';
import {
  Send, X, Sparkles, ChevronDown, ChevronRight,
  Database, FileText, Minimize2, LogIn,
} from 'lucide-react';

interface PageChatProps {
  pageContext: string;
  onClose: () => void;
  onVisualization?: (spec: VisualizationSpec | null) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  visualization?: VisualizationSpec | null;
}

const PAGE_LABELS: Record<string, { en: string; ar: string }> = {
  'skill-gap': { en: 'Skill Gap Analyst', ar: 'محلل فجوة المهارات' },
  'ai-impact': { en: 'AI Impact Analyst', ar: 'محلل تأثير الذكاء الاصطناعي' },
  forecast: { en: 'Forecast Analyst', ar: 'محلل التوقعات' },
  university: { en: 'Education Analyst', ar: 'محلل التعليم' },
};

const SAMPLE_QUESTIONS: Record<string, { en: string; ar: string }[]> = {
  'skill-gap': [
    { en: 'What are the top shortages in Dubai?', ar: 'ما هي أعلى حالات النقص في دبي؟' },
    { en: 'Compare tech vs healthcare gaps', ar: 'قارن فجوات التقنية والصحة' },
  ],
  'ai-impact': [
    { en: 'Which occupations face highest AI risk?', ar: 'ما المهن الأكثر عرضة لمخاطر الذكاء الاصطناعي؟' },
    { en: 'Show AI exposure across sectors', ar: 'أظهر تعرض القطاعات للذكاء الاصطناعي' },
  ],
  forecast: [
    { en: 'What is the demand forecast for AI Engineers?', ar: 'ما توقعات الطلب لمهندسي الذكاء الاصطناعي؟' },
    { en: 'Compare optimistic vs pessimistic scenarios', ar: 'قارن السيناريو المتفائل والمتشائم' },
  ],
  university: [
    { en: 'Which skills are missing from curricula?', ar: 'ما المهارات المفقودة من المناهج؟' },
    { en: 'Show program coverage analysis', ar: 'أظهر تحليل تغطية البرامج' },
  ],
};

const PageChat = ({ pageContext, onClose, onVisualization }: PageChatProps) => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const { streamMessage, streamingText, isStreaming, error } = useStreamChat({ pageContext });

  const label = PAGE_LABELS[pageContext] || { en: 'AI Assistant', ar: 'المساعد الذكي' };
  const samples = SAMPLE_QUESTIONS[pageContext] || [];

  // Show login prompt when not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-gradient-to-r from-navy/5 to-teal/5 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" />
            <span className="text-sm font-semibold text-primary">
              {t(label.ar, label.en)}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-text-muted">
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-navy/8 flex items-center justify-center mb-3">
            <LogIn className="w-6 h-6 text-navy" />
          </div>
          <p className="text-sm font-semibold text-primary mb-1">
            {t('تسجيل الدخول مطلوب', 'Login Required')}
          </p>
          <p className="text-xs text-text-muted mb-4">
            {t(
              'يرجى تسجيل الدخول للتحدث مع المساعد الذكي',
              'Please sign in to use the AI assistant',
            )}
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-xs font-medium hover:bg-navy-dark transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            {t('تسجيل الدخول', 'Sign In')}
          </a>
        </div>
      </div>
    );
  }

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      await streamMessage(text);
    } catch {
      // Error handled by useStreamChat
    }
  };

  // When streaming completes, add assistant message
  useEffect(() => {
    if (!isStreaming && streamingText) {
      const viz = parseVisualization(streamingText);
      const cleanText = stripChartBlock(streamingText);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: cleanText, visualization: viz },
      ]);
      if (viz) onVisualization?.(viz);
    }
  }, [isStreaming, streamingText]);

  const toggleCitations = (idx: number) => {
    setExpandedCitations(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-gradient-to-r from-navy/5 to-teal/5 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-gold" />
          <span className="text-sm font-semibold text-primary">
            {t(label.ar, label.en)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors text-text-muted"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-navy/8 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-navy" />
            </div>
            <p className="text-sm font-semibold text-primary mb-1">
              {t(label.ar, label.en)}
            </p>
            <p className="text-xs text-text-muted mb-4">
              {t(
                'اسأل أي سؤال حول هذه الصفحة',
                'Ask any question about this page\u0027s data',
              )}
            </p>
            <div className="space-y-2 w-full">
              {samples.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(t(q.ar, q.en))}
                  className="w-full text-left px-3 py-2 rounded-lg border border-border-light bg-card text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  {t(q.ar, q.en)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] ${
                    msg.role === 'user'
                      ? 'bg-navy text-white rounded-2xl rounded-br-md px-3 py-2'
                      : 'bg-surface-tertiary rounded-2xl rounded-bl-md px-3 py-2'
                  }`}
                >
                  <div className={`prose prose-xs max-w-none leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-1 [&_code]:text-[10px] [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-black/10 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:text-[10px] [&_pre]:overflow-x-auto [&_table]:text-[10px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_td]:border [&_th]:border-border-light [&_td]:border-border-light [&_blockquote]:border-l-2 [&_blockquote]:border-navy/30 [&_blockquote]:pl-2 [&_blockquote]:italic [&_a]:text-teal [&_a]:underline ${msg.role === 'user' ? '[&_*]:text-white' : '[&_*]:text-text-secondary [&_h1]:text-primary [&_h2]:text-primary [&_h3]:text-primary [&_strong]:text-primary'}`}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {/* Inline visualization */}
                  {msg.visualization && (
                    <div className="mt-2 bg-card rounded-lg border border-border-light p-2">
                      <ChatVisualization spec={msg.visualization} compact />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-surface-tertiary rounded-2xl rounded-bl-md px-3 py-2 max-w-[90%]">
                  {streamingText ? (
                    <div className="prose prose-xs max-w-none leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_code]:text-[10px] [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_*]:text-text-secondary [&_strong]:text-primary">
                      <ReactMarkdown>{stripChartBlock(streamingText)}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-navy/40 animate-bounce"
                          style={{ animationDelay: `${i * 0.16}s` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-xs text-sgi-critical bg-sgi-critical/5 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border-light px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            placeholder={t('اسأل سؤالاً...', 'Ask a question...')}
            className="flex-1 h-8 px-3 rounded-lg bg-surface-tertiary border border-border-light text-xs placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
            disabled={isStreaming}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isStreaming || !input.trim()}
            className="h-8 w-8 rounded-lg bg-navy text-white flex items-center justify-center hover:bg-navy-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageChat;
