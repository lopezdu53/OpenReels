import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { Layout } from "@/components/Layout";
import { AuthProvider } from "@/hooks/useAuth";
import { AdminPage } from "@/pages/AdminPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { CronogramaPage } from "@/pages/CronogramaPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { FilmPage } from "@/pages/FilmPage";
import { FlowPage } from "@/pages/FlowPage";
import { CastingPage } from "@/pages/CastingPage";
import { HistoriaPage } from "@/pages/HistoriaPage";
import { StickmanJobPage } from "@/pages/StickmanJobPage";
import { StickmanPage } from "@/pages/StickmanPage";
import { VoxJobPage } from "@/pages/VoxJobPage";
import { VoxPage } from "@/pages/VoxPage";
import { GalleryPage } from "@/pages/GalleryPage";
import { HomePage } from "@/pages/HomePage";
import { JobPage } from "@/pages/JobPage";
import { LabPage } from "@/pages/LabPage";
import { LearningPage } from "@/pages/LearningPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { useAuth } from "@/hooks/useAuth";

function AdminStudio({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytic" element={<AnalyticsPage />} />
            <Route path="/analytic/cronograma" element={<CronogramaPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/casting" element={<CastingPage />} />
            <Route path="/casting/:section" element={<CastingPage />} />
            <Route path="/lab" element={<LabPage />} />
            <Route path="/" element={<AdminStudio><HomePage /></AdminStudio>} />
            <Route path="/film" element={<AdminStudio><FilmPage /></AdminStudio>} />
            <Route path="/flow" element={<AdminStudio><FlowPage /></AdminStudio>} />
            <Route path="/vox" element={<AdminStudio><VoxPage /></AdminStudio>} />
            <Route path="/vox/:id" element={<AdminStudio><VoxJobPage /></AdminStudio>} />
            <Route path="/stickman" element={<AdminStudio><StickmanPage /></AdminStudio>} />
            <Route path="/stickman/:id" element={<AdminStudio><StickmanJobPage /></AdminStudio>} />
            <Route path="/historia" element={<AdminStudio><HistoriaPage /></AdminStudio>} />
            <Route path="/historia/:id" element={<AdminStudio><StickmanJobPage /></AdminStudio>} />
            <Route path="/jobs/:id" element={<AdminStudio><JobPage /></AdminStudio>} />
            <Route path="/gallery" element={<AdminStudio><GalleryPage /></AdminStudio>} />
            <Route path="/settings" element={<AdminStudio><SettingsPage /></AdminStudio>} />
            <Route path="/admin" element={<AdminStudio><AdminPage /></AdminStudio>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
