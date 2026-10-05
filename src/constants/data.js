/**
 * Data Constants - Application reference data
 *
 * Contains all static data used across the application including
 * event types, service categories, default company settings, and SAC codes.
 */

// ============================================================
// EVENT TYPES
// ============================================================

/**
 * Available event types for classification. "Other" is always last and,
 * when chosen in the Event Type dropdown, prompts for a free-text custom
 * type instead (see NewDraft.jsx / EditDraft.jsx) — Kerala event businesses
 * regularly handle types not on any fixed list (e.g. a specific local
 * ceremony name), so the list stays a set of common shortcuts, not a cap.
 */
export const EVENT_TYPES = [
  'Wedding', 'Reception', 'Engagement', 'Madhuramveppu', 'Birthday Party',
  'Baptism', 'Baby Shower', 'Haldi', 'Anniversary', 'Corporate Event',
  'Conference', 'House Warming', 'Religious Event', 'Government Event',
  'College Event', 'Celebration', 'Election', 'Funeral', 'Other',
];

// ============================================================
// SERVICE CATEGORIES
// ============================================================

/**
 * Default service categories with predefined items.
 * Each category has an id, display name, emoji icon, and list of service items.
 */
export const DEFAULT_CATEGORIES = [
  { id: 'decor', name: 'Decor & Setup', icon: '🎨', items: ['Wedding Stage Decor','Reception Stage Decor','Mandap Setup','Flower Decoration (Fresh)','Flower Decoration (Artificial)','Gate / Entrance Arch','Pathway Decoration','Backdrop / Photo Wall','Balloon Decoration','Car Decoration','Panthal / Pandal Setup','Ceiling Draping'] },
  { id: 'lighting', name: 'Lighting', icon: '💡', items: ['Stage Lights (LED/Par)','Fairy / String Lights','Chandeliers','Laser Lights','Moving Head Lights','LED Wall / Screen','Spotlight','Truss with Lights','Neon Signs'] },
  { id: 'sound', name: 'Sound & DJ', icon: '🔊', items: ['DJ System (with DJ)','PA System','Wireless Microphones','Speakers (Floor)','Speakers (Hanging)','Mixer / Amplifier','Musical Band','Karaoke Setup'] },
  { id: 'power', name: 'Power & Generator', icon: '⚡', items: ['Generator 25 KVA','Generator 50 KVA','Generator 75 KVA','Generator 100 KVA','Generator 125 KVA','UPS Backup','Electrical Wiring'] },
  { id: 'catering', name: 'Catering', icon: '🍽️', items: ['Vegetarian Menu','Non-Vegetarian Menu','Buffet Setup','Live Cooking Stations','Bar / Mocktail Counter','Tea / Coffee Station','Custom Cake','Service Staff'] },
  { id: 'photography', name: 'Photography & Video', icon: '📸', items: ['Photographer','Videographer','Drone Coverage','Pre-wedding Shoot','Album (Physical)','Album (Digital)','Photo Booth','Live Streaming'] },
  { id: 'venue', name: 'Venue & Logistics', icon: '🏛️', items: ['Venue Booking','Tent / Shamiyana','Chairs (Chiavari)','Chairs (Cushion)','Chairs (Plastic)','Tables (Round)','Tables (Rectangle)','Sofa Seating','Red Carpet','AC / Cooler','Portable Washrooms'] },
  { id: 'entertainment', name: 'Entertainment', icon: '🎭', items: ['Anchor / Emcee','Dance Troupe','Fireworks','Dhol / Band','Magician','Kids Zone'] },
  { id: 'transport', name: 'Transportation', icon: '🚗', items: ['Bridal Car','Guest Shuttle / Bus','Palki / Horse'] },
  { id: 'misc', name: 'Miscellaneous', icon: '📋', items: ['Valet Parking','Security Personnel','First Aid Staff','Event Coordinator','Makeup Artist','Mehndi Artist','Priest / Pandit'] },
];

// ============================================================
// COMPANY / INVOICE DEFAULTS
// ============================================================

/**
 * Default company/business settings for a brand-new tenant.
 * Deliberately blank: every company fills in its own name, address, tax IDs
 * and bank details in Settings — stored in Firestore, never in code.
 * (No company's real details belong in this repo.)
 */
export const DEFAULT_SETTINGS = {
  companyName: '',
  tagline: '',
  address: '',
  gstin: '',
  pan: '',
  phone: '',
  whatsapp: '',
  email: '',
  logo: null,
  bankDetails: {
    accountName: '',
    accountNo: '',
    bankName: '',
    branch: '',
    ifscCode: '',
    upiId: '',
  },
  invoicePrefix: 'INV',
  defaultGstRate: 18,
  termsAndConditions: [
    'Total payment due in 30 days',
  ],
  thankYouMessage: 'Thank You For Your Business!',
  // Google Sheets sync — see CODE_STRUCTURE.md and src/utils/sheetSync.js.
  // sheetSyncUrl is the deployed Apps Script Web App /exec URL (push/pull API).
  // sheetSyncSecret must match the SHARED_SECRET script property on that script.
  // sheetViewUrl is the actual spreadsheet link, opened when the user taps "Open Sheet".
  sheetSyncUrl: '',
  sheetSyncSecret: '',
  sheetViewUrl: '',
};

// ============================================================
// TAX CODES
// ============================================================

/** SAC (Services Accounting Code) for event management services */
export const DEFAULT_SAC_CODE = '998596';
