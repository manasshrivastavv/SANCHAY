import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { CompleteProfileModal } from './components/auth/CompleteProfileModal';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { CustomCursor } from './components/common/CustomCursor';
import { ScrollToTop } from './components/common/ScrollToTop';
import { LandingPage } from './pages/LandingPage';
import { ProfilePage } from './pages/ProfilePage';
import { GoalPage } from './pages/GoalPage';
import { PreferencesPage } from './pages/PreferencesPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { ComparePage } from './pages/ComparePage';
import { SourcesPage } from './pages/SourcesPage';
import { MyPlansPage } from './pages/MyPlansPage';
import { LICPage } from './pages/LICPage';
import { FreeBenefitsPage } from './pages/FreeBenefitsPage';
import { MyProfilePage } from './pages/MyProfilePage';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
          <ScrollToTop />
          <CustomCursor />
          <div className="min-h-screen bg-sanchay-light text-sanchay-navy-900 font-sans overflow-x-hidden w-full relative">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/goal" element={<GoalPage />} />
              <Route path="/preferences" element={<PreferencesPage />} />
              <Route path="/recommendations" element={<RecommendationsPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/lic" element={<LICPage />} />
              <Route path="/lic-plans" element={<LICPage />} />
              <Route path="/free-benefits" element={<FreeBenefitsPage />} />
              <Route path="/benefits" element={<FreeBenefitsPage />} />

              {/* Graceful redirect for legacy callback */}
              <Route path="/sso-callback" element={<Navigate to="/" replace />} />

              {/* Protected Sovereign Citizen Routes */}
              <Route
                path="/my-plans"
                element={
                  <ProtectedRoute>
                    <MyPlansPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-profile"
                element={
                  <ProtectedRoute>
                    <MyProfilePage />
                  </ProtectedRoute>
                }
              />
            </Routes>
            <AuthModal />
            <CompleteProfileModal />
          </div>
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
}
