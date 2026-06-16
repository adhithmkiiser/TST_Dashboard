import os
import csv
import pandas as pd
from collections import defaultdict
from pathlib import Path
import re

def read_birdnet_file(filepath):
    """Read a BirdNET results CSV file and return detection data."""
    detections = []
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            
            if not headers:
                return detections
            
            # Map column names to indices
            col_map = {}
            for i, header in enumerate(headers):
                col_map[header.strip().lower()] = i
            
            # Check if file has data rows
            for row in reader:
                if not row or len(row) < 3:
                    continue
                
                try:
                    start_time = float(row[col_map.get('start (s)', 0)])
                    end_time = float(row[col_map.get('end (s)', 1)])
                    scientific_name = row[col_map.get('scientific name', 2)].strip()
                    common_name = row[col_map.get('common name', 3)].strip() if len(row) > 3 else ''
                    confidence = float(row[col_map.get('confidence', 4)]) if len(row) > 4 and row[col_map.get('confidence', 4)] else None
                    
                    # Use common name if available, otherwise scientific name
                    species_name = common_name if common_name else scientific_name
                    
                    if species_name:  # Only add if we have a species name
                        detections.append({
                            'start': start_time,
                            'end': end_time,
                            'species': species_name,
                            'confidence': confidence
                        })
                except (ValueError, IndexError) as e:
                    continue
                    
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
    
    return detections

def group_consecutive_detections(detections, tolerance=0.5):
    """Group consecutive detections of the same species into call events."""
    if not detections:
        return []
    
    # Sort by start time
    sorted_detections = sorted(detections, key=lambda x: x['start'])
    
    events = []
    current_event = [sorted_detections[0]]
    
    for i in range(1, len(sorted_detections)):
        prev = sorted_detections[i-1]
        curr = sorted_detections[i]
        
        # Check if same species and consecutive (within tolerance)
        if (curr['species'] == prev['species'] and 
            abs(curr['start'] - prev['start'] - 3.0) <= tolerance):
            current_event.append(curr)
        else:
            # Finalize current event
            if current_event:
                events.append(current_event)
            # Start new event
            current_event = [curr]
    
    # Don't forget the last event
    if current_event:
        events.append(current_event)
    
    return events

def calculate_event_metrics(event, filename):
    """Calculate metrics for a call event."""
    if not event:
        return None
    
    sorted_event = sorted(event, key=lambda x: x['start'])
    
    species = sorted_event[0]['species']
    start_time = sorted_event[0]['start']
    end_time = sorted_event[-1]['end']
    consecutive_segments = len(sorted_event)
    duration = end_time - start_time
    
    confidences = [d['confidence'] for d in sorted_event if d['confidence'] is not None]
    
    if confidences:
        max_confidence = max(confidences)
        mean_confidence = sum(confidences) / len(confidences)
    else:
        max_confidence = None
        mean_confidence = None
    
    return {
        'species': species,
        'file_name': filename,
        'event_start_time': start_time,
        'event_end_time': end_time,
        'consecutive_segments': consecutive_segments,
        'duration': duration,
        'max_confidence': max_confidence,
        'mean_confidence': mean_confidence
    }

def rank_events(events):
    """Rank events by consecutive segments (primary) and confidence/duration (secondary)."""
    def sort_key(event):
        # Primary: consecutive segments (descending)
        # Secondary: max confidence (descending), or duration if no confidence
        segments = event['consecutive_segments']
        
        if event['max_confidence'] is not None:
            confidence = event['max_confidence']
        else:
            confidence = event['duration']
        
        return (-segments, -confidence)
    
    return sorted(events, key=sort_key)

def process_birdnet_directory(root_dir):
    """Process all BirdNET files in directory tree."""
    root_path = Path(root_dir)
    
    if not root_path.exists():
        print(f"Directory not found: {root_dir}")
        return {}
    
    all_species_events = defaultdict(list)
    
    # Find all CSV files
    csv_files = list(root_path.rglob("*.csv"))
    
    print(f"Found {len(csv_files)} CSV files to process...")
    
    for csv_file in csv_files:
        if "BirdNET.results" not in csv_file.name:
            continue
            
        print(f"Processing: {csv_file.relative_to(root_path)}")
        
        detections = read_birdnet_file(csv_file)
        
        if not detections:
            continue
        
        # Group detections by species within this file
        species_detections = defaultdict(list)
        for det in detections:
            species_detections[det['species']].append(det)
        
        # Process each species separately
        for species, species_dets in species_detections.items():
            events = group_consecutive_detections(species_dets)
            
            for event in events:
                metrics = calculate_event_metrics(event, csv_file.name)
                if metrics:
                    all_species_events[species].append(metrics)
    
    print(f"\nFound {len(all_species_events)} unique species")
    
    return all_species_events

def select_top_events(species_events, max_events=10):
    """Select top N events per species based on ranking."""
    top_events = {}
    
    for species, events in species_events.items():
        ranked = rank_events(events)
        top_events[species] = ranked[:max_events]
    
    return top_events

def generate_excel_output(top_events, output_file):
    """Generate Excel output with species summary."""
    all_rows = []
    
    for species, events in top_events.items():
        for event in events:
            all_rows.append({
                'Species': event['species'],
                'File Name': event['file_name'],
                'Event Start Time (s)': round(event['event_start_time'], 2),
                'Event End Time (s)': round(event['event_end_time'], 2),
                'Consecutive Segments': event['consecutive_segments'],
                'Duration (s)': round(event['duration'], 2),
                'Maximum Confidence': round(event['max_confidence'], 4) if event['max_confidence'] is not None else 'N/A',
                'Mean Confidence': round(event['mean_confidence'], 4) if event['mean_confidence'] is not None else 'N/A'
            })
    
    # Sort by species name, then by ranking
    all_rows.sort(key=lambda x: (x['Species'], -x['Consecutive Segments'], 
                                  -x['Maximum Confidence'] if isinstance(x['Maximum Confidence'], float) else 0))
    
    df = pd.DataFrame(all_rows)
    
    # Create Excel writer
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Species_Summary', index=False)
        
        # Adjust column widths
        worksheet = writer.sheets['Species_Summary']
        for idx, col in enumerate(df.columns, 1):
            max_length = max(df[col].astype(str).str.len().max(), len(col))
            worksheet.column_dimensions[chr(64 + idx)].width = min(max_length + 2, 50)
    
    print(f"\nExcel output generated: {output_file}")
    print(f"Total events: {len(all_rows)}")
    print(f"Total species: {len(top_events)}")

def main():
    # Configuration
    root_directory = r"D:\IISER-T\Dashboard\AUDIO\Birdnet_data"
    output_file = r"D:\IISER-T\Dashboard\AUDIO\BirdNET_Species_Call_Summary.xlsx"
    
    print("BirdNET Detection Analysis")
    print("=" * 50)
    print(f"Input directory: {root_directory}")
    print(f"Output file: {output_file}")
    print()
    
    # Process all files
    species_events = process_birdnet_directory(root_directory)
    
    if not species_events:
        print("No detection data found.")
        return
    
    # Select top 10 events per species
    top_events = select_top_events(species_events, max_events=10)
    
    # Generate Excel output
    generate_excel_output(top_events, output_file)
    
    print("\nAnalysis complete!")

if __name__ == "__main__":
    main()
