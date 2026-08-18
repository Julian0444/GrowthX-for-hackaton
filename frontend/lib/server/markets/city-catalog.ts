export interface MarketCity {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  hubWeight: number;
  aliases: string[];
}

// Curated geography only: coordinates and aliases let us resolve explicit
// locations returned by the providers. `hubWeight` is a small tie-breaker,
// never a substitute for query-specific evidence.
export const MARKET_CITIES: MarketCity[] = [
  { id: 'san-francisco', city: 'San Francisco', country: 'United States', countryCode: 'US', lat: 37.7749, lng: -122.4194, hubWeight: 1, aliases: ['san francisco', 'sf bay area', 'bay area', 'california'] },
  { id: 'new-york', city: 'New York', country: 'United States', countryCode: 'US', lat: 40.7128, lng: -74.006, hubWeight: 0.95, aliases: ['new york', 'nyc', 'new york city'] },
  { id: 'boston', city: 'Boston', country: 'United States', countryCode: 'US', lat: 42.3601, lng: -71.0589, hubWeight: 0.84, aliases: ['boston', 'massachusetts', 'cambridge ma'] },
  { id: 'austin', city: 'Austin', country: 'United States', countryCode: 'US', lat: 30.2672, lng: -97.7431, hubWeight: 0.82, aliases: ['austin', 'austin tx', 'texas'] },
  { id: 'seattle', city: 'Seattle', country: 'United States', countryCode: 'US', lat: 47.6062, lng: -122.3321, hubWeight: 0.88, aliases: ['seattle', 'washington state'] },
  { id: 'toronto', city: 'Toronto', country: 'Canada', countryCode: 'CA', lat: 43.6532, lng: -79.3832, hubWeight: 0.91, aliases: ['toronto', 'ontario'] },
  { id: 'vancouver', city: 'Vancouver', country: 'Canada', countryCode: 'CA', lat: 49.2827, lng: -123.1207, hubWeight: 0.82, aliases: ['vancouver', 'british columbia'] },
  { id: 'montreal', city: 'Montreal', country: 'Canada', countryCode: 'CA', lat: 45.5019, lng: -73.5674, hubWeight: 0.78, aliases: ['montreal', 'québec', 'quebec'] },
  { id: 'mexico-city', city: 'Mexico City', country: 'Mexico', countryCode: 'MX', lat: 19.4326, lng: -99.1332, hubWeight: 0.9, aliases: ['mexico city', 'ciudad de mexico', 'cdmx', 'méxico df', 'mexico df'] },
  { id: 'bogota', city: 'Bogotá', country: 'Colombia', countryCode: 'CO', lat: 4.711, lng: -74.0721, hubWeight: 0.82, aliases: ['bogota', 'bogotá'] },
  { id: 'buenos-aires', city: 'Buenos Aires', country: 'Argentina', countryCode: 'AR', lat: -34.6037, lng: -58.3816, hubWeight: 0.88, aliases: ['buenos aires', 'caba', 'argentina'] },
  { id: 'sao-paulo', city: 'São Paulo', country: 'Brazil', countryCode: 'BR', lat: -23.5505, lng: -46.6333, hubWeight: 0.94, aliases: ['sao paulo', 'são paulo', 'sp brazil'] },
  { id: 'santiago', city: 'Santiago', country: 'Chile', countryCode: 'CL', lat: -33.4489, lng: -70.6693, hubWeight: 0.79, aliases: ['santiago', 'santiago de chile'] },
  { id: 'lima', city: 'Lima', country: 'Peru', countryCode: 'PE', lat: -12.0464, lng: -77.0428, hubWeight: 0.73, aliases: ['lima', 'peru', 'perú'] },
  { id: 'london', city: 'London', country: 'United Kingdom', countryCode: 'GB', lat: 51.5072, lng: -0.1276, hubWeight: 0.98, aliases: ['london', 'greater london', 'united kingdom', 'uk'] },
  { id: 'berlin', city: 'Berlin', country: 'Germany', countryCode: 'DE', lat: 52.52, lng: 13.405, hubWeight: 0.93, aliases: ['berlin', 'germany', 'deutschland'] },
  { id: 'munich', city: 'Munich', country: 'Germany', countryCode: 'DE', lat: 48.1351, lng: 11.582, hubWeight: 0.82, aliases: ['munich', 'münchen', 'bavaria', 'bayern'] },
  { id: 'paris', city: 'Paris', country: 'France', countryCode: 'FR', lat: 48.8566, lng: 2.3522, hubWeight: 0.9, aliases: ['paris', 'île-de-france', 'ile de france'] },
  { id: 'lyon', city: 'Lyon', country: 'France', countryCode: 'FR', lat: 45.764, lng: 4.8357, hubWeight: 0.7, aliases: ['lyon', 'france - lyon'] },
  { id: 'amsterdam', city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', lat: 52.3676, lng: 4.9041, hubWeight: 0.87, aliases: ['amsterdam', 'netherlands', 'nederland'] },
  { id: 'barcelona', city: 'Barcelona', country: 'Spain', countryCode: 'ES', lat: 41.3874, lng: 2.1686, hubWeight: 0.83, aliases: ['barcelona', 'catalonia', 'catalunya'] },
  { id: 'madrid', city: 'Madrid', country: 'Spain', countryCode: 'ES', lat: 40.4168, lng: -3.7038, hubWeight: 0.81, aliases: ['madrid', 'comunidad de madrid'] },
  { id: 'lisbon', city: 'Lisbon', country: 'Portugal', countryCode: 'PT', lat: 38.7223, lng: -9.1393, hubWeight: 0.82, aliases: ['lisbon', 'lisboa', 'portugal'] },
  { id: 'stockholm', city: 'Stockholm', country: 'Sweden', countryCode: 'SE', lat: 59.3293, lng: 18.0686, hubWeight: 0.83, aliases: ['stockholm', 'sweden', 'sverige'] },
  { id: 'helsinki', city: 'Helsinki', country: 'Finland', countryCode: 'FI', lat: 60.1699, lng: 24.9384, hubWeight: 0.78, aliases: ['helsinki', 'finland', 'suomi'] },
  { id: 'warsaw', city: 'Warsaw', country: 'Poland', countryCode: 'PL', lat: 52.2297, lng: 21.0122, hubWeight: 0.77, aliases: ['warsaw', 'warszawa', 'poland', 'polska'] },
  { id: 'tallinn', city: 'Tallinn', country: 'Estonia', countryCode: 'EE', lat: 59.437, lng: 24.7536, hubWeight: 0.75, aliases: ['tallinn', 'estonia'] },
  { id: 'bucharest', city: 'Bucharest', country: 'Romania', countryCode: 'RO', lat: 44.4268, lng: 26.1025, hubWeight: 0.72, aliases: ['bucharest', 'bucuresti', 'bucurești', 'romania'] },
  { id: 'bengaluru', city: 'Bengaluru', country: 'India', countryCode: 'IN', lat: 12.9716, lng: 77.5946, hubWeight: 1, aliases: ['bengaluru', 'bangalore', 'karnataka'] },
  { id: 'hyderabad', city: 'Hyderabad', country: 'India', countryCode: 'IN', lat: 17.385, lng: 78.4867, hubWeight: 0.88, aliases: ['hyderabad', 'telangana'] },
  { id: 'pune', city: 'Pune', country: 'India', countryCode: 'IN', lat: 18.5204, lng: 73.8567, hubWeight: 0.82, aliases: ['pune', 'maharashtra'] },
  { id: 'mumbai', city: 'Mumbai', country: 'India', countryCode: 'IN', lat: 19.076, lng: 72.8777, hubWeight: 0.84, aliases: ['mumbai', 'bombay'] },
  { id: 'delhi', city: 'Delhi', country: 'India', countryCode: 'IN', lat: 28.6139, lng: 77.209, hubWeight: 0.83, aliases: ['delhi', 'new delhi', 'ncr'] },
  { id: 'singapore', city: 'Singapore', country: 'Singapore', countryCode: 'SG', lat: 1.3521, lng: 103.8198, hubWeight: 0.94, aliases: ['singapore'] },
  { id: 'tokyo', city: 'Tokyo', country: 'Japan', countryCode: 'JP', lat: 35.6762, lng: 139.6503, hubWeight: 0.94, aliases: ['tokyo', 'japan', '日本'] },
  { id: 'seoul', city: 'Seoul', country: 'South Korea', countryCode: 'KR', lat: 37.5665, lng: 126.978, hubWeight: 0.9, aliases: ['seoul', 'south korea', 'korea'] },
  { id: 'jakarta', city: 'Jakarta', country: 'Indonesia', countryCode: 'ID', lat: -6.2088, lng: 106.8456, hubWeight: 0.78, aliases: ['jakarta', 'indonesia'] },
  { id: 'ho-chi-minh-city', city: 'Ho Chi Minh City', country: 'Vietnam', countryCode: 'VN', lat: 10.8231, lng: 106.6297, hubWeight: 0.8, aliases: ['ho chi minh city', 'ho chi minh', 'saigon', 'vietnam'] },
  { id: 'manila', city: 'Manila', country: 'Philippines', countryCode: 'PH', lat: 14.5995, lng: 120.9842, hubWeight: 0.76, aliases: ['manila', 'metro manila', 'philippines'] },
  { id: 'sydney', city: 'Sydney', country: 'Australia', countryCode: 'AU', lat: -33.8688, lng: 151.2093, hubWeight: 0.88, aliases: ['sydney', 'new south wales'] },
  { id: 'melbourne', city: 'Melbourne', country: 'Australia', countryCode: 'AU', lat: -37.8136, lng: 144.9631, hubWeight: 0.84, aliases: ['melbourne', 'victoria australia'] },
  { id: 'tel-aviv', city: 'Tel Aviv', country: 'Israel', countryCode: 'IL', lat: 32.0853, lng: 34.7818, hubWeight: 0.89, aliases: ['tel aviv', 'tel-aviv', 'israel'] },
  { id: 'dubai', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', lat: 25.2048, lng: 55.2708, hubWeight: 0.82, aliases: ['dubai', 'uae', 'united arab emirates'] },
  { id: 'lagos', city: 'Lagos', country: 'Nigeria', countryCode: 'NG', lat: 6.5244, lng: 3.3792, hubWeight: 0.82, aliases: ['lagos', 'nigeria'] },
  { id: 'nairobi', city: 'Nairobi', country: 'Kenya', countryCode: 'KE', lat: -1.2921, lng: 36.8219, hubWeight: 0.76, aliases: ['nairobi', 'kenya'] },
  { id: 'cape-town', city: 'Cape Town', country: 'South Africa', countryCode: 'ZA', lat: -33.9249, lng: 18.4241, hubWeight: 0.78, aliases: ['cape town', 'western cape'] },
  { id: 'johannesburg', city: 'Johannesburg', country: 'South Africa', countryCode: 'ZA', lat: -26.2041, lng: 28.0473, hubWeight: 0.76, aliases: ['johannesburg', 'joburg', 'gauteng', 'south africa'] },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const COUNTRY_ALIASES: Record<string, string> = {
  'united states of america': 'US',
  usa: 'US',
  'united states': 'US',
  uk: 'GB',
  'united kingdom': 'GB',
  brazil: 'BR',
  brasil: 'BR',
  southkorea: 'KR',
  'south korea': 'KR',
  uae: 'AE',
};

export function cityForCountry(countryCodeOrName: string): MarketCity | null {
  const normalized = normalize(countryCodeOrName);
  const code =
    countryCodeOrName.trim().toUpperCase().length === 2
      ? countryCodeOrName.trim().toUpperCase()
      : COUNTRY_ALIASES[normalized] ??
        MARKET_CITIES.find((city) => normalize(city.country) === normalized)?.countryCode;
  if (!code) return null;
  return (
    MARKET_CITIES.filter((city) => city.countryCode === code).sort(
      (a, b) => b.hubWeight - a.hubWeight,
    )[0] ?? null
  );
}

export function resolveMarketCity(location: string): MarketCity | null {
  const normalized = normalize(location);
  if (!normalized) return null;

  const explicit = MARKET_CITIES.find((city) =>
    [city.city, ...city.aliases].some((alias) => {
      const candidate = normalize(alias);
      return candidate.length >= 3 && normalized.includes(candidate);
    }),
  );
  if (explicit) return explicit;
  return cityForCountry(location);
}

