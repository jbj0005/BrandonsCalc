const MIN_CREDIT_SCORE = 300;
const MAX_CREDIT_SCORE = 850;
const DOC_WRITE_TAG_RE =
  /document\.write\((['"`])([\s\S]*?)\1\.tagReplace\(\)\s*\);?/gi;

function decodeBasicEntities(value) {
  if (!value) return "";
  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeTokenForDedup(token) {
  return token.replace(/^[^A-Za-z0-9*]+|[^A-Za-z0-9*]+$/g, "").toLowerCase();
}

function chooseToken(firstToken, secondToken) {
  const closingPunctRe = /[)\]\}]/;
  if (closingPunctRe.test(secondToken) && !closingPunctRe.test(firstToken)) {
    return secondToken;
  }
  return firstToken;
}

function collapseDuplicateSequences(text) {
  const tokens = text.split(" ").filter(Boolean);
  const result = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    const maxSpan = Math.min(6, Math.floor((tokens.length - i) / 2));
    for (let span = maxSpan; span >= 1; span--) {
      let same = true;
      for (let j = 0; j < span; j++) {
        if (
          normalizeTokenForDedup(tokens[i + j]) !==
          normalizeTokenForDedup(tokens[i + span + j])
        ) {
          same = false;
          break;
        }
      }
      if (same) {
        for (let j = 0; j < span; j++) {
          const firstToken = tokens[i + j];
          const secondToken = tokens[i + span + j];
          result.push(chooseToken(firstToken, secondToken));
        }
        i += span * 2;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push(tokens[i]);
      i += 1;
    }
  }
  return result.join(" ");
}

function cleanRateText(value) {
  if (value == null) return "";
  let text = String(value);
  if (!text) return "";
  text = text.replace(DOC_WRITE_TAG_RE, (_, __, inner) => {
    const decoded = decodeBasicEntities(inner).replace(/\u00a0/g, " ");
    return decoded ? ` ${decoded} ` : " ";
  });
  text = decodeBasicEntities(text).replace(/\u00a0/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  text = collapseDuplicateSequences(text);
  return text.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}

function normalizeCondition(value) {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("used")) return "used";
  if (raw.includes("pre")) return "used";
  return "new";
}

function formatEffectiveDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeCreditRange(minRaw, maxRaw) {
  let min = toNumber(minRaw);
  let max = toNumber(maxRaw);
  if (!Number.isFinite(min)) min = MIN_CREDIT_SCORE;
  if (!Number.isFinite(max)) max = MAX_CREDIT_SCORE;
  min = Math.max(MIN_CREDIT_SCORE, Math.round(min));
  max = Math.min(MAX_CREDIT_SCORE, Math.round(max));
  if (max < min) {
    return {
      min: MIN_CREDIT_SCORE,
      max: MAX_CREDIT_SCORE,
    };
  }
  return { min, max };
}

function buildTermLabel({ termMin, termMax, explicitLabel }) {
  if (explicitLabel && explicitLabel.trim()) {
    return cleanRateText(explicitLabel);
  }
  if (termMin === termMax) {
    return `${termMin} mos.`;
  }
  return `${termMin}-${termMax} mos.`;
}

function deriveProgramLabel({ creditTierLabel, creditTier, fallback }) {
  const label = cleanRateText(creditTierLabel);
  if (label) {
    return label;
  }
  const tier = cleanRateText(creditTier);
  if (tier) {
    return tier;
  }
  return cleanRateText(fallback) || "";
}

function normalizeRateRow(row, provider, datasetEffectiveAt) {
  const termMin = toNumber(row?.term_range_min);
  const termMax = toNumber(row?.term_range_max);
  const aprPercent = toNumber(row?.apr_percent);
  if (!Number.isFinite(termMin) || !Number.isFinite(termMax)) return null;
  if (!Number.isFinite(aprPercent)) return null;

  const { min: creditScoreMin, max: creditScoreMax } = normalizeCreditRange(
    row?.credit_score_min,
    row?.credit_score_max
  );
  const vehicleCondition = normalizeCondition(
    row?.vehicle_condition ?? row?.loan_type
  );
  const termLabel = buildTermLabel({
    termMin,
    termMax,
    explicitLabel: row?.term_label,
  });
  const programLabel = deriveProgramLabel({
    creditTierLabel: row?.credit_tier_label,
    creditTier: row?.credit_tier,
    fallback: provider?.longName ?? provider?.shortName ?? provider?.source,
  });
  const effectiveAt = row?.effective_at ?? datasetEffectiveAt ?? null;

  return {
    providerId: provider?.id ?? null,
    providerSource: provider?.source ?? null,
    vehicleCondition,
    termMin,
    termMax,
    termLabel,
    creditScoreMin,
    creditScoreMax,
    aprPercent,
    programLabel,
    creditTier: row?.credit_tier ?? "",
    effectiveAt,
  };
}

function detectCreditBanding(rates) {
  if (!Array.isArray(rates)) return false;
  const seenByBucket = new Map();
  let banded = false;
  for (const rate of rates) {
    const key = `${rate.vehicleCondition}|${rate.termMin}|${rate.termMax}`;
    const rangeKey = `${rate.creditScoreMin}-${rate.creditScoreMax}`;
    if (!seenByBucket.has(key)) {
      seenByBucket.set(key, new Set([rangeKey]));
    } else {
      const ranges = seenByBucket.get(key);
      if (!ranges.has(rangeKey)) {
        ranges.add(rangeKey);
        banded = true;
      }
    }
    if (
      rate.creditScoreMin > MIN_CREDIT_SCORE ||
      rate.creditScoreMax < MAX_CREDIT_SCORE
    ) {
      banded = true;
    }
  }
  return banded;
}

function normalizeRates(rows, provider) {
  const list = Array.isArray(rows) ? rows : [];
  const latestEffective = list.reduce((acc, row) => {
    const effective = row?.effective_at;
    if (!effective) return acc;
    if (!acc || effective > acc) return effective;
    return acc;
  }, null);
  const filtered = latestEffective
    ? list.filter((row) => row?.effective_at === latestEffective)
    : list;

  const normalized = filtered
    .map((row) => normalizeRateRow(row, provider, latestEffective))
    .filter(Boolean);

  return {
    rates: normalized,
    effectiveAt: latestEffective ?? null,
    isCreditBanded: detectCreditBanding(normalized),
  };
}

function selectBestApr(matches) {
  if (!Array.isArray(matches) || !matches.length) return null;
  return matches.reduce((best, candidate) =>
    candidate.aprPercent < best.aprPercent ? candidate : best
  );
}

export function matchProgram(cacheLike, criteria = {}) {
  const cache = cacheLike ?? {};
  const rates = Array.isArray(cache.rates) ? cache.rates : [];
  if (!rates.length) {
    return { status: "noRates" };
  }

  const rawTerm = criteria.term;
  const parsedTerm = toNumber(rawTerm);
  const numericTerm = Number.isFinite(parsedTerm)
    ? Math.round(parsedTerm)
    : null;
  if (!Number.isFinite(numericTerm) || numericTerm <= 0) {
    return { status: "invalidTerm" };
  }

  const condition = criteria.condition
    ? normalizeCondition(criteria.condition)
    : null;
  const parsedScore = toNumber(criteria.creditScore);
  const creditScore = Number.isFinite(parsedScore)
    ? Math.round(parsedScore)
    : null;

  const eligibleByCondition = rates.filter((rate) => {
    if (condition && rate.vehicleCondition !== condition) return false;
    return numericTerm >= rate.termMin && numericTerm <= rate.termMax;
  });
  if (!eligibleByCondition.length) {
    return { status: "noMatch" };
  }

  if (cache.isCreditBanded && creditScore == null) {
    return { status: "needsCreditScore", matches: eligibleByCondition };
  }

  const eligibleByScore =
    creditScore == null
      ? eligibleByCondition
      : eligibleByCondition.filter(
          (rate) =>
            creditScore >= rate.creditScoreMin &&
            creditScore <= rate.creditScoreMax
        );

  if (!eligibleByScore.length) {
    return { status: "noMatchForScore", matches: eligibleByCondition };
  }

  const match = selectBestApr(eligibleByScore);
  if (!match) {
    return { status: "noMatch", matches: eligibleByCondition };
  }

  return { status: "matched", match };
}

function providerKeyFromInput(providerOrId) {
  if (!providerOrId) return null;
  if (typeof providerOrId === "string") {
    return providerOrId.toLowerCase();
  }
  if (typeof providerOrId === "object") {
    if (providerOrId.id) return String(providerOrId.id).toLowerCase();
    if (providerOrId.source) return String(providerOrId.source).toLowerCase();
  }
  return null;
}

export function createRatesEngine({ supabase } = {}) {
  const cacheByProvider = new Map();

  function getCache(provider) {
    const key = providerKeyFromInput(provider);
    if (!key) return null;
    if (!cacheByProvider.has(key)) {
      cacheByProvider.set(key, {
        provider,
        rates: [],
        effectiveAt: null,
        lastError: null,
        isCreditBanded: false,
        loadingPromise: null,
      });
    }
    const cache = cacheByProvider.get(key);
    if (!cache.provider && typeof provider === "object") {
      cache.provider = provider;
    }
    return cache;
  }

  async function ensureRates(provider, { reload = false } = {}) {
    const cache = getCache(provider);
    if (!cache) {
      return {
        provider,
        rates: [],
        effectiveAt: null,
        lastError: new Error("Invalid provider"),
        isCreditBanded: false,
      };
    }
    if (!reload && cache.rates.length && !cache.lastError) {
      return cache;
    }
    if (!supabase) {
      cache.rates = [];
      cache.effectiveAt = null;
      cache.lastError = new Error("Supabase client unavailable");
      cache.isCreditBanded = false;
      return cache;
    }
    if (cache.loadingPromise && !reload) {
      return cache.loadingPromise;
    }

    const providerMeta =
      typeof provider === "object" && provider
        ? provider
        : cache.provider ?? null;
    const source = providerMeta?.source;
    if (!source) {
      cache.rates = [];
      cache.effectiveAt = null;
      cache.lastError = new Error("Provider missing source");
      cache.isCreditBanded = false;
      return cache;
    }

    const query = supabase
      .from("auto_rates")
      .select(
        "loan_type, vehicle_condition, term_range_min, term_range_max, term_label, credit_score_min, credit_score_max, apr_percent, base_apr_percent, apr_adjustment, credit_tier, credit_tier_label, effective_at"
      )
      .eq("source", source)
      .order("effective_at", { ascending: false, nullsFirst: false })
      .order("term_range_min", { ascending: true })
      .order("credit_score_min", { ascending: false });

    const loadingPromise = query
      .then(({ data, error }) => {
        if (error) throw error;
        const { rates, effectiveAt, isCreditBanded } = normalizeRates(
          Array.isArray(data) ? data : [],
          providerMeta
        );
        cache.rates = rates;
        cache.effectiveAt = effectiveAt;
        cache.lastError = null;
        cache.isCreditBanded = isCreditBanded;
        cache.provider = providerMeta;
        return cache;
      })
      .catch((error) => {
        cache.rates = [];
        cache.effectiveAt = null;
        cache.lastError = error;
        cache.isCreditBanded = false;
        throw error;
      })
      .finally(() => {
        cache.loadingPromise = null;
      });

    cache.loadingPromise = loadingPromise;
    return loadingPromise;
  }

  async function matchProgramForProvider(provider, criteria = {}) {
    const cache = await ensureRates(provider);
    return matchProgram(cache, criteria);
  }

  async function applyProviderRate(provider, criteria = {}) {
    let cache;
    try {
      cache = await ensureRates(provider);
    } catch (error) {
      return {
        status: "error",
        provider: (typeof provider === "object" && provider) || null,
        error,
      };
    }
    if (!Array.isArray(cache.rates) || !cache.rates.length) {
      return {
        status: cache.lastError ? "error" : "noRates",
        provider: cache.provider ?? provider,
        error: cache.lastError ?? null,
      };
    }

    const result = matchProgram(cache, criteria);
    if (result.status !== "matched") {
      return {
        ...result,
        provider: cache.provider ?? provider,
        effectiveAt: cache.effectiveAt ?? null,
      };
    }

    const match = result.match;
    const providerMeta = cache.provider ?? provider ?? {};
    const aprDecimal = Math.max(match.aprPercent / 100, 0);
    const effectiveAt =
      match.effectiveAt ?? cache.effectiveAt ?? providerMeta.effectiveAt ?? null;
    const shortName =
      providerMeta.shortName || providerMeta.longName || providerMeta.source;
    const labelParts = [shortName];
    if (
      match.programLabel &&
      match.programLabel.trim() &&
      (!shortName ||
        match.programLabel.trim().toLowerCase() !== shortName.toLowerCase())
    ) {
      labelParts.push(match.programLabel.trim());
    }
    const prefix = labelParts.filter(Boolean).join(" ");
    const effectiveSuffix = effectiveAt
      ? ` (effective ${formatEffectiveDate(effectiveAt)})`
      : "";
    const note = `${prefix} ${match.termLabel}: ${match.aprPercent.toFixed(
      2
    )}%${effectiveSuffix}`.replace(/\s+/g, " ");

    return {
      status: "matched",
      aprDecimal,
      note,
      match,
      provider: providerMeta,
      effectiveAt,
    };
  }

  return {
    ensureRates,
    matchProgram: matchProgramForProvider,
    applyProviderRate,
  };
}
