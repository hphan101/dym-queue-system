export interface Province {
  name: string;
  name_with_type: string;
  code: string;
}

export interface Ward {
  name: string;
  name_with_type: string;
  code: string;
  parent_code: string;
}

let provincesPromise: Promise<Province[]> | null = null;
let occupationsPromise: Promise<string[]> | null = null;
const wardCache = new Map<string, Promise<Ward[]>>();

export function loadOccupations(): Promise<string[]> {
  if (!occupationsPromise) {
    occupationsPromise = fetch('/data/occupations.json')
      .then(async (res) => {
        if (!res.ok) throw new Error('OCCUPATIONS_UNAVAILABLE');
        return (await res.json()) as string[];
      })
      .catch((err) => {
        occupationsPromise = null;
        throw err;
      });
  }
  return occupationsPromise;
}

export function loadProvinces(): Promise<Province[]> {
  if (!provincesPromise) {
    provincesPromise = fetch('/data/provinces.json')
      .then(async (res) => {
        if (!res.ok) throw new Error('PROVINCES_UNAVAILABLE');
        const data = (await res.json()) as Record<string, Province>;
        return Object.values(data).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      })
      .catch((err) => {
        provincesPromise = null;
        throw err;
      });
  }
  return provincesPromise;
}

export function loadWardsForProvince(provinceCode: string): Promise<Ward[]> {
  if (!provinceCode) return Promise.resolve([]);
  const cached = wardCache.get(provinceCode);
  if (cached) return cached;

  const fetchPromise = fetch(`/data/wards/${provinceCode}.json`)
    .then(async (res) => {
      if (!res.ok) throw new Error('WARDS_UNAVAILABLE');
      const list = (await res.json()) as Ward[];
      return list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    })
    .catch((err) => {
      wardCache.delete(provinceCode);
      throw err;
    });

  wardCache.set(provinceCode, fetchPromise);
  return fetchPromise;
}
