/**
 * Payment → category inference.
 *
 * Used offline on-device and on spentd-api so both stay aligned.
 * Order: strip payment rails → merchant-first rules → full text → direction heuristics.
 */

export type CategorySlug =
  | "food"
  | "travel"
  | "shopping"
  | "bills"
  | "transfer"
  | "entertainment"
  | "health"
  | "other";

export type CategorizeDirection = "debit" | "credit";

export type CategorizeInput = {
  merchant?: string | null;
  direction?: CategorizeDirection | null;
  rawText?: string | null;
  notes?: string | null;
  amount?: string | null;
};

export type CategorizeConfidence = "high" | "medium" | "low";

export type CategorizeResult = {
  slug: CategorySlug;
  confidence: CategorizeConfidence;
  /** Where the decision came from. */
  source: "rules" | "heuristic";
  /** Human-readable reason for debugging / UI. */
  reason: string;
};

const RAIL_NOISE =
  /\b(phonepe|phone\s*pe|gpay|google\s*pay|paytm|bhim|upi|imps|neft|rtgs|cred\b|mobikwik|freecharge|amazon\s*pay|bharatpe|whatsapp\s*pay|navi|slice|jupiter|fi\s*money)\b/gi;

const NOISE_PHRASES =
  /\b(debited|credited|spent|paid|payment|txn|transaction|a\/c|account|avl\s*bal|available\s*balance|rs\.?|inr|ref\s*no|utr|vpa|@ok(icici|hdfc|sbi|axis|yesbank)?)\b/gi;

type Rule = {
  slug: CategorySlug;
  /** Specific brands / phrases — high confidence when matched. */
  patterns: RegExp[];
};

/**
 * Rules are checked in order within each pass; first match wins.
 * Keep specific brands before generic words. Payment rails are NOT transfer
 * signals — almost every UPI SMS mentions PhonePe/GPay.
 */
const RULES: Rule[] = [
  {
    slug: "food",
    patterns: [
      /\b(swiggy|zomato|zepto|blinkit|instamart|dunzo|bigbasket|grofers|eatfit|faasos|box8|behrouz|dominos|domino'?s|pizza\s*hut|mcdonald|mcd|kfc|starbucks|cafe\s*coffee|barista|haldiram|bikanervala|subway|burger\s*king|wow\s*momo|eatsure|magicpin|licious|freshtohome)\b/i,
      /\b(restaurant|cafe|cafeteria|bakery|dhaba|cloud\s*kitchen|food\s*court|tiffin|mess)\b/i,
      /\b(hotel|dine|dining|eatery|kitchen|biryani|chai|tea\s*stall)\b/i,
    ],
  },
  {
    slug: "travel",
    patterns: [
      /\b(uber|ola|rapido|meru|blusmart|namma\s*yatri|indrive|in\s*drive)\b/i,
      /\b(irctc|ixigo|makemytrip|mmt|goibibo|cleartrip|redbus|abhibus|yatra|booking\.com|airbnb|oyo|treebo)\b/i,
      /\b(indigo|spicejet|air\s*india|vistara|akasa|go\s*first)\b/i,
      /\b(petrol|diesel|fuel|hpcl|bpcl|iocl|indian\s*oil|reliance\s*fuel|shell|nayara)\b/i,
      /\b(metro|cab|taxi|auto\s*rickshaw|parking|toll|fastag|fas\s*tag)\b/i,
      /\b(railway|flight|airline|airport|bus\s*ticket|train)\b/i,
    ],
  },
  {
    slug: "shopping",
    patterns: [
      /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tatacliq|snapdeal|shopclues|croma|reliancedigital|vijaysales|poorvika)\b/i,
      /\b(ikea|decathlon|lifestyle|westside|pantaloons|max\s*fashion|\bhm\b|zara|uniqlo)\b/i,
      /\b(dmart|d-mart|reliance\s*fresh|more\s*supermarket|spencers|nature'?s\s*basket)\b/i,
      /\b(mall|store|retail|supermarket|hypermarket|fashion|apparel|clothing)\b/i,
    ],
  },
  {
    slug: "bills",
    patterns: [
      /\b(electricity|bescom|msedcl|tata\s*power|adani\s*electricity|bses|torrent\s*power)\b/i,
      /\b(airtel|jio|vi\b|vodafone|bsnl|mtnl|act\s*fibernet|hathway|you\s*broadband|excitel)\b/i,
      /\b(gas|indane|bharatgas|hp\s*gas|mahanagar\s*gas|\bigl\b|gujarat\s*gas)\b/i,
      /\b(water\s*bill|municipal|property\s*tax|society\s*maintenance|maintenance\s*charge)\b/i,
      /\b(\blic\b|insurance|premium|policybazaar|acko|digit\s*insurance|hdfc\s*life|sbi\s*life)\b/i,
      /\b(broadband|wifi|dth|tata\s*sky|dish\s*tv|sun\s*direct|recharge|postpaid|prepaid)\b/i,
      /\b(emi|loan\s*emi|credit\s*card|card\s*payment|bill\s*payment|bbps|biller)\b/i,
      /\b(rent|landlord|house\s*rent|pg\s*rent)\b/i,
    ],
  },
  {
    slug: "entertainment",
    patterns: [
      /\b(netflix|prime\s*video|amazon\s*prime|hotstar|disney|sonyliv|zee5|jio\s*cinema|voot|mx\s*player)\b/i,
      /\b(spotify|gaana|wynk|jiosaavn|youtube\s*premium|apple\s*music|apple\s*tv)\b/i,
      /\b(bookmyshow|pvr|inox|cinepolis|carnival\s*cinemas|ticketnew)\b/i,
      /\b(steam|playstation|xbox|gaming|game\s*top|dream11|\bmpl\b|rummy)\b/i,
      /\b(movie|cinema|theatre|concert|event)\b/i,
    ],
  },
  {
    slug: "health",
    patterns: [
      /\b(pharmeasy|1mg|netmeds|apollo\s*pharmacy|medplus|wellness\s*forever|tata\s*1mg)\b/i,
      /\b(apollo|fortis|max\s*hospital|manipal|narayana|practo|medanta)\b/i,
      /\b(pharmacy|chemist|hospital|clinic|doctor|dentist|lab\s*test|diagnostic)\b/i,
      /\b(medical|medicine|ayurved|pathology)\b/i,
    ],
  },
  {
    slug: "transfer",
    patterns: [
      // Real transfer intent only — not UPI app names
      /\b(self\s*transfer|to\s*self|own\s*account|savings\s*a\/c|savings\s*account)\b/i,
      /\b(fund\s*transfer|money\s*sent|sent\s*to|transferred\s*to|p2p)\b/i,
      /\b(wallet\s*load|add\s*money|cashback|refund)\b/i,
    ],
  },
];

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Drop rails / bank noise so "Paid via PhonePe to Swiggy" still sees Swiggy. */
export function stripPaymentNoise(text: string): string {
  return text
    .replace(RAIL_NOISE, " ")
    .replace(NOISE_PHRASES, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchRules(
  hay: string,
): { slug: CategorySlug; pattern: string } | null {
  if (!hay) return null;
  for (const rule of RULES) {
    for (const re of rule.patterns) {
      if (re.test(hay)) {
        return { slug: rule.slug, pattern: re.source };
      }
    }
  }
  return null;
}

function looksLikePersonName(merchant: string): boolean {
  const m = merchant.trim();
  if (!m || m.length > 40) return false;
  // "Rahul Sharma", "A. Kumar", single-word names — not brands with digits
  if (/\d{3,}/.test(m)) return false;
  if (/^[a-z][a-z.\s'-]{1,36}$/i.test(m) && !/\b(pvt|ltd|llp|inc|co)\b/i.test(m)) {
    return true;
  }
  return false;
}

/**
 * Analyze payment details and return a category slug + confidence.
 */
export function categorizePayment(input: CategorizeInput): CategorizeResult {
  const direction: CategorizeDirection =
    input.direction === "credit" ? "credit" : "debit";
  const merchant = clean(input.merchant);
  const raw = clean(input.rawText);
  const notes = clean(input.notes);

  const merchantClean = stripPaymentNoise(merchant);
  const fullClean = stripPaymentNoise(
    [merchant, notes, raw].filter(Boolean).join(" "),
  );

  // 1) Merchant alone (strongest signal)
  const merchantHit = matchRules(merchantClean || merchant);
  if (merchantHit) {
    return {
      slug: merchantHit.slug,
      confidence: "high",
      source: "rules",
      reason: `Matched merchant (${merchantHit.slug})`,
    };
  }

  // 2) Full cleaned context (SMS / OCR / notes)
  const fullHit = matchRules(fullClean);
  if (fullHit) {
    return {
      slug: fullHit.slug,
      confidence: merchant ? "medium" : "high",
      source: "rules",
      reason: `Matched text (${fullHit.slug})`,
    };
  }

  // 3) Direction / name heuristics
  if (direction === "credit") {
    return {
      slug: "transfer",
      confidence: merchant ? "medium" : "low",
      source: "heuristic",
      reason: "Credit with no brand match → transfer",
    };
  }

  if (merchant && looksLikePersonName(merchantClean || merchant)) {
    return {
      slug: "other",
      confidence: "low",
      source: "heuristic",
      reason: "Looks like a personal name",
    };
  }

  return {
    slug: "other",
    confidence: merchant || fullClean ? "low" : "low",
    source: "heuristic",
    reason: "No category signals",
  };
}

/**
 * Back-compat helper used by older call sites.
 */
export function inferCategorySlug(
  merchant: string,
  direction: CategorizeDirection = "debit",
  rawText?: string | null,
): CategorySlug {
  return categorizePayment({ merchant, direction, rawText }).slug;
}

export const CATEGORY_SLUGS: readonly CategorySlug[] = [
  "food",
  "travel",
  "shopping",
  "bills",
  "transfer",
  "entertainment",
  "health",
  "other",
] as const;

export function isCategorySlug(value: string): value is CategorySlug {
  return (CATEGORY_SLUGS as readonly string[]).includes(value);
}
