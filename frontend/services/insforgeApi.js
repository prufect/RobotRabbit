import { createClient } from '@insforge/sdk';
import * as mockApi from './mockApi.js';

const DEFAULT_LOCATION = 'San Francisco, CA';
const DEFAULT_BASE_URL = 'https://pzv974n7.us-east.insforge.app';
const REPAIR_PHOTO_BUCKET = 'repair-photos';

export class AuthRequiredError extends Error {
  constructor(message = 'Sign in to connect this repair request to your InsForge backend.') {
    super(message);
    this.name = 'AuthRequiredError';
    this.code = 'AUTH_REQUIRED';
  }
}

export function isAuthRequiredError(error) {
  return error?.code === 'AUTH_REQUIRED' || error instanceof AuthRequiredError;
}

export function getRuntimeConfig() {
  const env = import.meta.env ?? {};
  const runtime = globalThis.window?.AGENTRABBIT_CONFIG ?? globalThis.AGENTRABBIT_CONFIG ?? {};

  return {
    baseUrl: env.VITE_INSFORGE_URL
      ?? env.VITE_INSFORGE_BASE_URL
      ?? runtime.VITE_INSFORGE_URL
      ?? runtime.INSFORGE_BASE_URL
      ?? runtime.baseUrl
      ?? DEFAULT_BASE_URL,
    anonKey: env.VITE_INSFORGE_ANON_KEY
      ?? runtime.VITE_INSFORGE_ANON_KEY
      ?? runtime.INSFORGE_ANON_KEY
      ?? runtime.anonKey
      ?? '',
    locationText: env.VITE_AGENTRABBIT_LOCATION
      ?? runtime.VITE_AGENTRABBIT_LOCATION
      ?? runtime.locationText
      ?? DEFAULT_LOCATION,
    useMock: env.VITE_AGENTRABBIT_USE_MOCKS === 'true' || runtime.useMock === true,
  };
}

function extensionFrom(file) {
  const fromName = file?.name?.split('.').pop();
  if (fromName && fromName !== file.name) return fromName.toLowerCase();
  if (file?.type === 'image/png') return 'png';
  if (file?.type === 'image/webp') return 'webp';
  return 'jpg';
}

function asNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeContractor(contractor, index = 0) {
  const metadata = contractor?.metadata && typeof contractor.metadata === 'object'
    ? contractor.metadata
    : {};
  const rating = asNumber(contractor.rating ?? metadata.rating, 4.8 - (index * 0.1));
  const originalPrice = asNumber(
    contractor.originalPrice ?? metadata.originalPrice ?? metadata.estimated_price,
    185 - (index * 15),
  );
  const negotiatedPrice = asNumber(
    contractor.negotiatedPrice ?? metadata.negotiatedPrice,
    Math.max(95, originalPrice - 25 - (index * 7)),
  );

  return {
    ...contractor,
    id: contractor.id ?? contractor.source_ref ?? `contractor-${index + 1}`,
    name: contractor.name ?? `Repair Pro ${index + 1}`,
    phone: contractor.phone ?? null,
    rating: Math.max(0, Math.min(5, rating)),
    reviewCount: asNumber(contractor.reviewCount ?? metadata.reviewCount, 140 - (index * 24)),
    distance: asNumber(contractor.distance ?? metadata.distance, 2.1 + (index * 1.4)),
    verified: contractor.verified ?? {
      licensed: true,
      insured: index < 2,
      bbComplaint: false,
    },
    specialties: Array.isArray(contractor.specialties)
      ? contractor.specialties
      : [`${contractor.category ?? 'home'} repair`, contractor.source === 'serpapi' ? 'Local search' : 'Demo-ready'],
    yearsExperience: asNumber(contractor.yearsExperience ?? metadata.yearsExperience, 12 - index),
    originalPrice,
    negotiatedPrice,
    availability: contractor.availability ?? metadata.availability ?? ['Today, 4:00 PM', 'Today, 6:30 PM', 'Tomorrow, 9:00 AM'][index] ?? 'Tomorrow, 11:00 AM',
  };
}

function chooseBestOffer(contractors) {
  return contractors
    .map((contractor, index) => normalizeContractor(contractor, index))
    .sort((a, b) => {
      const scoreA = (a.rating * 10) - (a.negotiatedPrice * 0.08) - a.distance;
      const scoreB = (b.rating * 10) - (b.negotiatedPrice * 0.08) - b.distance;
      return scoreB - scoreA;
    })[0];
}

function assertSdkResult(result, fallbackMessage) {
  if (result?.error) throw result.error;
  if (!result?.data) throw new Error(fallbackMessage);
  return result.data;
}

function isPresignedStorageUploadError(error) {
  return error?.statusCode === 400
    && error?.error === 'STORAGE_ERROR'
    && /upload to storage failed|presigned/i.test(error.message ?? '');
}

function storageObjectUrl(baseUrl, bucketName, key) {
  return `${baseUrl.replace(/\/$/, '')}/api/storage/buckets/${bucketName}/objects/${encodeURIComponent(key)}`;
}

function normalizeStorageData(data, { baseUrl, bucketName, key, file }) {
  const normalizedKey = data?.key ?? key;
  const normalizedUrl = data?.url
    ? new URL(data.url, baseUrl).toString()
    : storageObjectUrl(baseUrl, bucketName, normalizedKey);

  return {
    bucket: data?.bucket ?? bucketName,
    key: normalizedKey,
    size: data?.size ?? file.size,
    mimeType: data?.mimeType ?? file.type ?? 'application/octet-stream',
    uploadedAt: data?.uploadedAt ?? new Date().toISOString(),
    url: normalizedUrl,
  };
}

async function uploadDirectlyThroughInsForge(insforge, config, key, file) {
  const http = insforge.getHttpClient?.();
  if (!http?.request) {
    throw new Error('InsForge direct upload fallback is unavailable in this SDK client.');
  }

  const formData = new FormData();
  formData.append('file', file, file?.name ?? key.split('/').pop() ?? 'photo');

  const data = await http.request(
    'PUT',
    `/api/storage/buckets/${REPAIR_PHOTO_BUCKET}/objects/${encodeURIComponent(key)}`,
    {
      body: formData,
      headers: {},
    },
  );

  return normalizeStorageData(data, {
    baseUrl: config.baseUrl,
    bucketName: REPAIR_PHOTO_BUCKET,
    key,
    file,
  });
}

async function uploadRepairPhoto(insforge, config, key, file) {
  const upload = await insforge.storage
    .from(REPAIR_PHOTO_BUCKET)
    .upload(key, file);

  if (!upload?.error) return upload;
  if (!isPresignedStorageUploadError(upload.error)) return upload;

  try {
    const data = await uploadDirectlyThroughInsForge(insforge, config, key, file);
    return { data, error: null };
  } catch (fallbackError) {
    const primaryMessage = upload.error.message || 'Presigned upload failed';
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    const error = new Error(`${primaryMessage}. Direct upload fallback also failed: ${fallbackMessage}`);
    error.code = 'STORAGE_UPLOAD_FAILED';
    error.cause = fallbackError;
    return { data: null, error };
  }
}

export function createRepairApi(options = {}) {
  const config = {
    ...getRuntimeConfig(),
    ...(options.config ?? {}),
  };
  const cryptoImpl = options.cryptoImpl ?? globalThis.crypto;
  const fallbackApi = options.fallbackApi ?? mockApi;
  const injectedClient = Boolean(options.insforge);
  const insforge = options.insforge
    ?? (config.anonKey && !config.useMock ? createClient({ baseUrl: config.baseUrl, anonKey: config.anonKey }) : null);

  let activeRequestId = null;
  let activeContractorIds = [];

  function isBackendConfigured() {
    return Boolean(insforge) && !config.useMock && (injectedClient || Boolean(config.baseUrl && config.anonKey));
  }

  async function getCurrentUser() {
    if (!isBackendConfigured()) {
      return { user: null, backendConfigured: false };
    }

    const { data, error } = await insforge.auth.getCurrentUser();
    if (error) throw error;
    return {
      user: data?.user ?? null,
      backendConfigured: true,
    };
  }

  async function requireCurrentUser() {
    const { user } = await getCurrentUser();
    if (!user?.id) throw new AuthRequiredError();
    return user;
  }

  async function signIn({ email, password }) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp({ email, password, name, redirectTo }) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.signUp({
      email,
      password,
      name,
      redirectTo,
    });
    if (error) throw error;
    return data;
  }

  async function signInWithGoogle({ redirectTo = globalThis.location?.origin ?? config.baseUrl } = {}) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.signInWithOAuth('google', {
      redirectTo,
      additionalParams: { prompt: 'select_account' },
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!isBackendConfigured()) return;
    const { error } = await insforge.auth.signOut();
    if (error) throw error;
  }

  async function analyzeImage(previewUrl, urgency = 'medium', file = null) {
    if (!isBackendConfigured() || !file) {
      return fallbackApi.analyzeImage(previewUrl, urgency);
    }

    const user = await requireCurrentUser();
    const requestId = cryptoImpl.randomUUID();
    const imageKey = `users/${user.id}/requests/${requestId}/photo.${extensionFrom(file)}`;
    const upload = await uploadRepairPhoto(insforge, config, imageKey, file);

    assertSdkResult(upload, 'Photo upload did not return storage metadata.');

    const { data: requests, error: insertError } = await insforge.database.from('repair_requests')
      .insert([{
        id: requestId,
        user_id: user.id,
        status: 'uploaded',
        urgency,
        location_text: config.locationText,
        image_url: upload.data.url,
        image_key: upload.data.key,
      }])
      .select();

    if (insertError) throw insertError;

    activeRequestId = requestId;
    activeContractorIds = [];

    const analysis = await insforge.functions.invoke('analyze', {
      body: { requestId },
    });

    return {
      ...assertSdkResult(analysis, 'Analyze function did not return a response.'),
      requestId,
      request: Array.isArray(requests) ? requests[0] : null,
      imageUrl: upload.data.url,
      imageKey: upload.data.key,
    };
  }

  async function analyzeVoice(transcript) {
    return fallbackApi.analyzeVoice(transcript);
  }

  async function searchContractors(query, location = config.locationText) {
    if (!isBackendConfigured() || !activeRequestId) {
      return fallbackApi.searchContractors(query, location);
    }

    const response = await insforge.functions.invoke('search-contractors', {
      body: { requestId: activeRequestId },
    });
    const data = assertSdkResult(response, 'Contractor search did not return results.');
    activeContractorIds = Array.isArray(data.contractorIds) ? data.contractorIds : [];

    return Array.isArray(data.results)
      ? data.results.map(normalizeContractor)
      : [];
  }

  async function getRepairStatus(requestId = activeRequestId) {
    if (!isBackendConfigured() || !requestId) return null;

    const response = await insforge.functions.invoke('status', {
      body: { requestId },
    });
    return assertSdkResult(response, 'Status lookup did not return a response.');
  }

  async function* negotiateAndBook(contractors, userPreferences = {}) {
    if (!isBackendConfigured() || !activeRequestId) {
      yield* fallbackApi.negotiateAndBook(contractors, userPreferences);
      return;
    }

    const contractorIds = activeContractorIds.length > 0
      ? activeContractorIds
      : contractors.map(contractor => contractor.id).filter(Boolean);

    yield {
      step: 'contacting',
      count: contractorIds.length,
      message: `Contacting ${contractorIds.length} professionals through InsForge...`,
    };

    const notification = await insforge.functions.invoke('notify-contractors', {
      body: {
        requestId: activeRequestId,
        contractorIds,
      },
    });
    const notificationData = assertSdkResult(notification, 'Contractor notification did not return a response.');

    yield {
      step: 'responses',
      count: notificationData.notifiedCount ?? contractorIds.length,
      message: `${notificationData.notifiedCount ?? contractorIds.length} contractor messages queued.`,
    };

    yield {
      step: 'negotiating',
      count: contractors.length,
      message: 'Comparing availability and expected rates...',
    };

    const status = await getRepairStatus(activeRequestId).catch(() => null);
    const bestQuote = status?.session?.bestQuote;

    yield {
      step: 'comparing',
      contractors,
      message: bestQuote ? 'A contractor quote is ready.' : 'Preparing the best available demo offer.',
    };

    const bestContractor = bestQuote
      ? normalizeContractor({
        id: bestQuote.contractor_id,
        name: bestQuote.contractor_name,
        phone: bestQuote.contractor_phone,
        originalPrice: Number(bestQuote.price ?? 165) + 25,
        negotiatedPrice: Number(bestQuote.price ?? 165),
        availability: bestQuote.availability,
      })
      : chooseBestOffer(contractors);

    if (!bestContractor) return;

    yield {
      step: 'booked',
      booking: {
        contractor: bestContractor,
        negotiatedPrice: bestContractor.negotiatedPrice,
        date: bestContractor.availability?.split(',')[0] ?? 'Today',
        time: bestContractor.availability?.split(',')[1]?.trim() ?? '4:00 PM',
        agentNote: 'Stored in InsForge. Contractor outreach and status are tied to this repair request.',
      },
    };
  }

  return {
    insforge,
    isBackendConfigured,
    getCurrentUser,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    analyzeImage,
    analyzeVoice,
    searchContractors,
    negotiateAndBook,
    getRepairStatus,
  };
}

const defaultApi = createRepairApi();

export const isBackendConfigured = defaultApi.isBackendConfigured;
export const getCurrentUser = defaultApi.getCurrentUser;
export const signIn = defaultApi.signIn;
export const signUp = defaultApi.signUp;
export const signInWithGoogle = defaultApi.signInWithGoogle;
export const signOut = defaultApi.signOut;
export const analyzeImage = defaultApi.analyzeImage;
export const analyzeVoice = defaultApi.analyzeVoice;
export const searchContractors = defaultApi.searchContractors;
export const negotiateAndBook = defaultApi.negotiateAndBook;
export const getRepairStatus = defaultApi.getRepairStatus;
