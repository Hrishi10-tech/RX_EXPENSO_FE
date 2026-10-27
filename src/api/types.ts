/**
 * Response shapes of the Expenso API v1, typed against the real responses in docs/samples.
 * Money is integer paise; instants are ISO 8601 UTC strings; calendar dates are YYYY-MM-DD IST.
 */

export type Paise = number;
export type ISO = string;
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'acc' | 'pool' | 'priv' | 'line';

export type TripStatus = 'scheduled' | 'active' | 'extended' | 'closed' | 'cancelled';
export type TripType = 'same_day' | 'multi_day';
export type Purpose = 'client_meeting' | 'conference' | 'training' | 'audit' | 'installation' | 'other';
export type MemberRole = 'owner' | 'member';
export type JoinStatus = 'invited' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type ClaimStatus = 'open' | 'ready' | 'verified' | 'part_paid' | 'reimbursed';
export type Category = 'airfare' | 'train' | 'cab' | 'fuel_toll' | 'accommodation' | 'meals' | 'client_entertainment' | 'event_fee'
  | 'printing' | 'courier' | 'internet_phone' | 'visa_passport' | 'other';
export type PaymentMode = 'upi' | 'cash' | 'card' | 'company';
export type PaidBy = 'self' | 'company';
export type BudgetSource = 'pool' | 'individual' | 'unbudgeted' | null;
export type Verification = 'pending' | 'verified' | 'query' | 'rejected';
export type EntryFlag = 'pre_trip' | 'outside_times' | 'late_entry' | 'device_time_mismatch';
export type BudgetState = 'ok' | 'warn' | 'over';
export type DocType = 'payment_proof' | 'invoice' | 'approval_note' | 'bank_statement' | 'other';
export type DocScope = 'trip' | 'claim' | 'expense';
export type ReimbursementMode = 'bank_transfer' | 'upi' | 'cash';
export type ExportScope = 'trip' | 'member' | 'each' | 'trip_and_each';
export type ExportFormat = 'pdf' | 'xlsx' | 'zip';
export type ExportStatus = 'queued' | 'building' | 'ready' | 'failed';

/* ---------------- sign-in and profile ---------------- */

export interface UserSettings {
  dailyDigest: boolean;
  theme: 'light' | 'dark' | 'system';
  notificationPrefs: Record<string, boolean>;
}
export interface Me {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  employeeCode: string;
  designation?: string | null;
  departmentId: string;
  departmentName: string;
  roles: string[];
  isFinance: boolean;
  isAdmin: boolean;
  settings: UserSettings;
}
export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Me;
}
export interface OtpRequestResult { sent: boolean; devCode?: string }

/* ---------------- trips ---------------- */

export interface Progress { day: number; of: number; extendedMs: number }
export interface PoolUse { allocatedPaise: Paise; spentPaise: Paise; pct: number }

/** One row of GET /finance/trips (and dashboard.running). */
export interface TripRow {
  id: string;
  ref: string;
  name: string;
  status: TripStatus;
  purpose: Purpose;
  clientEvent: string | null;
  primaryCity: string;
  scheduledStart: ISO;
  tentativeEnd: ISO;
  firstStartAt: ISO | null;
  closedAt: ISO | null;
  cancelledAt?: ISO | null;
  /** Accepted members who hold the Finance role (FR-VER-10). */
  financeMemberIds?: string[];
  enteredAfterStart: boolean;
  departmentId: string;
  departmentName: string;
  ownerId: string;
  ownerName: string;
  ownerActive: boolean;
  spendPaise: Paise;
  expenseCount: number;
  settledCount: number;
  queryCount: number;
  poolPaise: Paise | null;
  poolSpentPaise: Paise | null;
  individualCount: number;
  individualOver: boolean;
  memberCount: number;
  invitedCount: number;
  declinedCount: number;
  runningCount: number;
  claimsReady: number;
  claimsVerified: number;
  claimsPaid: number;
  earlyStarts: number;
  lastEnd: ISO | null;
  pool: PoolUse | null;
  progress: Progress | null;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export interface TripDetail {
  id: string;
  ref: string;
  clientId: string | null;
  name: string;
  type: TripType;
  purpose: Purpose;
  clientEvent: string | null;
  departmentId: string;
  ownerId: string;
  scheduledStart: ISO;
  tentativeEnd: ISO;
  primaryCity: string;
  notes: string | null;
  status: TripStatus;
  enteredAfterStart: boolean;
  createdOffline: boolean;
  copiedFrom: string | null;
  firstStartAt: ISO | null;
  extendedAt: ISO | null;
  closedAt: ISO | null;
  cancelledAt: ISO | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  version: number;
  createdAt: ISO;
  updatedAt: ISO;
  departmentName: string;
  ownerName: string;
  ownerActive: boolean;
  progress: Progress | null;
  window: { from: string; to: string };
}

export interface MemberRow {
  userId: string;
  name: string;
  employeeCode: string;
  role: MemberRole;
  joinStatus: JoinStatus;
  invitedAt: ISO;
  respondedAt: ISO | null;
  actualStart: ISO | null;
  startMethod: 'manual' | 'automatic' | null;
  startBackdated: boolean;
  startEarlyMinutes: number;
  startDeviceTime: ISO | null;
  startReceivedAt: ISO | null;
  actualEnd: ISO | null;
  endMethod: 'member' | 'finance' | null;
  endReason: string | null;
  endReceivedAt: ISO | null;
  running: boolean;
  pastEndMs: number;
  remindersSent: number;
  claimStatus: ClaimStatus;
  claimStatusAt: ISO;
  reopenedAt: ISO | null;
  reopenReason: string | null;
}

export interface BudgetView {
  id: string;
  type: 'pool' | 'individual';
  memberUserId: string | null;
  allocatedPaise: Paise;
  spentPaise: Paise;
  remainingPaise: Paise;
  pct: number;
  state: BudgetState;
  setAt: ISO;
}
export interface IndividualBudget extends BudgetView { memberName: string }

export interface LocationRow {
  id: string;
  tripId: string;
  clientId: string | null;
  city: string;
  venue: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  arrivalDate: string;
  departureDate: string;
  notes: string | null;
  isPrimary: boolean;
  addedBy: string;
  createdAt: ISO;
  updatedAt: ISO;
  deletedAt: ISO | null;
  expenseCount: number;
  totalPaise: Paise;
}

export interface Attachment {
  id: string;
  clientId: string | null;
  kind: 'receipt' | 'document';
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  status: 'pending' | 'uploaded';
  capturedAt: ISO | null;
  uploadedAt: ISO | null;
  docType: DocType | null;
  docScope: DocScope | null;
  messageId: string | null;
  url: string | null;
  /** Finance documents: what the document is about, from the upload drawer (W04·c). */
  note?: string | null;
  uploadedByName?: string;
}

export interface Expense {
  id: string;
  clientId: string | null;
  tripId: string;
  locationId: string | null;
  userId: string;
  userName: string;
  isMine: boolean;
  spentAt: ISO;
  category: Category;
  description: string;
  amountPaise: Paise;
  paymentMode: PaymentMode;
  paidBy: PaidBy;
  budgetSource: BudgetSource;
  needsBudgetChoice: boolean;
  remarks: string | null;
  verification: Verification;
  approvedPaise: Paise | null;
  approvalReason: string | null;
  financeRemark: string | null;
  flags: EntryFlag[];
  messageCount: number;
  attachments: Attachment[];
  version: number;
  createdAt: ISO;
  updatedAt: ISO;
  receivedAt: ISO;
  deviceTime: ISO | null;
}

export interface ClaimTotals {
  totalPaise: Paise;
  companyPaise: Paise;
  selfPaise: Paise;
  rejectedPaise: Paise;
  reimbursablePaise: Paise;
  paidPaise: Paise;
  balancePaise: Paise;
  count: number;
  verified: number;
  query: number;
  rejected: number;
  pending: number;
  poolPaise: Paise;
  individualPaise: Paise;
  unbudgetedPaise: Paise;
  /** Unreliable in API v1 (counts every self-paid expense); see docs/api-requests-web.md. */
  missingReceipts: number;
}
export interface TripClaim extends ClaimTotals { userId: string; name: string; status: ClaimStatus }

export interface TripDocument extends Attachment {
  memberUserId: string | null;
  expenseId: string | null;
  uploadedBy: string;
  uploadedByName: string;
  visibleToMember: boolean;
  canDelete: boolean;
}

export interface Payment {
  id: string;
  tripId: string;
  memberUserId: string;
  amountPaise: Paise;
  paidOn: string;
  mode: ReimbursementMode;
  reference: string | null;
  proofAttachmentId: string | null;
  note: string | null;
  recordedBy: string;
  recordedAt: ISO;
  recordedByName?: string;
  proof?: Attachment | null;
}

export interface ExportFile { format: ExportFormat; name: string; size: number; onDevice: boolean; url: string | null }
export interface ExportRow {
  id: string;
  tripId: string;
  tripRef: string | null;
  tripName: string | null;
  requestedBy: string;
  requestedByName: string | null;
  via: 'web' | 'mobile';
  scope: ExportScope;
  scopeLabel: string;
  memberUserId: string | null;
  memberName: string | null;
  formats: ExportFormat[];
  locationId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  limitLabel: string | null;
  provisional: boolean;
  status: ExportStatus;
  progress: { pct: number; step: string; detail?: string; phase?: ExportPhase; subject?: { userId: string; name: string } | null } | null;
  files: ExportFile[];
  sizeBytes: number;
  missingReceipts: number;
  error: string | null;
  createdAt: ISO;
  startedAt: ISO | null;
  finishedAt: ISO | null;
  baseName: string | null;
}

export interface FinanceTrip {
  trip: TripDetail;
  members: MemberRow[];
  budgets: { pool: BudgetView | null; individuals: IndividualBudget[] };
  locations: LocationRow[];
  expenses: Expense[];
  claims: TripClaim[];
  totals: { spendPaise: Paise; expenseCount: number; receiptCount: number; pendingUploads: number; documentCount: number };
  categories: Array<{ category: Category; totalPaise: Paise; pct: number }>;
  documents: TripDocument[];
  payments: Payment[];
  exports: ExportRow[];
  viewer: { isMember: boolean; canSetBudgets: boolean };
  financeUsers: FinanceUser[];
}

/** Active finance users and whether each is on the trip, for "Ask another finance user" (FR-VER-10). */
export interface FinanceUser { userId: string; name: string; onTrip: boolean; isMe: boolean }

export interface TimelineItem {
  id: number;
  at: ISO;
  action: string;
  actor: string;
  memberUserId: string | null;
  memberName: string;
  text: string;
  meta: Record<string, unknown>;
}

export interface BudgetLogItem {
  id: string;
  at: ISO;
  type: 'pool' | 'individual';
  memberUserId: string | null;
  memberName: string | null;
  oldPaise: Paise | null;
  newPaise: Paise | null;
  note: string | null;
  by: string;
}

export type BudgetEffectKey = 'toPool' | 'toIndividual' | 'needChoice' | 'poolToUnbudgeted' | 'individualToUnbudgeted';
export interface BudgetPreview {
  members: Array<{ userId: string; name: string; effect: Partial<Record<BudgetEffectKey, { count: number; paise: Paise }>> }>;
}

/* ---------------- dashboard ---------------- */

export interface DashboardData {
  kpis: {
    runningTrips: number;
    extendedTrips: number;
    runningDepartments: number;
    claimsReady: number;
    oldestReadyAt: ISO | null;
    claimsVerifiedUnpaid: number;
    openQueries: number;
    monthSpendPaise: Paise;
  };
  /** The IST month the spend figures cover, "2026-09". */
  month?: string;
  spendByDepartment: Array<{ id: string; name: string; total: Paise | string; trips: number | string }>;
  running: TripRow[];
  needsAttention: Array<{ kind: 'extended' | 'owner_inactive' | 'receipt_pending'; tripId: string; ref: string; name: string; userId: string | null; who: string; at: ISO }>;
  claimsReady: ClaimQueueItem[];
  activity: Array<{ at: ISO; action: string; actor: string; tripId: string | null; trip: { id: string; ref: string; name: string } | null; meta: Record<string, unknown> }>;
}

/* ---------------- claims ---------------- */

export interface ClaimQueueItem {
  tripId: string;
  ref: string;
  tripName: string;
  tripStatus: TripStatus;
  departmentName: string;
  userId: string;
  name: string;
  employeeCode: string;
  status: ClaimStatus;
  since: ISO;
  waitingMs: number;
  totals: ClaimTotals;
  flagged: number;
  ownClaim: boolean;
  actualStart?: ISO | null;
  actualEnd?: ISO | null;
  endMethod?: 'member' | 'finance' | null;
}

export interface ThreadMessage {
  id: string;
  side: 'finance' | 'member';
  kind: 'query' | 'reply' | 'reject' | 'note' | 'dispute';
  body: string;
  authorId?: string;
  authorName: string;
  createdAt: ISO;
  attachments: Attachment[];
}

export interface ReviewExpense extends Expense { locationCity: string; thread: ThreadMessage[] }

export interface ClaimReview {
  trip: { id: string; ref: string; name: string; status: TripStatus; scheduledStart: ISO; tentativeEnd: ISO; departmentName: string; ownerId: string };
  member: { userId: string; name: string; employeeCode: string; actualStart: ISO | null; startMethod: string | null; actualEnd: ISO | null; endMethod: string | null; endReason: string | null; running: boolean };
  claim: ClaimTotals & { status: ClaimStatus; since: ISO; reopenedAt: ISO | null; reopenReason: string | null };
  budgets: { pool: BudgetView | null; individual: BudgetView | null };
  expenses: ReviewExpense[];
  payments: Payment[];
  documents: Attachment[];
  viewer: { ownClaim: boolean; locked: boolean };
  financeUsers: FinanceUser[];
}

export interface ExpenseHistoryItem { at: ISO; action: string; actor: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
export interface ExpenseView {
  expense: Expense;
  location: { id: string; city: string; venue: string | null } | null;
  trip: { id: string; ref: string; name: string; status: TripStatus };
  thread: ThreadMessage[];
  history: ExpenseHistoryItem[];
  canEdit: boolean;
}

export interface BulkVerifyResult { results: Array<{ id: string; ok: boolean; code?: string; message?: string }> }
export interface PaymentResult { payment: Payment; claimStatus: ClaimStatus; balancePaise: Paise }

/* ---------------- exports ---------------- */

export interface ExportPreview {
  scope: ExportScope;
  scopeLabel: string;
  formats: ExportFormat[];
  provisional: boolean;
  reasons: string[];
  members: Array<{ userId: string; name: string; provisional: boolean; claimStatus: ClaimStatus; expenses: number; hasIndividualBudget: boolean }>;
  counts: { members: number; expenses: number; receipts: number; receiptsReceived: number; documents: number };
  budgetsStated: { pool: boolean; individuals: string[]; changeLog: number };
  limitLabel: string | null;
  missingReceipts: Array<{ expenseId: string; userId: string; memberName: string; description: string; spentAt: ISO; amountPaise: Paise; category: Category }>;
  deliverables: Array<{ format: ExportFormat; name: string }>;
  zipPaths: string[];
  estimatedBytes: { zip: number; pdf: number };
}
export type ExportPhase = 'read' | 'pdf' | 'xlsx' | 'zip';
export interface ExportProgress { id: string; tripId: string; pct: number; step: string; detail?: string; phase?: ExportPhase; subject?: { userId: string; name: string } | null }

/* ---------------- notifications ---------------- */

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  tripId: string | null;
  data: { tripId?: string; expenseId?: string; exportId?: string; userId?: string | null; budgetType?: string; topic?: 'budgets' | 'claim'; fromUserId?: string } & Record<string, unknown>;
  createdAt: ISO;
  readAt: ISO | null;
  channel?: 'app' | 'web' | 'both';
}
export interface NotificationList { items: NotificationItem[]; unread: number }

/* ---------------- people, departments, administration, audit ---------------- */

export interface Person { id: string; name: string; employeeCode: string; departmentId: string; active: boolean; isFinance: boolean }
export interface Department { id: string; name: string; createdAt: ISO; updatedAt: ISO; archivedAt: ISO | null }
export interface AdminDepartment extends Department { userCount: number; liveTrips: number; tripsThisYear?: number }

export interface AdminUser {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone: string | null;
  departmentId: string;
  designation?: string | null;
  isFinance: boolean;
  isAdmin: boolean;
  active: boolean;
  deactivatedAt: ISO | null;
  lockedUntil: ISO | null;
  firstMobileLoginAt: ISO | null;
  lastSeenAt: ISO | null;
  createdAt: ISO;
  updatedAt: ISO;
  hasPassword: boolean;
  signedInToApp: boolean;
  departmentName: string;
  liveTrips: number;
  lastMobile: ISO | null;
  lastWeb: ISO | null;
}
export interface UserInput {
  name: string;
  email: string;
  employeeCode: string;
  phone?: string | null;
  designation?: string | null;
  departmentId: string;
  isFinance?: boolean;
  isAdmin?: boolean;
  password?: string | null;
}
export interface DeactivationImpact {
  ownedLiveTrips: Array<{ id: string; ref: string; name: string; status: TripStatus }>;
  runningTrips: Array<{ id: string; ref: string; name: string }>;
  openClaims: number;
}

export interface AuditItem {
  id: number;
  at: ISO;
  actor: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  tripId: string | null;
  tripRef: string | null;
  tripName: string | null;
  member: string;
  memberUserId?: string | null;
  /** web, mobile or system (the source column). */
  client?: 'web' | 'mobile' | 'system' | null;
  /** The server's short label of what the entry is about. */
  item?: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown>;
}
export interface AuditPage { items: AuditItem[]; page: number; pageSize?: number; total?: number; scope?: 'all' | 'administration' }

/* ---------------- realtime ---------------- */

export interface TripChanged { tripId: string; kind: string; at: ISO; userId?: string; expenseId?: string; [k: string]: unknown }

/** PUT /finance/trips/:id/budgets: the whole W05 form in one transaction. */
export interface BudgetEntryInput { amountPaise: Paise; note?: string | null }
export interface BudgetsSaveInput { pool?: BudgetEntryInput | null; individuals?: Record<string, BudgetEntryInput | null>; note?: string | null }
export interface BudgetsSaveResult { changes: number; charged: number; askedToChoose: string[]; trip: FinanceTrip }
