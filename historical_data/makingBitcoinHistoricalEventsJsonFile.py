import json
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------
# MANUAL CONFIGURATION SECTION
# ---------------------------------------------------------
# Map manual extra inputs which may stand in for real source fields.
# If you map a Base field to "extraManualField1", that field will
# receive the value of EXTRA_MANUAL_INPUTS["extraManualInput1"].

EXTRA_MANUAL_INPUTS = {
    "extraManualInput1": "",          # e.g., use for category
    "extraManualInput2": "", # optional manual text
    "extraManualInput3": None                   # leave None if unused
}

# Mapping: base_field : source_field
# You can reference "extraManualField1", "extraManualField2", etc.
# leave first column intact (base) and only change the right column from (source)
FIELD_MAPPING = {
    "id": "links.0.text_en",
    "date": "date",
    "category": "category",    # <-- can injects manual #1 ("Technology") by adding extraManualField1
    "title": "title_en",
    "shortDescription": "description_tooltip_en",
    "longDescription": "description_full_en",
    "externalLink": "links.0.url"
}

# File names
BASE_JSON_FILE = "./historical_data/bitcoinHistoricalEvents.json"
SOURCE_JSON_FILE = "./historical_data/source.json"
OUTPUT_PREFIX = "./historical_data/merged_output"  # a timestamp will be appended

# ---------------------------------------------------------
# END OF MANUAL CONFIGURATION SECTION
# ---------------------------------------------------------


def load_json(path):
    """Return JSON data, empty list if file missing."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"⚠️  File not found, creating new one: {path}")
        return []


def save_json(data, path):
    """Write JSON pretty‑formatted."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def convert_date_format(date_string):
    """Normalize various date patterns to YYYY‑MM‑DD."""
    if not date_string:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(date_string, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    print(f"⚠️ Could not parse date '{date_string}', leaving as-is.")
    return date_string


def get_manual_value(marker):
    """
    When field mapping points to 'extraManualFieldX',
    fetch the corresponding manual input text.
    """
    if marker.lower().startswith("extramanualfield"):
        try:
            idx = int(marker[-1])  # 1, 2 or 3
            return EXTRA_MANUAL_INPUTS.get(f"extraManualInput{idx}")
        except (ValueError, KeyError):
            return None
    return None

def get_nested_value(data, path):
    """
    Retrieve value from nested dict/list using dot notation, e.g. "links.0.text_en" -> means data["links"][0]["text_en"].
    Returns None if any part of the path is missing.
    """
    if not path:
        return None
    current = data
    for part in path.split("."):
        if isinstance(current, list):
            try:
                idx = int(part)
                current = current[idx]
            except (ValueError, IndexError):
                return None
        elif isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current

def map_source_to_base(src_item):
    """
    Use FIELD_MAPPING to build a base‑shaped dict from one source item.
    Handle extraManualFieldX markers and strip empty keys.
    """
    new_item = {}
    for base_field, source_field in FIELD_MAPPING.items():
        # If mapping points to extraManualFieldX
        manual_value = get_manual_value(source_field)
        if manual_value is not None:
            value = manual_value
        else:
            value = get_nested_value(src_item, source_field)

        # Convert date format if applicable
        if base_field == "date" and value:
            value = convert_date_format(value)

        # Keep only non‑empty values
        if value not in (None, "", []):
            new_item[base_field] = value

    return new_item


def generate_output_filename(prefix):
    """Make timestamped filename, e.g., merged_output_2025‑06‑26_153215.json"""
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    return f"{prefix}_{timestamp}.json"


def collect_existing_ids(data_list):
    """
    Collect all existing IDs from Base JSON.
    Handles cases where 'id' might be missing.
    """
    return {item.get("id").lower() for item in data_list if item.get("id")}


def main():
    # Load both JSON files
    base_data = load_json(BASE_JSON_FILE)
    source_data = load_json(SOURCE_JSON_FILE)

    base_count = len(base_data)
    source_count = len(source_data)
    print(f"📄 Base loaded: {base_count} items, Source loaded: {source_count} items")

    # Build a set of all existing IDs to detect duplicates
    existing_ids = collect_existing_ids(base_data)
    print(f"🔎 Checking for duplicates... Found {len(existing_ids)} existing IDs.")

    # Transform the Source data into Base-like items
    mapped_items = [map_source_to_base(item) for item in source_data]

    # Filter new items based on 'id' field
    new_unique_items = []
    duplicates_skipped = 0
    for new_item in mapped_items:
        item_id = new_item.get("id", "").lower()
        if item_id and item_id in existing_ids:
            # A duplicate -> skip it
            duplicates_skipped += 1
            continue
        if item_id:
            existing_ids.add(item_id)
        new_unique_items.append(new_item)

    print(f"🚫 Duplicates skipped : {duplicates_skipped}")
    print(f"🆕 Unique new items    : {len(new_unique_items)}")

    # Merge base + unique new items
    merged = base_data + new_unique_items

    # Sort merged data by date (oldest first)
    merged.sort(
        key=lambda it: datetime.strptime(it.get("date", "9999-12-31"), "%Y-%m-%d")
    )

    # Create timestamped filename for safety
    output_file = generate_output_filename(OUTPUT_PREFIX)
    save_json(merged, output_file)

    # Summary
    print("\n✅ Merge Summary:")
    print(f"   Existing entries : {base_count}")
    print(f"   Source entries   : {source_count}")
    print(f"   Added (unique)   : {len(new_unique_items)}")
    print(f"   Skipped (dupes)  : {duplicates_skipped}")
    print(f"   Total in new file: {len(merged)}")
    print(f"💾 New file created : {output_file}")
    print("🟢 Check the new file, and archive/delete the old one if satisfied.")

if __name__ == "__main__":
    main()