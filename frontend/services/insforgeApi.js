import { createClient } from '@insforge/sdk';
import * as realApi from './realApi.js';

const DEFAULT_LOCATION = 'San Francisco, CA';
const DEFAULT_BASE_URL = 'https://pzv974n7.us-east.insforge.app';
const REPAIR_PHOTO_BUCKET = 'repair-photos';
const MAX_REPAIR_PHOTO_BYTES = 4 * 1024 * 1024;
const REPAIR_PHOTO_MAX_DIMENSION = 1600;
const REPAIR_PHOTO_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52];

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
    useMock: false, // Force no mocks
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

function rowTimestamp(row) {
  return row?.created_at ?? row?.updated_at ?? row?.at ?? new Date().toISOString();
}

function contractorIndex(contractors) {
  return new Map(
    contractors
      .filter(contractor => contractor?.id)
      .map(contractor => [contractor.id, contractor]),
  );
}

function ensureConversation(conversations, key, fallback = {}) {
  if (!conversations.has(key)) {
    conversations.set(key, {
      phone: fallback.phone ?? key,
      name: fallback.name ?? null,
      requestId: fallback.requestId ?? null,
      messages: [],
    });
  }

  const conversation = conversations.get(key);
  if (!conversation.name && fallback.name) conversation.name = fallback.name;
  if (!conversation.requestId && fallback.requestId) conversation.requestId = fallback.requestId;
  return conversation;
}

function conversationKey({ phone, contractorId, name, fallback }) {
  return phone ?? contractorId ?? name ?? fallback;
}

function pushConversationMessage(conversation, message) {
  conversation.messages.push({
    id: message.id,
    direction: message.direction,
    channel: message.channel,
    kind: message.kind,
    body: message.body,
    at: message.at,
  });
}

function requestTimelineConversation(session, conversations) {
  const timeline = Array.isArray(session?.messages) ? session.messages : [];
  if (!timeline.length) return;

  const conversation = ensureConversation(conversations, `request-${session.requestId}`, {
    phone: `request-${session.requestId}`,
    name: 'RobotRabbit Agent',
    requestId: session.requestId,
  });

  for (const message of timeline) {
    pushConversationMessage(conversation, {
      id: message.id ?? `message-${conversation.messages.length}`,
      direction: message.role === 'user' ? 'inbound' : 'outbound',
      channel: 'insforge',
      kind: message.message_type ?? message.role ?? 'message',
      body: message.content ?? '',
      at: rowTimestamp(message),
    });
  }
}

export function buildConversationsFromStatus(status, activeContractors = []) {
  const session = status?.session;
  if (!session?.requestId) return [];

  const conversations = new Map();
  const contractorsById = contractorIndex(activeContractors);

  for (const notification of Array.isArray(session.notifications) ? session.notifications : []) {
    const contractor = contractorsById.get(notification.contractor_id);
    const key = conversationKey({
      phone: contractor?.phone ?? notification.destination,
      contractorId: notification.contractor_id,
      name: contractor?.name,
      fallback: `notification-${notification.id}`,
    });
    const conversation = ensureConversation(conversations, key, {
      phone: contractor?.phone ?? notification.destination ?? key,
      name: contractor?.name ?? notification.destination ?? 'Service Provider',
      requestId: session.requestId,
    });

    pushConversationMessage(conversation, {
      id: notification.id,
      direction: 'outbound',
      channel: notification.channel ?? 'insforge',
      kind: notification.status ?? 'outreach',
      body: notification.message ?? '',
      at: rowTimestamp(notification),
    });
  }

  for (const quote of Array.isArray(session.quotes) ? session.quotes : []) {
    const contractor = contractorsById.get(quote.contractor_id);
    const key = conversationKey({
      phone: quote.contractor_phone ?? contractor?.phone,
      contractorId: quote.contractor_id,
      name: quote.contractor_name ?? contractor?.name,
      fallback: `quote-${quote.id}`,
    });
    const conversation = ensureConversation(conversations, key, {
      phone: quote.contractor_phone ?? contractor?.phone ?? key,
      name: quote.contractor_name ?? contractor?.name ?? 'Service Provider',
      requestId: session.requestId,
    });

    pushConversationMessage(conversation, {
      id: quote.id,
      direction: 'inbound',
      channel: 'insforge',
      kind: 'quote',
      body: quote.raw_message ?? `${quote.available === false ? 'Unavailable' : 'Available'}${quote.price ? `, $${quote.price}` : ''}`,
      at: rowTimestamp(quote),
    });
  }

  if (conversations.size === 0) {
    requestTimelineConversation(session, conversations);
  }

  return [...conversations.values()]
    .map((conversation) => {
      conversation.messages.sort((a, b) => new Date(a.at) - new Date(b.at));
      const last = conversation.messages.at(-1);
      return {
        ...conversation,
        messageCount: conversation.messages.length,
        lastMessageAt: last?.at ?? null,
        lastMessage: last?.body ?? null,
      };
    })
    .sort((a, b) => new Date(b.lastMessageAt ?? 0) - new Date(a.lastMessageAt ?? 0));
}

function assertSdkResult(result, fallbackMessage) {
  if (result?.error) throw result.error;
  if (!result?.data) throw new Error(fallbackMessage);
  return result.data;
}

function fileNameWithExtension(file, extension) {
  const name = file?.name || 'photo';
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base || 'photo'}.${extension}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function shouldOptimizePhoto(file) {
  return Boolean(file?.type?.startsWith('image/'))
    && (file.size > MAX_REPAIR_PHOTO_BYTES || file.type === 'image/png');
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function decodePhoto(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis.createImageBitmap(file);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close?.(),
    };
  }

  if (typeof globalThis.Image !== 'function' || !globalThis.URL?.createObjectURL) {
    return null;
  }

  const url = globalThis.URL.createObjectURL(file);
  const image = new globalThis.Image();
  image.decoding = 'async';

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Could not decode selected photo.'));
    image.src = url;
  });

  return {
    image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => globalThis.URL.revokeObjectURL(url),
  };
}

export async function prepareRepairPhotoForUpload(file) {
  if (!shouldOptimizePhoto(file) || !globalThis.document?.createElement) {
    return file;
  }

  let decoded = null;
  try {
    decoded = await decodePhoto(file);
    if (!decoded?.width || !decoded?.height) return file;

    const scale = Math.min(1, REPAIR_PHOTO_MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);

    for (const quality of REPAIR_PHOTO_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (!blob) continue;
      if (blob.size <= MAX_REPAIR_PHOTO_BYTES || quality === REPAIR_PHOTO_QUALITY_STEPS.at(-1)) {
        return new File([blob], fileNameWithExtension(file, 'jpg'), {
          type: 'image/jpeg',
          lastModified: file.lastModified ?? Date.now(),
        });
      }
    }
  } catch {
    return file;
  } finally {
    decoded?.cleanup?.();
  }

  return file;
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

function normalizeDirectUploadError(error, file) {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = error?.statusCode;
  const normalized = statusCode === 413 || /413|content too large|payload too large/i.test(message)
    ? new Error(`Photo upload is still too large (${formatBytes(file.size)}). Try a smaller photo or crop it before uploading.`)
    : new Error(message || 'Photo upload failed.');

  normalized.code = statusCode === 413 ? 'STORAGE_UPLOAD_TOO_LARGE' : 'STORAGE_UPLOAD_FAILED';
  normalized.cause = error;
  return normalized;
}

async function uploadRepairPhoto(insforge, config, key, file) {
  if (!insforge.getHttpClient?.()?.request) {
    return insforge.storage
      .from(REPAIR_PHOTO_BUCKET)
      .upload(key, file);
  }

  try {
    const data = await uploadDirectlyThroughInsForge(insforge, config, key, file);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: normalizeDirectUploadError(error, file) };
  }
}

export function createRepairApi(options = {}) {
  const config = {
    ...getRuntimeConfig(),
    ...(options.config ?? {}),
  };
  const cryptoImpl = options.cryptoImpl ?? globalThis.crypto;
  const fallbackApi = options.fallbackApi ?? realApi; // Always realApi, no mock
  const preparePhotoForUpload = options.preparePhotoForUpload ?? prepareRepairPhotoForUpload;
  const injectedClient = Boolean(options.insforge);
  const insforge = options.insforge
    ?? (config.anonKey ? createClient({ baseUrl: config.baseUrl, anonKey: config.anonKey }) : null);

  let activeRequestId = null;
  let activeContractorIds = [];
  let activeContractors = [];

  function isBackendConfigured() {
    if (!insforge) {
      console.error('InsForge is not configured! Please provide VITE_INSFORGE_ANON_KEY.');
      return false;
    }
    return true;
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
    if (!isBackendConfigured()) throw new Error('InsForge is not configured. Missing VITE_INSFORGE_ANON_KEY.');
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

  async function verifyEmail({ email, otp }) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.verifyEmail({ email, otp });
    if (error) throw error;
    return data;
  }

  async function resendVerificationEmail({ email, redirectTo }) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.resendVerificationEmail({ email, redirectTo });
    if (error) throw error;
    return data;
  }

  async function sendResetPasswordEmail({ email, redirectTo }) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.sendResetPasswordEmail({ email, redirectTo });
    if (error) throw error;
    return data;
  }

  async function exchangeResetPasswordToken({ email, code }) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.exchangeResetPasswordToken({ email, code });
    if (error) throw error;
    return data;
  }

  async function resetPassword({ newPassword, otp }) {
    if (!isBackendConfigured()) throw new Error('InsForge is not configured for this frontend.');
    const { data, error } = await insforge.auth.resetPassword({ newPassword, otp });
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
    const uploadFile = await preparePhotoForUpload(file);
    const imageKey = `users/${user.id}/requests/${requestId}/photo.${extensionFrom(uploadFile)}`;
    const upload = await uploadRepairPhoto(insforge, config, imageKey, uploadFile);

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
    activeContractors = [];

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

  async function getConversations() {
    if (!isBackendConfigured()) {
      return config.useMock ? fallbackApi.getConversations() : [];
    }

    if (!activeRequestId) return [];

    try {
      return buildConversationsFromStatus(
        await getRepairStatus(activeRequestId),
        activeContractors,
      );
    } catch (error) {
      console.warn('getConversations failed:', error?.message ?? error);
      return [];
    }
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

    const results = Array.isArray(data.results)
      ? data.results.map(normalizeContractor)
      : [];
    activeContractors = results;
    return results;
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
    verifyEmail,
    resendVerificationEmail,
    signInWithGoogle,
    signOut,
    sendResetPasswordEmail,
    exchangeResetPasswordToken,
    resetPassword,
    analyzeImage,
    analyzeVoice,
    searchContractors,
    negotiateAndBook,
    getRepairStatus,
    getConversations,
  };
}

const defaultApi = createRepairApi();

export const isBackendConfigured = defaultApi.isBackendConfigured;
export const getCurrentUser = defaultApi.getCurrentUser;
export const signIn = defaultApi.signIn;
export const signUp = defaultApi.signUp;
export const verifyEmail = defaultApi.verifyEmail;
export const resendVerificationEmail = defaultApi.resendVerificationEmail;
export const signInWithGoogle = defaultApi.signInWithGoogle;
export const signOut = defaultApi.signOut;
export const sendResetPasswordEmail = defaultApi.sendResetPasswordEmail;
export const exchangeResetPasswordToken = defaultApi.exchangeResetPasswordToken;
export const resetPassword = defaultApi.resetPassword;
export const analyzeImage = defaultApi.analyzeImage;
export const analyzeVoice = defaultApi.analyzeVoice;
export const searchContractors = defaultApi.searchContractors;
export const negotiateAndBook = defaultApi.negotiateAndBook;
export const getRepairStatus = defaultApi.getRepairStatus;
export const getConversations = defaultApi.getConversations;
