Here’s a **Markdown (`.md`) reference guide** that documents exactly what your final script does, how to configure it, and shows the workflow step‑by‑step with examples.

---

# 🧩 JSON Injection & Merge Script Reference

### 📛 File Name
`json_injector.py` (or any custom name you use)

---

## 🧠 Purpose

This script merges or *injects* new data (from a **Source JSON**) into an existing **Base JSON** file, following a **manual field mapping** setup defined by you.

### Key Features

✅ Manually define which fields from Source map to Base.  
✅ Supports *manual extra inputs* that can fill in missing Source data.  
✅ Automatically normalizes date formats (to `YYYY-MM-DD`).  
✅ Removes empty or `None` fields.  
✅ Sorts all records by date (oldest → newest).  
✅ Always creates a **new timestamped file**, keeping the old one as backup.  
✅ Logs how many entries were:
  - already in Base,
  - injected from Source,
  - saved in the new file.

---

## ⚙️ Setup and Configuration

### 1️⃣ Manual Inputs

These are fields you can use to inject manual data if your Source JSON doesn’t have some values (for example, all events in the current batch belong to the `"Technology"` category).

```python
EXTRA_MANUAL_INPUTS = {
    "extraManualInput1": "Technology",  # Example: will be injected with "extraManualField1"
    "extraManualInput2": "Custom Prefix or Note",
    "extraManualInput3": None           # Unused slot
}
```

### 2️⃣ Field Mapping

Here you define how each field in your **Base JSON structure** maps to fields in the **Source JSON**.

- The **keys** (`id`, `date`, etc.) **must remain** because they define the structure of the Base JSON.
- The **values** are where you define the **Source JSON field names**.
- You can also reference `extraManualField1`, `extraManualField2`, `extraManualField3` to inject manual values defined above.

```python
FIELD_MAPPING = {
    "id": "text_en",
    "date": "date",
    "category": "extraManualField1",    # Injects "Technology"
    "title": "title_en",
    "shortDescription": "description_tooltip_en",
    "longDescription": "description_full_en",
    "externalLink": "url"
}
```


Perfect 🎯  
You’re asking for a **clear, commented Python example** showing:

1. How the script now handles **nested data fields** using *dot notation* in the `FIELD_MAPPING`.  
2. What happens when the **Source JSON** is nested multiple levels deep (3 levels, for example).  
3. Explain everything (no mysterious `F0G` — maybe you saw “fmt” or “for loop” earlier 😁).

Let’s make it super clear and practical.

---

# 🧩 Updated Code with Full Comments — Nested Field Support

```python
# - nested fields are written with dot notation, e.g. "links.0.text_en"
FIELD_MAPPING = {
    "id": "meta.event.details.name",       # nested 3 levels deep
    "date": "meta.event.date",             # nested 2 levels deep
    "category": "extraManualField1",       # inject from manual
    "title": "meta.event.details.title_en",
    "shortDescription": "meta.event.details.short_en",
    "longDescription": "meta.event.details.long_en",
    "externalLink": "meta.event.details.link.url"
}

```
---

# 🧱 Example: Nested Source JSON (3 Levels Deep)

**Source data (`source.json`):**

```json
[
  {
    "meta": {
      "event": {
        "date": "2024-02-24",
        "details": {
          "name": "halving_2024",
          "title_en": "🚀 Bitcoin Halving 2024",
          "short_en": "The 4th Bitcoin halving reduces block reward.",
          "long_en": "Miners' reward drops from 6.25 to 3.125 BTC, historically leading to price adjustments.",
          "link": {
            "url": "https://bitcoinhalving.com/"
          }
        }
      }
    }
  }
]
```

---

# 🧾 Explanation of How the Mapping Works

| Base field | Source field path | Explanation |
|-------------|------------------|-------------|
| `id` | `meta.event.details.name` | Go inside `meta ➜ event ➜ details ➜ name` |
| `date` | `meta.event.date` | Go inside `meta ➜ event ➜ date` |
| `category` | `extraManualField1` | Use `"Technology"` from manual inputs |
| `title` | `meta.event.details.title_en` | Retrieves nested `title_en` |
| `shortDescription` | `meta.event.details.short_en` | Retrieves nested `short_en` |
| `longDescription` | `meta.event.details.long_en` | Retrieves nested `long_en` |
| `externalLink` | `meta.event.details.link.url` | Follows deeper nesting inside the `"link"` dictionary |

---

# ✅ Output Example

After running the script, the merged entry will look like this:

```json
{
  "id": "halving_2024",
  "date": "2024-02-24",
  "category": "Technology",
  "title": "🚀 Bitcoin Halving 2024",
  "shortDescription": "The 4th Bitcoin halving reduces block reward.",
  "longDescription": "Miners' reward drops from 6.25 to 3.125 BTC, historically leading to price adjustments.",
  "externalLink": "https://bitcoinhalving.com/"
}
```

---

# 💡 How Dot Notation Works (Simple Explanation)

- `.` means “go deeper inside a nested object or list.”
- `0`, `1`, etc., can be used to access list indices.
- So `"links.0.text_en"` is equivalent to:
  ```python
  data["links"][0]["text_en"]
  ```
- `"meta.event.details.title_en"` means:
  ```python
  data["meta"]["event"]["details"]["title_en"]
  ```

This way, you **only declare** where to look for the data in `FIELD_MAPPING`, without editing code each time your JSON source uses a different nested structure.

---


---

## 📂 File Inputs

```python
BASE_JSON_FILE = "./historical_data/bitcoinHistoricalEvents.json"
SOURCE_JSON_FILE = "./historical_data/source.json"
OUTPUT_PREFIX = "./historical_data/merged_output"
```

- `BASE_JSON_FILE` → your main file (existing events).  
- `SOURCE_JSON_FILE` → new data to inject.  
- `OUTPUT_PREFIX` → prefix for new timestamped output (actual file like `merged_output_2025-06-26_153215.json`).

---

## 🧩 Workflow

### Step 1: Run the Script

```bash
python json_injector.py
```

### Step 2: Script Actions

1. **Loads** both files (`base.json` and `source.json`).
2. **Reports** how many entries each contains.
3. **Maps** each item from Source → Base using your defined mapping.
4. **Injects manual data** where `extraManualFieldX` mappings are used.
5. **Normalizes** dates (to `YYYY-MM-DD`).
6. **Cleans up** empty or missing fields.
7. **Merges** the new items into the Base list.
8. **Sorts** them all by date (ascending).
9. **Writes with duplicates avoidance** a new file like:
   ```
   ./historical_data/merged_output_2025-06-26_153215.json
   ```
10. **Prints summary logs**.

---

## 🪄 Example Workflow

### Base File (`bitcoinHistoricalEvents.json`)
```json
[
  {
    "id": "genesis",
    "date": "2009-01-03",
    "category": "security",
    "title": "Bitcoin Genesis Block Mined",
    "shortDescription": "Satoshi mined the first Bitcoin block.",
    "longDescription": "Marked the start of the Bitcoin network.",
    "externalLink": "https://en.bitcoin.it/wiki/Genesis_block"
  }
]
```

### Source File (`source.json`)
```json
[
{
    "date": "2009-01-12",
    "category": "Technology",
    "title_es": "👨‍💻 Primera transacción",
    "description_tooltip_es": "Satoshi envía 10 BTC .... de la historia!",
    "description_full_es": "El 12 de enero ....información y las finanzas.",
    "title_en": "👨‍💻 First Transaction",
    "description_tooltip_en": "Satoshi sends 10 BTC to Hal Finney, a cryptography pioneer. The first BTC transfer in history!",
    "description_full_en": "On January 12,.....technology and finance.",
    "links": [
      {
        "text_es": "La primera transacción de Bitcoin",
        "text_en": "First Bitcoin Transaction",
        "url": "https://www.guinnessworldrecords.es/world-records/696243-first-bitcoin-transaction"
      }
    ]
  }
]
```

### Manual Section in Script

```python
EXTRA_MANUAL_INPUTS = {
    "extraManualInput1": "Technology",
    "extraManualInput2": "",
    "extraManualInput3": None
}
FIELD_MAPPING = {
    "id": "text_en",
    "date": "date",
    "category": "extraManualField1",  # Fills missing category with 'Technology'
    "title": "title_en",
    "shortDescription": "description_tooltip_en",
    "longDescription": "description_full_en",
    "externalLink": "url"
}
```

### Result JSON (new generated file)
`merged_output_2025-06-26_153215.json`
```json
[
  {
    "id": "genesis",
    "date": "2009-01-03",
    "category": "security",
    "title": "Bitcoin Genesis Block Mined",
    "shortDescription": "Satoshi mined the first Bitcoin block.",
    "longDescription": "Marked the start of the Bitcoin network.",
    "externalLink": "https://en.bitcoin.it/wiki/Genesis_block"
  },
  {
    "id": "ai_launch",
    "date": "2025-03-01",
    "category": "Technology",
    "title": "AI Launches Platform",
    "shortDescription": "An AI-based blockchain product is launched.",
    "longDescription": "Combines AI and blockchain in a new way.",
    "externalLink": "https://ai.example.com"
  }
]
```

---

## 📊 Console Output Example

```
📄 Base loaded: 42 items, Source loaded: 38 items
🔎 Checking for duplicates... Found 42 existing IDs.
🚫 Duplicates skipped : 38
🆕 Unique new items    : 0

✅ Merge Summary:
   Existing entries : 42
   Source entries   : 38
   Added (unique)   : 0
   Skipped (dupes)  : 38
   Total in new file: 42
💾 New file created : ./historical_data/merged_output_2025-10-18_230433.json
🟢 Check the new file, and archive/delete the old one if satisfied.
```

---

## 🧹 Notes & Tips

💡 You can have up to **three manual fields** ready for injection.  
💡 Use `"extraManualField1"`, `"extraManualField2"`, or `"extraManualField3"` in your mapping.  
💡 Always review the new file before deleting or overwriting your original Base file.  
💡 You can safely re-run at any time — every run produces a new timestamped output file.

---

## 🛠️ Typical Use Case
- You get a batch of new events from another tool or API.
- The data fields (keys) don't match your app’s expected JSON structure.
- You load both files and let this script normalize and inject them into your Base JSON, keeping everything consistent and ordered by time.

Excellent question 👏 — date/time parsing differences are one of the most common pitfalls in merging JSON data.  
Let’s go through it clearly in Markdown format so you can add it to your project documentation.  

---

# 🕓 Handling Different Date/Time Formats

### 🎯 Goal
Ensure **all date fields** end up following the consistent format:
```json
"date": "2009-01-03"
```
That’s the **ISO-like format `YYYY-MM-DD`**, which your base JSON uses.

---

## ⚙️ How the Script Currently Deals With Dates

Inside the function:
```python
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
```

### ▲ What it does:
1. Tries **multiple known patterns** (from strict to more human-friendly).  
2. When a match is found, it converts and *normalizes* the date string.  
3. If none of the formats match, it **keeps the original string** and prints a ⚠️ warning.

---

## 🧩 Supported Scenarios

> All of the following will be converted to `"2009-01-03"` automatically.

| Scenario | Example Input | Format Recognized As | Converted To |
|-----------|----------------|----------------------|---------------|
| ✅ **ISO format (already correct)** | `"2009-01-03"` | `%Y-%m-%d` | `"2009-01-03"` |
| ✅ **European format (dashes)** | `"03-01-2009"` | `%d-%m-%Y` | `"2009-01-03"` |
| ✅ **European format (slashes)** | `"03/01/2009"` | `%d/%m/%Y` | `"2009-01-03"` |
| ✅ **Day + short month name** | `"3 Jan 2009"` | `%d %b %Y` | `"2009-01-03"` |
| ✅ **Long month name with comma** | `"January 3, 2009"` | `%B %d, %Y` | `"2009-01-03"` |
| ⚠️ **Year-first with slashes** | `"2009/01/03"` | ❌ not covered in current formats | stays as `"2009/01/03"` |
| ⚠️ **With time component** | `"2009-01-03T10:15:00Z"` | ❌ not handled (will remain unchanged) |
| ⚠️ **Verbose text** | `"Sat, 03 Jan 2009"` | ❌ not handled (will remain unchanged) |

---

## 🔧 Expanding Date Support (Optional)

If your sources vary more, you can broaden the conversion logic like this:

```python
def convert_date_format(date_string):
    """Extended normalization for more date/time formats."""
    if not date_string:
        return None
    tried_formats = [
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y",
        "%d %b %Y", "%B %d, %Y",
        "%Y/%m/%d",                   # handle 2009/01/03
        "%Y-%m-%dT%H:%M:%SZ",         # handle 2009-01-03T10:15:00Z
        "%Y-%m-%dT%H:%M:%S.%fZ",      # handle fractional seconds
        "%a, %d %b %Y",               # handle Sat, 03 Jan 2009
        "%Y.%m.%d"                    # handle 2009.01.03
    ]
    for fmt in tried_formats:
        try:
            d = datetime.strptime(date_string, fmt)
            return d.strftime("%Y-%m-%d")
        except ValueError:
            continue
    print(f"⚠️ Could not parse date '{date_string}', leaving as-is.")
    return date_string
```

This extended version includes:
- Slash-style year-first format (`%Y/%m/%d`)
- ISO timestamp with or without milliseconds
- RFC‑style date strings (`Sat, 03 Jan 2009`)
- Dotted format (`2009.01.03`)

---

## 🧠 Recommended Workflow

1. **Inspect your source data first**  
   → Identify all date formats currently present.

2. **Add those formats** to the pattern list inside `convert_date_format`.

3. **Run the script** and watch the warnings (⚠️ lines in the console).  
   They tell you which entries had dates that didn’t match any known patterns.

4. **Optionally log the errors** to a text file if you’re running big datasets.

---

## 🧾 Example: Mixed Dates

### Source Input
```json
[
  {"date": "03-01-2009"},
  {"date": "January 3, 2009"},
  {"date": "2009/01/03"},
  {"date": "2009-01-03T10:15:00Z"}
]
```

### Console Output
```
⚠️ Could not parse date '2009/01/03', leaving as-is.
⚠️ Could not parse date '2009-01-03T10:15:00Z', leaving as-is.
```

### Merged Output
```json
[
  {"date": "2009-01-03"},
  {"date": "2009-01-03"},
  {"date": "2009/01/03"},
  {"date": "2009-01-03T10:15:00Z"}
]
```

After seeing the warnings, you can simply add those two extra date patterns into the list and rerun the script — no data lost, and it will fix itself next time.

---

## ✅ Summary

| Step | What Happens |
|------|---------------|
| 1️⃣ | Script attempts to parse each date string using predefined format list |
| 2️⃣ | If a match is found → normalized to `"YYYY-MM-DD"` |
| 3️⃣ | If no match → left unchanged but ⚠️ warning is printed |
| 4️⃣ | You can easily add more formats to the conversion list for future sources |

---

**Takeaway:**  
The conversion system is flexible — you can make it recognize any date pattern your data sources use simply by extending the `tried_formats` list inside `convert_date_format()`.
---

**Author:** Internal workflow documentation  
**Last Updated:** 2025‑10‑18