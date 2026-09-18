export const isProductionDomain = () => {
  return typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1';
};

const getApiBaseUrl = () => {
  const isProd = isProductionDomain();
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    const trimmed = envUrl.trim().replace(/\/+$/, '');
    if (isProd && (trimmed.includes('localhost') || trimmed.includes('127.0.0.1'))) {
      return '';
    }
    return trimmed;
  }
  if (isProd) {
    return 'https://sanchay-backend-2uw5.onrender.com';
  }
  return 'http://127.0.0.1:8000';
};


export const API_BASE_URL = getApiBaseUrl();
import { calculateLocalRecommendations } from './clientEngine';
import { FALLBACK_FREE_BENEFITS, filterLocalFreeBenefits } from '../data/freeBenefitsFallback';

/**
 * Health check to verify backend connectivity
 */
export async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Fetch scheme catalog with filtering & search from master database
 */
export async function fetchSchemes(params = {}) {
  try {
    const query = new URLSearchParams();
    if (typeof params === 'string') {
      if (params !== 'all' && params !== 'ALL') query.append('category', params);
    } else {
      if (params.category && params.category !== 'all' && params.category !== 'ALL') query.append('category', params.category);
      if (params.search) query.append('search', params.search);
      if (params.goal && params.goal !== 'all') query.append('goal', params.goal);
      if (params.state && params.state !== 'all') query.append('state', params.state);
      if (params.verified !== undefined) query.append('verified', params.verified);
      if (params.page) query.append('page', params.page);
      if (params.limit) query.append('limit', params.limit);
    }

    const url = `${API_BASE_URL}/api/schemes?${query.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('Backend API unavailable:', err);
    return null;
  }
}

/**
 * Fetch dynamic categories with counts
 */
export async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/schemes/categories`);
    if (!res.ok) throw new Error('Could not fetch categories');
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Fetch catalog stats
 */
export async function fetchCatalogStats() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/schemes/stats`);
    if (!res.ok) throw new Error('Could not fetch stats');
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Fetch total verified scheme counts from database
 */
export async function fetchSchemeCount() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/schemes/count`);
    if (!res.ok) throw new Error('Could not fetch count');
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Fetch individual scheme by ID
 */
export async function fetchSchemeById(schemeId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/schemes/${encodeURIComponent(schemeId)}`);
    if (!res.ok) throw new Error('Scheme not found');
    return await res.json();
  } catch (err) {
    console.warn(`Could not fetch scheme ${schemeId} from backend.`);
    return null;
  }
}

/**
 * Check single scheme deterministic eligibility
 */
export async function checkEligibility(schemeId, profile, goal = null) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/eligibility/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheme_id: schemeId,
        profile: profile,
        goal: goal
      })
    });
    if (!res.ok) throw new Error('Eligibility check error');
    return await res.json();
  } catch (err) {
    console.warn('Eligibility check API error:', err);
    return null;
  }
}

/**
 * Post recommendation request to Deterministic Two-Stage Engine
 */
export async function postRecommendation(profile, goal, preferences, categoryFilter = 'all') {
  try {
    const res = await fetch(`${API_BASE_URL}/api/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: {
          persona: profile.persona || profile.life_stage || 'young_professional',
          life_stage: profile.persona || profile.lifeStage || 'young_professional',
          saving_for: profile.savingFor || profile.saving_for || 'self',
          age: profile.age !== undefined && profile.age !== null ? Number(profile.age) : null,
          gender: profile.gender || 'all',
          state: profile.state || null,
          residency: profile.residency || profile.residency_status || 'Resident Indian',
          residency_status: profile.residencyStatus || profile.residency_status || 'resident',
          occupation: profile.occupation || 'salaried',
          annual_income: profile.annual_income !== undefined ? Number(profile.annual_income) : (profile.income !== undefined ? Number(profile.income) : null),
          income: profile.income !== undefined ? Number(profile.income) : null,
          has_guardian: profile.has_guardian !== undefined ? profile.has_guardian : (profile.hasGuardian !== undefined ? profile.hasGuardian : null),
          child_age: profile.child_age !== undefined ? Number(profile.child_age) : null,
          has_disability: profile.has_disability || profile.hasDisability || false
        },
        goal: {
          goal: goal.goal || goal.id || 'wealth'
        },
        preferences: {
          monthly_budget: Number(preferences.monthlyBudget || preferences.monthly_budget) || 2000,
          horizon_years: Number(preferences.horizonYears || preferences.horizon_years) || 10,
          liquidity_preference: preferences.liquidityNeed || preferences.liquidity_preference || 'medium',
          tax_preference: preferences.taxPriority !== undefined ? preferences.taxPriority : true
        },
        category_filter: categoryFilter
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && ((data.recommendations && data.recommendations.length > 0) || data.recommendation_type === 'no_exact_match')) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Backend API unavailable, using deterministic local engine:', err);
  }

  // Graceful deterministic fallback
  return calculateLocalRecommendations(profile, goal, preferences, categoryFilter);
}

/**
 * Compare 2 to 4 schemes side-by-side
 */
export async function compareSchemes(schemeIds, profile = null) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheme_ids: schemeIds,
        profile: profile
      })
    });
    if (!res.ok) throw new Error('Compare API Error');
    return await res.json();
  } catch (err) {
    console.warn('Compare API offline.');
    return null;
  }
}

/**
 * Chat with Sakhi AI Assistant (Grounded in Verified MongoDB records)
 */
export async function sendSakhiChat({ message, language = 'en', context = null }) {
  // If running in production on a remote domain without a remote backend URL, immediately use the local verified engine
  if (!API_BASE_URL || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost')) {
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      throw new Error('Remote backend not configured in production. Switching to verified local engine.');
    }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/sakhi/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
      body: JSON.stringify({
        message: message,
        language: language,
        context: context
      })
    });
    if (!res.ok) {
      throw new Error(`Sakhi API Error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.warn('Sakhi backend unavailable, using local sovereign engine:', err);
    throw err;
  }
}

/**
 * Legacy query Sakhi endpoint
 */
export async function querySakhi(queryText, language = 'en') {
  try {
    const chatRes = await sendSakhiChat({ message: queryText, language: language });
    if (chatRes) return chatRes;
  } catch (e) {
    console.warn('Legacy querySakhi fallback triggered.');
  }
  return null;
}

// -------------------------------------------------------------
// Authentication Token Provider (Clerk Integration)
// -------------------------------------------------------------

let authTokenProvider = null;

export function setAuthTokenProvider(fn) {
  authTokenProvider = fn;
}

export async function getEffectiveToken(explicitToken = null) {
  if (explicitToken) return explicitToken;
  if (typeof authTokenProvider === 'function') {
    try {
      const t = await authTokenProvider();
      if (t) return t;
    } catch (e) {
      console.warn('Error resolving Clerk session token:', e);
    }
  }
  return null;
}

export async function registerUser(userData) {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Registration failed.');
  }
  return data;
}

export async function verifyUserEmail({ email, code }) {
  const res = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Email verification failed.');
  }
  return data;
}

export async function loginUser({ email, password }) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Login failed.');
  }
  return data;
}

export async function loginWithGoogleApi(googleData) {
  const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Google login failed.');
  }
  return data;
}

export async function syncClerkUserApi(userData = {}, explicitToken = null) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) return null;
  const res = await fetch(`${API_BASE_URL}/api/auth/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(userData)
  });
  if (!res.ok) return null;
  return await res.json();
}

export async function updateUserProfileApi(profileData, explicitToken = null) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) throw new Error('Authentication required.');
  const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(profileData)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to update profile.');
  }
  return data;
}

export async function getCurrentUser(explicitToken = null) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) return null;
  const isProd = isProductionDomain();
  if (isProd && (!API_BASE_URL || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost'))) {
    return null;
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;

    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller ? controller.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (res.status === 401) {
      return { unauthorized: true };
    }
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function uploadProfilePhotoApi(explicitToken, photoData) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) throw new Error('Authentication required.');
  const isProd = isProductionDomain();
  if (isProd && (!API_BASE_URL || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost'))) {
    throw new Error('Profile photo upload requires backend connection.');
  }

  const res = await fetch(`${API_BASE_URL}/api/auth/profile-photo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ profile_photo: photoData })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to update profile photo.');
  }
  return data;
}

export async function updateAvatarApi(explicitToken, avatarId) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) throw new Error('Authentication required.');
  const isProd = isProductionDomain();
  if (isProd && (!API_BASE_URL || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost'))) {
    return { user: { avatar_id: avatarId } };
  }

  const res = await fetch(`${API_BASE_URL}/api/auth/avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ avatar_id: avatarId })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to update avatar.');
  }
  return data;
}

export async function fetchSavedPlans(explicitToken = null) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) return [];
  const isProd = isProductionDomain();
  if (isProd && (!API_BASE_URL || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost'))) {
    return [];
  }

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;

    const res = await fetch(`${API_BASE_URL}/api/auth/plans`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller ? controller.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    return [];
  }
}

export async function addSavedPlan(schemeId, explicitToken = null) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) throw new Error('Authentication required.');
  const isProd = isProductionDomain();
  if (isProd && (!API_BASE_URL || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost'))) {
    return { status: 'success', saved_plans: [schemeId] };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/plans/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({ scheme_id: schemeId })
    });
    if (timer) clearTimeout(timer);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to save scheme.');
    }
    return data;
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

export async function removeSavedPlan(schemeId, explicitToken = null) {
  const token = await getEffectiveToken(explicitToken);
  if (!token) throw new Error('Authentication required.');
  const isProd = isProductionDomain();
  if (isProd && (!API_BASE_URL || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost'))) {
    return { status: 'success', saved_plans: [] };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/plans/remove`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({ scheme_id: schemeId })
    });
    if (timer) clearTimeout(timer);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Failed to remove scheme.');
    }
    return data;
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}


// ==========================================
// LIC MASTER API CLIENTS
// ==========================================

export async function fetchLicPlans(params = {}) {
  try {
    const query = new URLSearchParams();
    if (params.category && params.category !== 'all' && params.category !== 'ALL') {
      query.append('category', params.category);
    }
    if (params.search && params.search.trim()) {
      query.append('search', params.search.trim());
    }

    const url = `${API_BASE_URL}/api/v1/lic/plans?${query.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LIC API Error: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn('Backend LIC API unavailable:', err);
    return null;
  }
}

export async function fetchLicPlanById(planId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/lic/plans/${encodeURIComponent(planId)}`);
    if (!res.ok) throw new Error('LIC Plan not found');
    return await res.json();
  } catch (err) {
    console.warn(`Could not fetch LIC plan ${planId}:`, err);
    return null;
  }
}

export async function recommendLicPlans(profileData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/lic/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    if (!res.ok) throw new Error('LIC Recommendation API error');
    return await res.json();
  } catch (err) {
    console.warn('LIC Recommendation API error:', err);
    return null;
  }
}

export async function fetchLicInfo() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/lic/info`);
    if (!res.ok) throw new Error('Could not fetch LIC information');
    return await res.json();
  } catch (err) {
    return null;
  }
}

// -------------------------------------------------------------
// Free Benefits & Assistance API
// -------------------------------------------------------------

export async function getFreeBenefits(params = {}) {
  try {
    const query = new URLSearchParams();
    if (params.state && params.state !== 'all' && params.state !== 'ALL') {
      query.append('state', params.state);
    }
    if (params.level && params.level !== 'all' && params.level !== 'ALL') {
      query.append('level', params.level);
    }
    if (params.category && params.category !== 'all' && params.category !== 'ALL') {
      query.append('category', params.category);
    }
    if (params.benefit_type && params.benefit_type !== 'all' && params.benefit_type !== 'ALL') {
      query.append('benefit_type', params.benefit_type);
    }
    if (params.status && params.status !== 'all') {
      query.append('status', params.status);
    }
    if (params.q && params.q.trim()) {
      query.append('q', params.q.trim());
    }

    const res = await fetch(`${API_BASE_URL}/api/v1/free-benefits?${query.toString()}`);
    if (!res.ok) throw new Error(`Free Benefits API Error: ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : filterLocalFreeBenefits(params);
  } catch (err) {
    console.warn('Backend Free Benefits API unavailable, using verified local dataset:', err);
    return filterLocalFreeBenefits(params);
  }
}

export async function getFreeBenefitById(benefitId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/free-benefits/${encodeURIComponent(benefitId)}`);
    if (!res.ok) throw new Error(`Could not fetch Free Benefit ${benefitId}`);
    return await res.json();
  } catch (err) {
    console.warn(`Error fetching Free Benefit ${benefitId}, using verified fallback:`, err);
    return FALLBACK_FREE_BENEFITS.find(b => b.benefit_id === benefitId) || null;
  }
}

export async function getLatestFreeBenefits(limit = 4) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/free-benefits/latest?limit=${limit}`);
    if (!res.ok) throw new Error('Could not fetch latest free benefits');
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : FALLBACK_FREE_BENEFITS.slice(0, limit);
  } catch (err) {
    console.warn('Error fetching latest free benefits, using verified fallback:', err);
    return FALLBACK_FREE_BENEFITS.slice(0, limit);
  }
}

export async function evaluateFreeBenefitEligibility(payload) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/free-benefits/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Free Benefits evaluation API error');
    return await res.json();
  } catch (err) {
    console.warn('Free Benefits evaluation error:', err);
    return null;
  }
}
