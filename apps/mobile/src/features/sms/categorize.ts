import { listCategories } from "@/src/data/expenses";

export type CategorySlug =
  | "food"
  | "travel"
  | "shopping"
  | "bills"
  | "transfer"
  | "entertainment"
  | "health"
  | "other";

/**
 * Merchant / SMS text → category slug.
 * Rules are checked in order; first match wins. Keep specific brands before generic words.
 */
const RULES: { slug: CategorySlug; patterns: RegExp[] }[] = [
  {
    slug: "food",
    patterns: [
      /\b(swiggy|zomato|zepto|blinkit|instamart|dunzo|bigbasket|grofers|eatfit|faasos|box8|behrouz|dominos|domino'?s|pizza\s*hut|mcdonald|mcd|kfc|starbucks|cafe\s*coffee|barista|haldiram|bikanervala|subway|burger\s*king|wow\s*momo|eatsure|magicpin)\b/i,
      /\b(restaurant|cafe|cafeteria|bakery|dhaba|cloud\s*kitchen|food\s*court|tiffin|mess)\b/i,
      /\b(hotel|dine|dining|eatery|kitchen|biryani|chai|tea\s*stall)\b/i,
    ],
  },
  {
    slug: "travel",
    patterns: [
      /\b(uber|ola|rapido|meru|blusmart|namma\s*yatri|inDrive|indrive)\b/i,
      /\b(irctc|ixigo|makemytrip|mmt|goibibo|cleartrip|redbus|abhibus|yatra|booking\.com|airbnb|oyo|treebo)\b/i,
      /\b(indigo|spicejet|air\s*india|vistara|akasa|go\s*first)\b/i,
      /\b(petrol|diesel|fuel|hpcl|bpcl|iocl|indian\s*oil|reliance\s*fuel|shell|nayara)\b/i,
      /\b(metro|rapido|cab|taxi|auto\s*rickshaw|parking|toll|fastag|fas\s*tag)\b/i,
      /\b(railway|flight|airline|airport|bus\s*ticket|train)\b/i,
    ],
  },
  {
    slug: "shopping",
    patterns: [
      /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tatacliq|snapdeal|shopclues|croma|reliancedigital|vijaysales|poorvika)\b/i,
      /\b(ikea|decathlon|lifestyle|westside|pantaloons|max\s*fashion|hm\b|zara|uniqlo)\b/i,
      /\b(dmart|d-mart|reliance\s*fresh|more\s*supermarket|spencers|nature'?s\s*basket)\b/i,
      /\b(mall|store|retail|supermarket|hypermarket|fashion|apparel|clothing)\b/i,
    ],
  },
  {
    slug: "bills",
    patterns: [
      /\b(electricity|bescom|msedcl|tata\s*power|adani\s*electricity|bses|torrent\s*power)\b/i,
      /\b(airtel|jio|vi\b|vodafone|bsnl|mtnl|act\s*fibernet|hathway|you\s*broadband|excitel)\b/i,
      /\b(gas|indane|bharatgas|hp\s*gas|mahanagar\s*gas|igl\b|gujarat\s*gas)\b/i,
      /\b(water\s*bill|municipal|property\s*tax|society\s*maintenance|maintenance\s*charge)\b/i,
      /\b(lic\b|insurance|premium|policybazaar|acko|digit\s*insurance|hdfc\s*life|sbi\s*life)\b/i,
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
      /\b(steam|playstation|xbox|gaming|game\s*top|dream11|mpl\b|rummy)\b/i,
      /\b(movie|cinema|theatre|concert|event)\b/i,
    ],
  },
  {
    slug: "health",
    patterns: [
      /\b(pharmeasy|1mg|netmeds|apollo\s*pharmacy|medplus|wellness\s*forever|tata\s*1mg)\b/i,
      /\b(apollo|fortis|max\s*hospital|manipal|narayana|practo|medanta)\b/i,
      /\b(pharmacy|chemist|hospital|clinic|doctor|dentist|lab\s*test|diagnostic|health)\b/i,
      /\b(medical|medicine|ayurved|pathology)\b/i,
    ],
  },
  {
    slug: "transfer",
    patterns: [
      /\b(self\s*transfer|to\s*self|own\s*account|savings\s*a\/c|savings\s*account)\b/i,
      /\b(neft|imps|rtgs|upi\s*transfer|fund\s*transfer|money\s*sent|sent\s*to)\b/i,
      /\b(paytm|phonepe|gpay|google\s*pay|bhim|cred\b|mobikwik|freecharge|amazon\s*pay)\b/i,
      /\b(wallet|add\s*money|cashback|refund)\b/i,
    ],
  },
];

/**
 * Infer a category slug from merchant name / SMS snippet.
 * Credits with no brand match default to transfer (person-to-person).
 */
export function inferCategorySlug(
  merchant: string,
  direction: "debit" | "credit" = "debit",
  rawText?: string | null
): CategorySlug {
  const hay = `${merchant ?? ""} ${rawText ?? ""}`.trim();
  if (!hay) return direction === "credit" ? "transfer" : "other";

  for (const rule of RULES) {
    for (const re of rule.patterns) {
      if (re.test(hay)) return rule.slug;
    }
  }

  // Person-looking names (UPI VPA local part / short names) → transfer
  if (direction === "credit") return "transfer";
  if (/^[a-z][a-z.\s]{1,28}$/i.test(merchant.trim()) && !/\d{3,}/.test(merchant)) {
    // Heuristic: bare personal names often uncategorized; leave as other for debits
    return "other";
  }

  return "other";
}

let slugIdCache: Map<string, string> | null = null;

/** Clear after tests or category reseeds. */
export function clearCategorySlugCache() {
  slugIdCache = null;
}

export async function getCategoryIdBySlug(
  slug: CategorySlug | string
): Promise<string | null> {
  if (!slugIdCache) {
    const { categories } = await listCategories();
    slugIdCache = new Map(categories.map((c) => [c.slug, c.id]));
  }
  return slugIdCache.get(slug) ?? slugIdCache.get("other") ?? null;
}

/** Resolve merchant (+ optional direction/raw) to a category UUID for insert. */
export async function resolveCategoryId(
  merchant: string,
  direction: "debit" | "credit" = "debit",
  rawText?: string | null
): Promise<string | null> {
  const slug = inferCategorySlug(merchant, direction, rawText);
  return getCategoryIdBySlug(slug);
}
