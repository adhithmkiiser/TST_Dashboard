import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { Recorder, SpeciesDetails } from '../types';

const AudioPlayer: React.FC<{ src: string; speciesName: string }> = ({ src, speciesName }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [src]);

  const togglePlay = () => {
    if (!src) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error("Audio playback failed:", err);
      });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (secs: number) => {
    if (secs === 0 || isNaN(secs)) return '0:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`audio-player-card ${!src ? 'disabled' : ''}`}>
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      <div className="player-controls-row">
        <button
          onClick={togglePlay}
          className={`play-btn ${isPlaying ? 'playing' : ''}`}
          disabled={!src}
          title={src ? 'Play/Pause bird call' : 'No call available'}
        >
          {isPlaying ? (
            <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg fill="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ marginLeft: '2px' }}>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="player-details">
          <span className="player-subtitle">{src ? speciesName : 'From Xenocanto'}</span>
          <span className="player-title">
            {src 
              ? (src.includes('/xeno-canto/') ? '(vocalisation from xeno-canto)' : '(vocalisation recorded on site)') 
              : 'Acoustic Call Missing'}
          </span>
        </div>

        {src && isPlaying && (
          <div className="soundwave-anim">
            <span className="wave-bar"></span>
            <span className="wave-bar"></span>
            <span className="wave-bar"></span>
            <span className="wave-bar"></span>
          </div>
        )}
      </div>

      {src && (
        <div className="timeline-row">
          <span className="time-lbl">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="player-slider"
            style={{
              background: `linear-gradient(to right, var(--color-neutral) ${progressPercent}%, #cbd5e1 ${progressPercent}%)`
            }}
          />
          <span className="time-lbl">{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
};

interface BirdSearchProps {
  recorders: Recorder[];
  speciesList: string[];
  speciesMetadata: Record<string, SpeciesDetails>;
  speciesDetectionsMatrix: Record<string, Record<string, number>>; // species -> recorderKey -> count
  detectionsByHour: Record<string, Record<number, number>>; // species -> hour -> count
}

const BirdSearch: React.FC<BirdSearchProps> = ({
  recorders,
  speciesList,
  speciesMetadata,
  speciesDetectionsMatrix,
  detectionsByHour,
}) => {
  const [query, setQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Set default species to first detected one if empty
  useEffect(() => {
    if (!selectedSpecies && speciesList.length > 0) {
      // Find a common species like White-cheeked Barbet or Gray Junglefowl if available
      const defaultSp = speciesList.includes('White-cheeked Barbet')
        ? 'White-cheeked Barbet'
        : speciesList[0];
      setSelectedSpecies(defaultSp);
    }
  }, [speciesList, selectedSpecies]);

  // Close suggestions dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update suggestions on query change
  const handleInputChange = (val: string) => {
    setQuery(val);
    if (val.trim() === '') {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const filtered = speciesList.filter((sp) => {
      const meta = speciesMetadata[sp];
      const matchCommon = sp.toLowerCase().includes(val.toLowerCase());
      const matchSci = meta?.scientific.toLowerCase().includes(val.toLowerCase()) || false;
      return matchCommon || matchSci;
    });

    setSuggestions(filtered.slice(0, 10)); // limit to 10 suggestions
    setShowDropdown(true);
  };

  // Select a suggestion
  const handleSelectSpecies = (spName: string) => {
    setSelectedSpecies(spName);
    setQuery('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  // Calculate species details
  const profileData = useMemo(() => {
    if (!selectedSpecies) return null;

    const meta = speciesMetadata[selectedSpecies];
    const detections = speciesDetectionsMatrix[selectedSpecies] || {};

    let totalDetections = 0;
    let lcDetections = 0;
    let liDetections = 0;

    let lcRecordersCount = 0;
    let liRecordersCount = 0;

    const detectedRecorders: string[] = [];
    const detectedSiteGroups = new Set<string>();

    recorders.forEach((rec) => {
      const key = `${rec.site_group}/${rec.recorder_id}`;
      const count = detections[key] || 0;
      if (count > 0) {
        totalDetections += count;
        detectedRecorders.push(rec.recorder_id);
        detectedSiteGroups.add(rec.site_group);

        if (rec.habitat === 'LC') {
          lcDetections += count;
          lcRecordersCount++;
        } else {
          liDetections += count;
          liRecordersCount++;
        }
      }
    });

    return {
      name: selectedSpecies,
      scientific: meta?.scientific || 'N/A',
      endemic: meta?.endemic || 'No',
      preferred_habitat: meta?.preferred_habitat || 'Unknown',
      guild: meta?.guild || 'Unknown',
      vocal_activity: meta?.vocal_activity || 'Unknown',
      iucn: meta?.iucn || 'LC',
      foraging_stratum: meta?.foraging_stratum || 'Unknown',
      indicator_group: (!meta?.indicator_group || meta.indicator_group === 'nan' || meta.indicator_group === 'None') ? 'Nil' : meta.indicator_group,
      image: meta?.image || '',
      audio: meta?.audio || '',

      totalDetections,
      lcDetections,
      liDetections,
      lcRecordersCount,
      liRecordersCount,
      recordersList: detectedRecorders,
      siteGroupsList: Array.from(detectedSiteGroups),
    };
  }, [selectedSpecies, recorders, speciesMetadata, speciesDetectionsMatrix]);

  // Mini Chart Option (Diurnal Activity Pattern of Selected Species)
  const chartOption = useMemo(() => {
    if (!selectedSpecies) return {};

    const hourlyData = detectionsByHour[selectedSpecies] || {};
    const dataX = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    const dataY = Array.from({ length: 24 }, (_, i) => hourlyData[i] || 0);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => `
          <div style="font-family: Inter, sans-serif; font-size: 11px; padding: 2px 4px;">
            Hour: <strong>${params[0].name}</strong><br/>
            Detections: <strong>${params[0].value} calls</strong>
          </div>
        `
      },
      grid: {
        top: '15%',
        left: '8%',
        right: '4%',
        bottom: '22%'
      },
      xAxis: {
        type: 'category',
        data: dataX,
        axisLabel: {
          interval: 2,
          fontSize: 8,
          color: '#64748b'
        },
        axisLine: { lineStyle: { color: '#e2e8f0' } }
      },
      yAxis: {
        type: 'value',
        name: 'Calls',
        nameTextStyle: { fontSize: 8, color: '#64748b' },
        axisLabel: { fontSize: 8, color: '#64748b' },
        splitLine: { lineStyle: { color: '#f1f5f9' } }
      },
      series: [
        {
          data: dataY,
          type: 'bar',
          itemStyle: { color: '#4f46e5' },
          barWidth: '70%'
        }
      ]
    };
  }, [selectedSpecies, detectionsByHour]);

  // Display details of the species
  return (
    <div className="dashboard-section" id="explorer-section">
      <div className="section-header">
        <div>
          <h2>Avian Species Explorer</h2>
          <p>Search for any detected bird species to view its ecological profile, IUCN status, and habitat associations.</p>
        </div>
      </div>

      <div className="search-box" ref={dropdownRef} style={{ maxWidth: '500px' }}>
        <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '18px', height: '18px' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder="Search by Common or Scientific name..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query.trim() !== '' && setShowDropdown(true)}
        />
        {showDropdown && suggestions.length > 0 && (
          <div className="autocomplete-suggestions">
            {suggestions.map((sp) => (
              <div key={sp} className="suggestion-item" onClick={() => handleSelectSpecies(sp)}>
                <span className="common">{sp}</span>
                <span className="scientific">{speciesMetadata[sp]?.scientific}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {profileData ? (
        <div className="profile-card">
          <div className="profile-left-col">
            <div className="profile-image-container">
              {profileData.image && !profileData.image.includes('nan') ? (
                <img
                  src={profileData.image}
                  alt={profileData.name}
                  className="profile-img"
                  onError={(e) => {
                    // If image fails, hide it and show fallback placeholder
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : null}
              <div className="profile-placeholder">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '48px', height: '48px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Avian Species Profile</span>
              </div>
            </div>
            <AudioPlayer src={profileData.audio} speciesName={profileData.name} />
          </div>

          <div className="profile-details">
            <div className="profile-header">
              <h3>{profileData.name}</h3>
              <div className="scientific">{profileData.scientific}</div>
            </div>

            <div className="profile-meta-grid">
              <div className="meta-item">
                <span className="meta-label">Conservation Status</span>
                <span className="meta-value" style={{ color: profileData.iucn !== 'LC' ? '#ea580c' : 'var(--text-main)' }}>
                  {profileData.iucn === 'LC' ? 'Least Concern (LC)' : profileData.iucn}
                </span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Foraging Guild</span>
                <span className="meta-value">{profileData.guild}</span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Endemic Status</span>
                <span className="meta-value">{profileData.endemic}</span>
              </div>

              <div className="meta-item">
                <span className="meta-label">Vocal Activity</span>
                <span className="meta-value">{profileData.vocal_activity}</span>
              </div>
            </div>

            <div className="profile-meta-grid" style={{ gridTemplateColumns: '2fr 1fr', marginTop: '-0.5rem' }}>
              <div className="meta-item">
                <span className="meta-label">Preferred Habitat / Foraging Stratum</span>
                <span className="meta-value" style={{ fontWeight: 500, fontSize: '0.8rem' }}>
                  {profileData.preferred_habitat} ({profileData.foraging_stratum})
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Indicator Class</span>
                <span className="meta-value" style={{ color: profileData.indicator_group !== 'Nil' ? 'var(--color-neutral)' : 'var(--text-main)' }}>
                  {profileData.indicator_group}
                </span>
              </div>
            </div>

            <div className="profile-compare-block">
              <span className="profile-compare-title">Habitat Distribution & Relative Abundance</span>
              <div className="profile-compare-grid">
                <div className="compare-col lc">
                  <span className="compare-header lc">Lantana-Cleared (LC)</span>
                  <div className="compare-stats">
                    <span className="compare-large">{profileData.lcDetections}</span>
                    <span className="compare-label lc">detections</span>
                  </div>
                  <span className="kpi-subtext" style={{ color: 'var(--color-lc-dark)' }}>
                    Present in {profileData.lcRecordersCount} LC stations
                  </span>
                </div>

                <div className="compare-col li">
                  <span className="compare-header li">Lantana-Infested (LI)</span>
                  <div className="compare-stats">
                    <span className="compare-large">{profileData.liDetections}</span>
                    <span className="compare-label li">detections</span>
                  </div>
                  <span className="kpi-subtext" style={{ color: 'var(--color-li-dark)' }}>
                    Present in {profileData.liRecordersCount} LI stations
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <span className="profile-compare-title">Diurnal Detections Pattern (Detections by Hour of Day)</span>
              <div style={{ height: '180px', width: '100%', marginTop: '0.5rem' }}>
                <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <span>Search or select a species from the auto-suggest list.</span>
        </div>
      )}
    </div>
  );
};

export default BirdSearch;
