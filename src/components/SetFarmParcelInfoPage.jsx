import React, { useState, useEffect, useContext } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, useMap, LayersControl, AttributionControl } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toast, ToastViewport } from "@/components/ui/toast";
import ClientOnly from './ClientOnly';
import { supabase } from '../services/api';
import ApiService from '../services/api';
import { ThemeContext } from '../App';
import QGISDocModal from './QGISDocModal';
import 'leaflet/dist/leaflet.css';

// Component to fix map rendering
const MapFixer = () => {
    const map = useMap();
    useEffect(() => {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    }, [map]);
    return null;
};

const SetFarmParcelInfoPage = () => {
    const { theme } = useContext(ThemeContext);
    const isDark = theme === 'dark';

    // Style classes
    const textClass = isDark ? 'text-white' : 'text-foreground';
    const subTextClass = isDark ? 'text-gray-400' : 'text-muted-foreground';
    const cardClass = isDark
        ? 'bg-[#1e1e1e] border border-[#333333]'
        : 'bg-card text-card-foreground border-0 shadow-lg';
    const inputClass = isDark
        ? 'bg-[#252525] border border-[#333333] text-gray-200'
        : 'bg-muted/50 border-0 text-foreground';

    const [farmBoundaries, setFarmBoundaries] = useState([]);
    const [farmParcels, setFarmParcels] = useState([]);
    const [selectedBoundary, setSelectedBoundary] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAttachModal, setShowAttachModal] = useState(false);
    const [selectedParcel, setSelectedParcel] = useState(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [mapCenter, setMapCenter] = useState([8.5, 124.8]); // Mindanao default
    const [mapZoom, setMapZoom] = useState(10);
    const [showDocModal, setShowDocModal] = useState(false);

    // Toast State
    const [toast, setToast] = useState({ show: false, variant: 'neutral', title: '', description: '' });

    const showToast = (variant, title, description) => {
        setToast({ show: true, variant, title, description });
    };

    // Fetch farm boundaries from database
    const fetchFarmBoundaries = async () => {
        try {
            setLoading(true);

            // Fetch data directly without pre-check
            const { data, error } = await supabase
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

            if (error) {
                console.error('Error fetching farm_boundaries:', error);
                throw error;
            }

            // Now fetch the related farm_parcels and registrants separately for each boundary
            const boundariesWithDetails = await Promise.all(
                data.map(async (boundary) => {
                    let parcelData = null;

                    if (boundary.farm_parcel_id) {
                        // Fetch the related farm parcel
                        const { data: parcel, error: parcelError } = await supabase
                            .from('farm_parcels')
                            .select(`
                id,
                farm_location,
                total_farm_area_ha,
                registrant_id
              `)
                            .eq('id', boundary.farm_parcel_id)
                            .single();

                        if (!parcelError && parcel) {
                            // Fetch the registrant for this parcel
                            if (parcel.registrant_id) {
                                const { data: registrant } = await supabase
                                    .from('registrants')
                                    .select('id, reference_no, first_name, surname, registry')
                                    .eq('id', parcel.registrant_id)
                                    .single();

                                parcelData = {
                                    ...parcel,
                                    registrants: registrant
                                };
                            } else {
                                parcelData = parcel;
                            }
                        }
                    }

                    return {
                        ...boundary,
                        farm_parcels: parcelData
                    };
                })
            );

            // Convert PostGIS geometry to Leaflet polygon format
            const formattedBoundaries = boundariesWithDetails.map(boundary => {
                let coordinates = [];

                try {
                    // Parse GeoJSON from PostGIS
                    if (boundary.boundary) {
                        let geom = boundary.boundary;

                        // Handle both POLYGON and MULTIPOLYGON
                        if (geom.type === 'MultiPolygon') {
                            // For MultiPolygon, take the first polygon
                            const firstPolygon = geom.coordinates[0];
                            const ring = firstPolygon[0];
                            coordinates = ring.map(coord => [coord[1], coord[0]]); // Convert to [lat, lng] for Leaflet
                        } else if (geom.type === 'Polygon') {
                            // For Polygon, take the outer ring
                            const ring = geom.coordinates[0];
                            coordinates = ring.map(coord => [coord[1], coord[0]]); // Convert to [lat, lng] for Leaflet
                        }
                    }
                } catch (e) {
                    console.error('Error parsing boundary geometry:', e, boundary.boundary);
                }

                return {
                    ...boundary,
                    coordinates,
                    hasParcel: !!boundary.farm_parcel_id,
                    parcelData: boundary.farm_parcels
                };
            });

            setFarmBoundaries(formattedBoundaries);

            // Set map center to first boundary if available
            if (formattedBoundaries.length > 0 && formattedBoundaries[0].coordinates.length > 0) {
                const firstCoord = formattedBoundaries[0].coordinates[0];
                setMapCenter(firstCoord);
                setMapZoom(13);
            }
        } catch (error) {
            console.error('Error fetching farm boundaries:', error);
            showToast('error', 'Error', error.message || 'Failed to load farm boundaries. Please check console for details.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch farm parcels without boundaries
    const fetchFarmParcels = async () => {
        try {
            const { data, error } = await supabase
                .from('farm_parcels')
                .select(`
          *,
          registrants (
            id,
            reference_no,
            first_name,
            surname,
            middle_name,
            registry
          )
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setFarmParcels(data);
        } catch (error) {
            console.error('Error fetching farm parcels:', error);
        }
    };

    useEffect(() => {
        fetchFarmBoundaries();
        fetchFarmParcels();
    }, []);

    const handleBoundaryClick = (boundary) => {
        setSelectedBoundary(boundary);
    };

    const handleAttachParcel = async () => {
        if (!selectedParcel || !selectedBoundary) return;

        try {
            setSaving(true);

            // Update farm_boundary with farm_parcel_id
            const { error: boundaryError } = await supabase
                .from('farm_boundaries')
                .update({
                    farm_parcel_id: selectedParcel.id
                })
                .eq('id', selectedBoundary.id);

            if (boundaryError) throw boundaryError;

            // Update farm_parcel with boundary_polygon and calculated_area_ha
            // If total_farm_area_ha is missing, populate it with the boundary area
            const updatePayload = {
                boundary_polygon: selectedBoundary.boundary,
                calculated_area_ha: selectedBoundary.area_hectares
            };

            if (!selectedParcel.total_farm_area_ha || parseFloat(selectedParcel.total_farm_area_ha) === 0) {
                updatePayload.total_farm_area_ha = selectedBoundary.area_hectares;
            }

            const { error: parcelError } = await supabase
                .from('farm_parcels')
                .update(updatePayload)
                .eq('id', selectedParcel.id);

            if (parcelError) throw parcelError;

            showToast('success', 'Success', `Successfully attached farm parcel! Calculated Area: ${selectedBoundary.area_hectares} hectares`);
            setShowAttachModal(false);
            setSelectedBoundary(null);
            setSelectedParcel(null);
            fetchFarmBoundaries();
            fetchFarmParcels();
        } catch (error) {
            console.error('Error attaching parcel:', error);
            showToast('error', 'Error', 'Failed to attach parcel: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDetachParcel = async (boundaryId) => {
        if (!confirm('Are you sure you want to detach this farm parcel from the boundary?')) return;

        try {
            setSaving(true);

            // Get the boundary to find the parcel_id
            const { data: boundary, error: fetchError } = await supabase
                .from('farm_boundaries')
                .select('farm_parcel_id')
                .eq('id', boundaryId)
                .single();

            if (fetchError) throw fetchError;

            // Update boundary: remove farm_parcel_id
            const { error: boundaryError } = await supabase
                .from('farm_boundaries')
                .update({
                    farm_parcel_id: null
                })
                .eq('id', boundaryId);

            if (boundaryError) throw boundaryError;

            // Update parcel: remove boundary_polygon and calculated_area_ha
            if (boundary.farm_parcel_id) {
                const { error: parcelError } = await supabase
                    .from('farm_parcels')
                    .update({
                        boundary_polygon: null,
                        calculated_area_ha: null
                    })
                    .eq('id', boundary.farm_parcel_id);

                if (parcelError) console.warn('Could not update parcel:', parcelError);
            }

            showToast('success', 'Success', 'Successfully detached farm parcel from boundary');
            fetchFarmBoundaries();
            fetchFarmParcels();
        } catch (error) {
            console.error('Error detaching parcel:', error);
            showToast('error', 'Error', 'Failed to detach: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (file) => {
        if (!file || !selectedBoundary) return;

        try {
            setUploadingImage(true);
            const publicUrl = await ApiService.uploadImage(file, 'farm-photos');

            // Update database
            const { error } = await supabase
                .from('farm_boundaries')
                .update({ farm_image_url: publicUrl })
                .eq('id', selectedBoundary.id);

            if (error) throw error;

            // Update local state and refresh
            const updatedBoundary = { ...selectedBoundary, farm_image_url: publicUrl };
            setSelectedBoundary(updatedBoundary);

            // Update the boundary in the main list as well
            setFarmBoundaries(prev => prev.map(b =>
                b.id === selectedBoundary.id ? updatedBoundary : b
            ));

        } catch (error) {
            console.error('Error uploading image:', error);
            showToast('error', 'Error', error.message || 'Failed to upload image');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleRemoveImage = async () => {
        if (!selectedBoundary) return;

        try {
            const { error } = await supabase
                .from('farm_boundaries')
                .update({ farm_image_url: null })
                .eq('id', selectedBoundary.id);

            if (error) throw error;

            // Update local state and refresh
            const updatedBoundary = { ...selectedBoundary, farm_image_url: null };
            setSelectedBoundary(updatedBoundary);

            setFarmBoundaries(prev => prev.map(b =>
                b.id === selectedBoundary.id ? updatedBoundary : b
            ));

        } catch (error) {
            console.error('Error removing image:', error);
            showToast('error', 'Error', 'Failed to remove image');
        }
    };

    const handleDeleteBoundary = async (boundaryId) => {
        if (!confirm('Are you sure you want to PERMANENTLY delete this boundary shape? This action cannot be undone.')) return;

        try {
            setSaving(true);

            // First detach any parcel if attached (safeguard)
            // But since we are deleting the boundary, existing FKs might fail if not handled?
            // Actually, if we delete the boundary, the FK from boundary->parcel is gone.
            // But we should also clear the parcel's `boundary_polygon` field if it references this boundary.

            // Get the boundary first to check for attached parcel
            const { data: boundary, error: fetchError } = await supabase
                .from('farm_boundaries')
                .select('farm_parcel_id')
                .eq('id', boundaryId)
                .single();

            if (!fetchError && boundary?.farm_parcel_id) {
                // Clear the parcel's reference to this boundary
                const { error: parcelError } = await supabase
                    .from('farm_parcels')
                    .update({
                        boundary_polygon: null,
                        calculated_area_ha: null
                    })
                    .eq('id', boundary.farm_parcel_id);

                if (parcelError) console.warn('Could not clear parcel data:', parcelError);
            }

            // Delete the boundary
            const { error: deleteError } = await supabase
                .from('farm_boundaries')
                .delete()
                .eq('id', boundaryId);

            if (deleteError) throw deleteError;

            showToast('success', 'Success', 'Successfully deleted boundary shape');
            setSelectedBoundary(null); // Close popup
            fetchFarmBoundaries();
            fetchFarmParcels();
        } catch (error) {
            console.error('Error deleting boundary:', error);
            showToast('error', 'Error', 'Failed to delete boundary: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    // Filter parcels by search AND availability
    const filteredParcels = farmParcels.filter(parcel => {
        const searchLower = searchTerm.toLowerCase();
        const registrant = parcel.registrants;

        // Check if parcel matches search
        const matchesSearch = (
            parcel.farm_location?.toLowerCase().includes(searchLower) ||
            registrant?.reference_no?.toLowerCase().includes(searchLower) ||
            registrant?.first_name?.toLowerCase().includes(searchLower) ||
            registrant?.surname?.toLowerCase().includes(searchLower)
        );

        if (!matchesSearch) return false;

        // Check if this parcel is currently assigned to the boundary we are editing
        const isCurrentAssignment = parcel.id === selectedBoundary?.farm_parcel_id;
        if (isCurrentAssignment) return true; // Always show the currently assigned one

        // Check if parcel is assigned to ANY other boundary
        // We iterate through all boundaries to find if this parcel ID is used elsewhere
        const isAssignedToOther = farmBoundaries.some(b =>
            b.farm_parcel_id === parcel.id && b.id !== selectedBoundary?.id
        );

        // Check if the parcel itself has a boundary_polygon set (double check for data consistency)
        // If it has a polygon, it's assigned. But we must ignore if it's assigned to US.
        // We already handled 'isCurrentAssignment' above, so if we are here and boundary_polygon is set,
        // it implies it's assigned to someone else (or data is out of sync, safest to hide).
        // Also check calculated_area_ha as a backup indicator
        const isAssignedSelf = parcel.boundary_polygon !== null || (parcel.calculated_area_ha !== null && parcel.calculated_area_ha > 0);

        return !isAssignedToOther && !isAssignedSelf;
    });


    // Get polygon color based on status
    const getPolygonColor = (boundary) => {
        // Strict check: Must have a valid ID AND successfully fetched parcel data
        // This ensures the color matches the Popup state (Green = Assigned & Loaded)
        const isAssigned = boundary.farm_parcel_id && boundary.parcelData;

        if (isAssigned) {
            return { color: '#10b981', fillColor: '#10b981', fillOpacity: 0.2 }; // Green for Assigned
        }
        return { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2 }; // Blue for Unassigned
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center h-screen">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
                    <p className={subTextClass}>Loading farm boundaries...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className={`grid grid-cols-1 lg:grid-cols-[3fr,1fr] gap-6`}>
                {/* Left Column: Map */}
                <Card className={`bg-card border-0 shadow-md h-full map-container`}>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div className="flex items-center gap-4">
                            <CardTitle className={`text-xl ${textClass}`}>
                                <i className="fas fa-draw-polygon mr-2"></i>
                                Set Farm Parcel Info
                            </CardTitle>
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                onClick={() => setShowDocModal(true)} 
                                variant="outline" 
                                size="sm" 
                                className="h-8"
                                title="View QGIS Import Guide"
                            >
                                <i className="fas fa-info-circle mr-2"></i>
                                Guide
                            </Button>
                            <Button onClick={() => { fetchFarmBoundaries(); fetchFarmParcels(); }} variant="outline" size="sm" className="h-8">
                                <i className="fas fa-sync mr-2"></i>
                                Refresh
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 relative h-[600px]">
                        <ClientOnly>
                            <div className="h-full w-full rounded-b-md overflow-hidden z-0">
                                <MapContainer
                                    center={mapCenter}
                                    zoom={mapZoom}
                                    style={{ height: '100%', width: '100%' }}
                                    attributionControl={false}
                                >
                                    <AttributionControl prefix={false} />
                                    <MapFixer />
                                    <LayersControl position="topright">
                                        <LayersControl.BaseLayer checked name="OpenStreetMap">
                                            <TileLayer
                                                attribution=""
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                        </LayersControl.BaseLayer>

                                        <LayersControl.BaseLayer name="ESRI Satellite">
                                            <TileLayer
                                                attribution=""
                                                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                            />
                                        </LayersControl.BaseLayer>

                                        <LayersControl.BaseLayer name="Elevation (Terrain)">
                                            <TileLayer
                                                attribution=""
                                                url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                                            />
                                        </LayersControl.BaseLayer>
                                    </LayersControl>

                                    {farmBoundaries.map((boundary, index) => (
                                        boundary.coordinates.length > 0 && (
                                            <Polygon
                                                key={`${boundary.id}-${index}`} // Force re-render on updates
                                                positions={boundary.coordinates}
                                                pathOptions={getPolygonColor(boundary)}
                                                eventHandlers={{
                                                    click: () => handleBoundaryClick(boundary)
                                                }}
                                            />
                                        )
                                    ))}
                                </MapContainer>

                                {/* Legend - Floating on map inside the container */}
                                <div className="absolute bottom-4 left-4 z-[400] bg-background/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-border">
                                    <h4 className="text-xs font-semibold mb-2 text-foreground">Legend</h4>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 border-2 border-blue-500 bg-blue-500/20"></div>
                                            <span className={`text-xs ${textClass}`}>Unassigned Shape</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 border-2 border-green-500 bg-green-500/20"></div>
                                            <span className={`text-xs ${textClass}`}>Assigned Shape</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ClientOnly>
                    </CardContent>
                </Card>

                {/* Right Column: Info Panel */}
                <Card className={`bg-card border-0 shadow-md h-[600px] flex flex-col`}>
                    <CardHeader className="border-b border-border pb-3">
                        <CardTitle className={`text-lg ${textClass}`}>
                            {selectedBoundary ? 'Boundary Details' : 'Select Boundary'}
                        </CardTitle>
                        <p className={`text-xs ${subTextClass}`}>
                            {selectedBoundary
                                ? 'Review and manage boundary assignment'
                                : 'Click a polygon on the map to view details'}
                        </p>
                    </CardHeader>
                    <CardContent className="flex-1 p-4 overflow-y-auto">
                        {selectedBoundary ? (
                            <div className="space-y-6">
                                {/* Statistics Info */}
                                <div>
                                    <h4 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Statistics
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 rounded-md bg-muted/50 border border-border">
                                            <p className={`text-xs ${subTextClass}`}>Area (GIS)</p>
                                            <p className={`font-medium text-lg ${textClass}`}>
                                                {selectedBoundary.area_hectares?.toFixed(4)} <span className="text-xs">ha</span>
                                            </p>
                                        </div>
                                        <div className="p-3 rounded-md bg-muted/50 border border-border">
                                            <p className={`text-xs ${subTextClass}`}>Perimeter</p>
                                            <p className={`font-medium text-lg ${textClass}`}>
                                                {selectedBoundary.perimeter_meters?.toFixed(2)} <span className="text-xs">m</span>
                                            </p>
                                        </div>
                                    </div>
                                    {selectedBoundary.notes && (
                                        <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                                            {selectedBoundary.notes}
                                        </div>
                                    )}
                                </div>

                                {/* Farm Image Section */}
                                <div>
                                    <h4 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Farm Image
                                    </h4>
                                    <div className="space-y-3">
                                        {selectedBoundary.farm_image_url ? (
                                            <div className="relative group">
                                                <img
                                                    src={selectedBoundary.farm_image_url}
                                                    alt="Farm"
                                                    className="w-full h-40 object-cover rounded-md border border-border"
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Remove this image?')) handleRemoveImage();
                                                    }}
                                                    className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-md"
                                                    title="Remove Image"
                                                >
                                                    <i className="fas fa-trash-alt text-xs"></i>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="h-40 bg-muted/30 border-2 border-dashed border-muted rounded-md flex flex-col items-center justify-center text-muted-foreground">
                                                <i className="fas fa-image text-3xl mb-2 opacity-50"></i>
                                                <span className="text-xs">No image uploaded</span>
                                            </div>
                                        )}

                                        <div className="relative">
                                            <input
                                                type="file"
                                                id="farm-image-upload"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={(e) => handleImageUpload(e.target.files[0])}
                                                disabled={uploadingImage}
                                            />
                                            <Button
                                                variant="outline"
                                                className="w-full"
                                                disabled={uploadingImage}
                                                onClick={() => document.getElementById('farm-image-upload').click()}
                                            >
                                                {uploadingImage ? (
                                                    <>
                                                        <i className="fas fa-spinner fa-spin mr-2"></i> Uploading...
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="fas fa-camera mr-2"></i> {selectedBoundary.farm_image_url ? 'Change Image' : 'Upload Image'}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Assignment Info */}
                                <div>
                                    <h4 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Assignment Status
                                    </h4>

                                    {selectedBoundary.hasParcel && selectedBoundary.parcelData ? (
                                        <div className="space-y-3">
                                            <div className="p-3 rounded-md border border-green-500/30 bg-green-500/10">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-xs font-bold text-green-600 uppercase">Attached Parcel</span>
                                                    {selectedBoundary.parcelData.registrants && (
                                                        <Badge className="bg-green-600">{selectedBoundary.parcelData.registrants.registry}</Badge>
                                                    )}
                                                </div>



                                                <p className={`text-sm font-medium ${textClass}`}>
                                                    {selectedBoundary.parcelData.farm_location}
                                                </p>
                                                {selectedBoundary.parcelData.registrants && (
                                                    <div className="mt-2 text-sm border-t border-green-500/20 pt-2">
                                                        <p className={textClass}>
                                                            {selectedBoundary.parcelData.registrants.first_name} {selectedBoundary.parcelData.registrants.surname}
                                                        </p>
                                                        <p className={`text-xs ${subTextClass}`}>
                                                            Ref: {selectedBoundary.parcelData.registrants.reference_no}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2 flex-col">
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        className="flex-1"
                                                        onClick={() => setShowAttachModal(true)}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            ✏️ Change Parcel
                                                        </span>
                                                    </Button>
                                                    <Button
                                                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                                        onClick={() => handleDetachParcel(selectedBoundary.id)}
                                                    >
                                                        <span className="flex items-center gap-1">
                                                            ❌ Detach
                                                        </span>
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="p-4 rounded-md border border-dashed border-blue-500/30 bg-blue-500/5 text-center">
                                                <p className={`text-sm ${subTextClass} mb-2`}>
                                                    No farm parcel is currently attached to this boundary.
                                                </p>
                                                <Button
                                                    className="w-full bg-primary hover:bg-primary/90"
                                                    onClick={() => setShowAttachModal(true)}
                                                >
                                                    <i className="fas fa-link mr-2"></i>
                                                    Attach Parcel
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Delete Section */}
                                <div className="pt-6 mt-6 border-t border-border">
                                    <h4 className="text-sm font-semibold uppercase tracking-wider mb-2 text-red-500">
                                        Danger Zone
                                    </h4>
                                    <p className={`text-xs mb-3 ${subTextClass}`}>
                                        Permanently delete this boundary shape from the database.
                                    </p>
                                    <Button
                                        variant="outline"
                                        className="w-full text-red-500 border-red-200 hover:bg-red-500/10 hover:text-red-700"
                                        onClick={() => handleDeleteBoundary(selectedBoundary.id)}
                                    >
                                        <i className="fas fa-trash-alt mr-2"></i>
                                        Delete Shape
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-50">
                                <i className="fas fa-draw-polygon text-6xl mb-4 text-muted-foreground"></i>
                                <p className="text-lg font-medium text-muted-foreground">No Boundary Selected</p>
                                <p className="text-sm text-muted-foreground max-w-[200px]">
                                    Click any polygon on the map to view its details or manage assignments.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Attach Farm Parcel Modal - kept outside the grid */}
            {
                showAttachModal && selectedBoundary && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <Card className={`${cardClass} max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col`}>
                            <CardHeader>
                                <CardTitle className={textClass}>
                                    Attach Farm Parcel to Boundary
                                </CardTitle>
                                <div className="space-y-1">
                                    <p className={subTextClass}>
                                        <strong>Boundary Area:</strong> {selectedBoundary.area_hectares?.toFixed(4)} hectares
                                    </p>
                                    <p className={subTextClass}>
                                        <strong>Perimeter:</strong> {selectedBoundary.perimeter_meters?.toFixed(2)} meters
                                    </p>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4 overflow-y-auto flex-1">
                                {/* Search */}
                                <div>
                                    <Input
                                        placeholder="Search by location or registrant name..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className={inputClass}
                                    />
                                </div>

                                {/* Farm Parcel List */}
                                <div className="space-y-2">
                                    {filteredParcels.length === 0 ? (
                                        <p className={`text-center ${subTextClass} py-8`}>
                                            {farmParcels.length === 0
                                                ? 'No unassigned farm parcels found. All parcels have boundaries assigned.'
                                                : 'No farm parcels match your search.'}
                                        </p>
                                    ) : (
                                        filteredParcels.map(parcel => {
                                            const isAssignedToCurrent = selectedBoundary?.farm_parcel_id === parcel.id;
                                            return (
                                                <div
                                                    key={parcel.id}
                                                    onClick={() => setSelectedParcel(parcel)}
                                                    className={`p-3 rounded-lg border cursor-pointer transition-colors relative ${selectedParcel?.id === parcel.id
                                                        ? 'border-blue-500 bg-blue-500/10'
                                                        : isAssignedToCurrent
                                                            ? 'border-green-500 bg-green-500/10'
                                                            : isDark
                                                                ? 'border-[#333333] hover:bg-[#252525]'
                                                                : 'border-border hover:bg-muted'
                                                        }`}
                                                >
                                                    {isAssignedToCurrent && (
                                                        <div className="absolute top-2 right-2">
                                                            <Badge className="bg-green-500 hover:bg-green-600 text-white">
                                                                Currently Assigned
                                                            </Badge>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <p className={`font-medium ${textClass}`}>
                                                                {parcel.farm_location}
                                                            </p>
                                                            {parcel.registrants && (
                                                                <>
                                                                    <p className={`text-sm ${subTextClass}`}>
                                                                        Owner: {parcel.registrants.first_name} {parcel.registrants.surname}
                                                                    </p>
                                                                    <p className={`text-sm ${subTextClass}`}>
                                                                        Ref: {parcel.registrants.reference_no}
                                                                    </p>
                                                                </>
                                                            )}
                                                            <p className={`text-sm ${subTextClass}`}>
                                                                Registered Area: {
                                                                    parcel.total_farm_area_ha
                                                                        ? `${parcel.total_farm_area_ha} ha`
                                                                        : (parcel.calculated_area_ha ? `${parseFloat(parcel.calculated_area_ha).toFixed(4)} ha` : 'Not specified')
                                                                }
                                                            </p>
                                                            {parcel.total_farm_area_ha && (
                                                                <p className={`text-xs ${subTextClass} mt-1`}>
                                                                    Difference from GIS: {Math.abs(parcel.total_farm_area_ha - selectedBoundary.area_hectares).toFixed(4)} ha
                                                                </p>
                                                            )}
                                                        </div>
                                                        {!isAssignedToCurrent && parcel.registrants && (
                                                            <Badge className={parcel.registrants.registry === 'farmer' ? 'bg-green-500' : 'bg-blue-500'}>
                                                                {parcel.registrants.registry}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </CardContent>

                            {/* Actions */}
                            <div className="p-4 border-t flex gap-2 justify-end">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setShowAttachModal(false);
                                        setSelectedParcel(null);
                                        setSearchTerm('');
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleAttachParcel}
                                    disabled={!selectedParcel || saving}
                                    className="bg-primary hover:bg-primary/90"
                                >
                                    {saving ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Attaching...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-link mr-2"></i>
                                            Attach & Update Area
                                        </>
                                    )}
                                </Button>
                            </div>
                        </Card>
                    </div>
                )
            }

            {/* QGIS Documentation Modal */}
            <QGISDocModal 
                isOpen={showDocModal} 
                onClose={() => setShowDocModal(false)} 
                type="polygon" 
            />

            {toast.show && (
                <ToastViewport position="top-center">
                    <Toast
                        variant={toast.variant}
                        title={toast.title}
                        description={toast.description}
                        onClose={() => setToast(prev => ({ ...prev, show: false }))}
                    />
                </ToastViewport>
            )}
        </div >
    );
};

export default SetFarmParcelInfoPage;
