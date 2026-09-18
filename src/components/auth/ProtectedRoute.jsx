import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { Navbar } from '../layout/Navbar';
import { Footer } from '../layout/Footer';

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoadingUser, openAuthModal } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isLoadingUser && !isAuthenticated) {
      openAuthModal('login');
    }
  }, [isAuthenticated, isLoadingUser, openAuthModal, location.pathname]);

  if (isLoadingUser) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF9F5]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-sanchay-emerald-600 border-t-transparent"></div>
            <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">Verifying Citizen Session...</span>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-[#FAF9F5]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-card text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-sanchay-emerald-50 border border-sanchay-emerald-200/60 flex items-center justify-center mx-auto mb-4 text-sanchay-emerald-700">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-sanchay-navy-950 mb-2">
              Citizen Authentication Required
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mb-6 font-sans">
              This sovereign portal area stores personal scheme recommendations, evaluations, and saved portfolios. Please sign in to continue.
            </p>
            <button
              onClick={() => openAuthModal('login')}
              className="w-full py-3.5 px-6 rounded-2xl bg-sanchay-emerald-600 hover:bg-sanchay-emerald-700 text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider shadow-card transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue with Google</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return children;
};
