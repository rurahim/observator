/**
 * DrillContext — manages drill-down state for chart exploration.
 * Wrap a page in <DrillProvider> to enable drilling into chart elements.
 */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

export interface DrillLevel {
  dimension: string;
  value: string;
  label: string;
}

interface DrillState {
  stack: DrillLevel[];
  push: (dimension: string, value: string, label: string) => void;
  pop: (toIndex: number) => void;
  reset: () => void;
  /** Derived filters object from the current drill stack */
  filters: Record<string, string>;
  /** Current depth (0 = root) */
  depth: number;
  /** Current drill level label (or null at root) */
  currentLabel: string | null;
}

const DrillContext = createContext<DrillState | null>(null);

export function DrillProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<DrillLevel[]>([]);

  const push = useCallback((dimension: string, value: string, label: string) => {
    setStack(prev => [...prev, { dimension, value, label }]);
  }, []);

  const pop = useCallback((toIndex: number) => {
    setStack(prev => prev.slice(0, toIndex));
  }, []);

  const reset = useCallback(() => {
    setStack([]);
  }, []);

  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    stack.forEach(level => {
      result[level.dimension] = level.value;
    });
    return result;
  }, [stack]);

  const value: DrillState = useMemo(
    () => ({
      stack,
      push,
      pop,
      reset,
      filters,
      depth: stack.length,
      currentLabel: stack.length > 0 ? stack[stack.length - 1].label : null,
    }),
    [stack, push, pop, reset, filters],
  );

  return <DrillContext.Provider value={value}>{children}</DrillContext.Provider>;
}

export function useDrill(): DrillState {
  const ctx = useContext(DrillContext);
  if (!ctx) throw new Error('useDrill must be used within a DrillProvider');
  return ctx;
}
