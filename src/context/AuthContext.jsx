import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
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

  // Complete Profile Modal State (prompt after Google connect or on-demand)
  const [isCompleteProfileModalOpen, setIsCompleteProfileModalOpen] = useState(false);

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

          let existingLocalUser = null;
          try {
            const raw = localStorage.getItem(USER_KEY);
            if (raw) existingLocalUser = JSON.parse(raw);
          } catch (e) {}

          let finalUserObj = null;

          try {
            // Check if profile exists in backend
            let backendUser = await getCurrentUser(idToken);
            if (backendUser && !backendUser.unauthorized) {
              finalUserObj = {
                ...existingLocalUser,
                ...backendUser,
                full_name: (backendUser.full_name && backendUser.full_name !== 'Citizen' && backendUser.full_name !== 'Not Specified')
                  ? backendUser.full_name
                  : (existingLocalUser?.full_name || fullName || 'Citizen'),
                email: backendUser.email || existingLocalUser?.email || primaryEmail || '',
                phone: backendUser.phone || backendUser.mobile || existingLocalUser?.phone || existingLocalUser?.mobile || primaryPhone || '',
                mobile: backendUser.mobile || backendUser.phone || existingLocalUser?.mobile || existingLocalUser?.phone || primaryPhone || '',
                age: backendUser.age ?? existingLocalUser?.age ?? null,
                gender: backendUser.gender || existingLocalUser?.gender || '',
                profession: backendUser.profession || existingLocalUser?.profession || '',
                state: backendUser.state || existingLocalUser?.state || '',
                income: backendUser.income || existingLocalUser?.income || '',
                avatar_id: backendUser.avatar_id || existingLocalUser?.avatar_id || 'male_1',
                profile_photo: (backendUser.profile_photo !== undefined)
                  ? backendUser.profile_photo
                  : (existingLocalUser?.profile_photo !== undefined ? existingLocalUser.profile_photo : imageUrl),
                is_profile_completed: Boolean(
                  backendUser.is_profile_completed ||
                  existingLocalUser?.is_profile_completed ||
                  (backendUser.age && backendUser.gender) ||
                  (existingLocalUser?.age && existingLocalUser?.gender)
                ),
                saved_plans: backendUser.saved_plans || existingLocalUser?.saved_plans || []
              };
            } else {
              // Sync user into MongoDB via FastAPI
              const syncRes = await syncFirebaseUserApi({
                email: primaryEmail,
                phone: existingLocalUser?.phone || primaryPhone,
                full_name: existingLocalUser?.full_name || fullName,
                profile_photo: existingLocalUser?.profile_photo !== undefined ? existingLocalUser.profile_photo : imageUrl
              }, idToken);

              if (syncRes?.user) {
                finalUserObj = {
                  ...existingLocalUser,
                  ...syncRes.user,
                  full_name: (syncRes.user.full_name && syncRes.user.full_name !== 'Citizen' && syncRes.user.full_name !== 'Not Specified')
                    ? syncRes.user.full_name
                    : (existingLocalUser?.full_name || fullName || 'Citizen'),
                  email: syncRes.user.email || existingLocalUser?.email || primaryEmail || '',
                  phone: syncRes.user.phone || syncRes.user.mobile || existingLocalUser?.phone || primaryPhone || '',
                  mobile: syncRes.user.mobile || syncRes.user.phone || existingLocalUser?.mobile || primaryPhone || '',
                  age: syncRes.user.age ?? existingLocalUser?.age ?? null,
                  gender: syncRes.user.gender || existingLocalUser?.gender || '',
                  profession: syncRes.user.profession || existingLocalUser?.profession || '',
                  state: syncRes.user.state || existingLocalUser?.state || '',
                  income: syncRes.user.income || existingLocalUser?.income || '',
                  avatar_id: syncRes.user.avatar_id || existingLocalUser?.avatar_id || 'male_1',
                  profile_photo: (syncRes.user.profile_photo !== undefined)
                    ? syncRes.user.profile_photo
                    : (existingLocalUser?.profile_photo !== undefined ? existingLocalUser.profile_photo : imageUrl),
                  is_profile_completed: Boolean(
                    syncRes.user.is_profile_completed ||
                    existingLocalUser?.is_profile_completed ||
                    (existingLocalUser?.age && existingLocalUser?.gender)
                  ),
                  saved_plans: syncRes.user.saved_plans || existingLocalUser?.saved_plans || []
                };
              }
            }
          } catch (backendErr) {
            console.warn('[AUTH_CONTEXT] Backend profile sync offline, using local Firebase session:', backendErr);
          }

          if (!finalUserObj) {
            finalUserObj = {
              ...existingLocalUser,
              firebase_uid: fbUser.uid,
              user_id: fbUser.uid,
              full_name: (existingLocalUser?.full_name && existingLocalUser.full_name !== 'Citizen' && existingLocalUser.full_name !== 'Not Specified')
                ? existingLocalUser.full_name
                : (fullName || 'Citizen'),
              email: existingLocalUser?.email || primaryEmail || '',
              phone: existingLocalUser?.phone || existingLocalUser?.mobile || primaryPhone || '',
              mobile: existingLocalUser?.mobile || existingLocalUser?.phone || primaryPhone || '',
              age: existingLocalUser?.age ?? null,
              gender: existingLocalUser?.gender || '',
              profession: existingLocalUser?.profession || '',
              state: existingLocalUser?.state || '',
              income: existingLocalUser?.income || '',
              profile_photo: existingLocalUser?.profile_photo !== undefined ? existingLocalUser.profile_photo : imageUrl,
              avatar_id: existingLocalUser?.avatar_id || 'male_1',
              is_profile_completed: Boolean(existingLocalUser?.is_profile_completed || (existingLocalUser?.age && existingLocalUser?.gender)),
              saved_plans: existingLocalUser?.saved_plans || user?.saved_plans || []
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

  const openAuthModal = useCallback(() => {
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

  // 2. OFFICIAL SIGNOUT
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
    // 1. Optimistically update local user state immediately
    setUser((prev) => {
      const updated = {
        ...prev,
        profile_photo: photoData
      };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });

    // 2. Persist to backend
    try {
      const res = await uploadProfilePhotoApi(null, photoData);
      if (res?.user) {
        setUser((prev) => {
          const finalUser = { ...prev, ...res.user, profile_photo: photoData };
          localStorage.setItem(USER_KEY, JSON.stringify(finalUser));
          return finalUser;
        });
      }
      return res;
    } catch (err) {
      console.warn('Backend uploadProfilePhoto notice (saved locally):', err);
      return { status: 'success', user: { profile_photo: photoData } };
    }
  };

  const changeAvatar = async (avatarId) => {
    // 1. Optimistically update local state immediately and clear profile_photo so avatar preset renders
    setUser((prev) => {
      const updated = {
        ...prev,
        avatar_id: avatarId,
        profile_photo: null
      };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });

    // 2. Persist to backend
    try {
      const res = await updateAvatarApi(null, avatarId);
      if (res?.user) {
        setUser((prev) => {
          const finalUser = { ...prev, ...res.user, avatar_id: avatarId, profile_photo: null };
          localStorage.setItem(USER_KEY, JSON.stringify(finalUser));
          return finalUser;
        });
      }
      return res;
    } catch (err) {
      console.warn('Backend updateAvatar notice (saved locally):', err);
      return { status: 'success', user: { avatar_id: avatarId, profile_photo: null } };
    }
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
          const finalUser = {
            ...prev,
            ...res.user,
            ...profileData,
            is_profile_completed: true
          };
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
      openAuthModal();
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
