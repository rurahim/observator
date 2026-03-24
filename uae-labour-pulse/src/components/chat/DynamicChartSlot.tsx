/**
 * DynamicChartSlot — displays the latest AI-generated chart at the top of a page.
 * Animates in when a new chart is available, can be dismissed or pinned.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pin, Sparkles } from 'lucide-react';
import ChatVisualization from './ChatVisualization';
import type { VisualizationSpec } from './parseVisualization';

interface DynamicChartSlotProps {
  spec: VisualizationSpec | null;
  onDismiss: () => void;
}

const DynamicChartSlot = ({ spec, onDismiss }: DynamicChartSlotProps) => {
  const [pinned, setPinned] = useState(false);

  if (!spec) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-4"
      >
        <div className="bg-card rounded-xl border border-navy/15 shadow-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-light bg-gradient-to-r from-navy/5 to-teal/5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-gold" />
              <span className="text-xs font-semibold text-primary">
                {spec.title || 'AI-Generated Visualization'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPinned(p => !p)}
                className={`p-1 rounded-md transition-colors ${
                  pinned
                    ? 'text-navy bg-navy/10'
                    : 'text-text-muted hover:text-navy hover:bg-surface-hover'
                }`}
                title={pinned ? 'Unpin' : 'Pin'}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              {!pinned && (
                <button
                  onClick={onDismiss}
                  className="p-1 rounded-md text-text-muted hover:text-primary hover:bg-surface-hover transition-colors"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="p-4">
            <ChatVisualization spec={spec} />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DynamicChartSlot;
