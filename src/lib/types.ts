// Shared type definitions used across the data layer, matcher, and UI.

export type ItemStatus =
  | 'expected'
  | 'verified'
  | 'missing'
  | 'damaged'
  | 'wrong_item';

export type Disposition =
  | 'unassigned'
  | 'wrong_project'
  | 'other_system'
  | 'advance_delivery'
  | 'investigate'
  | 'resolved';

/** A delivery / transport list. One file = one delivery. */
export interface Delivery {
  id: string;
  name: string;
  clientName?: string;
  importedAt: number;
  sourceType: 'xlsx' | 'csv' | 'photo' | 'manual';
  status: 'open' | 'closed';
  /** Optional override regex for the drawing-number pattern on this delivery. */
  codePattern?: string;
}

/** One row on a master list. The unique row key is (drawing, spool). */
export interface MasterItem {
  id: string;
  deliveryId: string;
  drawing: string; // "Drawing no." / "Tek nr"
  spool: string; // "Spool" letter, may be ''
  isoNumber?: string;
  project?: string;
  diameter?: string;
  paintSpec?: string;
  ral?: string;
  chClean?: string;
  remark?: string;
  status: ItemStatus;
  verifiedAt?: number;
  verifiedBy?: string;
  notes?: string;
  scanId?: string;
}

/** Every scan ever performed, matched or not. Append-only log. */
export interface Scan {
  id: string;
  timestamp: number;
  deliveryId?: string;
  drawing: string;
  spool: string;
  rawText?: string;
  matchedItemId?: string;
  confidence: 'exact' | 'fuzzy' | 'partial' | 'none';
  confirmed: boolean;
}

/** Scans that didn't match the active list — never silently dropped. */
export interface UnchartedItem {
  id: string;
  scanId: string;
  deliveryId?: string;
  timestamp: number;
  drawing: string;
  spool: string;
  diameter?: string;
  paintSpec?: string;
  ral?: string;
  scopeNr?: string;
  disposition: Disposition;
  notes?: string;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface ClientMapping {
  clientName: string;
  columnMap: Record<string, string>; // standard field -> their column header
  updatedAt: number;
}

export interface AppSettings {
  language: 'en' | 'nl';
  confirmBeforeVerified: boolean;
  confirmBeforeUncharted: boolean;
  haptic: boolean;
  sound: boolean;
  matchThreshold: number; // 0..1
  autoConfirmMode: boolean;
  defaultClientName?: string;
}

export const defaultSettings: AppSettings = {
  language: 'en',
  confirmBeforeVerified: true,
  confirmBeforeUncharted: true,
  haptic: true,
  sound: false,
  matchThreshold: 0.85,
  autoConfirmMode: false,
};

/** Composite key helper. Uppercases the spool letter. */
export function composeKey(drawing: string, spool: string | undefined | null): string {
  const s = (spool ?? '').toUpperCase().trim();
  return s.length === 0 ? drawing : `${drawing}|${s}`;
}
