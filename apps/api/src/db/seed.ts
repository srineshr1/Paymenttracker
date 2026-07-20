import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { categories } from "./schema.js";

const DEFAULT_CATEGORIES = [
  { name: "Food", slug: "food", icon: "utensils", color: "#E8A87C" },
  { name: "Travel", slug: "travel", icon: "car", color: "#85C1E9" },
  { name: "Shopping", slug: "shopping", icon: "bag", color: "#C39BD3" },
  { name: "Bills", slug: "bills", icon: "receipt", color: "#F5B041" },
  { name: "Transfer", slug: "transfer", icon: "arrows", color: "#7DCEA0" },
  {
    name: "Entertainment",
    slug: "entertainment",
    icon: "film",
    color: "#F1948A",
  },
  { name: "Health", slug: "health", icon: "heart", color: "#EC7063" },
  { name: "Other", slug: "other", icon: "tag", color: "#C4A574" },
];

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    await db
      .insert(categories)
      .values(cat)
      .onConflictDoUpdate({
        target: categories.slug,
        set: {
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
        },
      });
  }

  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories);
  console.log(`Seeded categories (${count[0]?.count ?? 0} total).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
