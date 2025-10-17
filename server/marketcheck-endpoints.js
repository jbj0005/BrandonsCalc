export const MARKETCHECK_ENDPOINTS = {
  searchActive: {
    path: "/search/car/active",
    buildParams({
      vin,
      zip,
      radius,
      rows = 25,
      start = 0,
      sortBy = "price",
    } = {}) {
      const params = {
        vin,
        rows,
        start,
        sort_by: sortBy,
      };
      if (zip) params.zip = zip;
      if (Number.isFinite(radius) && radius > 0) params.radius = radius;
      return params;
    },
  },
  searchFsboActive: {
    path: "/search/car/fsbo/active",
    buildParams({
      vin,
      zip,
      radius,
      rows = 25,
      start = 0,
      sortBy = "price",
    } = {}) {
      const params = {
        vin,
        rows,
        start,
        sort_by: sortBy,
      };
      if (zip) params.zip = zip;
      if (Number.isFinite(radius) && radius > 0) params.radius = radius;
      return params;
    },
  },
  searchAutoComplete: {
    path: "/search/car/auto-complete",
    buildParams({ term, latitude, longitude, radius, rows = 25 } = {}) {
      const params = { term, rows };
      if (latitude != null) params.latitude = latitude;
      if (longitude != null) params.longitude = longitude;
      if (Number.isFinite(radius) && radius > 0) params.radius = radius;
      return params;
    },
  },
  searchHistorical: {
    path: "/search/car/historical",
    buildParams({
      vin,
      radius,
      rows = 50,
      start = 0,
      sortBy = "last_seen_at",
    } = {}) {
      const params = {
        vin,
        rows,
        start,
        sort_by: sortBy,
      };
      if (Number.isFinite(radius) && radius > 0) params.radius = radius;
      return params;
    },
  },
  listingById: {
    buildPath({ id }) {
      if (!id) return null;
      return `/listing/car/${encodeURIComponent(id)}`;
    },
  },
  vinSummary: {
    buildPath({ vin }) {
      if (!vin) return null;
      return `/vin/${encodeURIComponent(vin)}/summary`;
    },
  },
  vinSpecs: {
    buildPath({ vin }) {
      if (!vin) return null;
      return `/vin/${encodeURIComponent(vin)}/specs`;
    },
  },
  historyByVin: {
    buildPath({ vin }) {
      if (!vin) return null;
      return `/history/car/${encodeURIComponent(vin)}`;
    },
  },
};

export const VIN_SEARCH_ORDER = [
  {
    endpoint: "searchActive",
    description: "active listings (zip-aware)",
    condition: ({ zip }) => Boolean(zip),
    params: ({ vin, zip, radius }) =>
      MARKETCHECK_ENDPOINTS.searchActive.buildParams({
        vin,
        zip,
        radius,
        sortBy: "dist",
      }),
  },
  {
    endpoint: "searchActive",
    description: "active listings (nationwide)",
    params: ({ vin, radius }) =>
      MARKETCHECK_ENDPOINTS.searchActive.buildParams({
      vin,
      radius,
      zip: undefined,
      sortBy: "price",
    }),
  },
  {
    endpoint: "searchFsboActive",
    description: "private seller listings",
    params: ({ vin, zip, radius }) =>
      MARKETCHECK_ENDPOINTS.searchFsboActive.buildParams({
        vin,
        zip,
        radius,
        sortBy: zip ? "dist" : "price",
      }),
  },
  {
    endpoint: "searchHistorical",
    description: "historical listings",
    params: ({ vin, radius }) =>
      MARKETCHECK_ENDPOINTS.searchHistorical.buildParams({
        vin,
        radius,
        sortBy: "last_seen_at",
      }),
  },
];

export const VIN_ENRICHMENT_ENDPOINTS = [
  {
    endpoint: "vinSummary",
    description: "VIN summary",
  },
  {
    endpoint: "vinSpecs",
    description: "VIN specs",
  },
  {
    endpoint: "historyByVin",
    description: "VIN history",
  },
];
