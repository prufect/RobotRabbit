export type RepairStatus =
  | 'uploaded'
  | 'needs_info'
  | 'identified'
  | 'searching'
  | 'notifying'
  | 'negotiating'
  | 'pending_approval'
  | 'completed'
  | 'booked'
  | 'failed';

export type JobType = 'analyze_image' | 'search_contractors' | 'notify_contractors';
export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type RepairRequest = {
  id: string;
  user_id: string;
  status: RepairStatus;
  category: string | null;
  brand: string | null;
  urgency: string;
  location_text: string | null;
  image_url: string;
  image_key: string;
  model_name: string | null;
  diagnosis: string | null;
  next_question: string | null;
  best_quote_id: string | null;
};

export type NormalizedAnalysis = {
  isIdentified: boolean;
  status: 'identified' | 'needs_info';
  category: string;
  brand: string | null;
  modelNumber: string | null;
  diagnosis: string | null;
  nextQuestion: string | null;
  messageToUser: string;
  contractorSearchQuery: string | null;
};

export type ContractorInsert = {
  name: string;
  phone: string | null;
  website: string | null;
  category: string;
  location_text: string | null;
  source: string;
  source_ref: string | null;
  metadata?: Record<string, unknown>;
};

export type Contractor = ContractorInsert & {
  id: string;
};

export type ContractorQuote = {
  id: string;
  request_id?: string;
  contractor_id?: string | null;
  contractor_name?: string;
  contractor_phone?: string | null;
  available: boolean;
  price: number | null;
  availability: string | null;
  raw_message?: string;
  approval_status?: 'pending' | 'approved' | 'rejected';
  approved_at?: string | null;
  rejected_at?: string | null;
};

export type AgentJob = {
  id: string;
  request_id: string;
  user_id: string;
  job_type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempt_count: number;
  last_error: string | null;
  run_after: string;
};

export type NotificationInsert = {
  request_id: string;
  user_id: string;
  contractor_id: string | null;
  channel: 'whatsapp' | 'telegram' | 'mock';
  destination: string | null;
  status: 'pending' | 'sent' | 'failed' | 'mock_sent' | 'replied';
  message: string;
  provider_message_id?: string | null;
  reply_received_at?: string | null;
  reply_message_id?: string | null;
  reply_body?: string | null;
  last_error?: string | null;
};

export type ConversationInsert = {
  user_id: string;
  contractor_id: string | null;
  contractor_name: string;
  contractor_phone: string | null;
  latest_request_id: string;
  status?: 'active' | 'archived';
  last_message_at?: string;
  last_message_preview?: string;
  unread_count?: number;
};

export type ConversationMessageInsert = {
  conversation_id: string;
  request_id: string | null;
  direction: 'inbound' | 'outbound';
  channel: string;
  kind: string;
  body: string;
  metadata?: Record<string, unknown>;
};
