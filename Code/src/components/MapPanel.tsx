import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Recorder } from '../types';

// Component to dynamically re-center/re-zoom the Leaflet map and trigger map.invalidateSize()
const ChangeView: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
    // Force Leaflet to recalculate container size to center pins perfectly
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [center, zoom, map]);
  return null;
};

interface MapPanelProps {
  recorders: Recorder[];
  siteRichness: Record<string, number>;
  siteDetections: Record<string, number>;
  selectedSiteGroup: string;
}

const MapPanel: React.FC<MapPanelProps> = ({
  recorders,
  siteRichness,
  siteDetections,
  selectedSiteGroup,
}) => {
  const [mapCenter, setMapCenter] = useState<[number, number]>([11.0, 76.9]);
  const [mapKey, setMapKey] = useState<string>('all');
  const [zoomLevel, setZoomLevel] = useState<number>(8.5);

  // Compute map center and zoom level when selections change
  useEffect(() => {
    const validRecorders = recorders.filter((r) => r.latitude !== null && r.longitude !== null);
    if (validRecorders.length > 0) {
      const sumLat = validRecorders.reduce((sum, r) => sum + (r.latitude || 0), 0);
      const sumLng = validRecorders.reduce((sum, r) => sum + (r.longitude || 0), 0);
      const centerLat = sumLat / validRecorders.length;
      const centerLng = sumLng / validRecorders.length;

      setMapCenter([centerLat, centerLng]);
      setMapKey(`${selectedSiteGroup}-${centerLat}-${centerLng}`);

      if (selectedSiteGroup === 'All') {
        setZoomLevel(8.5); // default zoom is slightly closer
      } else if (validRecorders.length === 1) {
        setZoomLevel(15.5); // tight zoom for single recorder
      } else {
        setZoomLevel(13.5); // medium zoom for single landscape site group
      }
    }
  }, [recorders, selectedSiteGroup]);

  // Create custom pin icon for LC (Green) and LI (Red)
  const createPinIcon = (habitat: 'LC' | 'LI') => {
    const color = habitat === 'LC' ? '#16a34a' : '#ef4444'; // Green for LC, Red for LI
    const svgHtml = `
      <div style="display: flex; justify-content: center; align-items: center; width: 32px; height: 32px;">
        <svg viewBox="0 0 24 24" width="30" height="30" fill="${color}" stroke="#ffffff" stroke-width="1.8" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.35));">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `;
    return L.divIcon({
      html: svgHtml,
      className: 'custom-pin-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 30] // Anchor pin tip to exact coordinates
    });
  };

  return (
    <div className="dashboard-section" id="map-section">
      <div className="section-header">
        <div>
          <h2>Landscape Map & Recorder Sites</h2>
          <p>Satellite visualization of passive acoustic monitoring recorders across field sites.</p>
        </div>
        <div className="map-legend" style={{ flexDirection: 'row', padding: '0.25rem 0.5rem', boxShadow: 'none', background: 'transparent' }}>
          <div className="legend-item">
            <span className="legend-color lc" style={{ backgroundColor: '#16a34a' }}></span>
            <span style={{ fontWeight: 600 }}>Lantana-Cleared (LC)</span>
          </div>
          <div className="legend-item" style={{ marginLeft: '1.5rem' }}>
            <span className="legend-color li" style={{ backgroundColor: '#ef4444' }}></span>
            <span style={{ fontWeight: 600 }}>Lantana-Infested (LI)</span>
          </div>
        </div>
      </div>

      <div className="map-container">
        <MapContainer
          key={mapKey}
          center={mapCenter}
          zoom={zoomLevel}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <ChangeView center={mapCenter} zoom={zoomLevel} />
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
          {recorders
            .filter((r) => r.latitude !== null && r.longitude !== null)
            .map((rec) => {
              const recKey = `${rec.site_group}/${rec.recorder_id}`;
              const richness = siteRichness[recKey] || 0;
              const detections = siteDetections[recKey] || 0;

              return (
                <Marker
                  key={recKey}
                  position={[rec.latitude!, rec.longitude!]}
                  icon={createPinIcon(rec.habitat)}
                >
                  <Tooltip direction="top" offset={[0, -25]} opacity={0.9}>
                    <div className="map-popup-content" style={{ padding: '0.2rem' }}>
                      <div className="map-popup-title" style={{ fontSize: '0.8rem', margin: 0 }}>
                        {rec.site_group} | {rec.recorder_id} ({rec.habitat})
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#333', marginTop: '0.1rem' }}>
                        Richness: <strong>{richness} species</strong>
                      </div>
                    </div>
                  </Tooltip>
                  <Popup>
                    <div className="map-popup-content">
                      <div className="map-popup-title">
                        {rec.site_group} — Recorder {rec.recorder_id}
                      </div>
                      <div className="map-popup-row">
                        <span className="map-popup-label">Habitat Class:</span>
                        <span className={`legend-pill ${rec.habitat.toLowerCase()}`} style={{ backgroundColor: rec.habitat === 'LC' ? '#dcfce7' : '#fee2e2', color: rec.habitat === 'LC' ? '#14532d' : '#991b1b' }}>
                          {rec.habitat === 'LC' ? 'Lantana-Cleared' : 'Lantana-Infested'}
                        </span>
                      </div>
                      <div className="map-popup-row">
                        <span className="map-popup-label">Latitude:</span>
                        <span className="map-popup-value">{rec.latitude?.toFixed(6)}° N</span>
                      </div>
                      <div className="map-popup-row">
                        <span className="map-popup-label">Longitude:</span>
                        <span className="map-popup-value">{rec.longitude?.toFixed(6)}° E</span>
                      </div>
                      <div className="map-popup-row">
                        <span className="map-popup-label">Processed Files:</span>
                        <span className="map-popup-value">{rec.actual_files} audio clips</span>
                      </div>
                      <div className="map-popup-row" style={{ borderTop: '1px solid #eee', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                        <span className="map-popup-label">Species Richness:</span>
                        <span className="map-popup-value" style={{ color: '#4f46e5', fontWeight: 'bold' }}>
                          {richness} species
                        </span>
                      </div>
                      <div className="map-popup-row">
                        <span className="map-popup-label">Total Detections:</span>
                        <span className="map-popup-value">{detections} calls</span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>
      </div>
    </div>
  );
};

export default MapPanel;
