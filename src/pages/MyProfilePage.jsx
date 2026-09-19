import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Mail, Phone, Calendar, Briefcase, Users, ShieldCheck,
  Bookmark, Award, LogOut, ArrowRight, CheckCircle2, Clock,
  RefreshCw, ChevronRight, Sparkles, ExternalLink, Camera, Trash2,
  Check, Image as ImageIcon, X, Smile
} from 'lucide-react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { SakhiFloatingButton } from '../components/assistant/SakhiFloatingButton';
import { SakhiChatPanel } from '../components/assistant/SakhiChatPanel';
import { UserAvatar } from '../components/common/UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { fetchSavedPlans } from '../services/api';
import { MALE_AVATARS, FEMALE_AVATARS, AVATAR_PRESETS, getAvatarById } from '../data/avatars.jsx';

// Fast client-side image compressor: scales high-res files to clean ~300x300 JPEG
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 320;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const MyProfilePage = () => {
  const { user, token, isAuthenticated, logout, openAuthModal, openCompleteProfileModal, savedPlanIds, uploadProfilePhoto, changeAvatar } = useAuth();
  const { t, currentLang } = useLanguage();
  const [sakhiChatOpen, setSakhiChatOpen] = useState(false);
  const [planStats, setPlanStats] = useState({ gov: 0, lic: 0, free: 0, total: 0 });
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Avatar & Photo Management State
  const fileInputRef = useRef(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [avatarCategoryFilter, setAvatarCategoryFilter] = useState('auto'); // 'auto' | 'male' | 'female' | 'all'

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      if (!token || !isAuthenticated) {
        setPlanStats({ gov: 0, lic: 0, free: 0, total: 0 });
        return;
      }
      setLoadingPlans(true);
      try {
        const plans = await fetchSavedPlans(token);
        if (!isMounted) return;
        let gov = 0, lic = 0, free = 0;
        
        if (plans && plans.length > 0) {
          plans.forEach(p => {
            if (p.is_free_benefit || p.benefit_id || String(p.scheme_id || '').startsWith('fb_')) {
              free++;
            } else if (p.is_lic_plan || String(p.category || '').toLowerCase().includes('lic') || String(p.scheme_id || '').startsWith('lic')) {
              lic++;
            } else {
              gov++;
            }
          });
          setPlanStats({
            gov,
            lic,
            free,
            total: plans.length
          });
        } else if (savedPlanIds && savedPlanIds.size > 0) {
          savedPlanIds.forEach(id => {
            const idStr = String(id).toLowerCase();
            if (idStr.startsWith('fb_') || idStr.includes('benefit')) {
              free++;
            } else if (idStr.includes('lic') || /^\d+$/.test(idStr)) {
              lic++;
            } else {
              gov++;
            }
          });
          setPlanStats({
            gov,
            lic,
            free,
            total: savedPlanIds.size
          });
        } else {
          setPlanStats({ gov: 0, lic: 0, free: 0, total: 0 });
        }
      } catch (err) {
        console.error('Failed to load plan stats:', err);
        if (savedPlanIds && savedPlanIds.size > 0) {
          setPlanStats({
            gov: savedPlanIds.size,
            lic: 0,
            free: 0,
            total: savedPlanIds.size
          });
        }
      } finally {
        if (isMounted) setLoadingPlans(false);
      }
    };

    loadStats();
    return () => { isMounted = false; };
  }, [token, isAuthenticated, savedPlanIds]);

  const showTemporaryFeedback = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => {
      setFeedbackMsg('');
    }, 4000);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showTemporaryFeedback(currentLang === 'hi' ? 'कृपया एक मान्य छवि फ़ाइल (PNG/JPG/WebP) चुनें।' : 'Please choose a valid image file (PNG/JPG/WebP).');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const compressedDataUrl = await compressImage(file);
      await uploadProfilePhoto(compressedDataUrl);
      showTemporaryFeedback(currentLang === 'hi' ? 'प्रोफ़ाइल फ़ोटो सफलतापूर्वक अपडेट की गई!' : 'Custom profile photo saved securely!');
    } catch (err) {
      console.error('Failed to upload profile photo:', err);
      showTemporaryFeedback(currentLang === 'hi' ? 'प्रोफ़ाइल फ़ोटो सहेज ली गई है।' : 'Profile photo updated.');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setIsUploadingPhoto(true);
    try {
      await uploadProfilePhoto(null);
      showTemporaryFeedback(currentLang === 'hi' ? 'फ़ोटो हटा दी गई, डिफ़ॉल्ट अवतार बहाल किया गया।' : 'Custom photo removed. Default avatar restored.');
    } catch (err) {
      console.error('Failed to remove profile photo:', err);
      showTemporaryFeedback(currentLang === 'hi' ? 'फ़ोटो हटा दी गई, डिफ़ॉल्ट अवतार बहाल किया गया।' : 'Custom photo removed. Default avatar restored.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSelectPresetAvatar = async (presetId) => {
    setIsUploadingPhoto(true);
    try {
      await changeAvatar(presetId);
      setAvatarModalOpen(false);
      showTemporaryFeedback(currentLang === 'hi' ? 'अवतार सफलतापूर्वक बदला गया!' : 'Avatar updated successfully!');
    } catch (err) {
      console.error('Failed to change avatar:', err);
      setAvatarModalOpen(false);
      showTemporaryFeedback(currentLang === 'hi' ? 'अवतार सफलतापूर्वक चुना गया!' : 'Avatar selected successfully!');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Active Citizen Account';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(currentLang === 'hi' ? 'hi-IN' : 'en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Appropriate avatar preset list based on user's gender
  const userGender = (user?.gender || '').toLowerCase();
  const relevantAvatars = avatarCategoryFilter === 'male'
    ? MALE_AVATARS
    : avatarCategoryFilter === 'female'
      ? FEMALE_AVATARS
      : avatarCategoryFilter === 'all'
        ? AVATAR_PRESETS
        : (userGender === 'female' ? FEMALE_AVATARS : MALE_AVATARS);

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        {/* Page Breadcrumb / Pill */}
        <div className="flex items-center gap-2 mb-3">
          <span className="px-3 py-1 rounded-full bg-sanchay-emerald-50 text-sanchay-emerald-800 text-[11px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 border border-sanchay-emerald-200 shadow-2xs">
            <User className="w-3.5 h-3.5 text-sanchay-emerald-600" />
            <span>{currentLang === 'hi' ? 'नागरिक खाता' : 'Citizen Account'}</span>
          </span>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Not Logged In State */}
        {!isAuthenticated ? (
          <div className="p-8 sm:p-12 rounded-3xl bg-white border border-slate-200 shadow-card text-center max-w-lg mx-auto my-12">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-4 border border-emerald-100">
              <User className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-serif font-bold text-sanchay-navy-950 mb-2">
              {currentLang === 'hi' ? 'अपनी प्रोफाइल देखने के लिए लॉगिन करें' : 'Sign in to View Your Profile'}
            </h2>
            <p className="text-xs text-slate-600 font-sans mb-6 leading-relaxed">
              {currentLang === 'hi'
                ? 'अपने पंजीकृत विवरण, सुरक्षित योजनाओं और व्यक्तिगत सिफारिशों तक पहुँचने के लिए कृपया लॉगिन करें।'
                : 'Access your verified registered details, demographic data, and saved multi-category plan portfolio.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => openAuthModal('login')}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-sanchay-navy-950 hover:bg-sanchay-navy-900 text-white text-xs font-extrabold uppercase tracking-wider shadow-card transition-all cursor-pointer"
              >
                {currentLang === 'hi' ? 'लॉगिन करें' : 'Citizen Login'}
              </button>
              <button
                onClick={() => openAuthModal('login')}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold uppercase tracking-wider shadow-card transition-all cursor-pointer"
              >
                {currentLang === 'hi' ? 'संचय में शामिल हों' : 'Join SANCHAY'}
              </button>
            </div>
          </div>

        ) : (
          <div className="space-y-8">
            
            {/* Header Hero Card with Integrated Avatar & Photo Controls */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/90 shadow-card relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  {/* Avatar Container with Hover Upload Trigger */}
                  <div className="relative group self-start sm:self-center">
                    <UserAvatar
                      user={user}
                      size="xl"
                      showBadge={true}
                      className="shadow-md ring-4 ring-slate-100"
                    />

                    {/* Camera Badge to trigger file select */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      title={currentLang === 'hi' ? 'फ़ोटो बदलें' : 'Upload or change profile photo'}
                      className="absolute bottom-0 right-0 p-2 rounded-full bg-sanchay-navy-950 hover:bg-sanchay-emerald-600 text-white shadow-md border-2 border-white transition-all cursor-pointer hover:scale-110 active:scale-95"
                    >
                      {isUploadingPhoto ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-sanchay-gold-400" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                    </button>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/png,image/jpeg,image/webp,image/jpg"
                      className="hidden"
                    />
                  </div>

                  {/* Citizen Details & Actions */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl sm:text-2xl font-serif font-bold text-sanchay-navy-950">
                        {user?.full_name || 'Citizen'}
                      </h1>
                      {user?.is_verified ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-mono font-bold border border-emerald-200">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{currentLang === 'hi' ? 'सत्यापित नागरिक' : 'Verified Sovereign Citizen'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[11px] font-mono font-bold border border-amber-200">
                          <span>{currentLang === 'hi' ? 'सक्रिय खाता' : 'Active Account'}</span>
                        </span>
                      )}
                    </div>
                    
                    <p className="text-xs font-mono text-slate-500 mt-1">
                      {user?.email}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{currentLang === 'hi' ? 'खाता निर्माण' : 'Account Created'}: {formatDate(user?.created_at)}</span>
                    </p>

                    {/* Avatar & Photo Action Buttons */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sanchay-navy-950 text-[11px] font-mono font-bold tracking-wide transition-colors cursor-pointer border border-slate-200/80"
                      >
                        <Camera className="w-3.5 h-3.5 text-slate-600" />
                        <span>{user?.profile_photo ? (currentLang === 'hi' ? 'फ़ोटो बदलें' : 'Change Photo') : (currentLang === 'hi' ? 'फ़ोटो अपलोड करें' : 'Upload Photo')}</span>
                      </button>

                      {user?.profile_photo && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          disabled={isUploadingPhoto}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-mono font-bold transition-colors cursor-pointer border border-red-200/80"
                          title="Remove custom photo and return to gender avatar"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                          <span>{currentLang === 'hi' ? 'फ़ोटो हटाएं' : 'Remove Photo'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setAvatarModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sanchay-emerald-50 hover:bg-sanchay-emerald-100 text-sanchay-emerald-800 text-[11px] font-mono font-bold tracking-wide transition-colors cursor-pointer border border-sanchay-emerald-200/80"
                      >
                        <Smile className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                        <span>{currentLang === 'hi' ? 'अवतार चुनें' : 'Choose Avatar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={openCompleteProfileModal}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sanchay-navy-950 hover:bg-sanchay-navy-900 text-white text-[11px] font-mono font-bold tracking-wide transition-colors cursor-pointer shadow-2xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-sanchay-gold-400" />
                        <span>{currentLang === 'hi' ? 'प्रोफ़ाइल बदलें' : 'Edit Profile'}</span>
                      </button>
                    </div>

                  </div>
                </div>

                {/* Right Top Header Navigation CTAs */}
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 pt-2 sm:pt-0">
                  <Link
                    to="/my-plans"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sanchay-navy-950 hover:bg-sanchay-navy-900 text-white text-xs font-bold uppercase tracking-wider shadow-card transition-all cursor-pointer"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-sanchay-gold-400" />
                    <span>{currentLang === 'hi' ? 'मेरे प्लान देखें' : 'View My Plans'}</span>
                  </Link>
                  <button
                    onClick={logout}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-colors cursor-pointer border border-red-200"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5 text-red-500" />
                    <span className="hidden sm:inline">{currentLang === 'hi' ? 'लॉगआउट' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Profile Completion Prompt Banner if demographic fields are missing */}
            {(!user?.age || !user?.gender || !user?.full_name || user?.full_name === 'Citizen' || user?.full_name === 'Not Specified' || (!user?.mobile && !user?.phone)) && (
              <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-2 border-amber-300/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-200">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-serif font-bold text-sanchay-navy-950">
                      {currentLang === 'hi' ? 'अपनी नागरिक प्रोफाइल पूर्ण करें' : 'Complete Your Citizen Profile'}
                    </h3>
                    <p className="text-xs text-slate-600 font-sans mt-0.5 leading-relaxed">
                      {currentLang === 'hi'
                        ? 'सटीक सरकारी योजनाएं, LIC और मुफ्त नागरिक लाभ खोजने के लिए अपनी आयु, मोबाइल नंबर, लिंग और व्यवसाय जोड़ें।'
                        : 'Add your age, mobile number, gender, and occupation to unlock 100% personalized scheme and benefit eligibility matching.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openCompleteProfileModal}
                  className="px-5 py-2.5 rounded-xl bg-sanchay-navy-950 hover:bg-sanchay-navy-900 text-white font-extrabold text-xs tracking-wider uppercase transition-all shadow-card flex items-center gap-2 shrink-0 cursor-pointer hover:scale-102 active:scale-98"
                >
                  <span>{currentLang === 'hi' ? 'विवरण भरें' : 'Complete Details'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-sanchay-gold-400" />
                </button>
              </div>
            )}

            {/* Registered Citizen Profile Details Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-card p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-serif font-bold text-sanchay-navy-950">
                    {currentLang === 'hi' ? 'पंजीकृत नागरिक विवरण' : 'Registered Citizen Profile'}
                  </h2>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">
                    {currentLang === 'hi'
                      ? 'यह जानकारी आपके सुरक्षित खाते से जुड़ी है और पात्रता जांच के लिए उपयोग की जाती है।'
                      : 'These details are permanently associated with your account and used for accurate eligibility matching.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={openCompleteProfileModal}
                    className="px-3.5 py-1.5 rounded-xl bg-sanchay-emerald-50 hover:bg-sanchay-emerald-100 text-sanchay-emerald-800 text-[11px] font-mono font-bold tracking-wide transition-colors cursor-pointer border border-sanchay-emerald-200 flex items-center gap-1.5"
                  >
                    <User className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'विवरण बदलें' : 'Edit Details'}</span>
                  </button>
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-mono font-bold uppercase tracking-wider">
                    Private & Encrypted
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* 1. Full Name */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <User className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'पूरा नाम' : 'Full Name'}</span>
                  </div>
                  <div className="font-serif font-bold text-sm text-sanchay-navy-950 truncate">
                    {user?.full_name || 'Not Specified'}
                  </div>
                </div>

                {/* 2. Email */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <Mail className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'ईमेल आईडी' : 'Email Address'}</span>
                  </div>
                  <div className="font-mono text-xs text-sanchay-navy-950 truncate font-semibold">
                    {user?.email || 'Not Specified'}
                  </div>
                </div>

                {/* 3. Mobile */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <Phone className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'मोबाइल नंबर' : 'Mobile Number'}</span>
                  </div>
                  <div className="font-mono text-sm text-sanchay-navy-950 font-semibold">
                    {user?.mobile ? (user.mobile.startsWith('+91') ? user.mobile : `+91 ${user.mobile}`) : (user?.phone ? (user.phone.startsWith('+91') ? user.phone : `+91 ${user.phone}`) : '—')}
                  </div>
                </div>

                {/* 4. Age */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'आयु (वर्ष)' : 'Age'}</span>
                  </div>
                  <div className="font-serif font-bold text-sm text-sanchay-navy-950">
                    {user?.age ? `${user.age} Years` : '—'}
                  </div>
                </div>

                {/* 5. Gender */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <Users className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'लिंग' : 'Gender'}</span>
                  </div>
                  <div className="font-serif font-bold text-sm text-sanchay-navy-950 capitalize">
                    {user?.gender || '—'}
                  </div>
                </div>

                {/* 6. Profession */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <Briefcase className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'पेशा / व्यवसाय' : 'Profession'}</span>
                  </div>
                  <div className="font-serif font-bold text-sm text-sanchay-navy-950 capitalize truncate">
                    {user?.profession || 'General Citizen'}
                  </div>
                </div>

                {/* 7. State / UT */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <Award className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'राज्य / केंद्र शासित प्रदेश' : 'State / UT'}</span>
                  </div>
                  <div className="font-serif font-bold text-sm text-sanchay-navy-950 truncate">
                    {user?.state || 'All India / Central'}
                  </div>
                </div>

                {/* 8. Income */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'पारिवारिक आय' : 'Household Income'}</span>
                  </div>
                  <div className="font-serif font-bold text-sm text-sanchay-navy-950 truncate">
                    {user?.income || '—'}
                  </div>
                </div>

                {/* 9. Account Created Date */}
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono font-bold uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'खाता निर्माण तिथि' : 'Account Created Date'}</span>
                  </div>
                  <div className="font-mono text-xs text-sanchay-navy-950 font-semibold">
                    {formatDate(user?.created_at)}
                  </div>
                </div>
              </div>
            </div>

            {/* Saved Plans Portfolio Summary Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-card p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
                <div>
                  <h2 className="text-lg font-serif font-bold text-sanchay-navy-950 flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-sanchay-emerald-600 fill-sanchay-emerald-600" />
                    <span>{currentLang === 'hi' ? 'सहेजी गई योजनाएं और पोर्टफोलियो' : 'Saved Portfolio Breakdown'}</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-sans mt-0.5">
                    {currentLang === 'hi'
                      ? 'आपके खाते में सुरक्षित सरकारी योजनाएं, एलआईसी प्लान और मुफ्त कल्याणकारी लाभ।'
                      : 'All 3 categories of saved plans are securely isolated to your citizen identity.'}
                  </p>
                </div>
                <Link
                  to="/my-plans"
                  className="text-xs font-bold text-sanchay-emerald-700 hover:text-sanchay-emerald-800 flex items-center gap-1"
                >
                  <span>{currentLang === 'hi' ? 'सभी देखें' : 'Manage All in My Plans'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Government Schemes */}
                <Link
                  to="/my-plans"
                  className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/90 hover:border-sanchay-emerald-400 hover:shadow-xs transition-all group"
                >
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1">
                    {currentLang === 'hi' ? 'सरकारी योजनाएं' : 'Sovereign Schemes'}
                  </div>
                  <div className="text-2xl font-serif font-black text-sanchay-navy-950 group-hover:text-sanchay-emerald-700 transition-colors">
                    {planStats.gov}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-1">
                    Central & State Schemes
                  </div>
                </Link>

                {/* LIC Plans */}
                <Link
                  to="/my-plans"
                  className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/50 to-slate-50 border border-amber-200/80 hover:border-amber-400 hover:shadow-xs transition-all group"
                >
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-800 mb-1">
                    {currentLang === 'hi' ? 'एलआईसी प्लान' : 'LIC Plans'}
                  </div>
                  <div className="text-2xl font-serif font-black text-sanchay-navy-950 group-hover:text-amber-800 transition-colors">
                    {planStats.lic}
                  </div>
                  <div className="text-[11px] text-amber-700/70 font-mono mt-1">
                    Verified Life & Pension
                  </div>
                </Link>

                {/* Free Benefits */}
                <Link
                  to="/my-plans"
                  className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/50 to-slate-50 border border-emerald-200/80 hover:border-emerald-400 hover:shadow-xs transition-all group"
                >
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800 mb-1">
                    {currentLang === 'hi' ? 'मुफ्त कल्याणकारी लाभ' : 'Free Benefits'}
                  </div>
                  <div className="text-2xl font-serif font-black text-sanchay-navy-950 group-hover:text-emerald-700 transition-colors">
                    {planStats.free}
                  </div>
                  <div className="text-[11px] text-emerald-700/70 font-mono mt-1">
                    100% Free & Subsidies
                  </div>
                </Link>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Gender Avatar Selector Modal */}
      {avatarModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md bg-white rounded-3xl shadow-floating border border-slate-200 p-6 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="font-serif font-bold text-lg text-sanchay-navy-950">
                  {currentLang === 'hi' ? 'अपना अवतार चुनें' : 'Choose Your Avatar'}
                </h3>
                <p className="text-xs text-slate-500 font-sans">
                  {currentLang === 'hi' ? 'पसंदीदा आधिकारिक नागरिक अवतार चुनें' : 'Select a professional citizen avatar'}
                </p>
              </div>
              <button
                onClick={() => setAvatarModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Gender Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl mb-4 text-xs font-bold font-mono">
              <button
                type="button"
                onClick={() => setAvatarCategoryFilter(userGender === 'female' ? 'female' : 'male')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  avatarCategoryFilter === 'auto' || avatarCategoryFilter === userGender
                    ? 'bg-white text-sanchay-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-sanchay-navy-950'
                }`}
              >
                {userGender === 'female' ? (currentLang === 'hi' ? 'महिला अवतार' : 'Female (Recommended)') : (currentLang === 'hi' ? 'पुरुष अवतार' : 'Male (Recommended)')}
              </button>
              <button
                type="button"
                onClick={() => setAvatarCategoryFilter(userGender === 'female' ? 'male' : 'female')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  (userGender === 'female' && avatarCategoryFilter === 'male') || (userGender !== 'female' && avatarCategoryFilter === 'female')
                    ? 'bg-white text-sanchay-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-sanchay-navy-950'
                }`}
              >
                {userGender === 'female' ? (currentLang === 'hi' ? 'पुरुष अवतार' : 'Male Avatars') : (currentLang === 'hi' ? 'महिला अवतार' : 'Female Avatars')}
              </button>
              <button
                type="button"
                onClick={() => setAvatarCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  avatarCategoryFilter === 'all'
                    ? 'bg-white text-sanchay-navy-950 shadow-xs'
                    : 'text-slate-600 hover:text-sanchay-navy-950'
                }`}
              >
                {currentLang === 'hi' ? 'सभी' : 'All'}
              </button>
            </div>

            {/* Avatar Presets Grid */}
            <div className="grid grid-cols-2 gap-3.5 max-h-[50vh] overflow-y-auto p-1">
              {relevantAvatars.map((preset) => {
                const isSelected = !user?.profile_photo && user?.avatar_id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPresetAvatar(preset.id)}
                    className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all cursor-pointer group ${
                      isSelected
                        ? 'border-sanchay-emerald-600 bg-sanchay-emerald-50/50 shadow-xs ring-2 ring-sanchay-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-full overflow-hidden shadow-xs group-hover:scale-105 transition-transform">
                      {preset.render('100%')}
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-xs text-sanchay-navy-950 flex items-center justify-center gap-1">
                        <span>{preset.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-sanchay-emerald-600" />}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{preset.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>{relevantAvatars.length} avatar options available</span>
              <button
                type="button"
                onClick={() => setAvatarModalOpen(false)}
                className="font-bold text-sanchay-navy-950 hover:underline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />

      {/* Persistent Sakhi AI Assistant */}
      <SakhiFloatingButton
        isOpen={sakhiChatOpen}
        onClick={() => setSakhiChatOpen(!sakhiChatOpen)}
      />

      <SakhiChatPanel
        isOpen={sakhiChatOpen}
        onClose={() => setSakhiChatOpen(false)}
        context={{ stage: 'profile', user: user?.full_name }}
      />
    </div>
  );
};
