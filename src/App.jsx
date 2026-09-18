import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ClerkProvider, AuthenticateWithRedirectCallback } from '@clerk/react';

import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
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

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

function AppContent({ isClerkConfigured }) {
  return (
    <AuthProvider isClerkConfigured={isClerkConfigured}>
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

            {/* Clerk OAuth Redirect Callback */}
            <Route
              path="/sso-callback"
              element={
                <AuthenticateWithRedirectCallback
                  signInFallbackRedirectUrl="/"
                  signUpFallbackRedirectUrl="/"
                />
              }
            />

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
        </div>
      </Router>
    </AuthProvider>
  );
}

export default function App() {
  const isKeyConfigured = Boolean(CLERK_PUBLISHABLE_KEY && CLERK_PUBLISHABLE_KEY.trim().startsWith('pk_'));

  return (
    <LanguageProvider>
      {isKeyConfigured ? (
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
          <AppContent isClerkConfigured={true} />
        </ClerkProvider>
      ) : (
        <AppContent isClerkConfigured={false} />
      )}
    </LanguageProvider>
  );
}
