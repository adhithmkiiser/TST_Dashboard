import React, { useState, useMemo } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import FilterBar from './components/FilterBar';
import SummaryCards from './components/SummaryCards';
import MapPanel from './components/MapPanel';
import RichnessComparison from './components/RichnessComparison';
import RichnessOverview from './components/RichnessOverview';
import HeatmapPanel from './components/HeatmapPanel';
import IndicatorPanel from './components/IndicatorPanel';
import BirdSearch from './components/BirdSearch';
import Footer from './components/Footer';
import type { AggregatedData, Recorder } from './types';

// Load preprocessed JSON data
import dataRaw from './data/data.json';

const App: React.FC = () => {
  // Cast raw data to typed AggregatedData through unknown
  const data = dataRaw as unknown as AggregatedData;

  // Filters State
  const [selectedSiteGroup, setSelectedSiteGroup] = useState<string>('All');
  const [selectedRecorder, setSelectedRecorder] = useState<string>('All');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.70);

  // 1. Get unique site groups and active recorders for dropdown lists
  const siteGroups = useMemo(() => {
    const groups = new Set<string>();
    data.recorders.forEach((r) => groups.add(r.site_group));
    return Array.from(groups).sort();
  }, [data.recorders]);

  const recordersList = useMemo(() => {
    let list = data.recorders;
    if (selectedSiteGroup !== 'All') {
      list = list.filter((r) => r.site_group === selectedSiteGroup);
    }
    const ids = list.map((r) => r.recorder_id);
    return Array.from(new Set(ids)).sort();
  }, [data.recorders, selectedSiteGroup]);

  // Reset recorder selection if it is no longer valid in the newly selected site group
  React.useEffect(() => {
    if (selectedRecorder !== 'All' && !recordersList.includes(selectedRecorder)) {
      setSelectedRecorder('All');
    }
  }, [selectedSiteGroup, recordersList, selectedRecorder]);

  // 2. Filter recorders list based on site selection (fully filtered)
  const filteredRecorders = useMemo(() => {
    let list = data.recorders;
    if (selectedSiteGroup !== 'All') {
      list = list.filter((r) => r.site_group === selectedSiteGroup);
    }
    if (selectedRecorder !== 'All') {
      list = list.filter((r) => r.recorder_id === selectedRecorder);
    }
    return list;
  }, [data.recorders, selectedSiteGroup, selectedRecorder]);

  // Recorders filtered ONLY by site group (ignores selected recorder)
  const landscapeRecorders = useMemo(() => {
    let list = data.recorders;
    if (selectedSiteGroup !== 'All') {
      list = list.filter((r) => r.site_group === selectedSiteGroup);
    }
    return list;
  }, [data.recorders, selectedSiteGroup]);

  // Map recorder key to its index in data.recorders
  const recorderKeyToIdx = useMemo(() => {
    const map = new Map<string, number>();
    data.recorders.forEach((r, idx) => {
      map.set(`${r.site_group}/${r.recorder_id}`, idx);
    });
    return map;
  }, [data.recorders]);

  // Map of valid recorder indices for fast filtering of detections (fully filtered)
  const validRecorderIndices = useMemo(() => {
    const indices = new Set<number>();
    filteredRecorders.forEach((r) => {
      const idx = recorderKeyToIdx.get(`${r.site_group}/${r.recorder_id}`);
      if (idx !== undefined) indices.add(idx);
    });
    return indices;
  }, [filteredRecorders, recorderKeyToIdx]);

  // Map of valid recorder indices for landscape-level filtering
  const landscapeRecorderIndices = useMemo(() => {
    const indices = new Set<number>();
    landscapeRecorders.forEach((r) => {
      const idx = recorderKeyToIdx.get(`${r.site_group}/${r.recorder_id}`);
      if (idx !== undefined) indices.add(idx);
    });
    return indices;
  }, [landscapeRecorders, recorderKeyToIdx]);

  // 3. Filter Detections in real-time (fully filtered by site group, recorder, and confidence)
  const filteredDetections = useMemo(() => {
    const thresholdPercentage = Math.round(confidenceThreshold * 100);
    return data.detections.filter((d) => {
      const recIdx = d[0];
      const confidence = d[4];

      // Filter by confidence threshold
      if (confidence < thresholdPercentage) return false;

      // Filter by recorder selection
      return validRecorderIndices.has(recIdx);
    });
  }, [data.detections, confidenceThreshold, validRecorderIndices]);

  // Landscape-level detections (filtered by site group & confidence, ignoring recorder)
  const landscapeDetections = useMemo(() => {
    const thresholdPercentage = Math.round(confidenceThreshold * 100);
    return data.detections.filter((d) => {
      const recIdx = d[0];
      const confidence = d[4];

      // Filter by confidence threshold
      if (confidence < thresholdPercentage) return false;

      // Filter by landscape recorders
      return landscapeRecorderIndices.has(recIdx);
    });
  }, [data.detections, confidenceThreshold, landscapeRecorderIndices]);

  // 4. Calculate stats on fully filtered detections (used for KPIs, Map, and Richness Comparison)
  const {
    uniqueSpeciesCount,
    totalDetections,
    activeRecordersCount,
    totalFilesProcessed,
    totalExpectedFiles,
    totalDays,
    siteRichness,
    siteDetections,
  } = useMemo(() => {
    const detectedSpecies = new Set<number>();
    const activeRecs = new Set<number>();
    const richnessMap: Record<string, Set<number>> = {};
    const detectionsMap: Record<string, number> = {};

    filteredDetections.forEach((d) => {
      const recIdx = d[0];
      const spIdx = d[1];

      detectedSpecies.add(spIdx);
      activeRecs.add(recIdx);

      const rec = data.recorders[recIdx];
      const recKey = `${rec.site_group}/${rec.recorder_id}`;

      // Site totals
      if (!richnessMap[recKey]) richnessMap[recKey] = new Set<number>();
      richnessMap[recKey].add(spIdx);
      detectionsMap[recKey] = (detectionsMap[recKey] || 0) + 1;
    });

    const finalRichness: Record<string, number> = {};
    Object.keys(richnessMap).forEach((key) => {
      finalRichness[key] = richnessMap[key].size;
    });

    // Calculate effort stats
    const filesProcessed = filteredRecorders.reduce((sum, r) => sum + r.actual_files, 0);
    const expectedFiles = filteredRecorders.reduce((sum, r) => sum + (r.expected_files || 0), 0);

    // Recorders metadata has days (about 11 days per site)
    const days = filteredRecorders.length * 11;

    return {
      uniqueSpeciesCount: detectedSpecies.size,
      totalDetections: filteredDetections.length,
      activeRecordersCount: activeRecs.size,
      totalFilesProcessed: filesProcessed,
      totalExpectedFiles: expectedFiles,
      totalDays: days,
      siteRichness: finalRichness,
      siteDetections: detectionsMap,
    };
  }, [filteredDetections, data.recorders, filteredRecorders]);

  // 4b. Calculate stats on landscape-level detections (ignoring recorder site filter)
  const {
    siteRichness: landscapeSiteRichness,
    siteDetections: landscapeSiteDetections,
    speciesDetectionsMatrix: landscapeSpeciesDetectionsMatrix,
    detectionsByHour: landscapeDetectionsByHour,
  } = useMemo(() => {
    const richnessMap: Record<string, Set<number>> = {};
    const detectionsMap: Record<string, number> = {};
    const matrixMap: Record<string, Record<string, number>> = {};
    const hourMap: Record<string, Record<number, number>> = {};

    landscapeDetections.forEach((d) => {
      const recIdx = d[0];
      const spIdx = d[1];
      const hour = d[3];

      const rec = data.recorders[recIdx];
      const recKey = `${rec.site_group}/${rec.recorder_id}`;
      const spName = data.species_list[spIdx];

      // Site totals
      if (!richnessMap[recKey]) richnessMap[recKey] = new Set<number>();
      richnessMap[recKey].add(spIdx);
      detectionsMap[recKey] = (detectionsMap[recKey] || 0) + 1;

      // Species-Site matrix
      if (!matrixMap[spName]) matrixMap[spName] = {};
      matrixMap[spName][recKey] = (matrixMap[spName][recKey] || 0) + 1;

      // Hourly patterns
      if (!hourMap[spName]) hourMap[spName] = {};
      hourMap[spName][hour] = (hourMap[spName][hour] || 0) + 1;
    });

    const finalRichness: Record<string, number> = {};
    Object.keys(richnessMap).forEach((key) => {
      finalRichness[key] = richnessMap[key].size;
    });

    return {
      siteRichness: finalRichness,
      siteDetections: detectionsMap,
      speciesDetectionsMatrix: matrixMap,
      detectionsByHour: hourMap,
    };
  }, [landscapeDetections, data.recorders, data.species_list]);

  // 5. CSV Download Handlers
  const downloadSummaryCSV = () => {
    const headers = ['Landscape Group', 'Recorder ID', 'Habitat Type', 'Processed Files', 'Species Richness', 'Total Detections'];
    const rows = landscapeRecorders.map((rec) => {
      const key = `${rec.site_group}/${rec.recorder_id}`;
      const richness = landscapeSiteRichness[key] || 0;
      const detections = landscapeSiteDetections[key] || 0;
      return [
        rec.site_group,
        rec.recorder_id,
        rec.habitat === 'LC' ? 'Lantana-Cleared' : 'Lantana-Infested',
        rec.actual_files,
        richness,
        detections
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    triggerDownload(csvContent, `richness_summary_${selectedSiteGroup}_conf${confidenceThreshold}.csv`);
  };

  const downloadMatrixCSV = (filteredSpecies: string[], activeRecs: Recorder[]) => {
    const headers = ['Species (Common Name)', 'Scientific Name', ...activeRecs.map(r => `${r.site_group}_${r.recorder_id}`)];
    const rows = filteredSpecies.map((sp) => {
      const meta = data.species_metadata[sp];
      const sci = meta?.scientific || '';
      const detections = activeRecs.map((rec) => {
        const key = `${rec.site_group}/${rec.recorder_id}`;
        return landscapeSpeciesDetectionsMatrix[sp]?.[key] || 0;
      });
      return [sp, sci, ...detections];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    triggerDownload(csvContent, `species_site_matrix_${selectedSiteGroup}_conf${confidenceThreshold}.csv`);
  };

  const triggerDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app-container">
      <Header />
      <Hero />
      <FilterBar
        selectedSiteGroup={selectedSiteGroup}
        setSelectedSiteGroup={setSelectedSiteGroup}
        siteGroups={siteGroups}
        selectedRecorder={selectedRecorder}
        setSelectedRecorder={setSelectedRecorder}
        recorders={recordersList}
        confidenceThreshold={confidenceThreshold}
        setConfidenceThreshold={setConfidenceThreshold}
      />

      <SummaryCards
        uniqueSpeciesCount={uniqueSpeciesCount}
        totalDetections={totalDetections}
        activeRecordersCount={activeRecordersCount}
        totalFilesProcessed={totalFilesProcessed}
        totalExpectedFiles={totalExpectedFiles}
        totalDays={totalDays}
      />

      <main className="dashboard-grid">
        <MapPanel
          recorders={filteredRecorders}
          siteRichness={siteRichness}
          siteDetections={siteDetections}
          selectedSiteGroup={selectedSiteGroup}
        />

        <BirdSearch
          recorders={data.recorders}
          speciesList={data.species_list}
          speciesMetadata={data.species_metadata}
          speciesDetectionsMatrix={landscapeSpeciesDetectionsMatrix}
          detectionsByHour={landscapeDetectionsByHour}
        />

        <RichnessComparison
          recorders={filteredRecorders}
          siteRichness={siteRichness}
          selectedSiteGroup={selectedSiteGroup === 'All' ? 'All' : selectedSiteGroup}
        />

        <RichnessOverview
          recorders={data.recorders}
          siteRichness={landscapeSiteRichness}
          siteDetections={landscapeSiteDetections}
          selectedSiteGroup={selectedSiteGroup}
          onDownloadCSV={downloadSummaryCSV}
        />

        <HeatmapPanel
          recorders={data.recorders}
          speciesList={data.species_list}
          speciesDetectionsMatrix={landscapeSpeciesDetectionsMatrix}
          selectedSiteGroup={selectedSiteGroup}
          onDownloadCSV={downloadMatrixCSV}
        />

        <IndicatorPanel
          recorders={data.recorders}
          speciesDetectionsMatrix={landscapeSpeciesDetectionsMatrix}
          selectedSiteGroup={selectedSiteGroup}
        />


      </main>
      <Footer />
    </div>
  );
};

export default App;

