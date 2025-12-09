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

const splitCsvLine = (line: string) => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Alternar modo de comillas para preservar comas internas como parte del campo.
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
};

const REQUIRED_GIFT_HEADERS = ['categoria', 'producto', 'uds', 'costo'];

const normalizeRowLength = (headers: string[], values: string[]) => {
  if (values.length <= headers.length) return values;
  // Si la línea trae comas de miles sin comillas, las combinamos en el último campo.
  const head = values.slice(0, headers.length - 1);
  const tail = values.slice(headers.length - 1).join(',');
  return [...head, tail];
};

export type ParsedGiftsResult = {
  gifts: Gift[];
  discardedRows: number;
};

export function parseParticipantsCsv(csvText: string): Participant[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const dataLines = lines.slice(1);

  return dataLines.map((line, index) => {
    const rawValues = splitCsvLine(line);
    const values = normalizeRowLength(headers, rawValues);
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

export function parseGiftsCsv(csvText: string): ParsedGiftsResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('CSV inválido: no tiene datos.');
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  const missingHeaders = REQUIRED_GIFT_HEADERS.filter((header) => !headers.includes(header));
  const extraHeaders = headers.filter((header) => !REQUIRED_GIFT_HEADERS.includes(header));
  const isOrderInvalid =
    headers.length === REQUIRED_GIFT_HEADERS.length &&
    REQUIRED_GIFT_HEADERS.some((header, index) => headers[index] !== header);

  if (missingHeaders.length > 0 || extraHeaders.length > 0 || isOrderInvalid) {
    const structureErrors: string[] = [];

    if (missingHeaders.length > 0) {
      structureErrors.push(`Faltan columnas: ${missingHeaders.join(', ')}`);
    }

    if (extraHeaders.length > 0) {
      structureErrors.push(`Columnas extra: ${extraHeaders.join(', ')}`);
    }

    if (isOrderInvalid) {
      structureErrors.push('Estructura incorrecta: usa el template oficial.');
    }

    const message = structureErrors.length
      ? structureErrors.join(' | ')
      : 'Estructura incorrecta';

    throw new Error(message);
  }

  const dataLines = lines.slice(1);
  let discardedRows = 0;

  const gifts = dataLines.reduce<Gift[]>((acc, line, index) => {
    const rawValues = splitCsvLine(line);
    const values = normalizeRowLength(headers, rawValues);

    if (values.length !== REQUIRED_GIFT_HEADERS.length) {
      throw new Error(`Estructura incorrecta en la fila ${index + 2}.`);
    }

    const [category, prize, unitsRaw, costRaw] = values.map((value) => value?.trim() ?? '');

    if (!category || !prize || !unitsRaw || !costRaw) {
      discardedRows += 1;
      return acc;
    }

    const units = Number(unitsRaw);
    const cleanCost = costRaw.replace(/[^0-9.-]+/g, '');
    const cost = cleanCost === '' ? NaN : Number(cleanCost);

    if (!Number.isInteger(units) || units < 1) {
      throw new Error(`Tipos incorrectos en la fila ${index + 2}: uds debe ser un entero mayor o igual a 1.`);
    }

    if (!Number.isFinite(cost)) {
      throw new Error(`Tipos incorrectos en la fila ${index + 2}: costo inválido.`);
    }

    acc.push({
      id: `${index}-${category}-${prize}`,
      category,
      prize,
      unit: unitsRaw,
      cost,
    });

    return acc;
  }, []);

  return { gifts, discardedRows };
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
