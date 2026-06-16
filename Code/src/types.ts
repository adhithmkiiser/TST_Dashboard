export interface Recorder {
  site_group: string;
  recorder_id: string;
  habitat: 'LC' | 'LI';
  latitude: number | null;
  longitude: number | null;
  size_gb: number | null;
  expected_files: number | null;
  actual_files: number;
}

export interface SpeciesDetails {
  scientific: string;
  endemic: string;
  preferred_habitat: string;
  guild: string;
  vocal_activity: string;
  iucn: string;
  foraging_stratum: string;
  indicator_group: string; // "Recovery-associated" | "Lantana-associated" | "None"
  image: string;
  audio: string;
}

export interface AggregatedData {
  base_date: string;
  recorders: Recorder[];
  species_list: string[];
  species_metadata: Record<string, SpeciesDetails>;
  detections: [number, number, number, number, number][]; // [rec_idx, species_idx, date_offset, hour, confidence_100]
}

export interface Config {
  indicator_species: {
    recovery: string[];
    lantana: string[];
  };
  confidence_threshold_default: number;
  display_labels: {
    LC: string;
    LI: string;
  };
}
