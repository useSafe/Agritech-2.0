import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, Tooltip, LayersControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../services/api';
import L from 'leaflet';

// MapFixer component
const MapFixer = () => {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }, [map]);
    return null;
};

// Zoom Handler
const MapZoomHandler = ({ selectedBoundary }) => {
    const map = useMap();
    useEffect(() => {
        if (selectedBoundary && selectedBoundary.coordinates && selectedBoundary.coordinates.length > 0) {
            const bounds = selectedBoundary.coordinates.reduce((acc, coord) => {
                return acc.extend(coord);
            }, new L.LatLngBounds(selectedBoundary.coordinates[0], selectedBoundary.coordinates[0]));

            map.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 17,
                animate: true,
                duration: 1
            });
        }
    }, [selectedBoundary, map]);
    return null;
};

// Reset View Control
const ResetViewControl = ({ onReset }) => {
    const map = useMap();
    const handleReset = (e) => {
        e.preventDefault();
        e.stopPropagation();
        map.setView([8.650788, 124.750792], 14, { animate: true });
        onReset();
    };
    return (
        <div className="leaflet-top leaflet-right">
            <div className="leaflet-control leaflet-bar border-0 shadow-lg" style={{ marginTop: '80px', marginRight: '10px', zIndex: 1000 }}>
                <button
                    onClick={handleReset}
                    className="flex items-center justify-center bg-white text-green-600 hover:text-green-700 hover:bg-gray-50 w-10 h-10 rounded shadow transition-all focus:outline-none"
                    title="Reset View"
                >
                    <i className="fas fa-compress text-lg"></i>
                </button>
            </div>
        </div>
    );
};

export default function FarmBoundaryMap({
    onBoundaryClick,
    searchTerm,
    filterStatus = 'All Farms',
    filterBarangay = 'All',
    filterPurok = 'All'
}) {
    const [boundaries, setBoundaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedBoundaryId, setSelectedBoundaryId] = useState(null);
    const mapRef = useRef(null);

    const fetchBoundaries = async () => {
        try {
            setLoading(true);
            // 1. Fetch Boundaries
            const { data: boundariesData, error } = await supabase
                .from('farm_boundaries')
                .select(`
                    id,
                    farm_parcel_id,
                    boundary,
                    notes,
                    area_hectares,
                    perimeter_meters,
                    farm_image_url,
                    created_at
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 2. Fetch Details
            const boundariesWithDetails = await Promise.all(
                boundariesData.map(async (boundary) => {
                    let parcelData = null;
                    if (boundary.farm_parcel_id) {
                        const { data: parcel, error: parcelError } = await supabase
                            .from('farm_parcels')
                            .select(`
                                *,
                                parcel_infos (
                                    *,
                                    crops:crops!parcel_info_id (*),
                                    livestock:livestock!parcel_info_id (*),
                                    poultry:poultry!parcel_info_id (*)
                                )
                            `)
                            .eq('id', boundary.farm_parcel_id)
                            .single();

                        if (!parcelError && parcel) {
                            if (parcel.registrant_id) {
                                const { data: registrant } = await supabase
                                    .from('registrants')
                                    .select(`*, addresses (*)`)
                                    .eq('id', parcel.registrant_id)
                                    .single();
                                parcelData = { ...parcel, registrants: registrant };
                            } else {
                                parcelData = parcel;
                            }
                        }
                    }
                    return { ...boundary, farm_parcels: parcelData };
                })
            );

            // Process Geom
            const processed = boundariesWithDetails.map(boundary => {
                let coordinates = [];
                try {
                    if (boundary.boundary) {
                        let geom = boundary.boundary;
                        if (geom.type === 'MultiPolygon') {
                            const firstPolygon = geom.coordinates[0];
                            const ring = firstPolygon[0];
                            coordinates = ring.map(coord => [coord[1], coord[0]]);
                        } else if (geom.type === 'Polygon') {
                            const ring = geom.coordinates[0];
                            coordinates = ring.map(coord => [coord[1], coord[0]]);
                        }
                    }
                } catch (e) { console.error('Error parsing boundary:', e); }
                return { ...boundary, coordinates };
            }).filter(b => b.coordinates.length > 0);

            setBoundaries(processed);
        } catch (err) {
            console.error('Error fetching farm boundaries:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBoundaries();
    }, []);

    // Filter Logic
    const filteredBoundaries = boundaries.filter(b => {
        // 1. Search Term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const loc = b.farm_parcels?.farm_location?.toLowerCase() || '';
            const name = b.farm_parcels?.registrants ? `${b.farm_parcels.registrants.first_name} ${b.farm_parcels.registrants.surname}`.toLowerCase() : '';
            const ref = b.farm_parcels?.registrants?.reference_no?.toLowerCase() || '';
            if (!loc.includes(term) && !name.includes(term) && !ref.includes(term)) return false;
        }

        // 2. Status Filter - STRICT Owner Check
        const isAssigned = !!(b.farm_parcels?.registrants);

        if (filterStatus === 'Assigned Farm' && !isAssigned) return false;
        if (filterStatus === 'Unassigned Farm' && isAssigned) return false;

        // 3. Location Extraction
        const locationStr = b.farm_parcels?.farm_location || '';
        const purokMatch = locationStr.match(/(?:purok|p)\s*(\d+[ab]?)/i);
        const purok = purokMatch ? purokMatch[1].toUpperCase() : '';

        // 4. Purok Filter
        if (filterPurok !== 'All') {
            if (purok !== filterPurok.toUpperCase()) return false;
        }

        // 5. Barangay Filter
        if (filterBarangay !== 'All') {
            const upperPuroks = ['5', '6A', '6B', '7', '8', '9A', '9B', '10'];
            const lowerPuroks = ['1', '2', '3', '4', '10', '11'];

            if (filterBarangay === 'Upper Jasaan' && !upperPuroks.includes(purok)) return false;
            if (filterBarangay === 'Lower Jasaan' && !lowerPuroks.includes(purok)) return false;
        }

        return true;
    });

    const getPolygonOptions = (boundary) => {
        const isAssigned = !!(boundary.farm_parcels?.registrants);
        return {
            color: isAssigned ? '#10b981' : '#ef4444',
            fillColor: isAssigned ? '#10b981' : '#ef4444',
            fillOpacity: 0.4,
            weight: 2
        };
    };

    const handleBoundaryClick = (boundary) => {
        setSelectedBoundaryId(boundary.id);
        onBoundaryClick(boundary);
    };

    const selectedBoundary = boundaries.find(b => b.id === selectedBoundaryId);

    return (
        <div className="relative h-full w-full">
            <MapContainer
                center={[8.650788, 124.750792]}
                zoom={14}
                style={{ height: '600px', width: '100%' }}
                ref={mapRef}
                attributionControl={false}
            >
                <MapFixer />
                <MapZoomHandler selectedBoundary={selectedBoundary} />
                <ResetViewControl onReset={() => { setSelectedBoundaryId(null); onBoundaryClick(null); }} />
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Satellite (ESRI)">
                        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="OpenStreetMap">
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    </LayersControl.BaseLayer>
                </LayersControl>

                {filteredBoundaries.map((boundary) => (
                    <Polygon
                        key={boundary.id}
                        positions={boundary.coordinates}
                        pathOptions={getPolygonOptions(boundary)}
                        eventHandlers={{ click: () => handleBoundaryClick(boundary) }}
                    >
                        <Tooltip sticky opacity={1} className="custom-map-tooltip">
                            <div className="p-1 min-w-[150px]">
                                {boundary.farm_parcels?.registrants ? (
                                    <>
                                        <div className="font-bold text-sm border-b border-gray-200 pb-1 mb-1">
                                            {boundary.farm_parcels.registrants.first_name} {boundary.farm_parcels.registrants.surname}
                                        </div>
                                        <div className="text-xs grid grid-cols-[auto,1fr] gap-x-2">
                                            <span className="text-muted-foreground">Ref:</span>
                                            <span className="font-mono">{boundary.farm_parcels.registrants.reference_no}</span>

                                            <span className="text-muted-foreground">Area:</span>
                                            <span>{boundary.area_hectares?.toFixed(4)} ha</span>

                                            <span className="text-muted-foreground">Perim:</span>
                                            <span>{boundary.perimeter_meters?.toFixed(2)} m</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="font-bold text-sm text-red-500 border-b border-gray-200 pb-1 mb-1">
                                            Unassigned Farm
                                        </div>
                                        <div className="text-xs grid grid-cols-[auto,1fr] gap-x-2">
                                            <span className="text-muted-foreground">Area:</span>
                                            <span>{boundary.area_hectares?.toFixed(4)} ha</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Tooltip>
                    </Polygon>
                ))}
            </MapContainer>

            {/* Legend - Updated Colors */}
            <div className="absolute bottom-4 left-4 z-[1000] bg-black/80 text-white p-3 rounded-lg text-xs">
                <div className="font-bold mb-2">Legend</div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 bg-green-500 rounded-sm"></span>
                    <span>Assigned Farm</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-red-500 rounded-sm"></span>
                    <span>Unassigned Farm</span>
                </div>
                <div className="mt-2 text-gray-400 border-t border-gray-600 pt-1">
                    Total Farm Polygons: {filteredBoundaries.length}
                </div>
            </div>

            {loading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-[1000]">
                    <div className="text-white">Loading Boundaries...</div>
                </div>
            )}
        </div>
    );
}
