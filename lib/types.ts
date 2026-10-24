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
  name?: string;    // short display name — absent on old schedules
  address?: string; // full address — absent on old schedules
}

export interface ScheduleRow {
  action: string;
  otherText: string;
  desc: string;
  loc: string;
  locLat: number | null;
  locLng: number | null;
  locName?: string;    // short display name — absent on old schedules
  locAddress?: string; // full address — absent on old schedules
  notes: string;
  cast?: string; // Preserve legacy cast notes separately from general notes.
  keyInstruction?: string; // Explicit essential information; always printed inline.
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
  timeInDay?: number; // Offset from the shoot date; also retained for computed starts.
  fixedOutDay?: number; // Explicit date of a fixed finish.
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

export type ProductionContactType = 'crew' | 'cast' | 'client' | 'location' | 'other';
export interface ProductionContact {
  id: string;
  type: ProductionContactType;
  name: string;
  role: string;
  phone: string;
  email: string;
  callTime: string;
  makeupTime?: string;
  readyTime?: string;
  releaseTime?: string;
  pickup?: string;
  availability?: string;

  directoryScope?: 'organization' | 'production' | 'phase';
  directoryLabel?: string;
  department?: string;
  company?: string;
  reportTo?: string;
  notes?: string;
}
export interface CallSheetData {
  reportLocation?: string;
  reportInstructions?: string;
  primaryContact?: string;
  primaryPhone?: string;
  crewCall?: string;
  firstShot?: string;
  mealTime?: string;
  estimatedWrap?: string;
  timeZone?: string;
  mealLocation?: string;
  mealContact?: string;
  mealHeadcount?: string;
  departmentNotes?: string;
  walkieChannels?: string;
  preparedBy?: string;
  revisionNotes?: string;

  productionOffice?: string;
  hospitalPhone?: string;
  hospitalNotes?: string;
  advanceSchedule?: string;
  basecamp?: string;
  parking?: string;
  hospital?: string;
  emergency?: string;
  mealNotes?: string;
  safetyNotes?: string;
  specialInstructions?: string;
  notes?: string;
}

export interface TimingSettings { mode: 'flexible'; between: 'backward' | 'forward' }

export interface ScheduleMeta {
  timing?: TimingSettings;
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
  productionContacts?: ProductionContact[];
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
