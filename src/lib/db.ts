// IndexedDB layer.
//
// Reliability principles:
//   - Atomic writes inside transactions (so partial saves can't happen).
//   - Append-only scan log: every confirmed action lands here BEFORE
//     the corresponding master_items row is mutated. If the app crashes
//     mid-scan, we still know what happened.
//   - JSON export/import for full backup as a defensive measure beyond
//     IndexedDB durability.
//   - Persistent storage requested at app startup so the browser
//     doesn't evict data under low-disk pressure.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppSettings,
  ClientMapping,
  Delivery,
  MasterItem,
  Scan,
  UnchartedItem,
} from './types';
import { defaultSettings } from './types';

interface SpoolCheckDB extends DBSchema {
  deliveries: {
    key: string;
    value: Delivery;
    indexes: { 'by-importedAt': number; 'by-status': string };
  };
  master_items: {
    key: string;
    value: MasterItem;
    indexes: {
      'by-delivery': string;
      'by-key': [string, string, string]; // [deliveryId, drawing, spool]
      'by-status': string;
    };
  };
  scans: {
    key: string;
    value: Scan;
    indexes: { 'by-timestamp': number; 'by-delivery': string };
  };
  uncharted: {
    key: string;
    value: UnchartedItem;
    indexes: { 'by-delivery': string; 'by-disposition': string };
  };
  client_mappings: {
    key: string; // clientName
    value: ClientMapping;
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'spool-check';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SpoolCheckDB>> | null = null;

function getDB(): Promise<IDBPDatabase<SpoolCheckDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SpoolCheckDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const deliveries = db.createObjectStore('deliveries', { keyPath: 'id' });
        deliveries.createIndex('by-importedAt', 'importedAt');
        deliveries.createIndex('by-status', 'status');

        const items = db.createObjectStore('master_items', { keyPath: 'id' });
        items.createIndex('by-delivery', 'deliveryId');
        items.createIndex('by-key', ['deliveryId', 'drawing', 'spool'], {
          unique: true,
        });
        items.createIndex('by-status', 'status');

        const scans = db.createObjectStore('scans', { keyPath: 'id' });
        scans.createIndex('by-timestamp', 'timestamp');
        scans.createIndex('by-delivery', 'deliveryId');

        const uncharted = db.createObjectStore('uncharted', { keyPath: 'id' });
        uncharted.createIndex('by-delivery', 'deliveryId');
        uncharted.createIndex('by-disposition', 'disposition');

        db.createObjectStore('client_mappings', { keyPath: 'clientName' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

/** Ask the browser to keep this site's storage even under disk pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function loadSettings(): Promise<AppSettings> {
  const db = await getDB();
  const tx = db.transaction('settings', 'readonly');
  const rows = await tx.store.getAll();
  await tx.done;
  const result: AppSettings = { ...defaultSettings };
  for (const row of rows) {
    if (row.key in result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[row.key] = row.value;
    }
  }
  return result;
}

export async function saveSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: key as string, value });
}

// ---------------------------------------------------------------------------
// Deliveries + master items
// ---------------------------------------------------------------------------

export async function listDeliveries(): Promise<Delivery[]> {
  const db = await getDB();
  const all = await db.getAll('deliveries');
  return all.sort((a, b) => b.importedAt - a.importedAt);
}

export async function getDelivery(id: string): Promise<Delivery | undefined> {
  return (await getDB()).get('deliveries', id);
}

export async function createDelivery(
  delivery: Delivery,
  items: MasterItem[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['deliveries', 'master_items'], 'readwrite');
  await tx.objectStore('deliveries').put(delivery);
  for (const item of items) {
    await tx.objectStore('master_items').put(item);
  }
  await tx.done;
}

export async function deleteDelivery(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['deliveries', 'master_items', 'scans', 'uncharted'],
    'readwrite',
  );
  await tx.objectStore('deliveries').delete(id);
  // Cascade-delete related rows.
  for (const store of ['master_items', 'scans', 'uncharted'] as const) {
    const idx = tx.objectStore(store).index('by-delivery');
    let cursor = await idx.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function listItems(deliveryId: string): Promise<MasterItem[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('master_items', 'by-delivery', deliveryId);
  // Stable sort: drawing then spool.
  return all.sort((a, b) => {
    const c = a.drawing.localeCompare(b.drawing);
    return c !== 0 ? c : a.spool.localeCompare(b.spool);
  });
}

export async function setItemStatus(
  itemId: string,
  status: MasterItem['status'],
  scanId?: string,
  notes?: string,
): Promise<MasterItem | undefined> {
  const db = await getDB();
  const tx = db.transaction('master_items', 'readwrite');
  const item = await tx.store.get(itemId);
  if (!item) {
    await tx.done;
    return undefined;
  }
  item.status = status;
  if (status === 'verified') {
    item.verifiedAt = Date.now();
    if (scanId) item.scanId = scanId;
  } else {
    item.verifiedAt = undefined;
    item.scanId = undefined;
  }
  if (notes !== undefined) item.notes = notes;
  await tx.store.put(item);
  await tx.done;
  return item;
}

export async function findItemByKey(
  deliveryId: string,
  drawing: string,
  spool: string,
): Promise<MasterItem | undefined> {
  const db = await getDB();
  return db.getFromIndex('master_items', 'by-key', [
    deliveryId,
    drawing,
    spool.toUpperCase(),
  ]);
}

/** All rows for a drawing — used for partial-match spool picker UI. */
export async function findItemsByDrawing(
  deliveryId: string,
  drawing: string,
): Promise<MasterItem[]> {
  const items = await listItems(deliveryId);
  return items.filter((i) => i.drawing === drawing);
}

// ---------------------------------------------------------------------------
// Scans + Uncharted
// ---------------------------------------------------------------------------

export async function appendScan(scan: Scan): Promise<void> {
  await (await getDB()).put('scans', scan);
}

export async function listScans(deliveryId?: string): Promise<Scan[]> {
  const db = await getDB();
  if (deliveryId) {
    return db.getAllFromIndex('scans', 'by-delivery', deliveryId);
  }
  return db.getAll('scans');
}

export async function appendUncharted(item: UnchartedItem): Promise<void> {
  await (await getDB()).put('uncharted', item);
}

export async function listUncharted(deliveryId?: string): Promise<UnchartedItem[]> {
  const db = await getDB();
  if (deliveryId) {
    return db.getAllFromIndex('uncharted', 'by-delivery', deliveryId);
  }
  return db.getAll('uncharted');
}

export async function setUnchartedDisposition(
  id: string,
  disposition: UnchartedItem['disposition'],
  notes?: string,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('uncharted', 'readwrite');
  const row = await tx.store.get(id);
  if (row) {
    row.disposition = disposition;
    if (notes !== undefined) row.notes = notes;
    if (disposition === 'resolved') row.resolvedAt = Date.now();
    await tx.store.put(row);
  }
  await tx.done;
}

// ---------------------------------------------------------------------------
// Client mappings
// ---------------------------------------------------------------------------

export async function saveClientMapping(mapping: ClientMapping): Promise<void> {
  await (await getDB()).put('client_mappings', mapping);
}

export async function listClientMappings(): Promise<ClientMapping[]> {
  return (await getDB()).getAll('client_mappings');
}

export async function getClientMapping(
  clientName: string,
): Promise<ClientMapping | undefined> {
  return (await getDB()).get('client_mappings', clientName);
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

export interface BackupBlob {
  exportedAt: number;
  version: 1;
  deliveries: Delivery[];
  master_items: MasterItem[];
  scans: Scan[];
  uncharted: UnchartedItem[];
  client_mappings: ClientMapping[];
  settings: { key: string; value: unknown }[];
}

export async function exportBackup(): Promise<BackupBlob> {
  const db = await getDB();
  const [deliveries, items, scans, uncharted, mappings, settings] =
    await Promise.all([
      db.getAll('deliveries'),
      db.getAll('master_items'),
      db.getAll('scans'),
      db.getAll('uncharted'),
      db.getAll('client_mappings'),
      db.getAll('settings'),
    ]);
  return {
    exportedAt: Date.now(),
    version: 1,
    deliveries,
    master_items: items,
    scans,
    uncharted,
    client_mappings: mappings,
    settings,
  };
}

export async function importBackup(blob: BackupBlob): Promise<void> {
  if (blob.version !== 1) {
    throw new Error(`Unsupported backup version: ${blob.version}`);
  }
  const db = await getDB();
  const tx = db.transaction(
    ['deliveries', 'master_items', 'scans', 'uncharted', 'client_mappings', 'settings'],
    'readwrite',
  );
  for (const d of blob.deliveries) await tx.objectStore('deliveries').put(d);
  for (const i of blob.master_items) await tx.objectStore('master_items').put(i);
  for (const s of blob.scans) await tx.objectStore('scans').put(s);
  for (const u of blob.uncharted) await tx.objectStore('uncharted').put(u);
  for (const m of blob.client_mappings) await tx.objectStore('client_mappings').put(m);
  for (const setting of blob.settings) await tx.objectStore('settings').put(setting);
  await tx.done;
}
