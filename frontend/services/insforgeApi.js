import { createClient } from '@insforge/sdk';
import * as realApi from './realApi.js';

const DEFAULT_LOCATION = 'San Francisco, CA';
const DEFAULT_BASE_URL = 'https://pzv974n7.us-east.insforge.app';
const REPAIR_PHOTO_BUCKET = 'repair-photos';
const MAX_REPAIR_PHOTO_BYTES = 4 * 1024 * 1024;
const REPAIR_PHOTO_MAX_DIMENSION = 1600;
const REPAIR_PHOTO_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52];
const DEFAULT_REPLY_POLL_ATTEMPTS = 8;
const DEFAULT_REPLY_POLL_INTERVAL_MS = 3000;

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function contractorNotificationPayload(contractor) {
  return {
    id: contractor.id ?? null,
    name: contractor.name ?? 'Selected Contractor',
    phone: contractor.phone ?? null,
    email: contractor.email ?? null,
    website: contractor.website ?? null,
    category: contractor.category ?? null,
    source_ref: contractor.source_ref ?? null,
    metadata: contractor.metadata ?? {},
  };
}

function quoteMatchesContractor(quote, contractor) {
  return Boolean(quote) && (
    quote.contractor_id === contractor.id
    || (contractor.phone && quote.contractor_phone === contractor.phone)
    || (contractor.name && quote.contractor_name === contractor.name)
  );
}

function findSelectedQuote(status, contractor) {
  const session = status?.session;
  const quotes = Array.isArray(session?.quotes) ? session.quotes : [];
  return quotes.find(quote => quoteMatchesContractor(quote, contractor))
    ?? (quoteMatchesContractor(session?.bestQuote, contractor) ? session.bestQuote : null);
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function quoteReplyText(quote) {
  return cleanText(quote?.raw_message ?? quote?.reply_body ?? quote?.message ?? '');
}

function quoteSessionFrom(status) {
  return status?.session ?? status ?? {};
}

function sameQuote(left, right) {
  return Boolean(left && right) && (
    (left.id && right.id && left.id === right.id)
    || (left.contractor_id && right.contractor_id && left.contractor_id === right.contractor_id)
  );
}

function quoteWithDetails(quote, session) {
  const quotes = Array.isArray(session?.quotes) ? session.quotes : [];
  const details = [session?.bestQuote, ...quotes].find(candidate => sameQuote(candidate, quote));
  return { ...(details ?? {}), ...(quote ?? {}) };
}

function quoteNeedsHomeownerDecision(quote) {
  return !quote?.approval_status || quote.approval_status === 'pending';
}

function firstPendingApproval(session) {
  const pendingApprovals = Array.isArray(session?.pendingApprovals) ? session.pendingApprovals : [];
  const quotes = Array.isArray(session?.quotes) ? session.quotes : [];
  return pendingApprovals.find(quoteNeedsHomeownerDecision)
    ?? (quoteNeedsHomeownerDecision(session?.bestQuote) ? session.bestQuote : null)
    ?? quotes.find(quoteNeedsHomeownerDecision)
    ?? null;
}

function formatTimeLabel(hour, minute = 0) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const suffix = normalizedHour >= 12 ? 'PM' : 'AM';
  const displayHour = normalizedHour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function timeFromText(text) {
  const raw = cleanText(text);
  if (!raw) return null;

  const meridiemMatch = raw.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] ?? 0);
    const meridiem = meridiemMatch[3].toLowerCase();
    if (hour < 1 || hour > 12) return null;
    if (meridiem.startsWith('p') && hour !== 12) hour += 12;
    if (meridiem.startsWith('a') && hour === 12) hour = 0;
    return formatTimeLabel(hour, minute);
  }

  const atMatch = raw.match(/\b(?:at|around|by)\s+(\d{1,2})(?::([0-5]\d))?\b/i);
  if (!atMatch) return null;

  let hour = Number(atMatch[1]);
  const minute = Number(atMatch[2] ?? 0);
  if (hour > 23) return null;
  if (hour >= 1 && hour <= 7) hour += 12;
  return formatTimeLabel(hour, minute);
}

function parseQuoteDateTime(quote, fallbackContractor = {}) {
  const availability = cleanText(quote?.availability ?? fallbackContractor.availability);
  const reply = quoteReplyText(quote);
  const combined = cleanText([availability, reply].filter(Boolean).join(' ')).toLowerCase();

  let date = cleanText(quote?.date);
  if (!date) {
    if (combined.includes('tomorrow')) date = 'Tomorrow';
    else if (combined.includes('today')) date = 'Today';
  }

  const time = cleanText(quote?.time)
    || timeFromText(availability)
    || timeFromText(reply)
    || 'Contractor will confirm';

  return {
    date: date || 'Today',
    time,
  };
}

function quoteToBooking(quote, fallbackContractor = {}) {
  const quotedPrice = Number(quote?.price);
  const negotiatedPrice = Number.isFinite(quotedPrice)
    ? quotedPrice
    : asNumber(fallbackContractor.negotiatedPrice, 165);
  const contractor = normalizeContractor({
    ...fallbackContractor,
    id: quote?.contractor_id ?? fallbackContractor.id,
    name: quote?.contractor_name ?? fallbackContractor.name,
    phone: quote?.contractor_phone ?? fallbackContractor.phone,
    originalPrice: asNumber(fallbackContractor.originalPrice, negotiatedPrice + 25),
    negotiatedPrice,
    availability: quote?.availability ?? fallbackContractor.availability,
  });
  const { date, time } = parseQuoteDateTime(quote, contractor);

  return {
    contractor,
    negotiatedPrice,
    date,
    time,
    agentNote: 'Contractor replied through Telegram. Booking is finalized only after homeowner approval.',
  };
}

function buildCounterOfferMessage(contractor, quote = {}, options = {}) {
  const currentPrice = Number(quote.price ?? quote.negotiatedPrice ?? contractor?.negotiatedPrice);
  const requestedTarget = Number(options.targetPrice);
  const targetPrice = Number.isFinite(requestedTarget)
    ? requestedTarget
    : Number.isFinite(currentPrice)
      ? Math.max(75, Math.round(currentPrice * 0.9))
      : null;
  const availability = cleanText(quote.availability ?? contractor?.availability);
  const currentLine = Number.isFinite(currentPrice) ? ` Your current quote is $${currentPrice}.` : '';
  const availabilityLine = availability ? ` Availability noted: ${availability}.` : '';
  const targetLine = targetPrice ? `$${targetPrice}` : 'a sharper price';

  return `Thanks for the quick reply.${currentLine}${availabilityLine} The homeowner is comparing a few options. Can you do any better at ${targetLine}?`;
}

export function buildQuoteApprovalProposal(status, fallbackContractor = {}) {
  const session = quoteSessionFrom(status);
  const pendingQuote = firstPendingApproval(session);
  if (!pendingQuote || pendingQuote.available === false) return null;

  const quote = quoteWithDetails(pendingQuote, session);
  const contractorName = cleanText(quote.contractor_name ?? fallbackContractor.name) || 'Contractor';
  const reply = quoteReplyText(quote);
  const message = reply
    ? `${contractorName} replied: "${reply}" Should we book?`
    : `${contractorName} replied. Should we book?`;

  return {
    quote,
    quoteId: quote.id ?? null,
    contractorId: quote.contractor_id ?? fallbackContractor.id ?? null,
    message,
    booking: quoteToBooking(quote, fallbackContractor),
  };
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
    approvalStatus: message.approvalStatus,
  });
}

function notificationAddress(notification, contractor) {
  if (contractor?.phone) return contractor.phone;
  if (notification.channel === 'telegram' && notification.destination) {
    return `telegram:${notification.destination}`;
  }
  return notification.destination ?? null;
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
    const address = notificationAddress(notification, contractor);
    const key = conversationKey({
      phone: contractor?.phone,
      contractorId: notification.contractor_id,
      name: contractor?.name,
      fallback: `notification-${notification.id}`,
    });
    const conversation = ensureConversation(conversations, key, {
      phone: address ?? key,
      name: contractor?.name ?? notification.destination ?? 'Service Provider',
      requestId: session.requestId,
    });

    pushConversationMessage(conversation, {
      id: notification.id,
      direction: 'outbound',
      channel: notification.channel ?? 'insforge',
      kind: notification.status === 'replied' ? 'sent' : notification.status ?? 'outreach',
      body: notification.message ?? '',
      at: rowTimestamp(notification),
    });

    if (notification.reply_body) {
      pushConversationMessage(conversation, {
        id: `${notification.id}-reply`,
        direction: 'inbound',
        channel: notification.channel ?? 'insforge',
        kind: 'reply',
        body: notification.reply_body,
        at: notification.reply_received_at ?? rowTimestamp(notification),
      });
    }
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
      approvalStatus: quote.approval_status,
    });
    conversation.approvalStatus = quote.approval_status ?? conversation.approvalStatus ?? null;
    conversation.needsApproval = conversation.needsApproval || quote.approval_status === 'pending';
    if (quote.approval_status === 'pending') {
      conversation.pendingQuoteId = quote.id;
    }
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
        approvalStatus: conversation.approvalStatus ?? null,
        needsApproval: Boolean(conversation.needsApproval),
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

  async function loadRecentSession() {
    if (!isBackendConfigured()) return null;
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return null;

    const { data: requests } = await insforge.database
      .from('repair_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!requests || requests.length === 0) return null;
    activeRequestId = requests[0].id;

    const { data: messages } = await insforge.database
      .from('request_messages')
      .select('*')
      .eq('request_id', activeRequestId)
      .order('created_at', { ascending: true });

    return { request: requests[0], messages: messages || [] };
  }

  async function getOrCreateActiveRequest(urgency = 'normal') {
    if (!isBackendConfigured()) return null;
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return null;

    if (activeRequestId) return activeRequestId;

    const requestId = cryptoImpl.randomUUID();
    const { error } = await insforge.database.from('repair_requests').insert([{
      id: requestId,
      user_id: user.id,
      status: 'uploaded',
      urgency,
      location_text: config.locationText,
      image_url: '',
      image_key: '',
    }]);
    
    if (!error) {
      activeRequestId = requestId;
      activeContractorIds = [];
      activeContractors = [];
    }
    return activeRequestId;
  }

  async function saveMessage(role, content, messageType = 'text', imageUrl = null) {
    if (!isBackendConfigured()) return;
    const user = await requireCurrentUser().catch(() => null);
    if (!user) return;

    if (!activeRequestId) {
      await getOrCreateActiveRequest();
    }
    if (!activeRequestId) return;

    const metadata = imageUrl ? { imageUrl } : {};

    await insforge.database.from('request_messages').insert([{
      request_id: activeRequestId,
      user_id: user.id,
      role,
      message_type: messageType,
      content,
      metadata
    }]);
  }

  async function analyzeImage(previewUrl, urgency = 'medium', file = null, userContext = null) {
    if (!isBackendConfigured() || !file) {
      return fallbackApi.analyzeImage(previewUrl, urgency, userContext);
    }

    const user = await requireCurrentUser();

    // If we already have an active request and userContext is provided,
    // this is a re-analysis with clarification — don't re-upload the photo
    if (userContext && activeRequestId) {
      const analysis = await insforge.functions.invoke('analyze', {
        body: { requestId: activeRequestId, userContext },
      });

      return {
        ...assertSdkResult(analysis, 'Analyze function did not return a response.'),
        requestId: activeRequestId,
      };
    }

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

    await insforge.database.from('request_messages').insert([{
      request_id: activeRequestId,
      user_id: user.id,
      role: 'user',
      message_type: 'image',
      content: '',
      metadata: { imageUrl: upload.data.url }
    }]);

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

  async function analyzeVoice(transcript, urgency = 'medium') {
    const analysis = await fallbackApi.analyzeVoice(transcript);
    if (!isBackendConfigured()) return analysis;

    const user = await requireCurrentUser();
    const requestId = cryptoImpl.randomUUID();
    const { data: requests, error: insertError } = await insforge.database.from('repair_requests')
      .insert([{
        id: requestId,
        user_id: user.id,
        status: analysis.isIdentified === false ? 'needs_info' : 'identified',
        category: analysis.category ?? 'general',
        brand: analysis.brand ?? null,
        urgency,
        location_text: config.locationText,
        image_url: `text://repair-requests/${requestId}`,
        image_key: `text-requests/${requestId}`,
        model_name: analysis.modelNumber ?? null,
        diagnosis: analysis.diagnosis ?? transcript,
        next_question: analysis.nextQuestion ?? null,
      }])
      .select();

    if (insertError) throw insertError;

    activeRequestId = requestId;
    activeContractorIds = [];
    activeContractors = [];

    return {
      ...analysis,
      requestId,
      request: Array.isArray(requests) ? requests[0] : null,
    };
  }

  async function getConversations() {
    if (!isBackendConfigured()) {
      return config.useMock ? fallbackApi.getConversations() : [];
    }

    try {
      const user = await requireCurrentUser().catch(() => null);
      if (!user) return [];

      // Primary: query the persistent conversations table (across ALL requests)
      const { data: convRows } = await insforge.database
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('last_message_at', { ascending: false });

      if (convRows && convRows.length > 0) {
        // Fetch the latest messages for each conversation (up to 50 per conv)
        const conversationsWithMessages = await Promise.all(
          convRows.map(async (conv) => {
            const { data: msgs } = await insforge.database
              .from('conversation_messages')
              .select('*')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: true });

            const messages = (msgs || []).map((m) => ({
              id: m.id,
              direction: m.direction,
              channel: m.channel,
              kind: m.kind,
              body: m.body,
              at: m.created_at,
              requestId: m.request_id,
              metadata: m.metadata,
            }));

            const last = messages.at(-1);
            return {
              conversationId: conv.id,
              phone: conv.contractor_phone ?? conv.contractor_id ?? conv.id,
              name: conv.contractor_name ?? 'Service Provider',
              contractorId: conv.contractor_id,
              requestId: conv.latest_request_id,
              messages,
              messageCount: messages.length,
              lastMessageAt: last?.at ?? conv.last_message_at,
              lastMessage: last?.body ?? conv.last_message_preview ?? '',
              unreadCount: conv.unread_count ?? 0,
              negotiationStatus: conv.negotiation_status ?? 'active',
            };
          }),
        );

        return conversationsWithMessages;
      }

      // Fallback: build from status (old path) for backward compat
      if (activeRequestId) {
        return buildConversationsFromStatus(
          await getRepairStatus(activeRequestId),
          activeContractors,
        );
      }

      return [];
    } catch (error) {
      console.warn('getConversations failed:', error?.message ?? error);
      // Fallback to old method on error
      if (activeRequestId) {
        try {
          return buildConversationsFromStatus(
            await getRepairStatus(activeRequestId),
            activeContractors,
          );
        } catch { return []; }
      }
      return [];
    }
  }

  async function getConversationMessages(conversationId) {
    if (!isBackendConfigured() || !conversationId) return [];
    try {
      const { data: msgs } = await insforge.database
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      return (msgs || []).map((m) => ({
        id: m.id,
        direction: m.direction,
        channel: m.channel,
        kind: m.kind,
        body: m.body,
        at: m.created_at,
        requestId: m.request_id,
        metadata: m.metadata,
      }));
    } catch { return []; }
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
      
    const TEST_CONTRACTOR = {
      id: 'test-contractor',
      name: 'Testing Contractor',
      phone: '+1234567890',
      email: 'test@hooman.com',
      website: 'www.test.hooman.com',
      rating: 5.0,
      reviewCount: 999,
      distance: 1.2,
      verified: { licensed: true, insured: true, bbComplaint: false },
      originalPrice: 150,
      negotiatedPrice: 120,
      availability: 'Today, 2:00 PM',
      category: 'general',
      specialties: ['Testing', 'Demo'],
      yearsExperience: 10,
    };

    activeContractors = [TEST_CONTRACTOR, ...results];
    return activeContractors;
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

    if (!contractors?.[0]) {
      throw new Error('Select a contractor before starting outreach.');
    }
    const selectedContractor = normalizeContractor(contractors[0], 0);
    if (!selectedContractor?.id) {
      throw new Error('Select a contractor before starting outreach.');
    }

    const contractorIds = [selectedContractor.id];

    yield {
      step: 'contacting',
      count: contractorIds.length,
      message: `Contacting ${selectedContractor.name} through InsForge...`,
    };

    const notification = await insforge.functions.invoke('notify-contractors', {
      body: {
        requestId: activeRequestId,
        contractorIds,
        selectedContractor: contractorNotificationPayload(selectedContractor),
      },
    });
    const notificationData = assertSdkResult(notification, 'Contractor notification did not return a response.');

    yield {
      step: 'responses',
      count: notificationData.notifiedCount ?? contractorIds.length,
      message: `Message sent to ${selectedContractor.name}. Waiting for their reply...`,
    };

    yield {
      step: 'negotiating',
      count: 1,
      message: 'Watching Telegram replies and quote updates...',
    };

    const replyPollAttempts = Math.max(1, Math.floor(userPreferences.replyPollAttempts ?? DEFAULT_REPLY_POLL_ATTEMPTS));
    const replyPollIntervalMs = Math.max(0, Math.floor(userPreferences.replyPollIntervalMs ?? DEFAULT_REPLY_POLL_INTERVAL_MS));
    let status = null;
    let selectedQuote = null;
    for (let attempt = 0; attempt < replyPollAttempts; attempt += 1) {
      status = await getRepairStatus(activeRequestId).catch(() => null);
      selectedQuote = findSelectedQuote(status, selectedContractor);
      if (selectedQuote) break;
      if (attempt < replyPollAttempts - 1 && replyPollIntervalMs > 0) {
        await sleep(replyPollIntervalMs);
      }
    }

    const bestQuote = selectedQuote ?? status?.session?.bestQuote;

    yield {
      step: 'comparing',
      contractors: [selectedContractor],
      message: bestQuote ? 'A contractor reply is ready.' : 'No reply yet. I will keep watching for their response.',
    };

    if (!bestQuote) {
      yield {
        step: 'waiting',
        contractors: [selectedContractor],
        message: `Still waiting for ${selectedContractor.name} to reply. I will update the chat once a quote arrives.`,
      };
      return;
    }

    const proposal = buildQuoteApprovalProposal(status, selectedContractor)
      ?? buildQuoteApprovalProposal({
        session: {
          bestQuote,
          pendingApprovals: [bestQuote],
          quotes: [bestQuote],
        },
      }, selectedContractor);

    if (!proposal) return;

    yield {
      step: 'approval',
      quote: proposal.quote,
      quoteId: proposal.quoteId,
      contractorId: proposal.contractorId,
      booking: proposal.booking,
      message: proposal.message,
    };
  }

  async function finalizeBooking(contractorId, date, time, quoteId = null) {
    if (!isBackendConfigured() || !activeRequestId) return;
    const body = { requestId: activeRequestId, contractorId, date, time };
    if (quoteId) body.quoteId = quoteId;
    const response = await insforge.functions.invoke('finalize-booking', {
      body,
    });
    return assertSdkResult(response, 'Booking finalization failed.');
  }

  async function negotiateQuote(contractor, quote = {}, options = {}) {
    if (!contractor?.id) throw new Error('Choose a contractor before negotiating.');
    if (!isBackendConfigured() || !activeRequestId) {
      return {
        status: 'success',
        followUp: true,
        message: buildCounterOfferMessage(contractor, quote, options),
      };
    }

    const selectedContractor = normalizeContractor(contractor, 0);
    const currentPrice = Number(quote.price ?? quote.negotiatedPrice ?? selectedContractor.negotiatedPrice);
    const targetPrice = Number(options.targetPrice);
    const followUpMessage = buildCounterOfferMessage(selectedContractor, quote, options);
    const response = await insforge.functions.invoke('notify-contractors', {
      body: {
        requestId: activeRequestId,
        contractorIds: [selectedContractor.id],
        selectedContractor: contractorNotificationPayload(selectedContractor),
        quoteId: quote.id ?? null,
        currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
        targetPrice: Number.isFinite(targetPrice) ? targetPrice : null,
        availability: quote.availability ?? selectedContractor.availability ?? null,
        followUpMessage,
      },
    });

    return assertSdkResult(response, 'Negotiation follow-up failed.');
  }
  
  async function getBookings(statusFilter = null) {
    if (!isBackendConfigured()) return [];
    try {
      const user = await requireCurrentUser().catch(() => null);
      if (!user) return [];
      let query = insforge.database
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      const { data } = await query;
      return data || [];
    } catch { return []; }
  }

  async function cancelBooking(bookingId, reason = '') {
    if (!isBackendConfigured() || !bookingId) throw new Error('Missing booking ID');
    const { data } = await insforge.database
      .from('bookings')
      .update({ status: 'cancelled', cancel_reason: reason })
      .eq('id', bookingId)
      .select();
    return data?.[0] ?? null;
  }

  async function rescheduleBooking(bookingId, newDate, newTime, note = '') {
    if (!isBackendConfigured() || !bookingId) throw new Error('Missing booking ID');
    const user = await requireCurrentUser();
    // Get original booking
    const { data: origRows } = await insforge.database
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    const orig = origRows;
    if (!orig) throw new Error('Booking not found');
    // Mark old as rescheduled
    await insforge.database
      .from('bookings')
      .update({ status: 'rescheduled', reschedule_note: note })
      .eq('id', bookingId);
    // Create new booking
    const bookingNumber = 'BK-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + crypto.randomUUID().slice(0,4).toUpperCase();
    const { data: newRows } = await insforge.database
      .from('bookings')
      .insert([{
        booking_number: bookingNumber,
        user_id: user.id,
        request_id: orig.request_id,
        conversation_id: orig.conversation_id,
        contractor_id: orig.contractor_id,
        quote_id: orig.quote_id,
        contractor_name: orig.contractor_name,
        contractor_phone: orig.contractor_phone,
        category: orig.category,
        price: orig.price,
        scheduled_date: newDate,
        scheduled_time: newTime,
        status: 'upcoming',
        original_booking_id: bookingId,
      }])
      .select();
    return newRows?.[0] ?? null;
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
    finalizeBooking,
    negotiateQuote,
    getRepairStatus,
    getConversations,
    getConversationMessages,
    getBookings,
    cancelBooking,
    rescheduleBooking,
    loadRecentSession,
    getOrCreateActiveRequest,
    saveMessage,
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
export const finalizeBooking = defaultApi.finalizeBooking;
export const negotiateQuote = defaultApi.negotiateQuote;
export const getRepairStatus = defaultApi.getRepairStatus;
export const getConversations = defaultApi.getConversations;
export const getConversationMessages = defaultApi.getConversationMessages;
export const getBookings = defaultApi.getBookings;
export const cancelBooking = defaultApi.cancelBooking;
export const rescheduleBooking = defaultApi.rescheduleBooking;
export const loadRecentSession = defaultApi.loadRecentSession;
export const getOrCreateActiveRequest = defaultApi.getOrCreateActiveRequest;
export const saveMessage = defaultApi.saveMessage;
