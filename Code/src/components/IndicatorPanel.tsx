import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { Recorder, Config } from '../types';
import appConfig from '../data/config.json';

interface IndicatorPanelProps {
  recorders: Recorder[];
  speciesDetectionsMatrix: Record<string, Record<string, number>>; // species -> recorderKey -> count
  selectedSiteGroup: string;
}

const IndicatorPanel: React.FC<IndicatorPanelProps> = ({
  recorders,
  speciesDetectionsMatrix,
  selectedSiteGroup,
}) => {
  const [indicatorClass, setIndicatorClass] = useState<string>('recovery'); // recovery, lantana, all
  const [useLogScale, setUseLogScale] = useState<boolean>(true); // default to true to match python scripts

  const config = appConfig as Config;

  // 1. Get filtered recorders for current site group selection
  const filteredRecs = useMemo(() => {
    let list = [...recorders];
    if (selectedSiteGroup !== 'All') {
      list = list.filter((r) => r.site_group === selectedSiteGroup);
    }
    return list.sort((a, b) => a.site_group.localeCompare(b.site_group) || a.recorder_id.localeCompare(b.recorder_id));
  }, [recorders, selectedSiteGroup]);

  // 2. Identify the active indicator species list
  const activeIndicators = useMemo(() => {
    if (indicatorClass === 'recovery') return config.indicator_species.recovery;
    if (indicatorClass === 'lantana') return config.indicator_species.lantana;
    return [...config.indicator_species.recovery, ...config.indicator_species.lantana];
  }, [indicatorClass, config]);

  // 3. Filter species list to only those that have detections in the active matrix
  const processedSpecies = useMemo(() => {
    const list = activeIndicators.map((sp) => {
      let total = 0;
      filteredRecs.forEach((rec) => {
        const key = `${rec.site_group}/${rec.recorder_id}`;
        total += (speciesDetectionsMatrix[sp]?.[key] || 0);
      });
      return { name: sp, total };
    });

    // Sort by total detections
    return list.sort((a, b) => b.total - a.total);
  }, [activeIndicators, filteredRecs, speciesDetectionsMatrix]);

  // 4. Calculate total indicator detections in LC vs LI
  const totals = useMemo(() => {
    let lcTotal = 0;
    let liTotal = 0;

    processedSpecies.forEach((sp) => {
      filteredRecs.forEach((rec) => {
        const key = `${rec.site_group}/${rec.recorder_id}`;
        const val = speciesDetectionsMatrix[sp.name]?.[key] || 0;
        if (rec.habitat === 'LC') {
          lcTotal += val;
        } else {
          liTotal += val;
        }
      });
    });

    return { lcTotal, liTotal };
  }, [processedSpecies, filteredRecs, speciesDetectionsMatrix]);

  // 5. Construct ECharts Heatmap Option
  const xCategories = useMemo(() => {
    return filteredRecs.map((r) => `${r.site_group}\n${r.recorder_id}`);
  }, [filteredRecs]);

  const yCategories = useMemo(() => {
    return processedSpecies.map((item) => item.name).reverse();
  }, [processedSpecies]);

  const chartOption = useMemo(() => {
    const data: [number, number, number, number][] = [];
    let maxVal = 1;

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
          const val = params.value[3]; // raw call count
          
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
        left: '20%',
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
          name: 'Indicator Detections',
          type: 'heatmap',
          data: data,
          label: {
            show: yCategories.length <= 25,
            fontSize: 8,
            color: (params: any) => {
              const val = params.value[3] || 0;
              return val <= 2 ? '#334155' : '#ffffff'; // dark text for light blue cells, white for dark indigo/navy cells
            },
            formatter: (params: any) => params.value[3] || '' // display raw call count inside cell
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
  }, [filteredRecs, xCategories, yCategories, speciesDetectionsMatrix, useLogScale]);

  const chartHeight = useMemo(() => {
    const count = yCategories.length;
    return `${Math.max(300, count * 22 + 100)}px`;
  }, [yCategories]);

  return (
    <div className="dashboard-section" id="indicators-section">
      <div className="section-header">
        <div>
          <h2>Indicator Species Heatmap</h2>
          <p>Ecological indicators mapping restoration recovery-associated and invasive lantana-associated birds.</p>
        </div>
      </div>

      <div className="heatmap-controls" style={{ gap: '2rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="filter-item" style={{ minWidth: '200px' }}>
          <label className="filter-label">Indicator Category</label>
          <select
            className="select-input"
            value={indicatorClass}
            onChange={(e) => setIndicatorClass(e.target.value)}
          >
            <option value="recovery">Recovery-associated Species</option>
            <option value="lantana">Lantana-associated Species</option>
            <option value="all">All Indicator Species</option>
          </select>
        </div>

        <div className="filter-item">
          <label className="filter-label">Visual Scale</label>
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

      <div className="split-layout">
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <div style={{ minWidth: '700px', padding: '1rem 0' }}>
            {yCategories.length === 0 ? (
              <div className="empty-state" style={{ border: 'none', background: 'none' }}>
                <span>No indicator species detected in the current landscape group.</span>
              </div>
            ) : (
              <ReactECharts option={chartOption} style={{ height: chartHeight, width: '100%' }} />
            )}
          </div>
        </div>

        <div className="stats-summary-panel" style={{ justifyContent: 'center' }}>
          <h3 className="stats-summary-title">Indicator Detections Summary</h3>

          <div className="stat-item" style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <span className="stat-item-label">Recovery Category Choice</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'capitalize', color: 'var(--color-neutral-dark)' }}>
              {indicatorClass === 'recovery' ? 'Restoration-associated' : indicatorClass === 'lantana' ? 'Lantana-associated' : 'Combined Indicators'}
            </span>
          </div>

          <div className="stats-grid" style={{ marginTop: '0.5rem' }}>
            <div className="stat-item" style={{ backgroundColor: 'var(--color-lc-light)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(22,163,74,0.1)' }}>
              <span className="stat-item-label" style={{ color: 'var(--color-lc-dark)' }}>Detections in LC</span>
              <span className="stat-item-value lc" style={{ fontSize: '1.5rem' }}>
                {new Intl.NumberFormat().format(totals.lcTotal)}
              </span>
              <span className="kpi-subtext" style={{ color: 'var(--color-lc-dark)' }}>Restored Habitats</span>
            </div>

            <div className="stat-item" style={{ backgroundColor: 'var(--color-li-light)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)' }}>
              <span className="stat-item-label" style={{ color: 'var(--color-li-dark)' }}>Detections in LI</span>
              <span className="stat-item-value li" style={{ fontSize: '1.5rem' }}>
                {new Intl.NumberFormat().format(totals.liTotal)}
              </span>
              <span className="kpi-subtext" style={{ color: 'var(--color-li-dark)' }}>Infested Habitats</span>
            </div>
          </div>

          <div className="stat-diff-callout" style={{ borderLeftColor: totals.lcTotal >= totals.liTotal ? '#16a34a' : '#ef4444' }}>
            <span className="stat-diff-label">Detections Ratio (LC / LI)</span>
            <span className="stat-diff-val" style={{ color: totals.lcTotal >= totals.liTotal ? '#16a34a' : '#ef4444' }}>
              {totals.liTotal > 0 ? (totals.lcTotal / totals.liTotal).toFixed(2) : totals.lcTotal > 0 ? 'LC Only' : '0.00'}x
            </span>
            <span className="kpi-subtext">
              {totals.lcTotal > totals.liTotal
                ? 'Detected predominantly in Lantana-Cleared (LC) sites.'
                : totals.lcTotal < totals.liTotal
                  ? 'Detected predominantly in Lantana-Infested (LI) sites.'
                  : 'Equally distributed between habitats.'
              }
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndicatorPanel;
