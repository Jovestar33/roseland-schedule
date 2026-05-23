// Actions list — order and values must match original app exactly.
// The blank string at index 0 renders as the default "no action selected" option.
export const ACTIONS = [
  '',
  'Crew Call',
  'Cast Call',
  'Briefing / Meeting',
  'Breakfast',
  'Move to Location',
  'Set Up',
  'Move / Set Up',
  'Shoot',
  'Tear Down / Pack Up',
  'Move',
  'LUNCH',
  'Dinner',
  'WRAP',
  'Move to Hotel',
  'Drive to Next Town',
  'Location Scout',
  'Time Off',
  'Rest of Day Off',
  'Day Off',
  'Drive Home',
  'Other',
] as const;

export type Action = (typeof ACTIONS)[number];

export const DEFAULT_ROW_ACTION = 'Move / Set Up';

// CMS-configurable brand color tokens (keys must match CSS custom property names in base.css)
export const CMS_COLORS = [
  { key: '--pink',      def: '#e91e8c' },
  { key: '--pink-dark', def: '#9d1468' },
  { key: '--pink-light',def: '#f472b6' },
  { key: '--black',     def: '#111111' },
  { key: '--row-even',  def: '#fdf4f9' },
  { key: '--row-hover', def: '#fce7f3' },
  { key: '--g100',      def: '#f4f4f5' },
] as const;

// CMS-configurable per-action color classes (cls must match CSS class names in mobile.css)
export const CMS_ACTION_STYLES = [
  { cls: 'aShoot',     defBg: '#fce7f3', defText: '#9d1468' },
  { cls: 'aLunch',     defBg: '#fef9c3', defText: '#854d0e' },
  { cls: 'aDinner',    defBg: '#fff1f2', defText: '#9f1239' },
  { cls: 'aWrap',      defBg: '#dcfce7', defText: '#166534' },
  { cls: 'aDayOff',    defBg: '#f0fdf4', defText: '#15803d' },
  { cls: 'aDrive',     defBg: '#eff6ff', defText: '#1d4ed8' },
  { cls: 'aMove',      defBg: '#f5f3ff', defText: '#6d28d9' },
  { cls: 'aCrewCall',  defBg: '#fff7ed', defText: '#c2410c' },
  { cls: 'aBreakfast', defBg: '#fefce8', defText: '#a16207' },
  { cls: 'aBreak',     defBg: '#f0fdf4', defText: '#166534' },
  { cls: 'aSetup',     defBg: '#faf5ff', defText: '#7e22ce' },
  { cls: 'aOther',     defBg: '#f1f5f9', defText: '#475569' },
] as const;

// Maps action string values to CSS class names for row coloring
export const ACTION_CLASS_MAP: Record<string, string> = {
  'Shoot':               'aShoot',
  'LUNCH':               'aLunch',
  'Dinner':              'aDinner',
  'WRAP':                'aWrap',
  'Day Off':             'aDayOff',
  'Rest of Day Off':     'aDayOff',
  'Time Off':            'aDayOff',
  'Drive to Next Town':  'aDrive',
  'Drive Home':          'aDrive',
  'Move':                'aMove',
  'Move to Location':    'aMove',
  'Move to Hotel':       'aMove',
  'Move / Set Up':       'aMove',
  'Crew Call':           'aCrewCall',
  'Cast Call':           'aCrewCall',
  'Breakfast':           'aBreakfast',
  'Set Up':              'aSetup',
  'Tear Down / Pack Up': 'aSetup',
  'Other':               'aOther',
};

// localStorage/sessionStorage keys — identical to original for cross-session compatibility
export const AUTH_TOKEN_KEY           = 'rp_sched_editor_token_v16';
export const LS_CREW_KEY              = 'rp_crew';
export const LS_SCHED_KEY             = 'rp_scheds';
export const LS_QUEUE_KEY             = 'rp_sched_queue';
export const LS_SNAP_KEY              = 'rp_sched_snaps';
export const LS_SYNC_META_KEY         = 'rp_sync_meta';
export const LS_DELETE_TOMBSTONES_KEY = 'rp_sched_deleted';
export const LS_LIBRARY_META_KEY      = 'rp_library_meta_v1';
export const LS_TEMPLATES_KEY         = 'rp_tpls';

export const UNDO_LIMIT               = 80;
export const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_ROW_COUNT        = 10;
