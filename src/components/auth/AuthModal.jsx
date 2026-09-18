import React, { useState, useEffect } from 'react';
import {
  X, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Lock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

// Helper to map Firebase error codes to friendly messages
function getFriendlyErrorMessage(err, lang = 'en') {
  const code = err?.code || '';
  const msg = err?.message || '';

  if (code === 'auth/popup-closed-by-user') {
    return lang === 'hi'
      ? 'Google साइन-इन रद्द कर दिया गया।'
      : 'Google sign-in was cancelled.';
  }
  if (code === 'auth/network-request-failed') {
    return lang === 'hi'
      ? 'नेटवर्क त्रुटि। कृपया अपना इंटरनेट कनेक्शन जांचें।'
      : 'Network error. Please check your internet connection.';
  }
  if (code === 'auth/too-many-requests') {
    return lang === 'hi'
      ? 'बहुत अधिक प्रयास किए गए। कृपया कुछ समय बाद पुनः प्रयास करें।'
      : 'Too many attempts. Please wait a few minutes before trying again.';
  }
  return msg || (lang === 'hi' ? 'Google साइन-इन विफल रहा। कृपया पुनः प्रयास करें।' : 'Google sign-in failed. Please try again.');
}

export const AuthModal = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    loginWithGoogle,
    isFirebaseConfigured
  } = useAuth();

  const { currentLang } = useLanguage();

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Sync state when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      setIsLoading(false);
    }
  }, [isAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  // Language dictionary for Auth UI
  const labels = {
    en: {
      welcome: 'Welcome to SANCHAY',
      subtext: 'Official Indian Government Scheme & Benefit Guidance Portal',
      continueWithGoogle: 'Continue with Google',
      signingInGoogle: 'Signing in with Google...',
      benefit1: 'Save and track verified Government Schemes & LIC Plans',
      benefit2: 'Unlimited personalized recommendations & Sakhi AI guidance',
      benefit3: 'Instant 1-click Google sign-in — no passwords to remember',
      firebaseNotice: 'Firebase configuration not detected. Please add Firebase variables to your .env file.',
      disclaimer: '256-bit encrypted authentication powered by Firebase & Government of India verified protocols'
    },
    hi: {
      welcome: 'संचय में आपका स्वागत है',
      subtext: 'आधिकारिक भारतीय सरकारी योजना एवं नागरिक लाभ पोर्टल',
      continueWithGoogle: 'Google के साथ आगे बढ़ें',
      signingInGoogle: 'Google से लॉगिन किया जा रहा है...',
      benefit1: 'आधिकारिक सरकारी योजनाएं और LIC प्लान सुरक्षित रखें',
      benefit2: 'असीमित व्यक्तिगत सिफारिशें और सखी AI मार्गदर्शन',
      benefit3: '1-क्लिक सुरक्षित Google साइन-इन — पासवर्ड याद रखने की जरूरत नहीं',
      firebaseNotice: 'Firebase कॉन्फ़िगरेशन नहीं मिला। कृपया .env फ़ाइल में Firebase वेरिएबल्स जोड़ें।',
      disclaimer: '256-बिट एन्क्रिप्टेड प्रमाणीकरण — Firebase एवं भारत सरकार द्वारा सत्यापित प्रोटोकॉल'
    },
    mr: {
      welcome: 'संचय मध्ये आपले स्वागत आहे',
      subtext: 'अधिकृत भारतीय शासकीय योजना आणि नागरिक मार्गदर्शन पोर्टल',
      continueWithGoogle: 'Google सह पुढे जा',
      signingInGoogle: 'Google सह लॉगिन करत आहे...',
      benefit1: 'शासकीय योजना आणि LIC योजना सुरक्षित ठेवा',
      benefit2: 'अमर्यादित वैयक्तिकृत शिफारसी आणि सखी AI मार्गदर्शन',
      benefit3: '1-क्लिक सुरक्षित Google साइन-इन — पासवर्डची आवश्यकता नाही',
      firebaseNotice: 'Firebase कॉन्फिगरेशन आढळले नाही. कृपया .env मध्ये Firebase व्हेरिएबल्स जोडा.',
      disclaimer: '256-बिट एनक्रिप्टेड प्रमाणीकरण — Firebase द्वारे समर्थित'
    },
    bn: {
      welcome: 'সঞ্চয়-এ আপনাকে স্বাগতম',
      subtext: 'অফিসিয়াল ভারতীয় সরকারি স্কিম এবং নাগরিক গাইডেন্স পোর্টাল',
      continueWithGoogle: 'Google দিয়ে এগিয়ে যান',
      signingInGoogle: 'Google দিয়ে সাইন ইন হচ্ছে...',
      benefit1: 'সরকারি স্কিম এবং LIC প্ল্যান সংরক্ষণ করুন',
      benefit2: 'ব্যক্তিগত সুপারিশ এবং সখী AI নির্দেশিকা পান',
      benefit3: '১-ক্লিক সুরক্ষিত Google সাইন-ইন — কোনো পাসওয়ার্ড লাগবে না',
      firebaseNotice: 'Firebase কনফিগারেশন পাওয়া যায়নি। .env ফাইলে Firebase ভেরিয়েবল যোগ করুন।',
      disclaimer: '২৫৬-বিট এনক্রিপ্ট করা প্রমাণীকরণ — Firebase দ্বারা চালিত'
    },
    te: {
      welcome: 'సంచయ్‌కి స్వాగతం',
      subtext: 'అధికారిక భారత ప్రభుత్వ పథకాలు మరియు పౌర మార్గదర్శక పోర్టల్',
      continueWithGoogle: 'Googleతో కొనసాగించండి',
      signingInGoogle: 'Googleతో లాగిన్ అవుతోంది...',
      benefit1: 'ప్రభుత్వ పథకాలు & LIC ప్లాన్‌లను భద్రపరచండి',
      benefit2: 'వ్యక్తిగతీకరించిన సిఫార్సులు మరియు సఖి AI మార్గదర్శకత్వం',
      benefit3: '1-క్లిక్ సురక్షిత Google సైన్-ఇన్ — పాస్‌వర్డ్ అవసరం లేదు',
      firebaseNotice: 'Firebase కాన్ఫిగరేషన్ కనుగొనబడలేదు. .env లో Firebase వేరియబుల్స్ జోడించండి.',
      disclaimer: '256-బిట్ ఎన్‌క్రిప్టెడ్ ప్రామాణీకరణ — Firebase ద్వారా ఆధారితం'
    }
  };

  const l = labels[currentLang] || labels.en;

  // Handle Google Login Click
  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google login error:', err);
      setErrorMsg(getFriendlyErrorMessage(err, currentLang));
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) closeAuthModal();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-floating border border-slate-200/90 overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header with Title and Close */}
        <div className="p-5 sm:p-7 bg-gradient-to-br from-sanchay-navy-950 via-sanchay-navy-900 to-sanchay-navy-950 text-white relative">
          <button
            onClick={closeAuthModal}
            disabled={isLoading}
            aria-label="Close"
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-sanchay-emerald-500/20 border border-sanchay-emerald-400/30 text-sanchay-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              SANCHAY Sovereign Authentication
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-white">
            {l.welcome}
          </h2>

          <p className="text-xs text-slate-300 font-sans mt-1">
            {l.subtext}
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-7 space-y-5">
          
          {/* Firebase setup notice if config is missing */}
          {!isFirebaseConfigured && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{l.firebaseNotice}</p>
                <p className="mt-1 text-[11px] text-amber-700">
                  Add <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_FIREBASE_API_KEY</code> and project credentials to your environment.
                </p>
              </div>
            </div>
          )}

          {/* Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-sanchay-emerald-50 border border-sanchay-emerald-200 text-sanchay-emerald-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-sanchay-emerald-600 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* GOOGLE AUTHENTICATION ONLY */}
          <div className="space-y-4">
            
            {/* CONTINUE WITH GOOGLE BUTTON */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 text-sanchay-navy-950 font-bold text-xs sm:text-sm tracking-wide shadow-2xs hover:shadow-card transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 group"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-sanchay-emerald-600" />
                  <span>{l.signingInGoogle}</span>
                </>
              ) : (
                <>
                  {/* Official Google Icon */}
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{l.continueWithGoogle}</span>
                </>
              )}
            </button>

            {/* Verified Citizen Benefits list */}
            <div className="pt-2 pb-1 space-y-2">
              <div className="flex items-center gap-2.5 text-[11px] text-slate-600">
                <span className="w-4 h-4 rounded-full bg-sanchay-emerald-100 text-sanchay-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                <span>{l.benefit1}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[11px] text-slate-600">
                <span className="w-4 h-4 rounded-full bg-sanchay-emerald-100 text-sanchay-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                <span>{l.benefit2}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[11px] text-slate-600">
                <span className="w-4 h-4 rounded-full bg-sanchay-emerald-100 text-sanchay-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                <span>{l.benefit3}</span>
              </div>
            </div>

          </div>

          {/* Privacy and Sovereign Disclaimer */}
          <div className="pt-2 text-center text-[10px] text-slate-400 font-sans flex items-center justify-center gap-1.5 border-t border-slate-100">
            <Lock className="w-3 h-3 text-slate-400 shrink-0" />
            <span>{l.disclaimer}</span>
          </div>

        </div>

      </div>
    </div>
  );
};
