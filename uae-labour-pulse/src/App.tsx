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
import ProtectedRoute from "@/components/shared/ProtectedRoute";
import NotFound from "@/pages/NotFound";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const SupplySidePage = lazy(() => import("@/pages/SupplySidePage"));
const DemandSidePage = lazy(() => import("@/pages/DemandSidePage"));
const KnowledgeBasePage = lazy(() => import("@/pages/KnowledgeBasePage"));
const AIImpactPage = lazy(() => import("@/pages/AIImpactPage"));

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
              <Route path="/" element={<Lazy><DashboardPage /></Lazy>} />
              <Route path="/supply" element={<Lazy><SupplySidePage /></Lazy>} />
              <Route path="/demand" element={<Lazy><DemandSidePage /></Lazy>} />
              <Route path="/knowledge-base" element={<Lazy><KnowledgeBasePage /></Lazy>} />
              <Route path="/ai-impact" element={<Lazy><AIImpactPage /></Lazy>} />
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
