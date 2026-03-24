/**
 * SplitPageLayout — wraps page content with a collapsible right-side AI chat panel.
 * Desktop: side-by-side. Mobile: full-screen overlay.
 */
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import PageChat from '@/components/chat/PageChat';
import DynamicChartSlot from '@/components/chat/DynamicChartSlot';
import type { VisualizationSpec } from '@/components/chat/parseVisualization';

interface SplitPageLayoutProps {
  children: ReactNode;
  pageContext: string;
}

const STORAGE_KEY = 'ai-panel-open';

const SplitPageLayout = ({ children, pageContext }: SplitPageLayoutProps) => {
  const [latestViz, setLatestViz] = useState<VisualizationSpec | null>(null);

  const handleVisualization = useCallback((spec: VisualizationSpec | null) => {
    if (spec) setLatestViz(spec);
  }, []);

  const [isPanelOpen, setIsPanelOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-${pageContext}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}-${pageContext}`, String(isPanelOpen));
    } catch { /* noop */ }
  }, [isPanelOpen, pageContext]);

  const toggle = () => setIsPanelOpen(p => !p);

  return (
    <div className="flex relative" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Main content */}
      <div
        className={`flex-1 overflow-y-auto min-w-0 transition-all duration-300 ${
          isPanelOpen ? 'lg:pr-0' : ''
        }`}
      >
        <DynamicChartSlot spec={latestViz} onDismiss={() => setLatestViz(null)} />
        {children}
      </div>

      {/* Desktop: side panel — sticky, doesn't scroll with content */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="hidden lg:flex flex-col flex-shrink-0 border-l border-border-light bg-card overflow-hidden h-full"
          >
            <PageChat pageContext={pageContext} onClose={toggle} onVisualization={handleVisualization} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile: bottom sheet overlay */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="lg:hidden fixed inset-0 z-50 bg-card flex flex-col"
            style={{ top: 56 }}
          >
            <PageChat pageContext={pageContext} onClose={toggle} onVisualization={handleVisualization} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      {!isPanelOpen && (
        <button
          onClick={toggle}
          className="fixed right-4 bottom-20 lg:bottom-6 z-40 w-12 h-12 rounded-full bg-navy text-white shadow-lg hover:bg-navy-dark transition-all flex items-center justify-center"
          title="Open AI Assistant"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default SplitPageLayout;
