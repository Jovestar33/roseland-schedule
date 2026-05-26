// Wire-compatible with original app's makeRow() and getMeta() data model.
// These shapes are stored in Netlify Blobs and must not change without a migration.

// Optional sub-location attached to a row. Old schedules without this field
// behave exactly as before.
export interface SubLocation {
  id: string;
  loc: string;
  locLat?: number | null;
  locLng?: number | null;
  done?: boolean;
  desc?: string;
}

export interface ScheduleRow {
  action: string;
  otherText: string;
  desc: string;
  loc: string;
  locLat: number | null;
  locLng: number | null;
  notes: string;
  status: string;
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  contactEmail: string;
  timeIn: string;
  dur: string;
  done: boolean;
  sunLocked: boolean;
  fixedIn: boolean;
  fixedOut: boolean;
  fixedOutTime: string;
  subLocations?: SubLocation[]; // absent on old schedules — treated as undefined
}

export interface WeatherData {
  sunrise?: string;
  sunset?: string;
  // Full forecast fields (from Open-Meteo)
  maxC?: number;
  minC?: number;
  maxF?: number;
  minF?: number;
  prec?: number;
  code?: number;
  cond?: string;
  fetchedAt?: string;
  town?: string;
  noForecast?: boolean;
}

export interface CallSheetData {
  basecamp?: string;
  parking?: string;
  hospital?: string;
  emergency?: string;
  mealNotes?: string;
  safetyNotes?: string;
  specialInstructions?: string;
  notes?: string;
}

export interface ScheduleMeta {
  town: string;
  date: string;
  prod: string;
  dir: string;
  dp: string;
  lat: number | null;
  lng: number | null;
  wx: WeatherData | null;
  projectName: string;
  phase: string;
  dayNumber: number | null;
  totalDays: number | null;
  callsheet?: CallSheetData;
}

// Wire format stored in Netlify Blobs — must stay compatible with save.js / load.js
export interface ScheduleData {
  meta: ScheduleMeta;
  rows: ScheduleRow[];
  savedAt: number;
}

export interface Snapshot {
  id: string;
  savedAt: number;
  label: string;
  data: ScheduleData;
}

export interface LibraryEntry {
  name: string;
  savedAt: number;
  folder: string | null;
}

export interface LibraryMeta {
  schedules: LibraryEntry[];
  folders: string[];
  tsarchived?: string[];
  townCache?: Record<string, string>;
  dateCache?: Record<string, string>;
}

export interface CMSConfig {
  actions: string[];
  actionStyles: Record<string, { bg: string; text: string }>;
  colors: Record<string, string>;
  labels: Record<string, string>;
  logo: string | null;
}

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'conflict';

export interface ConflictState {
  local: ScheduleData;
  remote: ScheduleData;
  scheduleName: string;
}

export interface SyncQueueEntry {
  scheduleName: string;
  data: ScheduleData;
  queuedAt: number;
}

// ── Production Command types ──────────────────────────────────────────────────

export type ProductionStatus =
  | 'development'
  | 'pre-production'
  | 'in-production'
  | 'post'
  | 'delivered'
  | 'archived';

export type ProductionDayType =
  | 'shoot'
  | 'prep'
  | 'travel'
  | 'hold'
  | 'wrap'
  | 'edit'
  | 'delivery'
  | 'custom';

export type ProductionDayStatus =
  | 'tbc'
  | 'confirmed'
  | 'tentative'
  | 'cancelled'
  | 'completed';

export interface CallSheetDefaults {
  hospital?: string;
  parking?: string;
  basecamp?: string;
  emergency?: string;
}

export interface Production {
  id: string;              // stable UUID — never changes
  prodKey: string;         // normalized projectName key (toLowerCase)
  title: string;
  clientName?: string;
  notes?: string;
  status?: ProductionStatus;
  callSheetDefaults?: CallSheetDefaults;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionDay {
  id: string;              // stable UUID
  productionId: string;
  date?: string;           // YYYY-MM-DD
  type: ProductionDayType;
  typeLabel?: string;      // custom label when type = 'custom'
  title?: string;
  phaseKey?: string;
  linkedScheduleName?: string;   // schedule blob key; patched by rename-schedule.js
  status: ProductionDayStatus;
  locationSummary?: string;
  callSheetStatus?: 'not-started' | 'draft' | 'issued';
  notes?: string;
  sortOrder: number;
}

export interface ProductionIndex {
  version: 1;
  productions: Production[];
  days: ProductionDay[];
  updatedAt: number;
}

// SaaS-ready — used as orgId: 'default' in single-tenant mode.
// Extend Netlify function keys to org/{orgId}/... when multi-tenancy is added.
export interface OrgContext {
  orgId: string;
  orgSlug: string;
}

export interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
}
