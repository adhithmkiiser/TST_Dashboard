import os
import re
import traceback
import pandas as pd
import scipy.io.wavfile as wav

# Paths
EXCEL_PATH = r"D:\IISER-T\Dashboard\AUDIO\BirdNET_Species_Call_Summary.xlsx"
AUDIO_DIR = r"D:\TST_DATA\Audio"
OUTPUT_DIR = r"D:\IISER-T\Dashboard\AUDIO\Audio_files"

def clean_filename(name):
    """Remove invalid characters for Windows filenames."""
    return re.sub(r'[\\/*?:"<>|]', "", str(name)).strip()

def main():
    print(f"Reading Excel summary from: {EXCEL_PATH}")
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: Excel file does not exist at {EXCEL_PATH}")
        return
        
    df = pd.read_excel(EXCEL_PATH)
    print(f"Loaded {len(df)} rows from Excel.")
    
    # Check for required columns
    required_cols = ['Species', 'File Name', 'Event Start Time (s)', 'Event End Time (s)']
    for col in required_cols:
        if col not in df.columns:
            print(f"Error: Required column '{col}' is missing from the Excel file.")
            return

    # Drop duplicates by Species to process only the first file/call of each species
    df_unique = df.drop_duplicates(subset=['Species'], keep='first').copy()
    print(f"Found {len(df_unique)} unique bird species to process.")

    # Scan the audio directory recursively once to build a lookup map
    print(f"Scanning audio directory: {AUDIO_DIR} ...")
    audio_map = {}
    for root, dirs, files in os.walk(AUDIO_DIR):
        for file in files:
            if file.lower().endswith('.wav'):
                # Map the base filename (without extension) to its full path
                base = os.path.splitext(file)[0]
                audio_map[base] = os.path.join(root, file)
                
    print(f"Scanned {len(audio_map)} WAV files from the audio directory.")
    
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Saving trimmed files to: {OUTPUT_DIR}\n")
    
    success_count = 0
    missing_count = 0
    error_count = 0
    
    # We will iterate species-by-species and look for any row that has a matching audio file
    unique_species = df['Species'].unique()
    print(f"Beginning extraction with fallback support for {len(unique_species)} unique species...")
    
    for species in unique_species:
        # Get all records for this species in order of ranking/appearance
        species_rows = df[df['Species'] == species]
        
        found_and_processed = False
        tried_files = []
        
        for idx, row in species_rows.iterrows():
            csv_file_name = row['File Name']
            start_time = row['Event Start Time (s)']
            end_time = row['Event End Time (s)']
            
            # Extract base file name from the csv file name in Excel
            base_audio_name = csv_file_name
            if ".BirdNET.results.csv" in base_audio_name:
                base_audio_name = base_audio_name.replace(".BirdNET.results.csv", "")
            elif base_audio_name.endswith(".csv"):
                base_audio_name = os.path.splitext(base_audio_name)[0]
                
            base_audio_name = base_audio_name.strip()
            tried_files.append(base_audio_name)
            
            # Lookup the path of the original audio file
            source_path = audio_map.get(base_audio_name)
            if not source_path:
                # Fallback check: if there is case discrepancy
                base_lower = base_audio_name.lower()
                matching_keys = [k for k in audio_map.keys() if k.lower() == base_lower]
                if matching_keys:
                    source_path = audio_map[matching_keys[0]]
                    
            if not source_path:
                continue  # Try next available record for this species
                
            # Prepare target output name
            clean_species = clean_filename(species)
            target_file_name = f"{clean_species}.wav"
            target_path = os.path.join(OUTPUT_DIR, target_file_name)
            
            print(f"[{species}] Found: {os.path.basename(source_path)} (from CSV: {csv_file_name})")
            print(f"  Trimming: {start_time}s to {end_time}s")
            print(f"  Saving to: {target_file_name}")
            
            try:
                # Validate timestamps
                start_time = float(start_time)
                end_time = float(end_time)
                if pd.isna(start_time) or pd.isna(end_time):
                    raise ValueError("Start or End time is NaN")
                    
                # Load the audio file
                rate, data = wav.read(source_path)
                
                # Calculate sample indices
                start_sample = int(start_time * rate)
                end_sample = int(end_time * rate)
                
                # Trim data
                if start_sample < 0:
                    start_sample = 0
                if end_sample > len(data):
                    end_sample = len(data)
                    
                trimmed_data = data[start_sample:end_sample]
                
                # Write trimmed audio
                wav.write(target_path, rate, trimmed_data)
                print(f"  -> SUCCESS")
                success_count += 1
                found_and_processed = True
                break  # Stop searching for this species since we got one file!
                
            except Exception as e:
                print(f"  -> ERROR trimming/writing file: {e}")
                traceback.print_exc()
                # We do not break here, we can try the next file if this one errored
                
        if not found_and_processed:
            print(f"[{species}] WARNING: No matching audio files found in {AUDIO_DIR}. Tried: {tried_files}")
            missing_count += 1
            
    print(f"\nProcessing summary:")
    print(f"  - Successfully processed: {success_count}")
    print(f"  - Missing original files: {missing_count}")
    print(f"  - Errors encountered:     {error_count}")

if __name__ == "__main__":
    main()
