import os
import re
import glob
import json
import pandas as pd
from datetime import datetime

# ─── PATHS ────────────────────────────────────────────────────────────────────
BASE_DIR = r"d:\IISER-T\Dashboard"
LOCATIONS_FILE = os.path.join(BASE_DIR, "Location", "TST recorder locations.xlsx")
SPECIES_MASTER_FILE = os.path.join(BASE_DIR, "Location", "species_master.xlsx")
DATA_DIR = os.path.join(BASE_DIR, "DATA")
OUTPUT_DIR = os.path.join(BASE_DIR, "Code", "src", "data")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─── HELPER: DMS TO DD ────────────────────────────────────────────────────────
def parse_dms(dms_str):
    if pd.isna(dms_str):
        return None
    dms_str = str(dms_str).strip()
    
    # Extract digits/decimals and direction
    numbers = re.findall(r'\d+\.\d+|\d+', dms_str)
    direction_match = re.search(r'([NSEWnsew])', dms_str)
    
    if len(numbers) >= 1 and direction_match:
        deg = float(numbers[0])
        minute = float(numbers[1]) if len(numbers) > 1 else 0.0
        sec = float(numbers[2]) if len(numbers) > 2 else 0.0
        direction = direction_match.group(1).upper()
        
        dd = deg + minute/60.0 + sec/3600.0
        if direction in ['S', 'W']:
            dd = -dd
        return dd
    return None

# ─── HELPER: SITE NAME NORMALIZATION ──────────────────────────────────────────
def normalize_site_name(name):
    name = str(name).strip()
    match = re.match(r'([A-Za-z]+)_*(\d+)', name)
    if match:
        prefix = match.group(1)
        num = int(match.group(2))
        return f"{prefix}_{num:02d}"
    return name

# ─── 1. LOAD LOCATIONS METADATA ───────────────────────────────────────────────
print("[1/4] Reading recorder locations and metadata...")
xl = pd.ExcelFile(LOCATIONS_FILE)
recorders_metadata = {}

# Map sheets to directory names
sheet_to_dir = {
    'ATR_1': 'ATR_01',
    'STR_1': 'STR_01',
    'STR_2': 'STR_02'
}

for sheet in xl.sheet_names:
    dir_name = sheet_to_dir.get(sheet)
    if not dir_name:
        continue
        
    df_loc = xl.parse(sheet)
    # Standardize column names
    df_loc.columns = df_loc.columns.str.strip()
    
    for idx, row in df_loc.iterrows():
        site_raw = row.get('SIte Name')
        if pd.isna(site_raw):
            continue
            
        site_norm = normalize_site_name(site_raw)
        lat_dms = row.get('Lat')
        long_dms = row.get('Long')
        
        lat_dd = parse_dms(lat_dms)
        long_dd = parse_dms(long_dms)
        
        # Capture size and file counts if present
        size_val = row.get('Size') or row.get('Size (GB)')
        size_gb = float(size_val) if pd.notna(size_val) else None
        files_count = int(row.get('Files')) if pd.notna(row.get('Files')) else None
        
        # Store in dict
        key = f"{dir_name}/{site_norm}"
        recorders_metadata[key] = {
            'site_group': dir_name,
            'recorder_id': site_norm,
            'habitat': 'LC' if site_norm.startswith('LC') else 'LI',
            'latitude': lat_dd,
            'longitude': long_dd,
            'size_gb': size_gb,
            'expected_files': files_count
        }

print(f"   -> Loaded metadata for {len(recorders_metadata)} site-recorders.")

# ─── 2. LOAD SPECIES ECOLOGICAL MASTER ────────────────────────────────────────
print("[2/4] Reading species ecological metadata...")
df_species = pd.read_excel(SPECIES_MASTER_FILE)
df_species.columns = df_species.columns.str.strip()

species_metadata = {}
for idx, row in df_species.iterrows():
    comm = str(row.get('common name')).strip()
    sci = str(row.get('scientific name')).strip()
    endemic = str(row.get('endemic status')).strip()
    habitat_pref = str(row.get('preferred habitat')).strip()
    guild = str(row.get('guild')).strip()
    vocal = str(row.get('vocal activity')).strip()
    iucn = str(row.get('iucn status')).strip()
    stratum = str(row.get('foraging stratum')).strip()
    indicator = str(row.get('indicator group')).strip()
    if pd.isna(row.get('indicator group')) or indicator == "" or indicator.lower() in ["nan", "none"]:
        indicator = "Nil"
    
    # Generate generic wikipedia media image fallback if empty
    image_link = str(row.get('image link')).strip()
    if pd.isna(row.get('image link')) or image_link == "" or "nan" in image_link:
        formatted_name = comm.replace(" ", "_")
        image_link = f"https://commons.wikimedia.org/wiki/File:{formatted_name}.jpg"
        
    audio_link = str(row.get('audio link')).strip()
    if pd.isna(row.get('audio link')) or audio_link == "" or "nan" in audio_link:
        audio_link = ""
        
    species_metadata[comm] = {
        'scientific': sci,
        'endemic': endemic,
        'preferred_habitat': habitat_pref,
        'guild': guild,
        'vocal_activity': vocal,
        'iucn': iucn,
        'foraging_stratum': stratum,
        'indicator_group': indicator,
        'image': image_link,
        'audio': audio_link
    }
print(f"   -> Loaded ecological profiles for {len(species_metadata)} species.")

# ─── 3. SCAN BIRDNET CSVS AND COLLECT DETECTIONS ──────────────────────────────
print("[3/4] Scanning BirdNET results CSV files...")
csv_pattern = os.path.join(DATA_DIR, "**", "*.csv")
csv_files = glob.glob(csv_pattern, recursive=True)
print(f"   -> Found {len(csv_files)} result CSV files.")

# To compress the output, we map species and recorder keys to integers
species_list = sorted(list(species_metadata.keys()))
species_to_idx = {name: idx for idx, name in enumerate(species_list)}

# Create sorted list of all active recorder keys we find or have in metadata
active_recorders = set()
raw_detections = []
base_date = datetime(2026, 2, 11) # Base date to calculate offsets

for i, fp in enumerate(csv_files):
    filename = os.path.basename(fp)
    # Parse filename: TST-<id>_<date>_<time>.BirdNET.results.csv
    # e.g., TST-10_20260213_063000.BirdNET.results.csv
    parts = filename.split('_')
    if len(parts) < 3:
        continue
        
    date_str = parts[1]
    time_str = parts[2].split('.')[0]
    
    # Get directory details
    # relpath e.g. ATR_01\LC_01\TST-10...
    rel_path = os.path.relpath(fp, DATA_DIR)
    dir_parts = rel_path.split(os.sep)
    if len(dir_parts) < 3:
        continue
        
    site_group = dir_parts[0]  # e.g. ATR_01
    site_folder = dir_parts[1] # e.g. LC_01
    
    rec_key = f"{site_group}/{site_folder}"
    active_recorders.add(rec_key)
    
    # Parse date and hour
    try:
        dt = datetime.strptime(date_str, "%Y%m%d")
        date_offset = (dt - base_date).days
        hour = int(time_str[:2])
    except Exception:
        continue
        
    try:
        df = pd.read_csv(fp)
        df.columns = df.columns.str.strip()
        
        # Only keep records >= 0.70 confidence (standard threshold)
        df = df[df['Confidence'] >= 0.70]
        
        for _, row in df.iterrows():
            comm = str(row.get('Common name')).strip()
            if comm.lower() == 'common crane':
                continue
            conf = float(row.get('Confidence'))
            
            # Map species to index
            sp_idx = species_to_idx.get(comm)
            if sp_idx is None:
                # If species is not in the master, add it on the fly
                species_list.append(comm)
                sp_idx = len(species_list) - 1
                species_to_idx[comm] = sp_idx
                species_metadata[comm] = {
                    'scientific': str(row.get('Scientific name')).strip(),
                    'endemic': 'No',
                    'preferred_habitat': 'Unknown',
                    'guild': 'Unknown',
                    'vocal_activity': 'Unknown',
                    'iucn': 'LC',
                    'foraging_stratum': 'Unknown',
                    'indicator_group': 'Nil',
                    'image': '',
                    'audio': ''
                }
                
            raw_detections.append({
                'rec_key': rec_key,
                'sp_idx': sp_idx,
                'date_offset': date_offset,
                'hour': hour,
                'conf': conf
            })
    except Exception as e:
        print(f"   [ERROR] Failed to read {rel_path}: {e}")

# Build a list of recorder profiles for our JSON output
recorders_list = []
recorder_to_idx = {}

# Order active recorders alphabetically so indices are stable
ordered_rec_keys = sorted(list(active_recorders))
for idx, rkey in enumerate(ordered_rec_keys):
    recorder_to_idx[rkey] = idx
    meta = recorders_metadata.get(rkey, {
        'site_group': rkey.split('/')[0],
        'recorder_id': rkey.split('/')[1],
        'habitat': 'LC' if rkey.split('/')[1].startswith('LC') else 'LI',
        'latitude': None,
        'longitude': None,
        'size_gb': None,
        'expected_files': None
    })
    
    # Calculate actual files processed for effort metric
    actual_files = len([f for f in csv_files if f"{os.sep}{rkey.replace('/', os.sep)}{os.sep}" in f])
    meta['actual_files'] = actual_files
    recorders_list.append(meta)

# Compress detections into a lightweight flat array
compressed_detections = []
for det in raw_detections:
    r_idx = recorder_to_idx.get(det['rec_key'])
    if r_idx is not None:
        # Array format: [rec_idx, species_idx, date_offset, hour, confidence_percentage]
        conf_int = int(round(det['conf'] * 100))
        compressed_detections.append([r_idx, det['sp_idx'], det['date_offset'], det['hour'], conf_int])

print(f"   -> Processed {len(compressed_detections)} total detection events.")

# ─── 4. EXPORT COMPILED DATA ──────────────────────────────────────────────────
print("[4/4] Writing compressed dataset to file...")

output_data = {
    'base_date': base_date.strftime("%Y-%m-%d"),
    'recorders': recorders_list,
    'species_list': species_list,
    'species_metadata': species_metadata,
    'detections': compressed_detections
}

out_file = os.path.join(OUTPUT_DIR, "data.json")
with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(output_data, f, separators=(',', ':')) # compact json

print(f"[SUCCESS] Generated preprocessed file at: {out_file}")
# Print file size
size_bytes = os.path.getsize(out_file)
print(f"   -> Output File Size: {size_bytes / 1024 / 1024:.2f} MB")
