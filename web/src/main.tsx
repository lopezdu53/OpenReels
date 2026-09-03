import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { Layout } from "@/components/Layout";
import { AuthProvider } from "@/hooks/useAuth";
import { AdminPage } from "@/pages/AdminPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { FilmPage } from "@/pages/FilmPage";
import { GalleryPage } from "@/pages/GalleryPage";
import { HomePage } from "@/pages/HomePage";
import { JobPage } from "@/pages/JobPage";
import { LabPage } from "@/pages/LabPage";
import { LearningPage } from "@/pages/LearningPage";
import { SettingsPage } from "@/pages/SettingsPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/film" element={<FilmPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytic" element={<AnalyticsPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/jobs/:id" element={<JobPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/lab" element={<LabPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
