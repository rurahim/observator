import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Topbar from './Topbar';
import AppSidebar from './AppSidebar';
import MobileNav from './MobileNav';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import CommandPalette from '@/components/shared/CommandPalette';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import OnboardingTour from '@/components/shared/OnboardingTour';
import DataSourceBadge from '@/components/shared/DataSourceBadge';

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isDesktop;
};

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = collapsed ? 60 : 220;
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Topbar onToggleSidebar={() => setCollapsed(c => !c)} />
      <AppSidebar collapsed={collapsed} onCollapse={() => setCollapsed(c => !c)} />
      <CommandPalette />
      <OnboardingTour />
      <main
        className="pt-14 pb-16 lg:pb-0 transition-all duration-300 overflow-x-hidden"
        style={{ marginLeft: isDesktop ? `${sidebarWidth}px` : 0 }}
      >
        <div className="p-4 lg:p-6">
          <Breadcrumbs />
          <ErrorBoundary key={location.pathname}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>
      </main>
      <MobileNav />
      <DataSourceBadge />
    </div>
  );
};

export default AppLayout;
