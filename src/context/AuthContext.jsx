import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  useClerk,
  useUser,
  useSession,
  useSignIn,
  useSignUp
} from '@clerk/react';

import {
  getCurrentUser,
  syncClerkUserApi,
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

/**
 * Inner component that mounts inside <ClerkProvider> to bind Clerk's hooks
 * and expose unified authentication methods across SANCHAY.
 */
export const AuthProvider = ({ children, isClerkConfigured = true }) => {
  const clerk = isClerkConfigured ? useClerk() : null;
  const { isLoaded: isUserLoaded, isSignedIn, user: clerkUser } = isClerkConfigured ? useUser() : { isLoaded: true, isSignedIn: false, user: null };
  const { session } = isClerkConfigured ? useSession() : { session: null };
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = isClerkConfigured ? useSignIn() : { isLoaded: true, signIn: null, setActive: null };
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = isClerkConfigured ? useSignUp() : { isLoaded: true, signUp: null, setActive: null };

  // SANCHAY user document (synced from MongoDB via FastAPI)
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(null);
  const [savedPlanIds, setSavedPlanIds] = useState(() => new Set(user?.saved_plans || []));
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login'); // 'login' | 'otp' | 'limit_reached'
  const [pendingPhone, setPendingPhone] = useState('');
  const [otpFlow, setOtpFlow] = useState('sign_in'); // 'sign_in' | 'sign_up'

  // Guest usage tracker for 2 free uses
  const [guestUsageCount, setGuestUsageCount] = useState(() => {
    const saved = localStorage.getItem(GUEST_USAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });

  // Sync token provider whenever Clerk session changes
  useEffect(() => {
    if (session) {
      setAuthTokenProvider(async () => {
        try {
          return await session.getToken();
        } catch (err) {
          return null;
        }
      });
      session.getToken().then(t => setToken(t)).catch(() => setToken(null));
    } else {
      setAuthTokenProvider(null);
      setToken(null);
    }
  }, [session]);

  // Sync user profile with FastAPI & MongoDB whenever Clerk auth status changes
  useEffect(() => {
    let isCancelled = false;

    if (!isUserLoaded) return;

    if (isSignedIn && clerkUser && session) {
      setIsLoadingUser(true);
      session.getToken()
        .then(async (jwtToken) => {
          if (isCancelled) return;
          if (!jwtToken) {
            setIsLoadingUser(false);
            return;
          }

          setToken(jwtToken);

          // Extract verified identifiers from Clerk User
          const primaryEmail = clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress || '';
          const primaryPhone = clerkUser.primaryPhoneNumber?.phoneNumber || clerkUser.phoneNumbers?.[0]?.phoneNumber || '';
          const fullName = clerkUser.fullName || `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'Citizen';
          const imageUrl = clerkUser.imageUrl || null;

          try {
            // First attempt to get current user from backend
            let backendUser = await getCurrentUser(jwtToken);
            if (backendUser && !backendUser.unauthorized) {
              if (!isCancelled) {
                setUser(backendUser);
                localStorage.setItem(USER_KEY, JSON.stringify(backendUser));
              }
            } else {
              // Sync user profile into MongoDB via sync endpoint
              const syncRes = await syncClerkUserApi({
                email: primaryEmail,
                phone: primaryPhone,
                full_name: fullName,
                profile_photo: imageUrl
              }, jwtToken);

              if (syncRes?.user && !isCancelled) {
                setUser(syncRes.user);
                localStorage.setItem(USER_KEY, JSON.stringify(syncRes.user));
              }
            }
          } catch (err) {
            console.warn('[AUTH_CONTEXT] Backend profile sync offline, using local Clerk session:', err);
            // Construct baseline local user object
            if (!isCancelled) {
              const fallbackUser = {
                clerk_user_id: clerkUser.id,
                user_id: clerkUser.id,
                full_name: fullName,
                email: primaryEmail,
                phone: primaryPhone,
                mobile: primaryPhone,
                profile_photo: imageUrl,
                avatar_id: 'female_1',
                saved_plans: user?.saved_plans || []
              };
              setUser(fallbackUser);
              localStorage.setItem(USER_KEY, JSON.stringify(fallbackUser));
            }
          } finally {
            if (!isCancelled) setIsLoadingUser(false);
          }
        })
        .catch(() => {
          if (!isCancelled) setIsLoadingUser(false);
        });
    } else {
      // Signed out
      setUser(null);
      setToken(null);
      localStorage.removeItem(USER_KEY);
      setIsLoadingUser(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [isSignedIn, clerkUser, session, isUserLoaded]);

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

  // 1. CONTINUE WITH GOOGLE (Official Clerk OAuth integration)
  const loginWithGoogle = async () => {
    if (!isClerkConfigured || !signIn) {
      throw new Error('Clerk is not configured. Please add VITE_CLERK_PUBLISHABLE_KEY to your .env file.');
    }
    try {
      const returnUrl = (typeof window !== 'undefined' && window.location.pathname && window.location.pathname !== '/sso-callback')
        ? window.location.pathname
        : '/';
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: returnUrl
      });
    } catch (err) {
      console.error('[CLERK_GOOGLE] Google OAuth initiation failed:', err);
      throw err;
    }
  };

  // 2. MOBILE SMS OTP: SEND OTP
  const startMobileOtp = async (rawPhone) => {
    if (!isClerkConfigured || !signIn || !signUp) {
      throw new Error('Clerk is not configured. Please add VITE_CLERK_PUBLISHABLE_KEY to your .env file.');
    }

    const formattedPhone = formatIndianPhone(rawPhone);
    if (!formattedPhone || formattedPhone.length < 13) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    setPendingPhone(formattedPhone);

    // Attempt Sign In first
    try {
      const si = await signIn.create({ identifier: formattedPhone });
      const phoneCodeFactor = si.supportedFirstFactors?.find(
        (f) => f.strategy === 'phone_code'
      );

      if (phoneCodeFactor) {
        await si.prepareFirstFactor({
          strategy: 'phone_code',
          phoneNumberId: phoneCodeFactor.phoneNumberId
        });
        setOtpFlow('sign_in');
        setAuthModalMode('otp');
        return { success: true, mode: 'sign_in', phone: formattedPhone };
      } else {
        throw new Error('SMS verification factor not available for this number.');
      }
    } catch (err) {
      const firstError = err?.errors?.[0];
      // If user does not exist yet, seamlessly create new account via Sign Up
      if (firstError?.code === 'form_identifier_not_found') {
        try {
          const su = await signUp.create({ phoneNumber: formattedPhone });
          await su.preparePhoneNumberVerification({ strategy: 'phone_code' });
          setOtpFlow('sign_up');
          setAuthModalMode('otp');
          return { success: true, mode: 'sign_up', phone: formattedPhone };
        } catch (signUpErr) {
          console.error('[CLERK_MOBILE] Sign up prepare failed:', signUpErr);
          throw new Error(signUpErr?.errors?.[0]?.message || 'Failed to send SMS OTP. Please check the number.');
        }
      } else {
        console.error('[CLERK_MOBILE] Sign in prepare failed:', err);
        throw new Error(firstError?.message || 'Failed to send SMS OTP. Please try again.');
      }
    }
  };

  // 3. MOBILE SMS OTP: VERIFY OTP
  const verifyMobileOtp = async (code) => {
    if (!code || code.trim().length !== 6) {
      throw new Error('Please enter the 6-digit OTP sent to your phone.');
    }

    const cleanCode = code.trim();

    try {
      if (otpFlow === 'sign_in') {
        if (!signIn) throw new Error('Sign-in session not active.');
        const result = await signIn.attemptFirstFactor({
          strategy: 'phone_code',
          code: cleanCode
        });

        if (result.status === 'complete') {
          if (setSignInActive) {
            await setSignInActive({ session: result.createdSessionId });
          }
          closeAuthModal();
          return { success: true };
        } else {
          throw new Error('Verification incomplete. Please check OTP.');
        }
      } else {
        if (!signUp) throw new Error('Sign-up session not active.');
        const result = await signUp.attemptPhoneNumberVerification({
          code: cleanCode
        });

        if (result.status === 'complete') {
          if (setSignUpActive) {
            await setSignUpActive({ session: result.createdSessionId });
          }
          closeAuthModal();
          return { success: true };
        } else {
          throw new Error('Verification incomplete. Please check OTP.');
        }
      }
    } catch (err) {
      console.error('[CLERK_MOBILE] Verification failed:', err);
      const msg = err?.errors?.[0]?.message || err.message || 'Incorrect or expired OTP. Please try again.';
      throw new Error(msg);
    }
  };

  // 4. RESEND SMS OTP
  const resendMobileOtp = async () => {
    if (!pendingPhone) throw new Error('No pending mobile number to resend OTP to.');
    try {
      if (otpFlow === 'sign_in') {
        const factor = signIn.supportedFirstFactors?.find((f) => f.strategy === 'phone_code');
        if (factor) {
          await signIn.prepareFirstFactor({
            strategy: 'phone_code',
            phoneNumberId: factor.phoneNumberId
          });
        }
      } else {
        await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' });
      }
      return { success: true };
    } catch (err) {
      const msg = err?.errors?.[0]?.message || err.message || 'Failed to resend OTP. Please wait before retrying.';
      throw new Error(msg);
    }
  };

  // 5. OFFICIAL CLERK SIGNOUT
  const logout = async () => {
    try {
      if (clerk && typeof clerk.signOut === 'function') {
        await clerk.signOut();
      }
    } catch (err) {
      console.warn('Clerk signOut notice:', err);
    } finally {
      setUser(null);
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
    const res = await updateUserProfileApi(profileData);
    if (res?.user) {
      setUser(res.user);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    }
    return res;
  };

  // Saved Plans Management
  const addToMyPlans = async (schemeId) => {
    if (!schemeId) return false;
    if (!isSignedIn && !user) {
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
    if (isSignedIn || user) return true;
    return guestUsageCount < MAX_FREE_GUEST_USES;
  };

  const recordFindMySchemesUsage = () => {
    if (isSignedIn || user) return;
    const nextCount = guestUsageCount + 1;
    setGuestUsageCount(nextCount);
    localStorage.setItem(GUEST_USAGE_KEY, nextCount.toString());
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: (isClerkConfigured ? isSignedIn : false) || (!!user && !!token),
        isLoadingUser: isClerkConfigured ? (!isUserLoaded || isLoadingUser) : false,
        savedPlanIds,
        isAuthModalOpen,
        authModalMode,
        pendingPhone,
        guestUsageCount,
        maxFreeGuestUses: MAX_FREE_GUEST_USES,
        isClerkConfigured,
        openAuthModal,
        closeAuthModal,
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
