"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Eye,
  Sparkles,
  Star,
  Gift,
  ShoppingCart,
  ArrowRight,
  Info,
  Zap,
  Crown,
  Heart,
  Flame,
  Trophy,
  Diamond,
  Rocket,
  ChevronDown,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import { formatCurrency, cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import type { CreditIcon } from "@/lib/types";

const CREDIT_ICONS: CreditIcon[] = [
  // --- funny (8) ---
  { id: "ci1", name: "Rubber Duck", valueCents: 1, iconKey: "rubber-duck", style: "flat", category: "funny", rarityColor: "#FDE68A", promptText: "A cute yellow rubber duck with a tiny top hat, flat icon style, clean vector" },
  { id: "ci2", name: "Banana Peel", valueCents: 2, iconKey: "banana-peel", style: "flat", category: "funny", rarityColor: "#FDE68A", promptText: "A cartoon banana peel on the ground, flat icon style, bright yellow" },
  { id: "ci3", name: "Whoopee Cushion", valueCents: 5, iconKey: "whoopee-cushion", style: "flat", category: "funny", rarityColor: "#FDBA74", promptText: "A red whoopee cushion slightly inflated, flat icon style, playful" },
  { id: "ci4", name: "Clown Nose", valueCents: 10, iconKey: "clown-nose", style: "flat", category: "funny", rarityColor: "#FCA5A5", promptText: "A shiny red clown nose, flat icon, simple and round with a highlight" },
  { id: "ci5", name: "Party Popper", valueCents: 25, iconKey: "party-popper", style: "flat", category: "funny", rarityColor: "#C084FC", promptText: "A party popper exploding with confetti, flat icon style, festive colors" },
  { id: "ci6", name: "Laughing Emoji", valueCents: 50, iconKey: "laughing-emoji", style: "flat", category: "funny", rarityColor: "#FCD34D", promptText: "A laughing face emoji with tears of joy, flat icon style, yellow" },
  { id: "ci7", name: "Jack in the Box", valueCents: 100, iconKey: "jack-in-box", style: "flat", category: "funny", rarityColor: "#F97316", promptText: "A jack in the box toy springing open with a jester, flat icon, colorful" },
  { id: "ci8", name: "Comedy Trophy", valueCents: 500, iconKey: "comedy-trophy", style: "flat", category: "funny", rarityColor: "#EF4444", promptText: "A golden comedy/tragedy mask trophy, flat icon style, gleaming gold" },
  // --- rare (8) ---
  { id: "ci9", name: "Four Leaf Clover", valueCents: 3, iconKey: "four-leaf-clover", style: "flat", category: "rare", rarityColor: "#4ADE80", promptText: "A shimmering four leaf clover, flat icon style, emerald green with sparkle" },
  { id: "ci10", name: "Shooting Star", valueCents: 15, iconKey: "shooting-star", style: "flat", category: "rare", rarityColor: "#67E8F9", promptText: "A bright shooting star with a long tail, flat icon, glowing cyan trail" },
  { id: "ci11", name: "Crystal Ball", valueCents: 50, iconKey: "crystal-ball", style: "flat", category: "rare", rarityColor: "#A78BFA", promptText: "A mystical crystal ball on a dark stand, flat icon, purple glow inside" },
  { id: "ci12", name: "Golden Key", valueCents: 100, iconKey: "golden-key", style: "flat", category: "rare", rarityColor: "#FCD34D", promptText: "An ornate golden skeleton key, flat icon style, antique design" },
  { id: "ci13", name: "Enchanted Scroll", valueCents: 200, iconKey: "enchanted-scroll", style: "flat", category: "rare", rarityColor: "#C084FC", promptText: "An ancient scroll with glowing runes, flat icon, parchment with purple magic" },
  { id: "ci14", name: "Prism", valueCents: 500, iconKey: "prism", style: "flat", category: "rare", rarityColor: "#F472B6", promptText: "A triangular glass prism splitting white light into rainbow, flat icon" },
  { id: "ci15", name: "Philosopher Stone", valueCents: 2500, iconKey: "philosopher-stone", style: "flat", category: "rare", rarityColor: "#F59E0B", promptText: "A glowing red philosopher stone with gold edges, flat icon, alchemical" },
  { id: "ci16", name: "Infinity Gem", valueCents: 5000, iconKey: "infinity-gem", style: "flat", category: "rare", rarityColor: "#EF4444", promptText: "A radiant cut gemstone pulsing with infinite energy, flat icon, deep red glow" },
  // --- military (8) ---
  { id: "ci17", name: "Dog Tag", valueCents: 5, iconKey: "dog-tag", style: "flat", category: "military", rarityColor: "#9CA3AF", promptText: "A pair of military dog tags on a chain, flat icon style, brushed metal" },
  { id: "ci18", name: "Combat Knife", valueCents: 25, iconKey: "combat-knife", style: "flat", category: "military", rarityColor: "#6B7280", promptText: "A tactical combat knife, flat icon style, steel blade with black handle" },
  { id: "ci19", name: "Grenade", valueCents: 50, iconKey: "grenade", style: "flat", category: "military", rarityColor: "#4B5563", promptText: "A military fragmentation grenade, flat icon, olive green with pin" },
  { id: "ci20", name: "Medal of Honor", valueCents: 100, iconKey: "medal-of-honor", style: "flat", category: "military", rarityColor: "#FCD34D", promptText: "A star-shaped medal of honor on a striped ribbon, flat icon, gold and blue" },
  { id: "ci21", name: "Shield Emblem", valueCents: 250, iconKey: "shield-emblem", style: "flat", category: "military", rarityColor: "#3B82F6", promptText: "A knight's shield with an eagle emblem, flat icon, blue and silver" },
  { id: "ci22", name: "War Drum", valueCents: 500, iconKey: "war-drum", style: "flat", category: "military", rarityColor: "#92400E", promptText: "A large ceremonial war drum with crossed drumsticks, flat icon, red and brown" },
  { id: "ci23", name: "Missile", valueCents: 2000, iconKey: "missile", style: "flat", category: "military", rarityColor: "#DC2626", promptText: "A ballistic missile mid-flight with exhaust trail, flat icon, white and red" },
  { id: "ci24", name: "Nuclear Emblem", valueCents: 10000, iconKey: "nuclear-emblem", style: "flat", category: "military", rarityColor: "#F97316", promptText: "A nuclear/radiation trefoil symbol glowing ominously, flat icon, orange on black" },
  // --- luxury (7) ---
  { id: "ci25", name: "Silk Ribbon", valueCents: 10, iconKey: "silk-ribbon", style: "flat", category: "luxury", rarityColor: "#F9A8D4", promptText: "An elegant silk ribbon tied in a bow, flat icon, pink satin with sheen" },
  { id: "ci26", name: "Pearl", valueCents: 75, iconKey: "pearl", style: "flat", category: "luxury", rarityColor: "#F5F5F4", promptText: "A luminous pearl in a half-open oyster shell, flat icon, iridescent white" },
  { id: "ci27", name: "Gold Ring", valueCents: 200, iconKey: "gold-ring", style: "flat", category: "luxury", rarityColor: "#FCD34D", promptText: "A thick gold signet ring with a gemstone, flat icon, polished gold" },
  { id: "ci28", name: "Diamond Necklace", valueCents: 500, iconKey: "diamond-necklace", style: "flat", category: "luxury", rarityColor: "#67E8F9", promptText: "A diamond pendant necklace on a fine chain, flat icon, sparkling stones" },
  { id: "ci29", name: "Champagne", valueCents: 1000, iconKey: "champagne", style: "flat", category: "luxury", rarityColor: "#FDE68A", promptText: "A champagne bottle popping with golden fizz, flat icon, celebration style" },
  { id: "ci30", name: "Royal Scepter", valueCents: 5000, iconKey: "royal-scepter", style: "flat", category: "luxury", rarityColor: "#C084FC", promptText: "A jeweled royal scepter with a large orb, flat icon, gold and purple gems" },
  { id: "ci31", name: "Platinum Crown", valueCents: 10000, iconKey: "platinum-crown", style: "flat", category: "luxury", rarityColor: "#E2E8F0", promptText: "A platinum crown encrusted with diamonds, flat icon, silver-white gleaming" },
  // --- nature (7) ---
  { id: "ci32", name: "Acorn", valueCents: 1, iconKey: "acorn", style: "flat", category: "nature", rarityColor: "#92400E", promptText: "A small brown acorn with its cap, flat icon style, warm autumn tones" },
  { id: "ci33", name: "Sunflower", valueCents: 5, iconKey: "sunflower", style: "flat", category: "nature", rarityColor: "#FCD34D", promptText: "A bright sunflower with green leaves, flat icon style, cheerful yellow" },
  { id: "ci34", name: "Butterfly", valueCents: 20, iconKey: "butterfly", style: "flat", category: "nature", rarityColor: "#818CF8", promptText: "A delicate butterfly with patterned wings, flat icon, purple and blue wings" },
  { id: "ci35", name: "Bonsai Tree", valueCents: 100, iconKey: "bonsai-tree", style: "flat", category: "nature", rarityColor: "#4ADE80", promptText: "A miniature bonsai tree in a ceramic pot, flat icon, lush green with brown trunk" },
  { id: "ci36", name: "Cherry Blossom", valueCents: 250, iconKey: "cherry-blossom", style: "flat", category: "nature", rarityColor: "#FDA4AF", promptText: "A branch of cherry blossoms in full bloom, flat icon, soft pink petals floating" },
  { id: "ci37", name: "Ancient Oak", valueCents: 1000, iconKey: "ancient-oak", style: "flat", category: "nature", rarityColor: "#166534", promptText: "A massive ancient oak tree with sprawling roots, flat icon, deep green canopy" },
  { id: "ci38", name: "World Tree", valueCents: 5000, iconKey: "world-tree", style: "flat", category: "nature", rarityColor: "#10B981", promptText: "Yggdrasil-style world tree connecting realms, flat icon, glowing green with golden roots" },
  // --- cosmic (8) ---
  { id: "ci39", name: "Asteroid", valueCents: 3, iconKey: "asteroid", style: "flat", category: "cosmic", rarityColor: "#78716C", promptText: "A rocky asteroid tumbling through space, flat icon, grey with craters" },
  { id: "ci40", name: "Crescent Moon", valueCents: 10, iconKey: "crescent-moon", style: "flat", category: "cosmic", rarityColor: "#FDE68A", promptText: "A glowing crescent moon with stars, flat icon, warm yellow glow" },
  { id: "ci41", name: "Comet", valueCents: 50, iconKey: "comet", style: "flat", category: "cosmic", rarityColor: "#67E8F9", promptText: "A blazing comet streaking across the sky, flat icon, icy blue with fiery tail" },
  { id: "ci42", name: "Saturn", valueCents: 150, iconKey: "saturn", style: "flat", category: "cosmic", rarityColor: "#FDBA74", promptText: "The planet Saturn with its iconic rings, flat icon, amber and gold tones" },
  { id: "ci43", name: "Nebula", valueCents: 500, iconKey: "nebula", style: "flat", category: "cosmic", rarityColor: "#A78BFA", promptText: "A swirling nebula cloud of gas and stars, flat icon, purple and pink cosmic dust" },
  { id: "ci44", name: "Supernova", valueCents: 1500, iconKey: "supernova", style: "flat", category: "cosmic", rarityColor: "#F472B6", promptText: "A massive supernova explosion in deep space, flat icon, brilliant white-pink burst" },
  { id: "ci45", name: "Black Hole", valueCents: 5000, iconKey: "black-hole", style: "flat", category: "cosmic", rarityColor: "#1E1B4B", promptText: "A black hole with swirling accretion disk, flat icon, dark void with orange ring" },
  { id: "ci46", name: "Big Bang", valueCents: 10000, iconKey: "big-bang", style: "flat", category: "cosmic", rarityColor: "#FBBF24", promptText: "The Big Bang expanding outward in all directions, flat icon, blinding golden explosion" },
  // --- mythical (8) ---
  { id: "ci47", name: "Fairy Dust", valueCents: 2, iconKey: "fairy-dust", style: "flat", category: "mythical", rarityColor: "#F9A8D4", promptText: "A pinch of sparkling fairy dust, flat icon, pink and gold sparkles" },
  { id: "ci48", name: "Magic Wand", valueCents: 15, iconKey: "magic-wand", style: "flat", category: "mythical", rarityColor: "#818CF8", promptText: "A wizard's magic wand with a glowing tip, flat icon, dark wood with blue star" },
  { id: "ci49", name: "Potion Bottle", valueCents: 50, iconKey: "potion-bottle", style: "flat", category: "mythical", rarityColor: "#4ADE80", promptText: "A glass potion bottle with bubbling green liquid, flat icon, alchemist style" },
  { id: "ci50", name: "Dragon Egg", valueCents: 200, iconKey: "dragon-egg", style: "flat", category: "mythical", rarityColor: "#DC2626", promptText: "A scaled dragon egg with internal glow, flat icon, deep red with fiery cracks" },
  { id: "ci51", name: "Unicorn Horn", valueCents: 500, iconKey: "unicorn-horn", style: "flat", category: "mythical", rarityColor: "#E9D5FF", promptText: "A spiraling unicorn horn radiating magic, flat icon, pearlescent white and purple" },
  { id: "ci52", name: "Phoenix Feather", valueCents: 1500, iconKey: "phoenix-feather", style: "flat", category: "mythical", rarityColor: "#F97316", promptText: "A single phoenix feather glowing with embers, flat icon, gradient red-orange-gold" },
  { id: "ci53", name: "Excalibur", valueCents: 5000, iconKey: "excalibur", style: "flat", category: "mythical", rarityColor: "#60A5FA", promptText: "The legendary sword Excalibur radiating holy light, flat icon, silver blade blue glow" },
  { id: "ci54", name: "Holy Grail", valueCents: 10000, iconKey: "holy-grail", style: "flat", category: "mythical", rarityColor: "#FCD34D", promptText: "The Holy Grail chalice overflowing with light, flat icon, ornate gold cup" },
  // --- food (6) ---
  { id: "ci55", name: "Cookie", valueCents: 1, iconKey: "cookie", style: "flat", category: "food", rarityColor: "#D97706", promptText: "A chocolate chip cookie with a bite taken, flat icon, warm brown tones" },
  { id: "ci56", name: "Slice of Pizza", valueCents: 10, iconKey: "pizza-slice", style: "flat", category: "food", rarityColor: "#F59E0B", promptText: "A cheesy slice of pepperoni pizza, flat icon, melted cheese stretching" },
  { id: "ci57", name: "Sushi Roll", valueCents: 25, iconKey: "sushi-roll", style: "flat", category: "food", rarityColor: "#FB923C", promptText: "A perfectly cut sushi roll with salmon and avocado, flat icon, clean Japanese style" },
  { id: "ci58", name: "Ramen Bowl", valueCents: 75, iconKey: "ramen-bowl", style: "flat", category: "food", rarityColor: "#FBBF24", promptText: "A steaming bowl of tonkotsu ramen with egg and nori, flat icon, warm inviting" },
  { id: "ci59", name: "Wagyu Steak", valueCents: 500, iconKey: "wagyu-steak", style: "flat", category: "food", rarityColor: "#DC2626", promptText: "A perfectly marbled wagyu steak on a hot plate, flat icon, rich red meat" },
  { id: "ci60", name: "Golden Truffle", valueCents: 2500, iconKey: "golden-truffle", style: "flat", category: "food", rarityColor: "#FCD34D", promptText: "A rare golden truffle with flecks of gold leaf, flat icon, luxurious golden brown" },
];

const CATEGORIES = [
  "All",
  "Funny",
  "Rare",
  "Military",
  "Luxury",
  "Nature",
  "Cosmic",
  "Mythical",
  "Food",
] as const;

type SortOption = "price-asc" | "price-desc" | "rarity";

const categoryColors: Record<string, { bg: string; text: string; emoji: string }> = {
  funny: { bg: "bg-amber-500/15", text: "text-amber-400", emoji: "😂" },
  rare: { bg: "bg-blue-500/15", text: "text-blue-400", emoji: "💎" },
  military: { bg: "bg-green-600/15", text: "text-green-400", emoji: "🎖️" },
  luxury: { bg: "bg-yellow-500/15", text: "text-yellow-400", emoji: "👑" },
  nature: { bg: "bg-emerald-500/15", text: "text-emerald-400", emoji: "🌿" },
  cosmic: { bg: "bg-purple-500/15", text: "text-purple-400", emoji: "🌌" },
  mythical: { bg: "bg-red-500/15", text: "text-red-400", emoji: "🐉" },
  food: { bg: "bg-orange-500/15", text: "text-orange-400", emoji: "🍕" },
};

function getRarityLabel(valueCents: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (valueCents >= 5000)
    return {
      label: "Legendary",
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/15",
    };
  if (valueCents >= 1000)
    return {
      label: "Epic",
      color: "text-purple-400",
      bgColor: "bg-purple-500/15",
    };
  if (valueCents >= 200)
    return {
      label: "Rare",
      color: "text-blue-400",
      bgColor: "bg-blue-500/15",
    };
  if (valueCents >= 25)
    return {
      label: "Uncommon",
      color: "text-green-400",
      bgColor: "bg-green-500/15",
    };
  return {
    label: "Common",
    color: "text-gray-400",
    bgColor: "bg-gray-500/15",
  };
}

export default function CreditsPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortOption, setSortOption] = useState<SortOption>("price-asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const addToast = useUIStore((s) => s.addToast);

  // Featured icons (most expensive)
  const featuredIcons = useMemo(
    () =>
      [...CREDIT_ICONS]
        .sort((a, b) => b.valueCents - a.valueCents)
        .slice(0, 8),
    []
  );

  // Filtered and sorted icons
  const filteredIcons = useMemo(() => {
    let result = [...CREDIT_ICONS];

    // Category filter
    if (activeCategory !== "All") {
      result = result.filter(
        (icon) =>
          icon.category.toLowerCase() === activeCategory.toLowerCase()
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (icon) =>
          icon.name.toLowerCase().includes(q) ||
          icon.category.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortOption) {
      case "price-asc":
        result.sort((a, b) => a.valueCents - b.valueCents);
        break;
      case "price-desc":
        result.sort((a, b) => b.valueCents - a.valueCents);
        break;
      case "rarity":
        result.sort((a, b) => b.valueCents - a.valueCents);
        break;
    }

    return result;
  }, [activeCategory, sortOption, searchQuery]);

  const handlePreview = (id: string) => {
    setPreviewingId(id);
    setTimeout(() => setPreviewingId(null), 1200);
  };

  const sortLabels: Record<SortOption, string> = {
    "price-asc": "Price: Low to High",
    "price-desc": "Price: High to Low",
    rarity: "Rarity",
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Credits Catalog
          </span>
        </h1>
        <p className="text-text-secondary text-lg">
          Support your favorite creators with unique gifts
        </p>
      </div>

      {/* ---- Quick Purchase / Featured ---- */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Flame size={18} className="text-warning" />
          <h2 className="text-lg font-semibold text-text">Popular Icons</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {featuredIcons.map((icon) => {
            const cat = categoryColors[icon.category] ?? categoryColors.rare;
            const rarity = getRarityLabel(icon.valueCents);
            return (
              <div
                key={icon.id}
                className="shrink-0 w-36 bg-bg-surface border border-border rounded-xl p-3 hover:border-primary/40 transition-all group"
              >
                <div
                  className={cn(
                    "w-full aspect-square rounded-lg flex items-center justify-center text-3xl mb-2",
                    cat.bg
                  )}
                >
                  {cat.emoji}
                </div>
                <p className="text-text text-sm font-medium truncate">
                  {icon.name}
                </p>
                <p className="text-primary font-bold text-sm">
                  {formatCurrency(icon.valueCents)}
                </p>
                <span
                  className={cn(
                    "inline-block text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded-full",
                    rarity.bgColor,
                    rarity.color
                  )}
                >
                  {rarity.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- Filter Bar ---- */}
      <div className="mb-6 space-y-4">
        {/* Category tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "shrink-0 px-4 py-2 text-sm font-medium rounded-full transition-all",
                activeCategory === cat
                  ? "bg-gradient-to-r from-primary to-accent text-white"
                  : "bg-bg-surface2 text-text-secondary hover:text-text hover:bg-bg-surface3"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search and sort row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search icons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              className="flex items-center gap-2 bg-bg-surface2 border border-border rounded-xl px-4 py-2.5 text-sm text-text hover:border-border-light transition-colors whitespace-nowrap"
            >
              {sortLabels[sortOption]}
              <ChevronDown
                size={14}
                className={cn(
                  "text-text-muted transition-transform",
                  sortDropdownOpen && "rotate-180"
                )}
              />
            </button>
            {sortDropdownOpen && (
              <div className="absolute z-20 right-0 top-full mt-1 bg-bg-surface border border-border rounded-xl shadow-lg overflow-hidden min-w-[200px]">
                {(
                  Object.entries(sortLabels) as [SortOption, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSortOption(key);
                      setSortDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm hover:bg-bg-surface2 transition-colors",
                      sortOption === key && "text-primary bg-primary/5"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Grid of Credit Icons ---- */}
      {filteredIcons.length === 0 ? (
        <div className="text-center py-16">
          <Search size={40} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No icons found</p>
          <p className="text-text-muted text-sm">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 mb-12">
          {filteredIcons.map((icon) => {
            const cat =
              categoryColors[icon.category] ?? categoryColors.rare;
            const rarity = getRarityLabel(icon.valueCents);
            const isPreviewing = previewingId === icon.id;

            return (
              <Card
                key={icon.id}
                padding="sm"
                className={cn(
                  "relative overflow-hidden transition-all duration-300",
                  isPreviewing && "ring-2 ring-primary shadow-[0_0_24px_rgba(139,92,246,0.3)]"
                )}
              >
                {/* Sparkle overlay when previewing */}
                {isPreviewing && (
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                      <Sparkles
                        key={i}
                        size={14}
                        className="absolute text-primary animate-ping"
                        style={{
                          top: `${15 + Math.random() * 70}%`,
                          left: `${10 + Math.random() * 80}%`,
                          animationDelay: `${i * 0.15}s`,
                          animationDuration: "0.8s",
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Icon display */}
                <div
                  className={cn(
                    "w-full aspect-square rounded-lg flex items-center justify-center mb-3 relative",
                    cat.bg
                  )}
                >
                  <span className="text-4xl md:text-5xl">{cat.emoji}</span>
                  {/* First letter overlay */}
                  <span
                    className={cn(
                      "absolute bottom-1 right-1.5 text-[10px] font-bold uppercase opacity-50",
                      cat.text
                    )}
                  >
                    {icon.name.charAt(0)}
                  </span>
                </div>

                {/* Name */}
                <p className="text-text font-semibold text-sm truncate mb-0.5">
                  {icon.name}
                </p>

                {/* Price */}
                <p className="text-primary font-bold text-base mb-1.5">
                  {formatCurrency(icon.valueCents)}
                </p>

                {/* Rarity + Category */}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                      rarity.bgColor,
                      rarity.color
                    )}
                  >
                    {rarity.label}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      cat.bg,
                      cat.text
                    )}
                  >
                    {icon.category}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePreview(icon.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-text-secondary bg-bg-surface2 hover:bg-bg-surface3 rounded-lg transition-colors"
                  >
                    <Eye size={12} />
                    Preview
                  </button>
                  <button
                    disabled
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-text-muted bg-bg-surface3 rounded-lg opacity-50 cursor-not-allowed"
                  >
                    <Gift size={12} />
                    Send (Live Only)
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---- How Credits Work ---- */}
      <div className="mt-8 mb-4">
        <div className="flex items-center gap-2 mb-6">
          <Info size={18} className="text-accent" />
          <h2 className="text-xl font-bold text-text">How Credits Work</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card padding="md" className="text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-3">
              <ShoppingCart size={22} className="text-primary" />
            </div>
            <h3 className="text-text font-semibold mb-1">Buy Credits</h3>
            <p className="text-text-muted text-sm">
              Purchase credits to unlock gift icons and support creators you love
            </p>
          </Card>

          <Card padding="md" className="text-center">
            <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center mx-auto mb-3">
              <Zap size={22} className="text-accent" />
            </div>
            <h3 className="text-text font-semibold mb-1">
              Send During Streams
            </h3>
            <p className="text-text-muted text-sm">
              Send gifts during live streams and battles to cheer on your
              favorites
            </p>
          </Card>

          <Card padding="md" className="text-center">
            <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center mx-auto mb-3">
              <Heart size={22} className="text-success" />
            </div>
            <h3 className="text-text font-semibold mb-1">Creators Earn</h3>
            <p className="text-text-muted text-sm">
              Creators receive the value of your gifts directly to their wallet
            </p>
          </Card>

          <Card padding="md" className="text-center">
            <div className="w-12 h-12 rounded-xl bg-warning/15 flex items-center justify-center mx-auto mb-3">
              <Trophy size={22} className="text-warning" />
            </div>
            <h3 className="text-text font-semibold mb-1">
              Bigger Impact
            </h3>
            <p className="text-text-muted text-sm">
              Higher tier gifts come with unique animations and make a bigger
              splash
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
