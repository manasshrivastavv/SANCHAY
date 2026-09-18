import React, { useState, useEffect, useRef } from 'react';
import {
  X, Phone, ShieldCheck, CheckCircle2, ArrowRight, AlertCircle, RefreshCw,
  ArrowLeft, Lock, Smartphone
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Toggle for Phone/SMS OTP in UI.
 * Enabled for Firebase Authentication with Indian (+91) Mobile OTP.
 */
const ENABLE_MOBILE_SMS = true;

// Helper to map Firebase error codes to friendly messages
function getFriendlyErrorMessage(err, lang = 'en') {
  const code = err?.code || '';
  const msg = err?.message || '';

  if (code === 'auth/invalid-phone-number') {
    return lang === 'hi'
      ? 'कृपया एक मान्य 10-अंकों का भारतीय मोबाइल नंबर दर्ज करें।'
      : 'Please enter a valid 10-digit Indian mobile number.';
  }
  if (code === 'auth/invalid-verification-code') {
    return lang === 'hi'
      ? 'अमान्य OTP कोड। कृपया सही 6-अंकों का कोड दर्ज करें।'
      : 'Invalid OTP. Please check the code and try again.';
  }
  if (code === 'auth/code-expired') {
    return lang === 'hi'
      ? 'OTP समाप्त हो गया है। कृपया पुनः नया OTP भेजें।'
      : 'OTP has expired. Please request a new OTP.';
  }
  if (code === 'auth/too-many-requests') {
    return lang === 'hi'
      ? 'बहुत अधिक प्रयास किए गए। कृपया कुछ समय बाद पुनः प्रयास करें।'
      : 'Too many attempts. Please wait a few minutes before trying again.';
  }
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
  if (code === 'auth/quota-exceeded') {
    return lang === 'hi'
      ? 'SMS सीमा समाप्त। कृपया कुछ समय बाद पुनः प्रयास करें या Google से लॉगिन करें।'
      : 'SMS quota exceeded. Please try again later or sign in with Google.';
  }
  if (code === 'auth/captcha-check-failed') {
    return lang === 'hi'
      ? 'सुरक्षा सत्यापन (reCAPTCHA) विफल रहा। कृपया पुनः प्रयास करें।'
      : 'reCAPTCHA verification failed. Please try again.';
  }
  return msg || (lang === 'hi' ? 'प्रमाणीकरण विफल रहा। कृपया पुनः प्रयास करें।' : 'Authentication failed. Please try again.');
}

export const AuthModal = () => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalMode,
    pendingPhone: initialPendingPhone,
    loginWithGoogle,
    startMobileOtp,
    verifyMobileOtp,
    resendMobileOtp,
    isFirebaseConfigured
  } = useAuth();

  const { currentLang } = useLanguage();

  const [step, setStep] = useState('select'); // 'select' | 'otp'
  const [mobileNumber, setMobileNumber] = useState('');
  const [formattedTargetPhone, setFormattedTargetPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  
  // UI states
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loadingAction, setLoadingAction] = useState(''); // 'google' | 'sending_otp' | 'verifying_otp' | 'resending_otp'
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpInputRef = useRef(null);

  // Sync state when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      if (ENABLE_MOBILE_SMS && authModalMode === 'otp') {
        setStep('otp');
        setFormattedTargetPhone(initialPendingPhone || '');
      } else {
        setStep('select');
      }
      setErrorMsg('');
      setSuccessMsg('');
      setOtpCode('');
      setLoadingAction('');
    }
  }, [isAuthModalOpen, authModalMode, initialPendingPhone]);

  // Resend cooldown timer
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Focus OTP input when entering OTP step
  useEffect(() => {
    if (step === 'otp' && otpInputRef.current) {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [step]);

  if (!isAuthModalOpen) return null;

  // Language dictionary for Auth UI
  const labels = {
    en: {
      welcome: 'Welcome to SANCHAY',
      subtext: 'Official Indian Government Scheme & Benefit Guidance Portal',
      continueWithGoogle: 'Continue with Google',
      orDivider: 'OR',
      continueWithMobile: 'Continue with Mobile',
      mobileLabel: 'Mobile Number',
      mobilePlaceholder: 'Enter 10-digit mobile number',
      sendOtp: 'Send OTP',
      sendingOtp: 'Sending OTP...',
      enterOtpTitle: 'Enter the 6-digit OTP',
      otpSentTo: 'We sent a verification code via SMS to',
      verifyOtp: 'Verify OTP',
      verifyingOtp: 'Verifying OTP...',
      resendOtp: 'Resend OTP',
      resendingOtp: 'Resending...',
      changeMobile: 'Change mobile number',
      resendIn: 'Resend in',
      signingInGoogle: 'Signing in with Google...',
      firebaseNotice: 'Firebase configuration not detected. Please add Firebase variables to your .env file.'
    },
    hi: {
      welcome: 'संचय में आपका स्वागत है',
      subtext: 'आधिकारिक भारतीय सरकारी योजना एवं नागरिक लाभ पोर्टल',
      continueWithGoogle: 'Google के साथ आगे बढ़ें',
      orDivider: 'या',
      continueWithMobile: 'मोबाइल नंबर से आगे बढ़ें',
      mobileLabel: 'मोबाइल नंबर',
      mobilePlaceholder: '10 अंकों का मोबाइल नंबर दर्ज करें',
      sendOtp: 'OTP भेजें',
      sendingOtp: 'OTP भेजा जा रहा है...',
      enterOtpTitle: '6-अंकों का OTP दर्ज करें',
      otpSentTo: 'हमने इस नंबर पर SMS द्वारा कोड भेजा है:',
      verifyOtp: 'OTP सत्यापित करें',
      verifyingOtp: 'OTP सत्यापित किया जा रहा है...',
      resendOtp: 'पुनः OTP भेजें',
      resendingOtp: 'भेजा जा रहा है...',
      changeMobile: 'नंबर बदलें',
      resendIn: 'पुनः भेजें',
      signingInGoogle: 'Google से लॉगिन किया जा रहा है...',
      firebaseNotice: 'Firebase कॉन्फ़िगरेशन नहीं मिला। कृपया .env फ़ाइल में Firebase वेरिएबल्स जोड़ें।'
    },
    mr: {
      welcome: 'संचय मध्ये आपले स्वागत आहे',
      subtext: 'अधिकृत भारतीय शासकीय योजना आणि नागरिक मार्गदर्शन पोर्टल',
      continueWithGoogle: 'Google सह पुढे जा',
      orDivider: 'किंवा',
      continueWithMobile: 'मोबाईल नंबरसह पुढे जा',
      mobileLabel: 'मोबाईल नंबर',
      mobilePlaceholder: '10 अंकी मोबाईल नंबर टाका',
      sendOtp: 'OTP पाठवा',
      sendingOtp: 'OTP पाठवत आहे...',
      enterOtpTitle: '6-अंकी OTP टाका',
      otpSentTo: 'आम्ही SMS द्वारे या नंबरवर कोड पाठवला आहे:',
      verifyOtp: 'OTP पडताळणी करा',
      verifyingOtp: 'पडताळणी करत आहे...',
      resendOtp: 'पुन्हा OTP पाठवा',
      resendingOtp: 'पाठवत आहे...',
      changeMobile: 'नंबर बदला',
      resendIn: 'पुन्हा पाठवा',
      signingInGoogle: 'Google सह लॉगिन करत आहे...',
      firebaseNotice: 'Firebase कॉन्फिगरेशन आढळले नाही. कृपया .env मध्ये Firebase व्हेरिएबल्स जोडा.'
    },
    bn: {
      welcome: 'সঞ্চয়-এ আপনাকে স্বাগতম',
      subtext: 'অফিসিয়াল ভারতীয় সরকারি স্কিম এবং নাগরিক গাইডেন্স পোর্টাল',
      continueWithGoogle: 'Google দিয়ে এগিয়ে যান',
      orDivider: 'অথবা',
      continueWithMobile: 'মোবাইল নম্বর দিয়ে এগিয়ে যান',
      mobileLabel: 'মোবাইল নম্বর',
      mobilePlaceholder: '১০ ডিজিটের মোবাইল নম্বর লিখুন',
      sendOtp: 'OTP পাঠান',
      sendingOtp: 'OTP পাঠানো হচ্ছে...',
      enterOtpTitle: '৬-সংখ্যার OTP লিখুন',
      otpSentTo: 'আমরা SMS এর মাধ্যমে এই নম্বরে কোড পাঠিয়েছি:',
      verifyOtp: 'OTP যাচাই করুন',
      verifyingOtp: 'যাচাই করা হচ্ছে...',
      resendOtp: 'পুনরায় OTP পাঠান',
      resendingOtp: 'পাঠানো হচ্ছে...',
      changeMobile: 'নম্বর পরিবর্তন করুন',
      resendIn: 'পুনরায় পাঠান',
      signingInGoogle: 'Google দিয়ে সাইন ইন হচ্ছে...',
      firebaseNotice: 'Firebase কনফিগারেশন পাওয়া যায়নি। .env ফাইলে Firebase ভেরিয়েবল যোগ করুন।'
    },
    te: {
      welcome: 'సంచయ్‌కి స్వాగతం',
      subtext: 'అధికారిక భారత ప్రభుత్వ పథకాలు మరియు పౌర మార్గదర్శక పోర్టల్',
      continueWithGoogle: 'Googleతో కొనసాగించండి',
      orDivider: 'లేదా',
      continueWithMobile: 'మొబైల్ నంబర్‌తో కొనసాగించండి',
      mobileLabel: 'మొబైల్ నంబర్',
      mobilePlaceholder: '10 అంకెల మొబైల్ నంబర్ నమోదు చేయండి',
      sendOtp: 'OTP పంపండి',
      sendingOtp: 'OTP పంపుతోంది...',
      enterOtpTitle: '6-అంకెల OTP నమోదు చేయండి',
      otpSentTo: 'మేము SMS ద్వారా ఈ నంబర్‌కు కోడ్ పంపాము:',
      verifyOtp: 'OTP ధృవీకరించండి',
      verifyingOtp: 'ధృవీకరిస్తోంది...',
      resendOtp: 'మరలా OTP పంపండి',
      resendingOtp: 'పంపుతోంది...',
      changeMobile: 'నంబర్ మార్చండి',
      resendIn: 'మరలా పంపండి',
      signingInGoogle: 'Googleతో లాగిన్ అవుతోంది...',
      firebaseNotice: 'Firebase కాన్ఫిగరేషన్ కనుగొనబడలేదు. .env లో Firebase వేరియబుల్స్ జోడించండి.'
    }
  };

  const l = labels[currentLang] || labels.en;

  // Handle Google OAuth Click
  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setLoadingAction('google');
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google login error:', err);
      setErrorMsg(getFriendlyErrorMessage(err, currentLang));
      setLoadingAction('');
    }
  };

  // Handle Send Mobile OTP
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    const cleanDigits = mobileNumber.replace(/\D/g, '');
    if (cleanDigits.length !== 10) {
      setErrorMsg(currentLang === 'hi' ? 'कृपया एक मान्य 10-अंकों का भारतीय मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setLoadingAction('sending_otp');

    try {
      const res = await startMobileOtp(cleanDigits);
      setFormattedTargetPhone(res.phone || `+91${cleanDigits}`);
      setStep('otp');
      setResendCooldown(30);
    } catch (err) {
      setErrorMsg(getFriendlyErrorMessage(err, currentLang));
    } finally {
      setLoadingAction('');
    }
  };

  // Handle Verify OTP
  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMsg(currentLang === 'hi' ? 'कृपया 6-अंकों का OTP दर्ज करें।' : 'Please enter the 6-digit OTP code.');
      return;
    }

    setErrorMsg('');
    setLoadingAction('verifying_otp');

    try {
      await verifyMobileOtp(otpCode.trim());
      // Successful verification automatically closes the modal
    } catch (err) {
      setErrorMsg(getFriendlyErrorMessage(err, currentLang));
    } finally {
      setLoadingAction('');
    }
  };

  // Handle Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setErrorMsg('');
    setLoadingAction('resending_otp');

    try {
      await resendMobileOtp();
      setResendCooldown(30);
      setSuccessMsg(currentLang === 'hi' ? 'नया OTP आपके मोबाइल पर भेजा गया।' : 'A new OTP has been sent to your mobile.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setErrorMsg(getFriendlyErrorMessage(err, currentLang));
    } finally {
      setLoadingAction('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loadingAction) closeAuthModal();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-floating border border-slate-200/90 overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-200">
        
        {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
        <div id="recaptcha-container"></div>

        {/* Header with Title and Close */}
        <div className="p-5 sm:p-7 bg-gradient-to-br from-sanchay-navy-950 via-sanchay-navy-900 to-sanchay-navy-950 text-white relative">
          <button
            onClick={closeAuthModal}
            disabled={!!loadingAction}
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
            {ENABLE_MOBILE_SMS && step === 'otp' ? l.enterOtpTitle : l.welcome}
          </h2>

          <p className="text-xs text-slate-300 font-sans mt-1">
            {ENABLE_MOBILE_SMS && step === 'otp' ? (
              <span>
                {l.otpSentTo} <strong className="text-white font-mono">{formattedTargetPhone}</strong>
              </span>
            ) : (
              l.subtext
            )}
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
                  Add <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_FIREBASE_API_KEY</code> and project details to your environment.
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

          {/* MAIN AUTHENTICATION SCREEN: GOOGLE + INDIAN MOBILE OTP */}
          {(!ENABLE_MOBILE_SMS || step === 'select') && (
            <div className="space-y-4">
              
              {/* CONTINUE WITH GOOGLE BUTTON */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={!!loadingAction}
                className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 text-sanchay-navy-950 font-bold text-xs sm:text-sm tracking-wide shadow-2xs hover:shadow-card transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 group"
              >
                {loadingAction === 'google' ? (
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

              {/* OR DIVIDER */}
              {ENABLE_MOBILE_SMS && (
                <div className="relative flex items-center justify-center pt-2">
                  <div className="border-t border-slate-200 w-full" />
                  <span className="bg-white px-3 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    {l.orDivider}
                  </span>
                  <div className="border-t border-slate-200 w-full" />
                </div>
              )}

              {/* MOBILE NUMBER INPUT FORM */}
              {ENABLE_MOBILE_SMS && (
                <form onSubmit={handleSendOtp} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                      <span>{l.continueWithMobile}</span>
                    </label>

                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50/70 focus-within:bg-white focus-within:border-sanchay-emerald-500 focus-within:ring-2 focus-within:ring-sanchay-emerald-500/20 transition-all overflow-hidden">
                      <div className="px-3.5 py-3 bg-slate-100/90 text-slate-700 font-mono font-bold text-xs flex items-center gap-1.5 border-r border-slate-200 select-none shrink-0">
                        <span className="text-sm">🇮🇳</span>
                        <span>+91</span>
                        <span className="text-slate-300 font-normal">|</span>
                      </div>

                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="98765 43210"
                        className="w-full px-3.5 py-3 text-xs sm:text-sm font-mono tracking-wider bg-transparent outline-none text-sanchay-navy-950 placeholder:text-slate-400 placeholder:font-sans"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loadingAction === 'sending_otp' || mobileNumber.length !== 10}
                    className="w-full py-3.5 px-4 rounded-2xl bg-sanchay-emerald-600 hover:bg-sanchay-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-card hover:shadow-card-hover transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingAction === 'sending_otp' ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{l.sendingOtp}</span>
                      </>
                    ) : (
                      <>
                        <span>{l.sendOtp}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Verified Citizen Benefits list */}
              <div className="pt-2 pb-1 space-y-2">
                <div className="flex items-center gap-2.5 text-[11px] text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-sanchay-emerald-100 text-sanchay-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                  <span>{currentLang === 'hi' ? 'आधिकारिक सरकारी योजनाएं और LIC प्लान सुरक्षित रखें' : 'Save and track verified Government Schemes & LIC Plans'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-sanchay-emerald-100 text-sanchay-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                  <span>{currentLang === 'hi' ? 'असीमित व्यक्तिगत सिफारिशें और सखी AI मार्गदर्शन' : 'Unlimited personalized recommendations & Sakhi AI guidance'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-sanchay-emerald-100 text-sanchay-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">✓</span>
                  <span>{currentLang === 'hi' ? '1-क्लिक सुरक्षित Google या मोबाइल OTP साइन-इन — पासवर्ड याद रखने की जरूरत नहीं' : 'Instant 1-click Google or Mobile OTP sign-in — no passwords to remember'}</span>
                </div>
              </div>

            </div>
          )}

          {/* 6-DIGIT OTP SCREEN */}
          {ENABLE_MOBILE_SMS && step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 text-center">
                  {l.enterOtpTitle}
                </label>

                <div className="relative">
                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    className="w-full text-center text-2xl sm:text-3xl font-mono font-black tracking-[0.4em] sm:tracking-[0.5em] py-3.5 px-4 rounded-2xl border-2 border-slate-200 bg-slate-50/50 focus:bg-white focus:border-sanchay-emerald-500 focus:ring-4 focus:ring-sanchay-emerald-500/20 outline-none transition-all text-sanchay-navy-950"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loadingAction === 'verifying_otp' || otpCode.length !== 6}
                className="w-full py-3.5 px-4 rounded-2xl bg-sanchay-emerald-600 hover:bg-sanchay-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-card hover:shadow-card-hover transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingAction === 'verifying_otp' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{l.verifyingOtp}</span>
                  </>
                ) : (
                  <>
                    <span>{l.verifyOtp}</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 text-xs border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || loadingAction === 'resending_otp'}
                  className="font-mono font-bold text-sanchay-emerald-700 hover:text-sanchay-emerald-800 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  {loadingAction === 'resending_otp' ? (
                    l.resendingOtp
                  ) : resendCooldown > 0 ? (
                    `${l.resendIn} (${resendCooldown}s)`
                  ) : (
                    l.resendOtp
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('select');
                    setErrorMsg('');
                    setSuccessMsg('');
                    setOtpCode('');
                  }}
                  className="text-slate-500 hover:text-sanchay-navy-950 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{l.changeMobile}</span>
                </button>
              </div>
            </form>
          )}

          {/* Privacy and Sovereign Disclaimer */}
          <div className="pt-2 text-center text-[10px] text-slate-400 font-sans flex items-center justify-center gap-1.5 border-t border-slate-100">
            <Lock className="w-3 h-3 text-slate-400 shrink-0" />
            <span>256-bit encrypted authentication powered by Firebase & Government of India verified protocols</span>
          </div>

        </div>

      </div>
    </div>
  );
};
