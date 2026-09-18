import React, { useState, useEffect } from 'react';
import {
  X, User, Phone, Calendar, Users, Briefcase, MapPin, IndianRupee,
  ShieldCheck, CheckCircle2, ArrowRight, RefreshCw, Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const INDIAN_STATES = [
  'All India / Central',
  'Andhra Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi (NCT)',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

export const CompleteProfileModal = () => {
  const {
    user,
    isCompleteProfileModalOpen,
    closeCompleteProfileModal,
    updateUserProfile
  } = useAuth();

  const { currentLang } = useLanguage();

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [profession, setProfession] = useState('Salaried / Professional');
  const [state, setState] = useState('Uttar Pradesh');
  const [income, setIncome] = useState('₹1 Lakh - ₹2.5 Lakhs');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Prefill when modal opens or user updates
  useEffect(() => {
    if (isCompleteProfileModalOpen && user) {
      setFullName((user.full_name && user.full_name !== 'Citizen' && user.full_name !== 'Not Specified') ? user.full_name : '');
      setMobile(user.mobile || user.phone || '');
      setAge(user.age ? String(user.age) : '');
      setGender(user.gender || 'male');
      setProfession(user.profession && user.profession !== 'General Citizen' ? user.profession : 'Salaried / Professional');
      setState(user.state || 'Uttar Pradesh');
      setIncome(user.income || '₹1 Lakh - ₹2.5 Lakhs');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isCompleteProfileModalOpen, user]);

  if (!isCompleteProfileModalOpen) return null;

  const labels = {
    en: {
      title: 'Complete Your Citizen Profile',
      subtitle: 'Provide your demographic details for accurate government scheme and benefit matching.',
      fullName: 'Full Name',
      fullNamePlaceholder: 'e.g. Ramesh Kumar',
      mobile: 'Mobile Number',
      mobilePlaceholder: '10-digit Indian mobile',
      age: 'Age (Years)',
      agePlaceholder: 'e.g. 28',
      gender: 'Gender',
      genderMale: 'Male',
      genderFemale: 'Female',
      genderOther: 'Other',
      profession: 'Profession / Occupation',
      state: 'State / Union Territory',
      income: 'Annual Household Income',
      saveBtn: 'Save & Complete Profile',
      savingBtn: 'Saving Profile...',
      skipBtn: 'Skip for Now',
      success: 'Profile saved successfully!'
    },
    hi: {
      title: 'नागरिक प्रोफाइल पूर्ण करें',
      subtitle: 'सटीक सरकारी योजना और लाभ अनुशंसा के लिए अपनी जनसांख्यिकीय जानकारी दर्ज करें।',
      fullName: 'पूरा नाम',
      fullNamePlaceholder: 'उदा. रमेश कुमार',
      mobile: 'मोबाइल नंबर',
      mobilePlaceholder: '10 अंकों का मोबाइल नंबर',
      age: 'आयु (वर्ष)',
      agePlaceholder: 'उदा. 28',
      gender: 'लिंग',
      genderMale: 'पुरुष',
      genderFemale: 'महिला',
      genderOther: 'अन्य',
      profession: 'पेशा / व्यवसाय',
      state: 'राज्य / केंद्र शासित प्रदेश',
      income: 'वार्षिक पारिवारिक आय',
      saveBtn: 'प्रोफाइल सहेजें',
      savingBtn: 'सहेजा जा रहा है...',
      skipBtn: 'बाद में पूरा करें',
      success: 'प्रोफाइल सफलतापूर्वक अपडेट हो गई!'
    }
  };

  const l = labels[currentLang] || labels.en;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    if (!fullName.trim()) {
      setErrorMsg(currentLang === 'hi' ? 'कृपया अपना पूरा नाम दर्ज करें।' : 'Please enter your full name.');
      return;
    }

    const cleanMobile = mobile.replace(/\D/g, '');
    if (cleanMobile && cleanMobile.length !== 10) {
      setErrorMsg(currentLang === 'hi' ? 'कृपया 10 अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const numAge = parseInt(age, 10);
    if (!age || isNaN(numAge) || numAge < 1 || numAge > 120) {
      setErrorMsg(currentLang === 'hi' ? 'कृपया 1 से 120 वर्ष के बीच एक मान्य आयु दर्ज करें।' : 'Please enter a valid age between 1 and 120.');
      return;
    }

    if (!gender) {
      setErrorMsg(currentLang === 'hi' ? 'कृपया लिंग का चयन करें।' : 'Please select your gender.');
      return;
    }

    setIsSubmitting(true);

    try {
      await updateUserProfile({
        full_name: fullName.trim(),
        mobile: cleanMobile ? cleanMobile : '',
        phone: cleanMobile ? cleanMobile : '',
        age: numAge,
        gender: gender.toLowerCase(),
        profession: profession || 'Salaried / Professional',
        state: state || 'All India / Central',
        income: income || ''
      });

      setSuccessMsg(l.success);
      setTimeout(() => {
        closeCompleteProfileModal();
      }, 700);
    } catch (err) {
      console.error('Profile update failed:', err);
      setErrorMsg(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) closeCompleteProfileModal();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-floating border border-slate-200/90 overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header with Title and Close */}
        <div className="p-5 sm:p-6 bg-gradient-to-br from-sanchay-navy-950 via-sanchay-navy-900 to-sanchay-navy-950 text-white relative">
          <button
            onClick={closeCompleteProfileModal}
            disabled={isSubmitting}
            aria-label="Close"
            className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-sanchay-emerald-500/20 border border-sanchay-emerald-400/30 text-sanchay-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sanchay-gold-400" />
              Sovereign Citizen Registry
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-white">
            {l.title}
          </h2>

          <p className="text-xs text-slate-300 font-sans mt-1 leading-relaxed">
            {l.subtitle}
          </p>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          
          {/* Alerts */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <span className="font-bold">Error:</span> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-sanchay-emerald-50 border border-sanchay-emerald-200 text-sanchay-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sanchay-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 1. Full Name */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-sanchay-emerald-600" />
              <span>{l.fullName} <strong className="text-red-500">*</strong></span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={l.fullNamePlaceholder}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-sanchay-emerald-500 focus:ring-2 focus:ring-sanchay-emerald-500/20 outline-none text-sanchay-navy-950 transition-all font-sans font-medium"
            />
          </div>

          {/* 2. Mobile & Age (2-columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                <span>{l.mobile}</span>
              </label>
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/60 focus-within:bg-white focus-within:border-sanchay-emerald-500 focus-within:ring-2 focus-within:ring-sanchay-emerald-500/20 transition-all overflow-hidden">
                <div className="px-2.5 py-2.5 bg-slate-100 text-slate-600 font-mono font-bold text-xs border-r border-slate-200 select-none">
                  🇮🇳 +91
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98765 43210"
                  className="w-full px-3 py-2 text-xs sm:text-sm font-mono bg-transparent outline-none text-sanchay-navy-950 placeholder:text-slate-400 placeholder:font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sanchay-emerald-600" />
                <span>{l.age} <strong className="text-red-500">*</strong></span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder={l.agePlaceholder}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-sanchay-emerald-500 focus:ring-2 focus:ring-sanchay-emerald-500/20 outline-none text-sanchay-navy-950 transition-all font-mono font-bold"
              />
            </div>
          </div>

          {/* 3. Gender */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-sanchay-emerald-600" />
              <span>{l.gender} <strong className="text-red-500">*</strong></span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'male', label: l.genderMale, icon: '👨' },
                { id: 'female', label: l.genderFemale, icon: '👩' },
                { id: 'other', label: l.genderOther, icon: '🧑' }
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setGender(item.id)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    gender === item.id
                      ? 'border-sanchay-emerald-600 bg-sanchay-emerald-50 text-sanchay-emerald-900 shadow-2xs font-bold'
                      : 'border-slate-200 bg-slate-50/60 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Profession / Occupation */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-sanchay-emerald-600" />
              <span>{l.profession}</span>
            </label>
            <select
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-sanchay-emerald-500 focus:ring-2 focus:ring-sanchay-emerald-500/20 outline-none text-sanchay-navy-950 transition-all font-sans cursor-pointer"
            >
              <option value="Salaried / Professional">Salaried / Professional (Corporate / Private)</option>
              <option value="Government / Public Sector">Government / Public Sector Employee</option>
              <option value="Self-Employed / Business">Self-Employed / Business Owner</option>
              <option value="Farmer / Agriculturalist">Farmer / Agriculturalist</option>
              <option value="Unorganised / Gig Worker">Unorganised / Daily Wage / Gig Worker</option>
              <option value="Student">Student (High School / College / Higher Ed)</option>
              <option value="Homemaker">Homemaker</option>
              <option value="Retired Senior">Retired Senior Citizen</option>
              <option value="General Citizen">General Citizen</option>
            </select>
          </div>

          {/* 5. State / UT */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-sanchay-emerald-600" />
              <span>{l.state}</span>
            </label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-sanchay-emerald-500 focus:ring-2 focus:ring-sanchay-emerald-500/20 outline-none text-sanchay-navy-950 transition-all font-sans cursor-pointer"
            >
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* 6. Income Range */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-slate-600 mb-1.5 flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-sanchay-emerald-600" />
              <span>{l.income}</span>
            </label>
            <select
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-sanchay-emerald-500 focus:ring-2 focus:ring-sanchay-emerald-500/20 outline-none text-sanchay-navy-950 transition-all font-sans cursor-pointer"
            >
              <option value="Less than ₹1 Lakh">Less than ₹1 Lakh</option>
              <option value="₹1 Lakh - ₹2.5 Lakhs">₹1 Lakh - ₹2.5 Lakhs (BPL / Low Income)</option>
              <option value="₹2.5 Lakhs - ₹5 Lakhs">₹2.5 Lakhs - ₹5 Lakhs (Lower Middle Class)</option>
              <option value="₹5 Lakhs - ₹10 Lakhs">₹5 Lakhs - ₹10 Lakhs (Middle Class)</option>
              <option value="Above ₹10 Lakhs">Above ₹10 Lakhs</option>
            </select>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-sanchay-emerald-600 hover:bg-sanchay-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-card hover:shadow-card-hover transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{l.savingBtn}</span>
                </>
              ) : (
                <>
                  <span>{l.saveBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={closeCompleteProfileModal}
              disabled={isSubmitting}
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              {l.skipBtn}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
