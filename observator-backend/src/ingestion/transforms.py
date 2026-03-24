"""Reusable transform functions for column mapping.

Each function has signature: (value, context: dict) -> Any
context contains lookup maps built at load time (time_map, sector_map, etc.)
"""
import logging
import re
from datetime import date

logger = logging.getLogger(__name__)

# ---------- Region transforms ----------

EMIRATE_TO_CODE = {
    "abu dhabi": "AUH",
    "abu dhabi emirate": "AUH",
    "al ain": "AUH",
    "dubai": "DXB",
    "sharjah": "SHJ",
    "ajman": "AJM",
    "ras al khaimah": "RAK",
    "ras al-khaimah": "RAK",
    "fujairah": "FUJ",
    "umm al quwain": "UAQ",
    "umm al-quwain": "UAQ",
    # Arabic variants
    "أبوظبي": "AUH",
    "أبو ظبي": "AUH",
    "دبي": "DXB",
    "الشارقة": "SHJ",
    "عجمان": "AJM",
    "رأس الخيمة": "RAK",
    "الفجيرة": "FUJ",
    "أم القيوين": "UAQ",
    # Bayanat variants
    "al dhafra": "AUH",
    "al dhafra region": "AUH",
    "al ain region": "AUH",
    "abu dhabi region": "AUH",
}


def location_to_region(value, context=None):
    """Map location string to region code. Returns None if unmappable."""
    if not value or str(value).strip() == "":
        return None
    s = str(value).strip().lower()
    # Skip national-level entries
    if s in ("uae", "united arab emirates", "emirates", "الإمارات"):
        return None
    code = EMIRATE_TO_CODE.get(s)
    if code:
        return code
    # Fuzzy: check if any key is a substring
    for k, v in EMIRATE_TO_CODE.items():
        if k in s or s in k:
            return v
    return None


def emirate_to_region_code(value, context=None):
    """Alias for location_to_region."""
    return location_to_region(value, context)


# ---------- Time transforms ----------

def date_to_time_id(value, context=None):
    """Parse date string → time_id from context['time_map']."""
    if not value:
        return None
    time_map = (context or {}).get("time_map", {})
    s = str(value).strip()
    # Try multiple date formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            from datetime import datetime
            dt = datetime.strptime(s[:10], fmt).date()
            return time_map.get(dt)
        except (ValueError, TypeError):
            continue
    # Try ISO datetime
    try:
        dt = date.fromisoformat(s[:10])
        return time_map.get(dt)
    except (ValueError, TypeError):
        pass
    return None


def year_to_time_id(value, context=None):
    """Year int/string → time_id for Jan 1 of that year."""
    if not value:
        return None
    time_map = (context or {}).get("time_map", {})
    try:
        yr = int(str(value).strip()[:4])
        if 1975 <= yr <= 2035:
            return time_map.get(date(yr, 1, 1))
    except (ValueError, TypeError):
        pass
    return None


def yyyymm_to_time_id(value, context=None):
    """Parse '201112' → year=2011, month=12 → time_id for 1st of month."""
    if not value:
        return None
    time_map = (context or {}).get("time_map", {})
    s = str(value).strip()
    if len(s) == 6 and s.isdigit():
        yr, mo = int(s[:4]), int(s[4:6])
        if 1 <= mo <= 12 and 1975 <= yr <= 2035:
            return time_map.get(date(yr, mo, 1))
    # Also try plain year
    return year_to_time_id(value, context)


# ---------- Sector transforms ----------

# Common industry → ISIC mapping
_INDUSTRY_TO_ISIC = {
    "information technology": "J",
    "it services": "J",
    "software development": "J",
    "computer software": "J",
    "internet": "J",
    "telecommunications": "J",
    "technology": "J",
    "financial services": "K",
    "banking": "K",
    "insurance": "K",
    "investment": "K",
    "accounting": "K",
    "real estate": "L",
    "construction": "F",
    "building materials": "F",
    "oil & energy": "B",
    "oil and gas": "B",
    "mining": "B",
    "mining and quarrying": "B",
    "manufacturing": "C",
    "automotive": "C",
    "chemicals": "C",
    "food production": "C",
    "food & beverages": "C",
    "textiles": "C",
    "logistics": "H",
    "transportation": "H",
    "airlines/aviation": "H",
    "maritime": "H",
    "warehousing": "H",
    "retail": "G",
    "wholesale": "G",
    "consumer goods": "G",
    "e-commerce": "G",
    "supermarkets": "G",
    "luxury goods & jewelry": "G",
    "hospitality": "I",
    "restaurants": "I",
    "food and beverage": "I",
    "leisure, travel & tourism": "I",
    "education": "P",
    "education management": "P",
    "higher education": "P",
    "primary/secondary education": "P",
    "e-learning": "P",
    "health": "Q",
    "hospital & health care": "Q",
    "medical devices": "Q",
    "pharmaceuticals": "Q",
    "health, wellness and fitness": "Q",
    "government": "O",
    "government administration": "O",
    "public administration": "O",
    "defense & space": "O",
    "military": "O",
    "law enforcement": "O",
    "judiciary": "O",
    "media": "J",
    "publishing": "J",
    "broadcast media": "J",
    "entertainment": "R",
    "arts": "R",
    "sports": "R",
    "performing arts": "R",
    "gambling & casinos": "R",
    "professional services": "M",
    "management consulting": "M",
    "legal services": "M",
    "research": "M",
    "architecture & planning": "M",
    "design": "M",
    "human resources": "N",
    "staffing and recruiting": "N",
    "security and investigations": "N",
    "facilities services": "N",
    "environmental services": "E",
    "renewables & environment": "D",
    "utilities": "D",
    "electrical": "D",
    "agriculture": "A",
    "farming": "A",
    "fishery": "A",
    "nonprofit": "S",
    "civic & social organization": "S",
    "religious institutions": "S",
    "international affairs": "U",
    "international trade and development": "U",
    "household": "T",
}

# Bayanat Economic Activity → ISIC
_ACTIVITY_TO_ISIC = {
    "agriculture, forestry, and fishing": "A",
    "agriculture, hunting and forestry and fishing": "A",
    "mining and quarrying": "B",
    "manufacturing": "C",
    "electricity, gas, steam, and air conditioning supply": "D",
    "electricity, gas and water supply": "D",
    "water supply; sewerage, waste management and remediation activities": "E",
    "construction": "F",
    "wholesale and retail trade": "G",
    "wholesale and retail trade; repair of motor vehicles and motorcycles": "G",
    "transportation and storage": "H",
    "transport, storage and communication": "H",
    "accommodation and food service activities": "I",
    "hotels and restaurants": "I",
    "information and communication": "J",
    "financial and insurance activities": "K",
    "financial intermediation": "K",
    "real estate activities": "L",
    "real estate, renting and business activities": "L",
    "professional, scientific and technical activities": "M",
    "administrative and support service activities": "N",
    "public administration and defence": "O",
    "public administration and defense; compulsory social security": "O",
    "education": "P",
    "human health and social work activities": "Q",
    "health and social work": "Q",
    "arts, entertainment and recreation": "R",
    "other service activities": "S",
    "other community, social and personal service activities": "S",
    "activities of households as employers": "T",
    "activities of extraterritorial organizations and bodies": "U",
    "activities of extraterritorial organisations": "U",
}


def industry_to_sector_id(value, context=None):
    """Map LinkedIn industry string → sector_id via fuzzy ISIC match."""
    if not value:
        return None
    sector_map = (context or {}).get("sector_map", {})  # {isic_code: sector_id}
    s = str(value).strip().lower()
    isic = _INDUSTRY_TO_ISIC.get(s)
    if not isic:
        # Fuzzy: check if any key is contained in value
        for k, v in _INDUSTRY_TO_ISIC.items():
            if k in s or s in k:
                isic = v
                break
    if isic:
        return sector_map.get(isic)
    return None


def activity_to_sector_id(value, context=None):
    """Map Bayanat Economic Activity → sector_id."""
    if not value:
        return None
    sector_map = (context or {}).get("sector_map", {})
    s = str(value).strip().lower()
    isic = _ACTIVITY_TO_ISIC.get(s)
    if not isic:
        for k, v in _ACTIVITY_TO_ISIC.items():
            if k in s or s in k:
                isic = v
                break
    if isic:
        return sector_map.get(isic)
    return None


# ---------- Occupation transforms ----------

# ISCO major group digit → label prefix
_ISCO_MAJOR = {
    "0": "Armed Forces",
    "1": "Manager",
    "2": "Professional",
    "3": "Technician",
    "4": "Clerical",
    "5": "Service and Sales",
    "6": "Skilled Agricultural",
    "7": "Craft",
    "8": "Plant and Machine Operator",
    "9": "Elementary",
}


def isco_major_group_to_occupation_id(value, context=None):
    """Parse '5-Service and Sales Worker' or '2-Professionals' → occupation_id.
    Looks up by isco_major_group digit in dim_occupation."""
    if not value:
        return None
    occ_map = (context or {}).get("occ_major_map", {})  # {major_group_str: occ_id}
    s = str(value).strip()
    # Extract leading digit
    digit = s[0] if s and s[0].isdigit() else None
    if digit:
        return occ_map.get(digit)
    return None


def soc_to_occupation_id(value, context=None):
    """SOC code → crosswalk → ISCO → occupation_id."""
    if not value:
        return None
    crosswalk = (context or {}).get("crosswalk", {})  # {soc_code: occupation_id}
    s = str(value).strip()
    # Try exact match
    occ_id = crosswalk.get(s)
    if occ_id:
        return occ_id
    # Try without dot (e.g., "11-1011" matches "11-1011.00")
    for k, v in crosswalk.items():
        if k.startswith(s) or s.startswith(k):
            return v
    return None


def esco_uri_to_occupation_id(value, context=None):
    """ESCO URI → dim_occupation.occupation_id via code_esco lookup."""
    if not value:
        return None
    esco_occ_map = (context or {}).get("esco_occ_map", {})  # {uri: occ_id}
    return esco_occ_map.get(str(value).strip())


def esco_uri_to_skill_id(value, context=None):
    """ESCO URI → dim_skill.skill_id via uri_esco lookup."""
    if not value:
        return None
    esco_skill_map = (context or {}).get("esco_skill_map", {})  # {uri: skill_id}
    return esco_skill_map.get(str(value).strip())


# ---------- Normalization transforms ----------

def gender_normalize(value, context=None):
    """Normalize gender to M/F/NULL."""
    if not value:
        return None
    s = str(value).strip().lower()
    if s in ("male", "males", "m", "ذكر", "ذكور"):
        return "M"
    if s in ("female", "females", "f", "أنثى", "إناث"):
        return "F"
    return None


def nationality_normalize(value, context=None):
    """Normalize nationality to citizen/expat/NULL."""
    if not value:
        return None
    s = str(value).strip().lower()
    if s in ("citizen", "emirati", "national", "مواطن", "مواطنين"):
        return "citizen"
    if s in ("non-citizen", "non citizen", "expat", "expatriate", "غير مواطن", "وافد", "وافدين"):
        return "expat"
    return None


def first_char(value, context=None):
    """Extract first character (e.g., ISCO major group from code)."""
    if not value:
        return None
    s = str(value).strip()
    return s[0] if s else None


def to_int(value, context=None):
    """Convert to integer, return 0 for failures."""
    if value is None:
        return 0
    try:
        f = float(str(value).strip().replace(",", ""))
        return int(f)
    except (ValueError, TypeError):
        return 0


def to_float(value, context=None):
    """Convert to float, return None for failures."""
    if value is None:
        return None
    try:
        return float(str(value).strip().replace(",", ""))
    except (ValueError, TypeError):
        return None


def passthrough(value, context=None):
    """Return value as-is (string)."""
    if value is None:
        return None
    return str(value).strip() or None


def strip_bom(value, context=None):
    """Strip BOM and whitespace."""
    if value is None:
        return None
    s = str(value).strip().lstrip("\ufeff")
    return s or None


# Registry of all transform functions by name
TRANSFORMS = {
    "location_to_region": location_to_region,
    "emirate_to_region_code": emirate_to_region_code,
    "date_to_time_id": date_to_time_id,
    "year_to_time_id": year_to_time_id,
    "yyyymm_to_time_id": yyyymm_to_time_id,
    "industry_to_sector_id": industry_to_sector_id,
    "activity_to_sector_id": activity_to_sector_id,
    "isco_major_group_to_occupation_id": isco_major_group_to_occupation_id,
    "soc_to_occupation_id": soc_to_occupation_id,
    "esco_uri_to_occupation_id": esco_uri_to_occupation_id,
    "esco_uri_to_skill_id": esco_uri_to_skill_id,
    "gender_normalize": gender_normalize,
    "nationality_normalize": nationality_normalize,
    "first_char": first_char,
    "to_int": to_int,
    "to_float": to_float,
    "passthrough": passthrough,
    "strip_bom": strip_bom,
}
