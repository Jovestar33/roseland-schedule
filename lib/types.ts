// Wire-compatible with original app's makeRow() and getMeta() data model.
// These shapes are stored in Netlify Blobs and must not change without a migration.

// Optional structured sub-location attached to a row. The plain-text `loc` field
// on the row remains the primary location for display and print; locationDetails
// is supplementary. Old schedules without this field behave exactly as before.
export interface SubLocation {
  id: string;        // short random ID — stable React key, not a blob key
  name: string;
  address: string;   // formatted address from geocodePlace()
  lat: number | null;
  lng: number | null;
  mapsUrl: string;   // Google Maps direction URL constructed from lat/lng
  notes: string;
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
  locationDetails?: SubLocation[]; // absent on old schedules — treated as undefined
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
