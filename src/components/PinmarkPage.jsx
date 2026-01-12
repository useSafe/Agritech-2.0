// src/components/PinMarkMap.jsx
'use client';

import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../services/api';
import L from 'leaflet';

// Custom Stacked Icons Generator
const createPinIcon = (color, iconClass, iconColor = 'white') => L.divIcon({
  html: `
    <div style="position: relative; width: 40px; height: 50px; display: flex; align-items: center; justify-content: center;">
        <!-- White Border (Background) -->
        <i class="fas fa-map-marker" style="position: absolute; top: -3px; color: white; font-size: 48px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));"></i>
        <!-- Colored Body -->
        <i class="fas fa-map-marker" style="position: absolute; top: 0; color: ${color}; font-size: 42px;"></i>
        <!-- Inner Icon -->
        <i class="fas ${iconClass}" style="position: absolute; top: 10px; color: ${iconColor}; font-size: 18px; z-index: 10;"></i>
    </div>
  `,
  className: 'custom-pin-marker',
  iconSize: [40, 50],
  iconAnchor: [20, 48], // Tip location
  popupAnchor: [0, -48],
  tooltipAnchor: [0, -50]
});

// Define Icons
// Farmer: Green Body, Yellow/Amber Icon (Grain style)
const greenPinIcon = createPinIcon('#10b981', 'fa-leaf', '#fbbf24');
// Fisherfolk: Blue Body, White Fish
const bluePinIcon = createPinIcon('#3b82f6', 'fa-fish', 'white');
// Unassigned: Red Body, White Exclamation
const redPinIcon = createPinIcon('#ef4444', 'fa-exclamation', 'white');

// Map Zoom Handler
function MapZoomHandler({ selectedMarkerId, markers }) {
  const map = useMap();
  useEffect(() => {
    if (selectedMarkerId) {
      const marker = markers.find(m => m.id === selectedMarkerId);
      if (marker && marker.position) {
        map.flyTo(marker.position, 18, {
          duration: 1.5,
          easeLinearity: 0.5
        });
      }
    }
  }, [selectedMarkerId, markers, map]);
  return null;
}

// Map Fixer
const MapFixer = () => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
  }, [map]);
  return null;
};

export default function PinMarkMap({
  onMarkerClick,
  selectedFarmerId,
  searchTerm,
  filterType = 'All Pinmarks',
  filterBarangay = 'All',
  filterPurok = 'All'
}) {
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);

  const fetchFarmersData = async () => {
    try {
      setLoading(true);

      const { data: pinmarksData, error } = await supabase
        .from('pinmark_locations')
        .select(`
          id,
          registrant_id,
          location,
          location_name,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pinmarksWithDetails = await Promise.all(
        pinmarksData.map(async (pinmark) => {
          let registrantData = null;
          if (pinmark.registrant_id) {
            const { data: registrant, error: regError } = await supabase
              .from('registrants')
              .select(`
                *,
                addresses (*),
                financial_infos (*)
              `)
              .eq('id', pinmark.registrant_id)
              .single();

            if (!regError && registrant) {
              registrantData = registrant;
            }
          }
          return { ...pinmark, registrants: registrantData };
        })
      );

      const markersData = pinmarksWithDetails.map(pin => {
        let lat = null, lng = null;
        try {
          if (pin.location) {
            if (pin.location.type === 'Point') {
              lng = pin.location.coordinates[0]; lat = pin.location.coordinates[1];
            } else if (pin.location.type === 'MultiPoint') {
              lng = pin.location.coordinates[0][0]; lat = pin.location.coordinates[0][1];
            }
          }
        } catch (e) { console.error(e); }

        if (!lat || !lng) return null;

        const reg = pin.registrants;
        const address = reg?.addresses?.[0];
        const purok = address?.purok || pin.location_name || 'Unknown';

        return {
          id: pin.id,
          name: pin.location_name || (reg ? `${reg.first_name} ${reg.surname}` : 'Unnamed Pin'),
          position: [lat, lng],
          purok: purok,
          registrant: reg,
          fullData: pin
        };
      }).filter(m => m !== null);

      setMarkers(markersData);
    } catch (err) {
      console.error('Error fetching pinmarks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFarmersData();
  }, []);

  const handleResetView = () => {
    if (mapRef.current) {
      mapRef.current.setView([8.650788, 124.750792], 15, { animate: true });
    }
  };

  // Filter Logic (Preserved)
  const visibleMarkers = markers.filter(marker => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesName = marker.name.toLowerCase().includes(term);
      const matchesLoc = marker.purok.toLowerCase().includes(term);
      if (!matchesName && !matchesLoc) return false;
    }
    if (filterType !== 'All Pinmarks') {
      const hasReg = !!marker.registrant;
      const regType = marker.registrant?.registry?.toLowerCase();
      if (filterType === 'All Registrants' && !hasReg) return false;
      if (filterType === 'Unassigned Pin' && hasReg) return false;
      if (filterType === 'Farmer' && regType !== 'farmer') return false;
      if (filterType === 'Fisherfolk' && regType !== 'fisherfolk') return false;
    }
    if (filterPurok !== 'All') {
      const pNormalized = marker.purok.replace(/purok\s*/i, '').trim();
      if (pNormalized !== filterPurok) return false;
    }
    if (filterBarangay !== 'All') {
      const pNormalized = marker.purok.replace(/purok\s*/i, '').trim();
      const upperPuroks = ['5', '6A', '6B', '7', '8', '9A', '9B', '10'];
      const lowerPuroks = ['1', '2', '3', '4', '10', '11'];
      if (filterBarangay === 'Upper Jasaan' && !upperPuroks.includes(pNormalized)) return false;
      if (filterBarangay === 'Lower Jasaan' && !lowerPuroks.includes(pNormalized)) return false;
    }
    return true;
  });

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[8.650788, 124.750792]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        zoomControl={false}
        ref={mapRef}
        attributionControl={false}
      >
        <MapFixer />
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Satellite (ESRI)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        <MapZoomHandler selectedMarkerId={selectedFarmerId} markers={markers} />

        {visibleMarkers.map((marker) => {
          let icon = redPinIcon;
          let type = 'Unassigned';

          if (marker.registrant) {
            if (marker.registrant.registry === 'fisherfolk') {
              icon = bluePinIcon;
              type = 'Fisherfolk';
            } else {
              icon = greenPinIcon;
              type = 'Farmer';
            }
          }

          return (
            <Marker
              key={marker.id}
              position={marker.position}
              icon={icon}
              eventHandlers={{
                click: () => onMarkerClick({ ...marker })
              }}
            >
              <Tooltip direction="top" offset={[0, -42]} opacity={1} className="custom-map-tooltip">
                <div className="p-1 space-y-1 min-w-[150px]">
                  {marker.registrant ? (
                    <>
                      <div className="font-bold text-sm border-b border-gray-200 pb-1 mb-1">
                        {marker.registrant.first_name} {marker.registrant.surname}
                      </div>
                      <div className="text-xs grid grid-cols-[auto,1fr] gap-x-2">
                        <span className="text-muted-foreground">Ref:</span>
                        <span className="font-mono">{marker.registrant.reference_no}</span>

                        <span className="text-muted-foreground">Type:</span>
                        <span className={`font-semibold ${type === 'Farmer' ? 'text-green-600' : 'text-blue-600'}`}>
                          {type.toUpperCase()}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-sm text-red-500 border-b border-gray-200 pb-1 mb-1">
                        Unassigned Pin
                      </div>
                      <div className="text-xs grid grid-cols-[auto,1fr] gap-x-2">
                        <span className="text-muted-foreground">Loc:</span>
                        <span>{marker.purok}</span>
                      </div>
                    </>
                  )}
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Manual Reset View Button */}
      {selectedFarmerId && (
        <button
          onClick={handleResetView}
          className="absolute top-4 right-4 z-[1000] bg-white text-green-600 hover:bg-gray-100 rounded-full w-10 h-10 flex items-center justify-center shadow-lg transition-all"
          title="Reset View"
        >
          <i className="fas fa-compress text-lg"></i>
        </button>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-black/85 text-white px-4 py-3 rounded-lg shadow-lg border border-green-600/30">
        <div className="text-xs font-bold mb-2 text-green-400 flex items-center gap-2">
          <span>📍</span>
          <span>Pinmark Legend</span>
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 flex justify-center"><i className="fas fa-exclamation text-red-500 text-sm"></i></div>
            <span>Unassigned (Red)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 flex justify-center"><i className="fas fa-leaf text-green-500 text-sm"></i></div>
            <span>Farmer (Green)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 flex justify-center"><i className="fas fa-fish text-blue-500 text-sm"></i></div>
            <span>Fisherfolk (Blue)</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-600 text-xs text-gray-400">
          Total Pinmarks: <span className="text-green-400 font-semibold">{visibleMarkers.length}</span>
        </div>
      </div>
    </div>
  );
}
