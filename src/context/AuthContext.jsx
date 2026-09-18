import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import {
  getCurrentUser,
  syncFirebaseUserApi,
  uploadProfilePhotoApi,
  updateAvatarApi,
  updateUserProfileApi,
  addSavedPlan,
  removeSavedPlan,
  setAuthTokenProvider
} from '../services/api';

const AuthContext = createContext();

const USER_KEY = 'sanchay_auth_user';
const GUEST_USAGE_KEY = 'sanchay_guest_fms_count';
const MAX_FREE_GUEST_USES = 2;

// Utility to normalize Indian mobile numbers to standard E.164 (+91XXXXXXXXXX)
export function formatIndianPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `+91${digits.slice(1)}`;
  }
  if (String(phone).startsWith('+')) {
    return String(phone);
  }
  return `+91${digits}`;
}

export const AuthProvider = ({ children }) => {
  // SANCHAY user document (synced from MongoDB via FastAPI)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [token, setToken] = useState(null);
  const [savedPlanIds, setSavedPlanIds] = useState(() => new Set(user?.saved_plans || []));
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login'); // 'login' | 'otp' | 'limit_reached'
  const [pendingPhone, setPendingPhone] = useState('');

  // Complete Profile Modal State (prompt after Google connect or on-demand)
  const [isCompleteProfileModalOpen, setIsCompleteProfileModalOpen] = useState(false);

  // Firebase Phone Confirmation Result ref
  const confirmationResultRef = useRef(null);

  // Guest usage tracker for 2 free uses
  const [guestUsageCount, setGuestUsageCount] = useState(() => {
    const saved = localStorage.getItem(GUEST_USAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });

  // Setup auth token provider for api.js
  useEffect(() => {
    if (auth) {
      setAuthTokenProvider(async () => {
        try {
          if (auth.currentUser) {
            return await auth.currentUser.getIdToken();
          }
          return null;
        } catch (err) {
          console.warn('[AUTH_CONTEXT] Failed to resolve Firebase ID token:', err);
          return null;
        }
      });
    } else {
      setAuthTokenProvider(null);
    }
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    if (!auth) {
      setIsLoadingUser(false);
      return;
    }

    let isCancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        setIsLoadingUser(true);
        try {
          const idToken = await fbUser.getIdToken();
          if (isCancelled) return;
          setToken(idToken);

          const primaryEmail = fbUser.email || '';
          const primaryPhone = fbUser.phoneNumber || '';
          const fullName = fbUser.displayName || 'Citizen';
          const imageUrl = fbUser.photoURL || null;

          let finalUserObj = null;

          try {
            // Check if profile exists in backend
            let backendUser = await getCurrentUser(idToken);
            if (backendUser && !backendUser.unauthorized) {
              finalUserObj = {
                ...backendUser,
                full_name: (backendUser.full_name && backendUser.full_name !== 'Citizen' && backendUser.full_name !== 'Not Specified')
                  ? backendUser.full_name
                  : (fullName || 'Citizen'),
                email: backendUser.email || primaryEmail || '',
                phone: backendUser.phone || backendUser.mobile || primaryPhone || '',
                mobile: backendUser.mobile || backendUser.phone || primaryPhone || '',
                profile_photo: backendUser.profile_photo || imageUrl || null
              };
            } else {
              // Sync user into MongoDB via FastAPI
              const syncRes = await syncFirebaseUserApi({
                email: primaryEmail,
                phone: primaryPhone,
                full_name: fullName,
                profile_photo: imageUrl
              }, idToken);

              if (syncRes?.user) {
                finalUserObj = {
                  ...syncRes.user,
                  full_name: (syncRes.user.full_name && syncRes.user.full_name !== 'Citizen' && syncRes.user.full_name !== 'Not Specified')
                    ? syncRes.user.full_name
                    : (fullName || 'Citizen'),
                  email: syncRes.user.email || primaryEmail || '',
                  phone: syncRes.user.phone || syncRes.user.mobile || primaryPhone || '',
                  mobile: syncRes.user.mobile || syncRes.user.phone || primaryPhone || ''
                };
              }
            }
          } catch (backendErr) {
            console.warn('[AUTH_CONTEXT] Backend profile sync offline, using local Firebase session:', backendErr);
          }

          if (!finalUserObj) {
            finalUserObj = {
              firebase_uid: fbUser.uid,
              user_id: fbUser.uid,
              full_name: fullName,
              email: primaryEmail,
              phone: primaryPhone,
              mobile: primaryPhone,
              profile_photo: imageUrl,
              avatar_id: 'female_1',
              saved_plans: user?.saved_plans || []
            };
          }

          if (!isCancelled) {
            setUser(finalUserObj);
            localStorage.setItem(USER_KEY, JSON.stringify(finalUserObj));
          }
        } catch (err) {
          console.error('[AUTH_CONTEXT] Error processing auth state change:', err);
        } finally {
          if (!isCancelled) setIsLoadingUser(false);
        }
      } else {
        // Signed out
        setUser(null);
        setToken(null);
        localStorage.removeItem(USER_KEY);
        setIsLoadingUser(false);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  // Sync saved plan IDs set
  useEffect(() => {
    if (user?.saved_plans) {
      setSavedPlanIds(new Set(user.saved_plans));
    } else {
      setSavedPlanIds(new Set());
    }
  }, [user]);

  const openAuthModal = useCallback((mode = 'login', phone = '') => {
    setAuthModalMode(mode);
    if (phone) setPendingPhone(phone);
    setIsAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  const openCompleteProfileModal = useCallback(() => {
    setIsCompleteProfileModalOpen(true);
  }, []);

  const closeCompleteProfileModal = useCallback(() => {
    setIsCompleteProfileModalOpen(false);
  }, []);

  // 1. CONTINUE WITH GOOGLE (Firebase OAuth popup)
  const loginWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error('Firebase authentication is not initialized. Please verify configuration.');
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      closeAuthModal();
      // Prompt citizen to complete demographic details right after Google connects
      setTimeout(() => {
        setIsCompleteProfileModalOpen(true);
      }, 400);
      return result;
    } catch (err) {
      console.error('[FIREBASE_GOOGLE] Google Sign-In failed:', err);
      throw err;
    }
  };

  // Helper to get or create invisible RecaptchaVerifier
  const getRecaptchaVerifier = () => {
    if (typeof window === 'undefined') return null;

    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (e) {
        console.warn('Recaptcha clear notice:', e);
      }
      window.recaptchaVerifier = null;
    }

    const container = document.getElementById('recaptcha-container');
    if (!container) {
      throw new Error('reCAPTCHA container element (#recaptcha-container) not found in DOM.');
    }

    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // Solved
      },
      'expired-callback': () => {
        console.warn('reCAPTCHA expired. Please try requesting OTP again.');
      }
    });

    return window.recaptchaVerifier;
  };

  // 2. MOBILE SMS OTP: SEND OTP
  const startMobileOtp = async (rawPhone) => {
    if (!auth) {
      throw new Error('Firebase authentication is not initialized.');
    }

    const formattedPhone = formatIndianPhone(rawPhone);
    if (!formattedPhone || formattedPhone.length !== 13 || !formattedPhone.startsWith('+91')) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    setPendingPhone(formattedPhone);

    try {
      const appVerifier = getRecaptchaVerifier();
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      confirmationResultRef.current = confirmationResult;
      setAuthModalMode('otp');
      return { success: true, phone: formattedPhone };
    } catch (err) {
      console.error('[FIREBASE_PHONE] Send SMS OTP failed:', err);
      // Reset reCAPTCHA if error occurs
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {
          // ignore
        }
        window.recaptchaVerifier = null;
      }
      throw err;
    }
  };

  // 3. MOBILE SMS OTP: VERIFY OTP
  const verifyMobileOtp = async (code) => {
    if (!code || code.trim().length !== 6) {
      throw new Error('Please enter the 6-digit OTP sent to your phone.');
    }

    if (!confirmationResultRef.current) {
      throw new Error('No active OTP verification session found. Please request a new OTP.');
    }

    const cleanCode = code.trim();
    try {
      const userCredential = await confirmationResultRef.current.confirm(cleanCode);
      closeAuthModal();
      return { success: true, user: userCredential.user };
    } catch (err) {
      console.error('[FIREBASE_PHONE] OTP Verification failed:', err);
      throw err;
    }
  };

  // 4. RESEND SMS OTP
  const resendMobileOtp = async () => {
    if (!pendingPhone) {
      throw new Error('No pending mobile number to resend OTP to.');
    }
    return await startMobileOtp(pendingPhone);
  };

  // 5. OFFICIAL SIGNOUT
  const logout = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (err) {
      console.warn('Firebase signOut notice:', err);
    } finally {
      setUser(null);
      setFirebaseUser(null);
      setToken(null);
      setSavedPlanIds(new Set());
      localStorage.removeItem(USER_KEY);
    }
  };

  // Profile Management
  const uploadProfilePhoto = async (photoData) => {
    const res = await uploadProfilePhotoApi(null, photoData);
    if (res?.user) {
      setUser(res.user);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    }
    return res;
  };

  const changeAvatar = async (avatarId) => {
    const res = await updateAvatarApi(null, avatarId);
    if (res?.user) {
      setUser(res.user);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    }
    return res;
  };

  const updateUserProfile = async (profileData) => {
    // 1. Instantly update local user state so UI reflects changes immediately
    setUser((prev) => {
      const updated = {
        ...prev,
        ...profileData,
        is_profile_completed: true,
        mobile: profileData.mobile || profileData.phone || prev?.mobile || '',
        phone: profileData.phone || profileData.mobile || prev?.phone || ''
      };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });

    // 2. Persist to backend MongoDB
    try {
      const res = await updateUserProfileApi(profileData);
      if (res?.user) {
        setUser((prev) => {
          const finalUser = { ...prev, ...res.user, is_profile_completed: true };
          localStorage.setItem(USER_KEY, JSON.stringify(finalUser));
          return finalUser;
        });
      }
      return res;
    } catch (err) {
      console.warn('Backend updateUserProfile offline, persisted locally:', err);
      return { status: 'success', user: { ...profileData, is_profile_completed: true } };
    }
  };

  // Saved Plans Management
  const addToMyPlans = async (schemeId) => {
    if (!schemeId) return false;
    if (!firebaseUser && !user) {
      openAuthModal('login');
      return false;
    }

    const idStr = String(schemeId);
    const currentList = Array.from(savedPlanIds || user?.saved_plans || []);
    const updatedPlans = currentList.includes(idStr) ? currentList : [...currentList, idStr];
    setSavedPlanIds(new Set(updatedPlans));
    setUser((prev) => {
      const updatedUser = prev ? { ...prev, saved_plans: updatedPlans } : { saved_plans: updatedPlans };
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      return updatedUser;
    });

    try {
      const res = await addSavedPlan(schemeId);
      if (res?.saved_plans) {
        setSavedPlanIds(new Set(res.saved_plans));
        setUser((prev) => {
          const updatedUser = prev ? { ...prev, saved_plans: res.saved_plans } : prev;
          if (updatedUser) localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
          return updatedUser;
        });
      }
    } catch (err) {
      console.warn('Backend addSavedPlan offline, persisted locally:', err);
    }
    return true;
  };

  const removeFromMyPlans = async (schemeId) => {
    if (!schemeId) return false;
    const idStr = String(schemeId).toLowerCase();
    const currentList = Array.from(savedPlanIds || user?.saved_plans || []);
    const updatedPlans = currentList.filter((id) => {
      const curLower = String(id).toLowerCase();
      if (curLower === idStr) return false;
      const m1 = curLower.match(/\d+/);
      const m2 = idStr.match(/\d+/);
      if (m1 && m2 && m1[0] === m2[0] && (curLower.includes('lic') || idStr.includes('lic'))) return false;
      return true;
    });

    setSavedPlanIds(new Set(updatedPlans));
    setUser((prev) => {
      const updatedUser = prev ? { ...prev, saved_plans: updatedPlans } : { saved_plans: updatedPlans };
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      return updatedUser;
    });

    try {
      const res = await removeSavedPlan(schemeId);
      if (res?.saved_plans) {
        setSavedPlanIds(new Set(res.saved_plans));
        setUser((prev) => {
          const updatedUser = prev ? { ...prev, saved_plans: res.saved_plans } : prev;
          if (updatedUser) localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
          return updatedUser;
        });
      }
    } catch (err) {
      console.warn('Backend removeSavedPlan offline, removed locally:', err);
    }
    return true;
  };

  const isPlanSaved = (schemeId) => {
    if (!schemeId) return false;
    if (savedPlanIds.has(schemeId)) return true;
    const sLower = String(schemeId).toLowerCase();
    for (const id of savedPlanIds) {
      const idLower = String(id).toLowerCase();
      if (idLower === sLower) return true;
      const numMatch = idLower.match(/\d+/);
      const targetMatch = sLower.match(/\d+/);
      if (numMatch && targetMatch && numMatch[0] === targetMatch[0]) {
        if (idLower.includes('lic') || sLower.includes('lic')) return true;
      }
    }
    return false;
  };

  // Find My Schemes guest evaluation tracker
  const canUseFindMySchemes = () => {
    if (firebaseUser || user) return true;
    return guestUsageCount < MAX_FREE_GUEST_USES;
  };

  const recordFindMySchemesUsage = () => {
    if (firebaseUser || user) return;
    const nextCount = guestUsageCount + 1;
    setGuestUsageCount(nextCount);
    localStorage.setItem(GUEST_USAGE_KEY, nextCount.toString());
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        firebaseUser,
        isAuthenticated: !!firebaseUser || (!!user && !!token),
        isLoadingUser,
        savedPlanIds,
        isAuthModalOpen,
        authModalMode,
        pendingPhone,
        isCompleteProfileModalOpen,
        guestUsageCount,
        maxFreeGuestUses: MAX_FREE_GUEST_USES,
        isFirebaseConfigured: !!auth,
        isClerkConfigured: false,
        openAuthModal,
        closeAuthModal,
        openCompleteProfileModal,
        closeCompleteProfileModal,
        loginWithGoogle,
        startMobileOtp,
        verifyMobileOtp,
        resendMobileOtp,
        logout,
        uploadProfilePhoto,
        changeAvatar,
        updateUserProfile,
        addToMyPlans,
        removeFromMyPlans,
        isPlanSaved,
        canUseFindMySchemes,
        recordFindMySchemesUsage
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
