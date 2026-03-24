import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { FilterProvider } from "@/contexts/FilterContext";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import { SkeletonPage } from "@/components/shared/Skeletons";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import ProtectedRoute from "@/components/shared/ProtectedRoute";
import NotFound from "@/pages/NotFound";

const SkillGapPage = lazy(() => import("@/pages/SkillGapPage"));
const AIImpactPage = lazy(() => import("@/pages/AIImpactPage"));
const ForecastPage = lazy(() => import("@/pages/ForecastPage"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const KnowledgeBasePage = lazy(() => import("@/pages/KnowledgeBasePage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const UniversityPage = lazy(() => import("@/pages/UniversityPage"));
const AgentsPage = lazy(() => import("@/pages/AgentsPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const DataLandscapePage = lazy(() => import("@/pages/DataLandscapePage"));
const SkillsTaxonomyPage = lazy(() => import("@/pages/SkillsTaxonomyPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const DataExplorerPage = lazy(() => import("@/pages/DataExplorerPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const Lazy = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<SkeletonPage />}>{children}</Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <LanguageProvider>
      <FilterProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/skill-gap" element={<Lazy><SkillGapPage /></Lazy>} />
              <Route path="/ai-impact" element={<Lazy><AIImpactPage /></Lazy>} />
              <Route path="/forecast" element={<Lazy><ForecastPage /></Lazy>} />
              <Route path="/chat" element={<Lazy><ChatPage /></Lazy>} />
              <Route path="/knowledge-base" element={<Lazy><KnowledgeBasePage /></Lazy>} />
              <Route path="/reports" element={<Lazy><ReportsPage /></Lazy>} />
              <Route path="/university" element={<Lazy><UniversityPage /></Lazy>} />
              <Route path="/agents" element={<Lazy><AgentsPage /></Lazy>} />
              <Route path="/admin" element={<Lazy><AdminPage /></Lazy>} />
              <Route path="/data-landscape" element={<Lazy><DataLandscapePage /></Lazy>} />
              <Route path="/skills-taxonomy" element={<Lazy><SkillsTaxonomyPage /></Lazy>} />
              <Route path="/data-explorer" element={<Lazy><DataExplorerPage /></Lazy>} />
              <Route path="/settings" element={<Lazy><SettingsPage /></Lazy>} />
            </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </FilterProvider>
    </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
