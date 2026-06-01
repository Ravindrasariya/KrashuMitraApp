// Copernicus Data Space Ecosystem (CDSE) Sentinel Hub client.
//
// Used by the "Plot Health Check" Digital Clinic service. Renders Sentinel-2
// vegetation-index map tiles (true color / NDVI / NDRE / NDMI) and computes
// per-lot statistics. Credentials are OAuth2 client-credentials stored as the
// secrets CDSE_CLIENT_ID / CDSE_CLIENT_SECRET (a free Copernicus Data Space
// account). All raster work happens in the CDSE cloud — we never download or
// process bands on the server (the container has very little free RAM).

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";
const CATALOG_URL =
  "https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search";

const CRS_3857 = "http://www.opengis.net/def/crs/EPSG/0/3857";

export type IndexId = "truecolor" | "ndvi" | "ndre" | "ndmi";
export const INDEX_IDS: IndexId[] = ["truecolor", "ndvi", "ndre", "ndmi"];

export class MissingCredentialsError extends Error {
  constructor() {
    super("CDSE credentials are not configured");
    this.name = "MissingCredentialsError";
  }
}

export function hasCredentials(): boolean {
  return Boolean(process.env.CDSE_CLIENT_ID && process.env.CDSE_CLIENT_SECRET);
}

// ---------------------------------------------------------------------------
// OAuth token (cached + refreshed a little before expiry)
// ---------------------------------------------------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!hasCredentials()) throw new MissingCredentialsError();
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.CDSE_CLIENT_ID as string,
    client_secret: process.env.CDSE_CLIENT_SECRET as string,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CDSE auth failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in || 600) * 1000,
  };
  return cachedToken.token;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const ORIGIN = 20037508.342789244; // half the Web Mercator extent (meters)

function lngLatTo3857(lng: number, lat: number): [number, number] {
  const x = (lng * ORIGIN) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * ORIGIN) / 180;
  return [x, y];
}

// XYZ tile -> EPSG:3857 bbox [minX, minY, maxX, maxY]
export function tileToBBox3857(z: number, x: number, y: number): [number, number, number, number] {
  const size = (2 * ORIGIN) / Math.pow(2, z);
  const minX = -ORIGIN + x * size;
  const maxX = minX + size;
  const maxY = ORIGIN - y * size;
  const minY = maxY - size;
  return [minX, minY, maxX, maxY];
}

// Square box of side `sizeM` meters centered on (lat,lng), in EPSG:3857.
export function boxBBox3857(lat: number, lng: number, sizeM: number): [number, number, number, number] {
  const [cx, cy] = lngLatTo3857(lng, lat);
  // 3857 is distorted by latitude; scale the half-side so the box is ~sizeM on
  // the ground at this latitude.
  const half = (sizeM / 2) / Math.cos((lat * Math.PI) / 180);
  return [cx - half, cy - half, cx + half, cy + half];
}

// Square box in WGS84 [minLng, minLat, maxLng, maxLat] for the Catalog API.
export function boxBBox4326(lat: number, lng: number, sizeM: number): [number, number, number, number] {
  const half = sizeM / 2;
  const dLat = half / 111320;
  const dLng = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

// ---------------------------------------------------------------------------
// Evalscripts
// ---------------------------------------------------------------------------
const CLOUD_SCL = "function isCloud(scl){return scl===3||scl===8||scl===9||scl===10||scl===11;}";

function rampHelper(): string {
  return `function ramp(v,stops){if(v<=stops[0][0])return stops[0][1];for(var i=1;i<stops.length;i++){if(v<=stops[i][0]){var v0=stops[i-1][0],c0=stops[i-1][1],v1=stops[i][0],c1=stops[i][1];var t=(v-v0)/(v1-v0);return [c0[0]+(c1[0]-c0[0])*t,c0[1]+(c1[1]-c0[1])*t,c0[2]+(c1[2]-c0[2])*t];}}return stops[stops.length-1][1];}`;
}

// Color ramp stops per index (value -> [r,g,b] in 0..1).
const RAMP_STOPS: Record<Exclude<IndexId, "truecolor">, string> = {
  ndvi: "[[-0.2,[0.66,0.66,0.66]],[0.0,[0.78,0.40,0.20]],[0.2,[0.86,0.78,0.27]],[0.4,[0.40,0.74,0.27]],[0.6,[0.16,0.55,0.16]],[0.9,[0.0,0.27,0.0]]]",
  ndre: "[[-0.2,[0.70,0.70,0.70]],[0.0,[0.90,0.85,0.40]],[0.2,[0.70,0.85,0.30]],[0.4,[0.30,0.70,0.30]],[0.6,[0.10,0.50,0.15]],[0.8,[0.0,0.30,0.05]]]",
  ndmi: "[[-0.8,[0.40,0.20,0.0]],[-0.2,[0.80,0.60,0.30]],[0.0,[0.90,0.90,0.60]],[0.2,[0.40,0.80,0.50]],[0.4,[0.10,0.50,0.80]],[0.8,[0.0,0.20,0.60]]]",
};

const INDEX_BANDS: Record<Exclude<IndexId, "truecolor">, string> = {
  ndvi: "(s.B08-s.B04)/(s.B08+s.B04+1e-10)",
  ndre: "(s.B08-s.B05)/(s.B08+s.B05+1e-10)",
  ndmi: "(s.B08-s.B11)/(s.B08+s.B11+1e-10)",
};

const INDEX_INPUTS: Record<Exclude<IndexId, "truecolor">, string> = {
  ndvi: '"B04","B08"',
  ndre: '"B05","B08"',
  ndmi: '"B08","B11"',
};

function vizEvalscript(index: IndexId): string {
  if (index === "truecolor") {
    return `//VERSION=3
function setup(){return {input:["B02","B03","B04","dataMask"],output:{bands:4}};}
function evaluatePixel(s){if(s.dataMask===0)return [0,0,0,0];var g=2.5;return [s.B04*g,s.B03*g,s.B02*g,1];}`;
  }
  const stops = RAMP_STOPS[index];
  const expr = INDEX_BANDS[index];
  const inputs = INDEX_INPUTS[index];
  return `//VERSION=3
function setup(){return {input:[${inputs},"SCL","dataMask"],output:{bands:4}};}
${CLOUD_SCL}
${rampHelper()}
function evaluatePixel(s){if(s.dataMask===0||isCloud(s.SCL))return [0,0,0,0];var v=${expr};var c=ramp(v,${stops});return [c[0],c[1],c[2],1];}`;
}

// Stats evalscript: three raw index bands + a cloud-aware dataMask.
const STATS_EVALSCRIPT = `//VERSION=3
function setup(){return {input:[{bands:["B04","B05","B08","B11","SCL","dataMask"]}],output:[{id:"indices",bands:3,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]};}
${CLOUD_SCL}
function evaluatePixel(s){var valid=(s.dataMask===1&&!isCloud(s.SCL))?1:0;var ndvi=(s.B08-s.B04)/(s.B08+s.B04+1e-10);var ndre=(s.B08-s.B05)/(s.B08+s.B05+1e-10);var ndmi=(s.B08-s.B11)/(s.B08+s.B11+1e-10);return {indices:[ndvi,ndre,ndmi],dataMask:[valid]};}`;

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

// Render a single 256x256 PNG tile for the given index at the given date.
export async function renderTile(
  index: IndexId,
  z: number,
  x: number,
  y: number,
  date: string,
): Promise<Buffer> {
  const token = await getAccessToken();
  const bbox = tileToBBox3857(z, x, y);
  const payload = {
    input: {
      bounds: { bbox, properties: { crs: CRS_3857 } },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` },
            mosaickingOrder: "leastCC",
            maxCloudCoverage: 90,
          },
        },
      ],
    },
    output: {
      width: 256,
      height: 256,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: vizEvalscript(index),
  };
  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CDSE tile failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

export interface Acquisition {
  date: string; // YYYY-MM-DD
  datetime: string; // full ISO timestamp
  cloudCover: number; // scene-level %
}

// Find the most recent acceptably-clear Sentinel-2 acquisition over the box.
// `date` is the upper bound of the search window; for a specific day pass the
// same day; for "latest clear" pass today and a wider lookbackDays.
export async function findAcquisition(
  lat: number,
  lng: number,
  sizeM: number,
  toDate: string,
  lookbackDays: number,
  maxCloud: number,
): Promise<Acquisition | null> {
  const token = await getAccessToken();
  const bbox = boxBBox4326(lat, lng, sizeM);
  const to = new Date(`${toDate}T23:59:59Z`);
  const from = new Date(to.getTime() - lookbackDays * 24 * 3600 * 1000);
  const payload = {
    collections: ["sentinel-2-l2a"],
    bbox,
    datetime: `${from.toISOString()}/${to.toISOString()}`,
    limit: 50,
    filter: `eo:cloud_cover < ${maxCloud}`,
    "filter-lang": "cql2-text",
    fields: { include: ["properties.datetime", "properties.eo:cloud_cover"], exclude: [] },
    sortby: [{ field: "properties.datetime", direction: "desc" }],
  };
  const res = await fetch(CATALOG_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CDSE catalog failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    features?: Array<{ properties: { datetime: string; "eo:cloud_cover"?: number } }>;
  };
  const feat = json.features && json.features[0];
  if (!feat) return null;
  const dt = feat.properties.datetime;
  return {
    date: dt.slice(0, 10),
    datetime: dt,
    cloudCover: Math.round((feat.properties["eo:cloud_cover"] ?? 0) * 10) / 10,
  };
}

export interface IndexStat {
  mean: number;
  min: number;
  max: number;
}

export interface LotStats {
  ndvi: IndexStat | null;
  ndre: IndexStat | null;
  ndmi: IndexStat | null;
  validFraction: number; // 0..1 fraction of cloud-free pixels in the box
}

// Per-lot mean/min/max for NDVI/NDRE/NDMI on a single date.
export async function getStats(
  lat: number,
  lng: number,
  sizeM: number,
  date: string,
): Promise<LotStats | null> {
  const token = await getAccessToken();
  const bbox = boxBBox3857(lat, lng, sizeM);
  const payload = {
    input: {
      bounds: { bbox, properties: { crs: CRS_3857 } },
      data: [{ type: "sentinel-2-l2a", dataFilter: { mosaickingOrder: "leastCC" } }],
    },
    aggregation: {
      timeRange: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` },
      aggregationInterval: { of: "P1D" },
      resx: 10,
      resy: 10,
      evalscript: STATS_EVALSCRIPT,
    },
    calculations: { indices: {} },
  };
  const res = await fetch(STATS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CDSE statistics failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{
      outputs?: {
        indices?: { bands?: Record<string, { stats?: { mean?: number; min?: number; max?: number; sampleCount?: number; noDataCount?: number } }> };
      };
    }>;
  };
  const interval = json.data && json.data[0];
  const bands = interval?.outputs?.indices?.bands;
  if (!bands) return null;

  const read = (key: string): IndexStat | null => {
    const st = bands[key]?.stats;
    if (!st || st.mean == null || !Number.isFinite(st.mean)) return null;
    return {
      mean: Math.round((st.mean as number) * 1000) / 1000,
      min: Math.round((st.min ?? 0) * 1000) / 1000,
      max: Math.round((st.max ?? 0) * 1000) / 1000,
    };
  };

  const first = bands["B0"]?.stats;
  let validFraction = 1;
  if (first && (first.sampleCount != null || first.noDataCount != null)) {
    const sample = first.sampleCount ?? 0;
    const nodata = first.noDataCount ?? 0;
    const total = sample + nodata;
    validFraction = total > 0 ? Math.round((sample / total) * 100) / 100 : 0;
  }

  const ndvi = read("B0");
  const ndre = read("B1");
  const ndmi = read("B2");
  if (!ndvi && !ndre && !ndmi) return null;
  return { ndvi, ndre, ndmi, validFraction };
}
