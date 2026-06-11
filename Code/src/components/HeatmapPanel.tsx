import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { Recorder } from '../types';

interface HeatmapPanelProps {
  recorders: Recorder[];
  speciesList: string[];
  speciesDetectionsMatrix: Record<string, Record<string, number>>; // species -> recorderKey -> count
  selectedSiteGroup: string;
  onDownloadCSV: (filteredSpecies: string[], filteredRecs: Recorder[]) => void;
}

const HeatmapPanel: React.FC<HeatmapPanelProps> = ({
  recorders,
  speciesList,
  speciesDetectionsMatrix,
  selectedSiteGroup,
  onDownloadCSV,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [topN, setTopN] = useState<string>('25'); // Top 10, 25, 50, All
  const [sortBy, setSortBy] = useState<string>('detections'); // detections, alphabetical
  const [useLogScale, setUseLogScale] = useState<boolean>(true); // default to true to match indicator species behavior and python settings

  // 1. Get filtered recorders for X-Axis
  const filteredRecs = useMemo(() => {
    let list = [...recorders];
    if (selectedSiteGroup !== 'All') {
      list = list.filter((r) => r.site_group === selectedSiteGroup);
    }
    return list.sort((a, b) => a.site_group.localeCompare(b.site_group) || a.recorder_id.localeCompare(b.recorder_id));
  }, [recorders, selectedSiteGroup]);

  const xCategories = useMemo(() => {
    return filteredRecs.map((r) => `${r.site_group}\n${r.recorder_id}`);
  }, [filteredRecs]);

  // 2. Filter and sort species list for Y-Axis
  const processedSpecies = useMemo(() => {
    // Calculate total detections for each species across current filtered sites
    const speciesTotals = speciesList.map((sp) => {
      let total = 0;
      filteredRecs.forEach((rec) => {
        const key = `${rec.site_group}/${rec.recorder_id}`;
        total += (speciesDetectionsMatrix[sp]?.[key] || 0);
      });
      return { name: sp, total };
    });

    // Filter by search term
    let filtered = speciesTotals.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort
    if (sortBy === 'detections') {
      filtered.sort((a, b) => b.total - a.total);
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Slice Top-N
    if (topN !== 'All') {
      const limit = parseInt(topN, 10);
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }, [speciesList, filteredRecs, speciesDetectionsMatrix, searchTerm, sortBy, topN]);

  const yCategories = useMemo(() => {
    // ECharts draws from bottom to top, so reverse to show highest at the top
    return processedSpecies.map((item) => item.name).reverse();
  }, [processedSpecies]);

  // 3. Construct ECharts Heatmap Data
  const chartOption = useMemo(() => {
    const data: [number, number, number, number][] = [];
    let maxVal = 1;

    // Y categories are reversed in yCategories
    yCategories.forEach((sp, yIdx) => {
      filteredRecs.forEach((rec, xIdx) => {
        const recKey = `${rec.site_group}/${rec.recorder_id}`;
        const val = speciesDetectionsMatrix[sp]?.[recKey] || 0;
        const colorVal = useLogScale ? Math.log1p(val) : val;
        data.push([xIdx, yIdx, colorVal, val]);
        if (val > maxVal) maxVal = val;
      });
    });

    const maxColorVal = useLogScale ? Math.log1p(maxVal) : Math.max(10, Math.ceil(maxVal * 0.4));

    return {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const xIdx = params.value[0];
          const yIdx = params.value[1];
          const val = params.value[3]; // raw calls count
          
          const rec = filteredRecs[xIdx];
          const spName = yCategories[yIdx];

          return `
            <div style="font-family: Inter, sans-serif; padding: 4px 8px;">
              <div style="font-weight: 700; font-size: 13px;">${spName}</div>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">
                Site: <strong>${rec.site_group} — ${rec.recorder_id}</strong> (${rec.habitat})
              </div>
              <div style="font-size: 12px; color: #666; margin-top: 2px;">
                Detections: <strong style="color: #4f46e5">${val} calls</strong>
              </div>
            </div>
          `;
        }
      },
      grid: {
        top: '5%',
        left: '20%', // Leave space for long species names
        right: '5%',
        bottom: '12%',
        containLabel: false
      },
      xAxis: {
        type: 'category',
        data: xCategories,
        axisLabel: {
          interval: 0,
          rotate: 45,
          fontSize: 9,
          color: '#475569'
        },
        splitArea: { show: true }
      },
      yAxis: {
        type: 'category',
        data: yCategories,
        axisLabel: {
          fontSize: 9,
          color: '#475569'
        },
        splitArea: { show: true }
      },
      visualMap: {
        min: 0,
        max: maxColorVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        inRange: {
          // Light slate -> light indigo -> indigo -> navy gradient suitable for white text
          color: ['#f8fafc', '#a5b4fc', '#6366f1', '#4f46e5', '#3730a3', '#1e1b4b']
        },
        textStyle: { color: '#475569', fontSize: 10 },
        formatter: (value: number) => {
          return useLogScale ? value.toFixed(1) : Math.round(value).toString();
        },
        text: [useLogScale ? 'log(Detections + 1)' : 'Detections', '']
      },
      series: [
        {
          name: 'Detections',
          type: 'heatmap',
          data: data,
          label: {
            show: selectedSiteGroup !== 'All' && yCategories.length <= 30,
            fontSize: 8,
            color: (params: any) => {
              const val = params.value[3] || 0;
              return val <= 2 ? '#334155' : '#ffffff'; // dark text for light blue cells, white for dark indigo/navy cells
            },
            formatter: (params: any) => params.value[3] || '' // display raw call count inside cells
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    };
  }, [filteredRecs, xCategories, yCategories, speciesDetectionsMatrix, selectedSiteGroup, useLogScale]);

  // Adjust height based on number of species
  const chartHeight = useMemo(() => {
    const count = yCategories.length;
    return `${Math.max(300, count * 20 + 100)}px`;
  }, [yCategories]);

  return (
    <div className="dashboard-section" id="heatmap-section">
      <div className="section-header">
        <div>
          <h2>Species Detection Heatmap</h2>
          <p>Distribution and relative abundance (call counts) of species across physical recorders.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => onDownloadCSV(processedSpecies.map((s) => s.name), filteredRecs)}
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Matrix CSV
        </button>
      </div>

      <div className="heatmap-controls" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div className="search-box">
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ width: '18px', height: '18px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search species common name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-item" style={{ minWidth: '150px' }}>
          <select className="select-input" value={topN} onChange={(e) => setTopN(e.target.value)}>
            <option value="15">Top 15 Species</option>
            <option value="25">Top 25 Species</option>
            <option value="50">Top 50 Species</option>
            <option value="All">All Species</option>
          </select>
        </div>

        <div className="filter-item" style={{ minWidth: '150px' }}>
          <select className="select-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="detections">Sort by Detections</option>
            <option value="alphabetical">Sort Alphabetically</option>
          </select>
        </div>

        <div className="filter-item">
          <div className="scale-toggle-group">
            <button
              type="button"
              className={`scale-toggle-btn ${!useLogScale ? 'active' : ''}`}
              onClick={() => setUseLogScale(false)}
            >
              Linear
            </button>
            <button
              type="button"
              className={`scale-toggle-btn ${useLogScale ? 'active' : ''}`}
              onClick={() => setUseLogScale(true)}
            >
              Log Scale ln(x+1)
            </button>
          </div>
        </div>
      </div>

      {yCategories.length === 0 ? (
        <div className="empty-state">
          <span>No species match your query.</span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', width: '100%', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <div style={{ minWidth: '800px', padding: '1rem 0' }}>
            <ReactECharts option={chartOption} style={{ height: chartHeight, width: '100%' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default HeatmapPanel;
