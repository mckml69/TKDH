import React, { createContext } from "react";
import {
  Flame, Droplet, GraduationCap, Wrench, ShieldAlert, Bug, Hammer, Brush, Camera,
  ClipboardCheck, Phone, Blinds, MapPin,
} from "lucide-react";

export const DUE_SOON_WINDOW = 30;
export const RECENT_WINDOW = 7;
export const MAX_FILE_BYTES = 3.5 * 1024 * 1024;

export const TEMPLATES = {
  fire: { key: "fire", label: "Fire Safety", short: "Fire", icon: Flame, mode: "recurring", accent: "#A8402F", assetEligible: true, roomEligible: true, contractorEligible: true,
    presets: ["Fire alarm test", "Fire extinguisher check", "Emergency lighting test", "Fire drill", "Fire door inspection", "Fire risk assessment review"] },
  legionella: { key: "legionella", label: "Legionella & Water Hygiene", short: "Water", icon: Droplet, mode: "recurring", accent: "#2A6F97", assetEligible: true, roomEligible: true, contractorEligible: true,
    presets: ["Outlet temperature check", "Water tank inspection", "Shower head descale", "Kettle descaling", "Water sample / analysis", "Calorifier temperature check", "TMV servicing"] },
  equipment: { key: "equipment", label: "Equipment Checks", short: "Equipment", icon: Wrench, mode: "recurring", accent: "#8A6D1F", assetEligible: true, roomEligible: true, contractorEligible: true,
    presets: ["Lift service", "Lift LOLER thorough examination", "PAT testing", "EICR (electrical installation)", "Kitchen equipment service", "Fire alarm system service", "Gas safety check", "AC filter clean", "AC service", "Ladder / access equipment check"] },
  window_restriction: { key: "window_restriction", label: "Window Restriction Checks", short: "Window", icon: Blinds, mode: "recurring", accent: "#3A6B5C", assetEligible: true, roomEligible: false, contractorEligible: true,
    presets: ["Window restrictor check"] },
  risk: { key: "risk", label: "Risk Assessments", short: "Risk", icon: ShieldAlert, mode: "recurring", accent: "#5B4A8A", assetEligible: false, roomEligible: false, contractorEligible: true,
    presets: ["General H&S risk assessment", "COSHH assessment", "Manual handling assessment", "Slips, trips & falls assessment", "Lone working assessment", "Fire risk assessment", "Legionella risk assessment"] },
  training: { key: "training", label: "Staff Training", short: "Training", icon: GraduationCap, mode: "expiry", accent: "#2F6B4C", assetEligible: false, roomEligible: false, contractorEligible: false, staffEligible: true,
    presets: ["Fire Safety Awareness", "First Aid at Work", "Food Hygiene Level 2", "Manual Handling", "Health & Safety Induction", "Legionella Awareness"] },
  pest: { key: "pest", label: "Pest Control", short: "Pest", icon: Bug, mode: "incident", accent: "#7A4B26", assetEligible: false, roomEligible: true, contractorEligible: true,
    presets: ["Mice / rodents", "Bed bugs", "Cockroaches", "Ants", "Wasps / hornets", "Other"] },
  deep_clean: { key: "deep_clean", label: "Deep Clean", short: "Deep Clean", icon: Brush, mode: "recurring", accent: "#1D7A72", assetEligible: false, roomEligible: true, contractorEligible: true,
    presets: ["Full room deep clean", "Carpet shampoo", "Mattress deep clean", "Curtain / soft furnishings clean", "Bathroom deep clean"] },
  room_inspection: { key: "room_inspection", label: "Room Inspection", short: "Inspection", icon: ClipboardCheck, mode: "log", accent: "#4A5A8A", assetEligible: false, roomEligible: true, contractorEligible: false },
  room_photo: { key: "room_photo", label: "Room Photo", short: "Photo", icon: Camera, mode: "log", accent: "#8A4A6E", assetEligible: false, roomEligible: true, contractorEligible: false },
  maintenance: { key: "maintenance", label: "Maintenance Issue", short: "Maintenance", icon: Hammer, mode: "maintenance", accent: "#4A4A4A", assetEligible: true, roomEligible: true, contractorEligible: true },
  fire_daily: { key: "fire_daily", label: "Fire Log — Daily", short: "Fire Daily", icon: Flame, mode: "firelog", accent: "#A8402F", assetEligible: false, roomEligible: false, contractorEligible: false, hidden: true },
  fire_weekly: { key: "fire_weekly", label: "Fire Log — Weekly", short: "Fire Weekly", icon: Flame, mode: "firelog", accent: "#A8402F", assetEligible: false, roomEligible: false, contractorEligible: false, hidden: true },
  fire_monthly: { key: "fire_monthly", label: "Fire Log — Monthly", short: "Fire Monthly", icon: Flame, mode: "firelog", accent: "#A8402F", assetEligible: false, roomEligible: false, contractorEligible: false, hidden: true },
  fire_periodic: { key: "fire_periodic", label: "Fire Log — Periodic", short: "Fire Periodic", icon: Flame, mode: "firelog", accent: "#A8402F", assetEligible: false, roomEligible: false, contractorEligible: false, hidden: true },
  window_restriction_check: { key: "window_restriction_check", label: "Window Restriction Check", short: "Window Check", icon: Blinds, mode: "checkpoint_check", accent: "#3A6B5C", assetEligible: false, roomEligible: false, contractorEligible: false, hidden: true },
};
/** The fixed checklist for each Fire Log period type — not a free preset dropdown like other templates,
    since these come straight from the hotel's actual fire logbook and shouldn't drift from it. */
export const FIRE_LOG_ITEMS = {
  fire_daily: [
    { key: "exitDoorsOpen", label: "Exit doors open check" },
    { key: "openingProcedure", label: "Opening procedure" },
    { key: "exitDoorsClosed", label: "Exit doors close check" },
    { key: "closingProcedure", label: "Closing procedure" },
  ],
  fire_weekly: [
    { key: "fireDoorsMagnetic", label: "Check all fire doors (magnetic)" },
    { key: "fireAlarmTest", label: "Check fire alarm", hasCallPoint: true },
    { key: "fireSafetyBox", label: "Check fire safety box contents" },
    { key: "liftDrop", label: "Check lift drop" },
  ],
  fire_monthly: [
    { key: "fireFightingEquipment", label: "Check all fire fighting equipment" },
    { key: "emergencyLighting", label: "Check emergency lighting" },
    { key: "staffMonthlyTraining", label: "Staff monthly fire training", hasNA: true },
    { key: "staffInduction", label: "Staff induction training", hasNA: true },
  ],
  fire_periodic: [
    { key: "fireDrill", label: "Fire drill" },
    { key: "fireAuthorityVisit", label: "Fire authority visit" },
  ],
};
export const FIRE_LOG_PERIOD_LABEL = { fire_daily: "Daily", fire_weekly: "Weekly", fire_monthly: "Monthly", fire_periodic: "Periodic" };
export const TEMPLATE_LIST = Object.values(TEMPLATES).filter((t) => !t.hidden);
/** Hidden categories exist to keep dedicated-entry record types (Fire Log, Window Restriction checks)
    out of the general "New record" picker — they're always created through their own fast-entry
    screens. But hiding them from the picker doesn't mean they should be invisible when someone
    filters "All records" by the category they conceptually belong to. This maps each visible
    category's chip to every hidden category that should also match it. */
export const CATEGORY_FILTER_GROUPS = {
  fire: ["fire", "fire_daily", "fire_weekly", "fire_monthly", "fire_periodic"],
  window_restriction: ["window_restriction", "window_restriction_check"],
};
export const categoryFilterMatches = (record, filterCategory) => (CATEGORY_FILTER_GROUPS[filterCategory] || [filterCategory]).includes(record.category);
export const FREQUENCY_PRESETS = [
  { label: "Daily", days: 1 }, { label: "Weekly", days: 7 }, { label: "Monthly", days: 30 },
  { label: "Quarterly", days: 91 }, { label: "Twice yearly", days: 182 }, { label: "Annually", days: 365 },
  { label: "Custom", days: null },
];
/** Sensible default interval per recurring task, so the frequency field is almost always already right. */
export const PRESET_DEFAULT_FREQUENCY = {
  "Fire alarm test": 7, "Fire extinguisher check": 30, "Emergency lighting test": 30, "Fire drill": 182, "Fire door inspection": 91, "Fire risk assessment review": 365,
  "Outlet temperature check": 30, "Water tank inspection": 365, "Shower head descale": 91, "Kettle descaling": 30, "Water sample / analysis": 365, "Calorifier temperature check": 30, "TMV servicing": 365,
  "Lift service": 30, "Lift LOLER thorough examination": 182, "PAT testing": 365, "EICR (electrical installation)": 1825, "Kitchen equipment service": 365, "Fire alarm system service": 182, "Gas safety check": 365, "AC filter clean": 91, "AC service": 365, "Ladder / access equipment check": 30,
  "Window restrictor check": 30,
  "General H&S risk assessment": 365, "COSHH assessment": 365, "Manual handling assessment": 365, "Slips, trips & falls assessment": 365, "Lone working assessment": 365, "Fire risk assessment": 365, "Legionella risk assessment": 730,
  "Full room deep clean": 182, "Carpet shampoo": 365, "Mattress deep clean": 182, "Curtain / soft furnishings clean": 365, "Bathroom deep clean": 91,
};
export const LOCATION_PRESETS = ["Kitchen", "Plant Room", "Roof / Water Tank Room", "Laundry", "Reception", "Car Park", "Corridor", "Bar", "Restaurant", "Basement Store"];

export const ASSET_TYPES = [
  { key: "fire_extinguisher", label: "Fire Extinguisher", category: "fire", prefix: "FE", eligibleFor: ["fire"] },
  { key: "fire_door", label: "Fire Door", category: "fire", prefix: "FD", eligibleFor: ["fire"] },
  { key: "emergency_light", label: "Emergency Light", category: "fire", prefix: "EL", eligibleFor: ["fire"] },
  { key: "boiler", label: "Boiler", category: "legionella", prefix: "BLR", eligibleFor: ["legionella"] },
  { key: "calorifier", label: "Calorifier", category: "legionella", prefix: "CAL", eligibleFor: ["legionella"] },
  { key: "water_tank", label: "Water Tank", category: "legionella", prefix: "WT", eligibleFor: ["legionella"] },
  { key: "tmv", label: "TMV", category: "legionella", prefix: "TMV", eligibleFor: ["legionella"] },
  { key: "lift", label: "Lift", category: "equipment", prefix: "LFT", eligibleFor: ["equipment"] },
  { key: "kitchen_equipment", label: "Kitchen Equipment", category: "equipment", prefix: "KE", eligibleFor: ["equipment"] },
  { key: "air_conditioning", label: "Air Conditioning Unit", category: "equipment", prefix: "AC", eligibleFor: ["equipment"] },
  { key: "ac_filter", label: "AC Filter", category: "equipment", prefix: "ACF", eligibleFor: ["equipment"] },
  { key: "kettle", label: "Kettle", category: "legionella", prefix: "KTL", eligibleFor: ["legionella", "equipment"] },
  { key: "tv", label: "Television", category: "equipment", prefix: "TV", eligibleFor: ["equipment"] },
  { key: "phone", label: "Room Phone", category: "equipment", prefix: "PHN", eligibleFor: ["equipment"] },
  { key: "fridge", label: "Fridge", category: "equipment", prefix: "FRG", eligibleFor: ["equipment"] },
  { key: "underfloor_heating", label: "Underfloor Heating", category: "equipment", prefix: "UFH", eligibleFor: ["equipment"] },
  { key: "sockets_panel", label: "Main Sockets Panel", category: "equipment", prefix: "MSP", eligibleFor: ["equipment"] },
  { key: "bedside_socket", label: "Bedside Socket Panel", category: "equipment", prefix: "BSP", eligibleFor: ["equipment"] },
  { key: "bedside_lamp", label: "Bedside Lamp", category: "equipment", prefix: "BLP", eligibleFor: ["equipment"] },
  { key: "desk_lamp", label: "Desk Lamp", category: "equipment", prefix: "DLP", eligibleFor: ["equipment"] },
  { key: "ladder", label: "Ladder / Access Equipment", category: "equipment", prefix: "LAD", eligibleFor: ["equipment"] },
  { key: "window_restrictor", label: "Window Restrictor", category: "window_restriction", prefix: "WR", eligibleFor: ["window_restriction"] },
  { key: "other", label: "Other", category: "equipment", prefix: "OTH", eligibleFor: ["equipment"] },
];
export const ASSET_STATUSES = ["In Service", "Out of Service", "Decommissioned"];
export const DECOMMISSION_REASONS = ["Faulty / broken", "End of life / worn out", "Damaged", "Upgraded to newer model", "Other"];
/** The standard set of in-room assets every guest room gets, used by the bulk room-asset import. */
export const ROOM_ASSET_KIT = [
  { typeKey: "kettle" },
  { typeKey: "tv" },
  { typeKey: "air_conditioning" },
  { typeKey: "ac_filter" },
  { typeKey: "phone" },
  { typeKey: "fridge" },
  { typeKey: "underfloor_heating" },
  { typeKey: "sockets_panel" },
  { typeKey: "bedside_socket", sides: ["L", "R"] },
  { typeKey: "bedside_lamp", sides: ["L", "R"] },
  { typeKey: "desk_lamp" },
];
export const ROOM_TYPES = ["Superior Double Lower Ground", "Classic Double", "Deluxe Double/Twin", "Superior Double", "Superior Twin", "Junior Suite", "Superior Triple", "Other"];

/* ---------------------------------------------------------
   COMPLIANCE LIBRARY — reference content, not records.
   General guidance based on common UK legislation/ACOPs. Not legal advice —
   requirements vary by property, size, nation and local authority; confirm
   specifics with your fire risk assessor, EHO, or a qualified H&S consultant.
--------------------------------------------------------- */
export const REQUIREMENTS = [
  { id: "fra", category: "risk", matchMode: "preset", matchValues: ["Fire risk assessment review"], title: "Fire Risk Assessment",
    whatToKeep: "A written fire risk assessment covering the whole building, identifying hazards, people at risk, and the actions taken to reduce risk.",
    why: "Since 1 October 2023, all fire risk assessments must be recorded in writing regardless of business size (previously only required for 5+ employees). This is the foundation document everything else in your fire safety programme sits under.",
    frequency: "No fixed legal interval, but must be kept under regular review and reviewed whenever something changes (refit, new furniture, change of use). Annual review is common practice.",
    evidence: "The written assessment itself, identified actions with target dates, and evidence actions were completed.",
    retention: "Keep the current version plus prior versions for as long as you're the responsible person — you're legally required to hand records to an incoming responsible person if management changes.",
    legislation: "Regulatory Reform (Fire Safety) Order 2005 (England & Wales); Fire (Scotland) Act 2005; Fire and Rescue Services (NI) Order 2006." },
  { id: "fire-alarm-weekly", category: "fire", matchMode: "preset", matchValues: ["Fire alarm test"], title: "Fire Alarm Weekly Test",
    whatToKeep: "A log of the weekly manual call point test.",
    why: "The Fire Safety Order requires fire detection and alarm systems to be kept in effective working order at all times.",
    frequency: "Weekly (a different call point each week if you have several, cycling through them).",
    evidence: "Fire alarm logbook entry — date, call point tested, outcome, any faults.",
    retention: "For the life of the system; keep at least the current logbook plus the previous one.",
    legislation: "RRFSO 2005; BS 5839-1 (code of practice for fire detection and alarm systems)." },
  { id: "fire-alarm-service", category: "equipment", matchMode: "preset", matchValues: ["Fire alarm system service"], certTypes: ["Fire Alarm Service Certificate"], title: "Fire Alarm System Servicing",
    whatToKeep: "A professional service certificate from a qualified fire alarm engineer.",
    why: "Weekly in-house testing alone doesn't satisfy the standard — periodic professional servicing is expected under BS 5839-1.",
    frequency: "At least every 6 months.",
    evidence: "Engineer's service report/certificate, listing any defects and remedial action.",
    retention: "Keep for the life of the system.",
    legislation: "RRFSO 2005; BS 5839-1." },
  { id: "extinguisher", category: "fire", matchMode: "preset", matchValues: ["Fire extinguisher check"], title: "Fire Extinguisher Check",
    whatToKeep: "Monthly visual checks plus an annual service record for every extinguisher.",
    why: "Extinguishers are general fire precautions under the Fire Safety Order and must be maintained and available for use.",
    frequency: "Monthly visual check (in place, not damaged, pin/seal intact); annual service by a competent person.",
    evidence: "Visual check log and annual service tag/certificate per extinguisher.",
    retention: "Current plus previous annual service record.",
    legislation: "RRFSO 2005; BS 5306-3." },
  { id: "emergency-lighting", category: "fire", matchMode: "preset", matchValues: ["Emergency lighting test"], title: "Emergency Lighting Test",
    whatToKeep: "A monthly brief function test and an annual full-duration discharge test.",
    why: "Escape routes must remain visible if mains power fails — a legal requirement under general fire precautions.",
    frequency: "Monthly (brief function test); annually (full 3-hour discharge test).",
    evidence: "Test log noting date, duration, and outcome for each test point.",
    retention: "Current plus previous annual record.",
    legislation: "RRFSO 2005; BS 5266-1." },
  { id: "fire-door", category: "fire", matchMode: "preset", matchValues: ["Fire door inspection"], title: "Fire Door Inspection",
    whatToKeep: "A per-door checklist covering seals, self-closers, gaps, and glazing.",
    why: "Fire doors hold back fire and smoke to protect escape routes — damaged seals or closers routinely fail to do this without anyone noticing.",
    frequency: "Commonly quarterly for doors on busy escape routes; at least annually for others (aligns with industry 'Check It Out' guidance).",
    evidence: "Inspection checklist per door with date and any remedial action.",
    retention: "Keep to support your Fire Risk Assessment review.",
    legislation: "RRFSO 2005; Building Regulations Approved Document B." },
  { id: "fire-drill", category: "fire", matchMode: "preset", matchValues: ["Fire drill"], title: "Fire Drill",
    whatToKeep: "A record of each evacuation drill, including timing and any issues found.",
    why: "Staff need to actually practise evacuation procedures, not just read about them, and the Order requires appropriate fire safety training.",
    frequency: "At least annually, or as recommended by your Fire Risk Assessment.",
    evidence: "Drill record — date, scenario, evacuation time, issues identified, follow-up actions.",
    retention: "Keep to support your Fire Risk Assessment review.",
    legislation: "RRFSO 2005, Article 21 (training)." },
  { id: "legionella-ra", category: "risk", matchMode: "preset", matchValues: ["Legionella risk assessment"], certTypes: ["Legionella Risk Assessment"], title: "Legionella Risk Assessment",
    whatToKeep: "A written assessment of your hot and cold water systems, identifying sources of risk (tanks, TMVs, low-use outlets, showerheads).",
    why: "You must know where Legionella could grow in your specific water system before you can control it — this document drives your whole monitoring programme.",
    frequency: "Review at least every 2 years, and immediately after any system modification, suspected case, or extended closure.",
    evidence: "Written risk assessment plus your written scheme of control.",
    retention: "Keep current and previous versions; best practice is indefinitely for as long as you control the premises.",
    legislation: "Health and Safety at Work etc Act 1974; COSHH 2002; HSE ACOP L8 & HSG274." },
  { id: "water-temp", category: "legionella", matchMode: "preset", matchValues: ["Outlet temperature check"], title: "Water Temperature Monitoring",
    whatToKeep: "Regular temperature readings at representative outlets.",
    why: "Temperature is the primary control for Legionella — this is how you prove the control is actually working, not just written down.",
    frequency: "Monthly, per ACOP L8/HSG274.",
    evidence: "Temperature log — hot water ≥50°C at the outlet within 1 minute, cold water ≤20°C within 2 minutes (confirm your own figures against your risk assessment).",
    retention: "At least 5 years per ACOP L8 guidance; many operators keep these indefinitely.",
    legislation: "HSE ACOP L8 & HSG274; COSHH 2002." },
  { id: "calorifier", category: "legionella", matchMode: "preset", matchValues: ["Calorifier temperature check"], title: "Calorifier Temperature Check",
    whatToKeep: "Flow and return temperature readings for each calorifier/hot water cylinder.",
    why: "Calorifiers are a common Legionella reservoir if they don't reach and maintain temperature.",
    frequency: "Monthly.",
    evidence: "Temperature log per calorifier.",
    retention: "At least 5 years.",
    legislation: "HSE ACOP L8 & HSG274." },
  { id: "tank-inspection", category: "legionella", matchMode: "preset", matchValues: ["Water tank inspection"], title: "Water Tank Inspection",
    whatToKeep: "Annual internal inspection (and clean if needed) of cold water storage tanks.",
    why: "Tanks are a known Legionella risk point, especially with debris, sediment, or a failed cover.",
    frequency: "Annual internal inspection; more frequent visual checks per your written scheme.",
    evidence: "Inspection report; cleaning/disinfection certificate if carried out.",
    retention: "At least 5 years.",
    legislation: "HSE ACOP L8 & HSG274." },
  { id: "tmv", category: "legionella", matchMode: "preset", matchValues: ["TMV servicing"], title: "TMV Servicing",
    whatToKeep: "A service record confirming the thermostatic mixing valve fails safely and delivers the correct blended temperature.",
    why: "TMVs prevent scalding but can mask a Legionella-risk hot water fault if not serviced.",
    frequency: "Annually, or per manufacturer guidance.",
    evidence: "Service record with confirmed output temperature.",
    retention: "At least 5 years.",
    legislation: "HSE ACOP L8; HSE guidance on thermostatic mixing valves." },
  { id: "descale", category: "legionella", matchMode: "preset", matchValues: ["Shower head descale", "Kettle descaling"], title: "Showerhead / Kettle Descaling",
    whatToKeep: "A descaling log by room or appliance.",
    why: "Limescale harbours biofilm, which protects Legionella bacteria from temperature and disinfectant controls.",
    frequency: "Per your written scheme — commonly quarterly for low-use guest rooms.",
    evidence: "Descale log noting location/asset and date.",
    retention: "At least 5 years.",
    legislation: "HSE ACOP L8 & HSG274 (written scheme of control)." },
  { id: "water-sample", category: "legionella", matchMode: "preset", matchValues: ["Water sample / analysis"], title: "Water Sample / Analysis",
    whatToKeep: "Laboratory microbiological analysis results.",
    why: "Sampling verifies that your temperature and other controls are actually keeping Legionella counts down, not just assumed to be.",
    frequency: "Per your risk assessment — often quarterly for higher-risk systems.",
    evidence: "Lab analysis certificate.",
    retention: "At least 5 years.",
    legislation: "HSE ACOP L8 & HSG274." },
  { id: "loler-lift", category: "equipment", matchMode: "preset", matchValues: ["Lift LOLER thorough examination"], certTypes: ["Lift LOLER Report"], title: "Lift LOLER Thorough Examination",
    whatToKeep: "A written thorough examination report from an independent competent person — separate from your routine maintenance contract.",
    why: "This is easy to miss: a lift servicing/maintenance contract does not satisfy this legal requirement. They're two separate obligations, and paying for one doesn't cover the other.",
    frequency: "Every 6 months for lifts that carry people (this interval can't be extended, even by a written scheme); every 12 months for goods-only lifts.",
    evidence: "Written report listing defects found, condition assessed, and the next due date.",
    retention: "Keep current and previous reports — HSE can request historic records.",
    legislation: "Lifting Operations and Lifting Equipment Regulations (LOLER) 1998, Regulation 9." },
  { id: "lift-service", category: "equipment", matchMode: "preset", matchValues: ["Lift service"], title: "Lift Routine Servicing",
    whatToKeep: "Maintenance visit records — separate from, and in addition to, the LOLER thorough examination above.",
    why: "General equipment maintenance duty, and keeps the lift reliable between formal examinations.",
    frequency: "Typically every 1–3 months in a hotel (higher-use environments often go monthly).",
    evidence: "Engineer's visit report.",
    retention: "Keep current maintenance history.",
    legislation: "Provision and Use of Work Equipment Regulations (PUWER) 1998." },
  { id: "pat", category: "equipment", matchMode: "preset", matchValues: ["PAT testing"], certTypes: ["PAT Testing Summary"], title: "PAT Testing (Portable Appliances)",
    whatToKeep: "A pass/fail test record per portable appliance.",
    why: "Portable electrical equipment must be maintained in a safe condition.",
    frequency: "No fixed legal interval — HSE recommends a risk-based approach. Annual is a common hotel baseline; heavily-used items (kettles, hairdryers, kitchen equipment) may warrant more frequent checks.",
    evidence: "PAT record per appliance — date, result, tester, asset reference.",
    retention: "Current test cycle plus one previous cycle is reasonable practice.",
    legislation: "Electricity at Work Regulations 1989; PUWER 1998 (no single statutory interval — this is HSE guidance, not a fixed legal number)." },
  { id: "eicr", category: "equipment", matchMode: "preset", matchValues: ["EICR (electrical installation)"], certTypes: ["EICR"], title: "EICR (Fixed Electrical Installation)",
    whatToKeep: "A full Electrical Installation Condition Report from a qualified electrician.",
    why: "Fixed wiring degrades over time and is a significant fire-cause category in commercial buildings.",
    frequency: "Commonly every 5 years for commercial premises per industry guidance (IET Guidance Note 3) — not a fixed statutory interval, but expected by insurers and EHOs.",
    evidence: "EICR certificate listing any C1/C2/C3 observation codes and remedial actions taken.",
    retention: "Keep until superseded by the next EICR, plus evidence remedial work was completed.",
    legislation: "Electricity at Work Regulations 1989; BS 7671 (IET Wiring Regulations)." },
  { id: "gas-safety", category: "equipment", matchMode: "preset", matchValues: ["Gas safety check"], certTypes: ["Gas Safety Certificate (CP12)"], title: "Gas Safety Check",
    whatToKeep: "An annual Gas Safety Record/Certificate (CP12) covering every gas appliance serving guest accommodation.",
    why: "This applies specifically to hotels and B&Bs — even appliances sited away from guest rooms if they serve guest accommodation.",
    frequency: "Annually (can be renewed 10–12 months after the last check without losing the original due date).",
    evidence: "Gas Safety Record from a Gas Safe registered engineer.",
    retention: "At least 2 years (recommended to keep longer, e.g. for the engineer's working life on site).",
    legislation: "Gas Safety (Installation and Use) Regulations 1998, as amended 2018." },
  { id: "kitchen-equipment", category: "equipment", matchMode: "preset", matchValues: ["Kitchen equipment service"], title: "Kitchen Equipment & Extraction Servicing",
    whatToKeep: "Service records for cooking equipment, and separately, extraction/ductwork cleaning.",
    why: "Grease buildup in kitchen extraction is a leading cause of commercial kitchen fires — this is both an equipment and a fire safety matter.",
    frequency: "Per manufacturer guidance for equipment; extraction/ductwork cleaning typically every 6–12 months depending on usage (TR19 guidance).",
    evidence: "Service/cleaning certificate.",
    retention: "Keep current plus previous for insurance and Fire Risk Assessment purposes.",
    legislation: "PUWER 1998; BESA/TR19 guidance on ductwork cleanliness." },
  { id: "ac-filter", category: "equipment", matchMode: "preset", matchValues: ["AC filter clean", "AC service"], title: "Air Conditioning Filter Cleaning & Servicing",
    whatToKeep: "A record of when filters were last cleaned or replaced, and any wider servicing carried out.",
    why: "Dirty filters reduce air quality and system efficiency, and neglected AC systems (particularly those with a water/humidification element) can be a Legionella risk — not just an equipment matter.",
    frequency: "No single fixed legal interval — follow manufacturer guidance; filters in guest rooms are commonly cleaned quarterly, with a fuller service annually.",
    evidence: "Cleaning/service log per unit, ideally linked to the specific Air Conditioning asset.",
    retention: "Keep current plus previous service history.",
    legislation: "General duty under the Health and Safety at Work etc Act 1974; HSE ACOP L8 where a water/humidification element is present; F-Gas Regulations may apply to refrigerant-handling servicing on larger systems." },
  { id: "gen-ra", category: "risk", matchMode: "preset", matchValues: ["General H&S risk assessment"], title: "General H&S Risk Assessment",
    whatToKeep: "Written risk assessments covering your general workplace activities.",
    why: "Baseline legal duty — you must identify and control foreseeable risks to staff and guests.",
    frequency: "Review when activities/circumstances change; annual review is common good practice.",
    evidence: "Written assessment (mandatory in writing if you have 5+ employees; recommended for everyone).",
    retention: "Keep current plus review history.",
    legislation: "Management of Health and Safety at Work Regulations 1999, Regulation 3." },
  { id: "coshh", category: "risk", matchMode: "preset", matchValues: ["COSHH assessment"], title: "COSHH Assessment",
    whatToKeep: "An assessment for each hazardous substance in use (cleaning chemicals, pool/spa chemicals, etc.) plus safety data sheets.",
    why: "Hazardous substances need documented controls, not just correct storage.",
    frequency: "Review when substances or processes change, or periodically (e.g. annually).",
    evidence: "COSHH assessment per substance, current safety data sheets.",
    retention: "Keep current plus review history.",
    legislation: "Control of Substances Hazardous to Health Regulations (COSHH) 2002." },
  { id: "manual-handling-ra", category: "risk", matchMode: "preset", matchValues: ["Manual handling assessment"], title: "Manual Handling Assessment",
    whatToKeep: "Assessment of manual handling tasks (housekeeping, laundry, deliveries).",
    why: "Manual handling injuries are one of the most common workplace injury categories in hospitality.",
    frequency: "Review when tasks or equipment change.",
    evidence: "Written assessment identifying tasks and control measures.",
    retention: "Keep current plus review history.",
    legislation: "Manual Handling Operations Regulations 1992." },
  { id: "slips-ra", category: "risk", matchMode: "preset", matchValues: ["Slips, trips & falls assessment"], title: "Slips, Trips & Falls Assessment",
    whatToKeep: "Assessment of flooring, lighting, and housekeeping practices that affect slip/trip risk.",
    why: "One of the most common causes of injury claims against hotels.",
    frequency: "Review periodically and after any incident.",
    evidence: "Written assessment; incident-linked review notes.",
    retention: "Keep current plus review history.",
    legislation: "Workplace (Health, Safety and Welfare) Regulations 1992; Management of H&S at Work Regs 1999." },
  { id: "lone-working-ra", category: "risk", matchMode: "preset", matchValues: ["Lone working assessment"], title: "Lone Working Assessment",
    whatToKeep: "Assessment covering night staff, early cleaners, or anyone working without direct supervision.",
    why: "Employers must protect staff who work alone from foreseeable risks, including violence.",
    frequency: "Review periodically and when shift patterns change.",
    evidence: "Written assessment and any lone-worker procedures/devices in place.",
    retention: "Keep current plus review history.",
    legislation: "Health and Safety at Work etc Act 1974 (general duty); HSE lone working guidance." },
  { id: "fire-training", category: "training", matchMode: "preset", matchValues: ["Fire Safety Awareness"], title: "Fire Safety Awareness Training",
    whatToKeep: "A training record per staff member, with completion and expiry/refresh dates.",
    why: "All staff need to know evacuation procedures and their role in a fire — this is a specific legal training duty, not just good practice.",
    frequency: "On induction, then refreshed at least annually.",
    evidence: "Training certificate or sign-off record per staff member.",
    retention: "Duration of employment, plus a reasonable period after (e.g. 2 years).",
    legislation: "RRFSO 2005, Article 21." },
  { id: "first-aid-training", category: "training", matchMode: "preset", matchValues: ["First Aid at Work"], title: "First Aid at Work Training",
    whatToKeep: "Certificates for your appointed first aiders.",
    why: "You must provide adequate first aid provision based on your workforce and risk profile.",
    frequency: "Certificates are typically valid 3 years (First Aid at Work) or 1 year (Emergency First Aid at Work).",
    evidence: "Training certificate from an HSE-approved provider.",
    retention: "Duration of validity, kept alongside the employment record.",
    legislation: "Health and Safety (First-Aid) Regulations 1981." },
  { id: "food-hygiene-training", category: "training", matchMode: "preset", matchValues: ["Food Hygiene Level 2"], title: "Food Hygiene Training",
    whatToKeep: "Certificates for anyone handling food.",
    why: "Food handlers must be trained/supervised commensurate with their role.",
    frequency: "No fixed legal expiry, but refreshing every 3 years is standard industry practice.",
    evidence: "Training certificate.",
    retention: "Duration of employment.",
    legislation: "Food Safety Act 1990; Food Hygiene (England) Regulations 2013 (or devolved equivalent)." },
  { id: "manual-handling-training", category: "training", matchMode: "preset", matchValues: ["Manual Handling"], title: "Manual Handling Training",
    whatToKeep: "Training records for staff who lift, carry, or move loads as part of their role.",
    why: "Training is one of the required control measures once a manual handling risk is identified.",
    frequency: "On induction, refreshed periodically (e.g. every 2–3 years) or after a relevant incident.",
    evidence: "Training certificate or sign-off record.",
    retention: "Duration of employment.",
    legislation: "Manual Handling Operations Regulations 1992." },
  { id: "hs-induction", category: "training", matchMode: "preset", matchValues: ["Health & Safety Induction"], title: "Health & Safety Induction",
    whatToKeep: "A record that every new starter received a H&S induction before starting unsupervised work.",
    why: "General duty to provide information, instruction, training and supervision.",
    frequency: "Before starting work, then reinforced through ongoing training.",
    evidence: "Signed induction checklist.",
    retention: "Duration of employment.",
    legislation: "Health and Safety at Work etc Act 1974; Management of Health and Safety at Work Regulations 1999." },
  { id: "legionella-training", category: "training", matchMode: "preset", matchValues: ["Legionella Awareness"], title: "Legionella Awareness Training",
    whatToKeep: "Training records for whoever holds the 'responsible person' role for water hygiene.",
    why: "ACOP L8 requires the responsible person to be competent — that competence needs to be demonstrable, not assumed.",
    frequency: "On appointment, refreshed periodically (e.g. every 2–3 years).",
    evidence: "Training certificate.",
    retention: "Duration of appointment.",
    legislation: "HSE ACOP L8 (competency requirement)." },
  { id: "pest-monitoring", category: "pest", matchMode: "category", matchValues: [], title: "Pest Monitoring & Control",
    whatToKeep: "Ongoing monitoring records plus a log of every sighting and the action taken.",
    why: "Food premises must be kept free from pests, and any infestation must be dealt with promptly and documented.",
    frequency: "Regular proactive inspection (e.g. monthly contractor visits) plus immediate logging of any sighting.",
    evidence: "Contractor visit reports, in-house sighting/treatment log.",
    retention: "Keep for at least 2 years to support EHO inspections.",
    legislation: "Food Safety Act 1990; Food Hygiene (England) Regulations 2013; general duty under the Health and Safety at Work etc Act 1974." },
  { id: "riddor", category: null, matchMode: "none", matchValues: [], title: "Accident Book & RIDDOR Reporting",
    whatToKeep: "Every workplace injury logged in an accident book, plus formal RIDDOR reports for qualifying incidents.",
    why: "Certain injuries, illnesses, and dangerous occurrences must be reported to HSE, not just recorded internally.",
    frequency: "Ongoing — RIDDOR-reportable incidents must be reported without delay (fatalities and specified injuries within 10 days; over-7-day incapacitation within 15 days).",
    evidence: "Accident book entries; RIDDOR online submission reference where applicable.",
    retention: "At least 3 years from the date of the entry.",
    legislation: "Reporting of Injuries, Diseases and Dangerous Occurrences Regulations (RIDDOR) 2013.",
    appNote: "This app doesn't have a dedicated record type for accidents/RIDDOR yet — for now, keep this in a physical or digital accident book and let me know if you'd like it built in." },
  { id: "haccp", category: null, matchMode: "none", matchValues: [], title: "Food Safety Management System (HACCP)",
    whatToKeep: "A documented food safety management system plus daily diary records (fridge/freezer temps, cooking/cooling temps, cleaning schedule).",
    why: "Food businesses must have food safety procedures based on HACCP principles — this is usually what an EHO asks to see first.",
    frequency: "Diary records daily/per service; review the management system after any menu, process, or supplier change.",
    evidence: "Written food safety management system (e.g. a Safer Food Better Business-style pack); daily diary sheets.",
    retention: "Keep diary records for at least 12 months; keep the management system document current.",
    legislation: "Food Safety Act 1990; Regulation (EC) 852/2004; Food Hygiene (England) Regulations 2013.",
    appNote: "This app doesn't have a dedicated record type for daily food safety diaries yet — flag if you'd like this built in." },
  { id: "el-insurance", category: null, matchMode: "none", matchValues: [], title: "Employers' Liability Insurance",
    whatToKeep: "A current Employers' Liability insurance certificate, displayed where staff can see it (or accessible electronically).",
    why: "This is a legal minimum, not optional business insurance.",
    frequency: "Renew annually with your policy.",
    evidence: "Current certificate.",
    retention: "At least 40 years from the policy expiry date — this is a specific statutory minimum, much longer than most other records.",
    legislation: "Employers' Liability (Compulsory Insurance) Act 1969.",
    appNote: "This app doesn't have a dedicated record type for insurance documents yet — flag if you'd like this built in." },
];

/* First Day Audit — priority weighting and helpers */
export const AUDIT_PRIORITY = {
  fra: "high", "legionella-ra": "high", "water-temp": "high", "gas-safety": "high", "loler-lift": "high",
  eicr: "high", "fire-alarm-weekly": "high", "fire-alarm-service": "high", "el-insurance": "high", riddor: "high",
  descale: "low", "lift-service": "low", "manual-handling-training": "low",
};
export const getAuditPriority = (req) => AUDIT_PRIORITY[req.id] || "medium";
export const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
export const ANSWER_OPTIONS = [
  { key: "yes-current", label: "Yes — current & documented", color: "#2F6B4C" },
  { key: "yes-outdated", label: "Yes — but outdated / incomplete", color: "#B8862B" },
  { key: "no", label: "No — doesn't exist", color: "#A8402F" },
  { key: "unsure", label: "Not sure", color: "#6E6A61" },
];
export const AUDIT_CATEGORIES = ["fire", "legionella", "equipment", "risk", "training", "pest", "general"];
export const auditCategoryLabel = (c) => (c === "general" ? "General" : TEMPLATES[c].label);
export function getImmediateAction(req) {
  if (req.matchMode === "none") return `Set up a simple process for this now, even outside the app. Start with: ${req.evidence}`;
  const t = TEMPLATES[req.category];
  if (t?.mode === "expiry") return "Book the training and log the certificate here — that's your first record.";
  if (req.category === "risk") return "Commission or write this risk assessment, then log it here so its review date is tracked.";
  if (t?.mode === "incident") return "Start logging any reports from today, even if nothing has happened recently.";
  if (t?.mode === "recurring") return "Carry out this check as soon as possible and log it — that becomes your first piece of evidence.";
  return "Get this in place and log it here.";
}

export const ROLES = ["Employee", "General Manager"];
export const RoleContext = createContext({ role: "Employee", currentUser: null, canEdit: false, canDelete: false, canManageUsers: false, canViewSensitive: false });



// Certificate / Visit / User reference data
export const CERT_TYPES = ["Gas Safety Certificate (CP12)", "EICR", "PAT Testing Summary", "Fire Alarm Service Certificate", "Legionella Risk Assessment", "Employers' Liability Insurance", "Public Liability Insurance", "Lift LOLER Report", "Food Hygiene Rating", "Other"];
export const CERTIFICATE_HISTORY_FIELDS = { title: "Title", certType: "Type", issuer: "Issuer", issueDate: "Issue date", expiryDate: "Expiry date", coverage: "Coverage", notes: "Notes" };
export const VISIT_TYPES = ["Environmental Health Inspection", "Fire Officer Inspection", "Food Safety Inspection", "Health & Safety Executive Visit", "Licensing Visit", "Insurance Assessor Visit", "Other"];
export const VISIT_OUTCOMES = ["No issues found", "Advice given", "Improvement notice issued", "Prohibition notice issued", "Enforcement action", "Follow-up required", "Other"];
export const SERIOUS_OUTCOMES = ["Improvement notice issued", "Prohibition notice issued", "Enforcement action"];
export const VISIT_HISTORY_FIELDS = { visitType: "Visit type", visitDate: "Visit date", officerName: "Officer name", authority: "Authority", outcome: "Outcome", findings: "Findings", actionsRequired: "Actions required", followUpDate: "Follow-up date", status: "Status", notes: "Notes" };
export const USER_HISTORY_FIELDS = { name: "Name", email: "Email", role: "Role" };

export const STATUS_META = {
  overdue: { label: "Overdue", color: "#A8402F" },
  "due-soon": { label: "Due soon", color: "#B8862B" },
  compliant: { label: "Compliant", color: "#2F6B4C" },
  open: { label: "Open", color: "#A8402F" },
  "in-progress": { label: "In progress", color: "#B8862B" },
  resolved: { label: "Resolved", color: "#2F6B4C" },
  "no-checks": { label: "No checks logged", color: "#6E6A61" },
  logged: { label: "Logged", color: "#4A5A8A" },
  missing: { label: "Never logged", color: "#A8402F" },
  "not-tracked": { label: "Not tracked in app", color: "#8A6D1F" },
  tracked: { label: "Tracked", color: "#2F6B4C" },
};

export const RECORD_HISTORY_FIELDS = {
  title: "Title", location: "Location", people: "Responsible / people", notes: "Notes", detail: "Type / detail",
  lastCompleted: "Last completed", frequencyDays: "Frequency (days)", completedDate: "Completed date", expiryDate: "Expiry date",
  dateReported: "Date reported", dateRaised: "Date raised", dateLogged: "Date", actionTaken: "Action taken",
  priority: "Priority", status: "Status", flagged: "Flagged as failed", flagDescription: "Flag description",
  flagResolved: "Flag resolved", flagResolvedNotes: "Flag resolution notes", resolvedNotes: "Resolution notes", resolvedDate: "Resolved date",
  temperatureC: "Temperature reading", readingType: "Reading type", checks: "Fire Log checklist", note: "Check note",
  awaitingContactName: "Awaiting", resolvedContactName: "Resolved by",
};
export const ASSET_HISTORY_FIELDS = { assetType: "Asset type", category: "Category", eligibleFor: "Eligible for", assetCode: "Asset code", name: "Name", location: "Location", manufacturer: "Manufacturer", model: "Model", serialNumber: "Serial number", installDate: "Installed on", status: "Status", notes: "Notes" };
export const ROOM_HISTORY_FIELDS = { roomNumber: "Room number", floor: "Floor", roomType: "Room type", notes: "Notes" };
export const CONTRACTOR_HISTORY_FIELDS = { name: "Name", contactName: "Contact person", phone: "Phone", email: "Email", insuranceExpiry: "Insurance expiry", notes: "Notes" };
export const CHECKPOINT_HISTORY_FIELDS = { name: "Name", notes: "Notes" };
export const STAFF_HISTORY_FIELDS = { name: "Name", role: "Role / position", email: "Email", phone: "Phone", startDate: "Start date", notes: "Notes" };
