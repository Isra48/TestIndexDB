import { Gift, Participant, Winner } from '../types';

const DB_NAME = 'giftRaffleDB';
const DB_VERSION = 1;
const WINNERS_STORE = 'winners';
const META_STORE = 'meta';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WINNERS_STORE)) {
        db.createObjectStore(WINNERS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => T | Promise<T>
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = action(store);

    transaction.oncomplete = () => resolve(result as T);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveWinners(winners: Winner[]): Promise<void> {
  await withStore(WINNERS_STORE, 'readwrite', (store) => {
    store.clear();
    winners.forEach((winner) => store.put(winner));
  });
  await withStore(META_STORE, 'readwrite', (store) => {
    store.put({ key: 'lastSavedAt', value: new Date().toISOString() });
  });
}

export async function readWinners(): Promise<Winner[]> {
  return withStore(WINNERS_STORE, 'readonly', (store) => {
    return new Promise<Winner[]>((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result as Winner[]) ?? []);
      request.onerror = () => resolve([]);
    });
  });
}

export async function readLastSavedAt(): Promise<string | undefined> {
  return withStore(META_STORE, 'readonly', (store) => {
    return new Promise<string | undefined>((resolve) => {
      const request = store.get('lastSavedAt');
      request.onsuccess = () => resolve(request.result?.value as string | undefined);
      request.onerror = () => resolve(undefined);
    });
  });
}

export async function clearDatabase(): Promise<void> {
  await withStore(WINNERS_STORE, 'readwrite', (store) => {
    store.clear();
  });
  await withStore(META_STORE, 'readwrite', (store) => {
    store.clear();
  });
}

export async function hasStoredData(): Promise<boolean> {
  const winners = await readWinners();
  return winners.length > 0;
}

export function winnersToCSV(winners: Winner[]): string {
  const header = 'name,employeeNumber,email,prize,category,cost';
  const rows = winners.map((winner) =>
    [
      JSON.stringify(winner.participant.name ?? ''),
      JSON.stringify(winner.participant.employeeNumber ?? ''),
      JSON.stringify(winner.participant.email ?? ''),
      JSON.stringify(winner.gift.prize ?? ''),
      JSON.stringify(winner.gift.category ?? ''),
      JSON.stringify(winner.gift.cost ?? ''),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export function parseParticipantsCsv(csvText: string): Participant[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const dataLines = lines.slice(1);

  return dataLines.map((line, index) => {
    const values = line.split(',').map((value) => value.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });

    const name = row['name'] ?? '';
    const email = row['email'] ?? '';
    const employeeNumber = row['employeenumber'] ?? '';

    return {
      id: `${index}-${name}`,
      name,
      employeeNumber: employeeNumber || undefined,
      email: email || undefined,
    };
  });
}

export function parseGiftsCsv(csvText: string): Gift[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const dataLines = lines.slice(1);

  return dataLines.map((line, index) => {
    const values = line.split(',').map((value) => value.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });

    const clean = (row['costo'] ?? '').replace(/[^0-9.-]+/g, '');
    const cost = clean === '' ? undefined : Number(clean);
    const category = row['categoria'] ?? '';
    const prize = row['producto'] ?? '';
    const unit = row['unidad'] ?? '';
    return {
      id: `${index}-${category}-${prize}`,
      category,
      prize,
      unit,
      cost,
    };
  });
}

export function presortWinners(participants: Participant[], gifts: Gift[]): Winner[] {
  const shuffledParticipants = [...participants].sort(() => Math.random() - 0.5);
  const shuffledGifts = [...gifts].sort(() => Math.random() - 0.5);
  const total = Math.min(shuffledParticipants.length, shuffledGifts.length);

  const selectedParticipants = shuffledParticipants.slice(0, total);
  const selectedGifts = shuffledGifts.slice(0, total);

  return selectedGifts.map((gift, index) => ({
    id: `${gift.id}-${selectedParticipants[index].id}`,
    participant: selectedParticipants[index],
    gift,
  }));
}
