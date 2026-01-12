import React, { useState, useEffect, useContext } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, AttributionControl } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toast, ToastViewport } from "@/components/ui/toast";
import ClientOnly from './ClientOnly';
import { supabase } from '../services/api';
import { ThemeContext } from '../App';
import QGISDocModal from './QGISDocModal';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom blue icon for pinmarks
const bluePinIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Custom green icon for pinmarks with attached data
const greenPinIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

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

const SetPinmarkInfoPage = () => {
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

    const [pinmarks, setPinmarks] = useState([]);
    const [registrants, setRegistrants] = useState([]);
    const [selectedPinmark, setSelectedPinmark] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAttachModal, setShowAttachModal] = useState(false);
    const [selectedRegistrant, setSelectedRegistrant] = useState(null);
    const [mapCenter, setMapCenter] = useState([8.5, 124.8]); // Mindanao default
    const [mapZoom, setMapZoom] = useState(10);
    const [showDocModal, setShowDocModal] = useState(false);

    // Toast State
    const [toast, setToast] = useState({ show: false, variant: 'neutral', title: '', description: '' });

    const showToast = (variant, title, description) => {
        setToast({ show: true, variant, title, description });
    };

    // Fetch pinmarks from database
    const fetchPinmarks = async () => {
        try {
            setLoading(true);

            // Fetch data directly without pre-check
            const { data, error } = await supabase
                .from('pinmark_locations')
                .select(`
          id,
          registrant_id,
          location,
          location_name,
          notes,
          created_at
        `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching pinmark_locations:', error);
                throw error;
            }

            // Now fetch the related registrants separately for each pinmark
            const pinmarksWithDetails = await Promise.all(
                data.map(async (pinmark) => {
                    let registrantData = null;

                    if (pinmark.registrant_id) {
                        // Fetch the related registrant
                        const { data: registrant, error: regError } = await supabase
                            .from('registrants')
                            .select('id, reference_no, first_name, surname, registry')
                            .eq('id', pinmark.registrant_id)
                            .single();

                        if (!regError && registrant) {
                            registrantData = registrant;
                        }
                    }

                    return {
                        ...pinmark,
                        registrants: registrantData
                    };
                })
            );

            // Convert PostGIS geometry to lat/lng
            const formattedPinmarks = pinmarksWithDetails.map(pinmark => {
                let lat = null;
                let lng = null;

                try {
                    if (pinmark.location) {
                        let geom = pinmark.location;

                        // Handle both Point and MultiPoint
                        if (geom.type === 'Point') {
                            lng = parseFloat(geom.coordinates[0]);
                            lat = parseFloat(geom.coordinates[1]);
                        } else if (geom.type === 'MultiPoint') {
                            // For MultiPoint, take the first point
                            lng = parseFloat(geom.coordinates[0][0]);
                            lat = parseFloat(geom.coordinates[0][1]);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing pinmark geometry:', e, pinmark.location);
                }

                return {
                    ...pinmark,
                    lat,
                    lng,
                    hasRegistrant: !!pinmark.registrant_id
                };
            });

            setPinmarks(formattedPinmarks);

            // Set map center to first pinmark if available
            if (formattedPinmarks.length > 0 && formattedPinmarks[0].lat) {
                setMapCenter([formattedPinmarks[0].lat, formattedPinmarks[0].lng]);
                setMapZoom(12);
            }
        } catch (error) {
            console.error('Error fetching pinmarks:', error);
            showToast('error', 'Error', error.message || 'Failed to load pinmarks. Please check console for details.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch registrants without locations
    const fetchRegistrants = async () => {
        try {
            const { data, error } = await supabase
                .from('registrants')
                .select('id, reference_no, first_name, surname, middle_name, registry, mobile_number')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRegistrants(data);
        } catch (error) {
            console.error('Error fetching registrants:', error);
        }
    };

    useEffect(() => {
        fetchPinmarks();
        fetchRegistrants();
    }, []);

    const handlePinmarkClick = (pinmark) => {
        setSelectedPinmark(pinmark);
    };

    const handleAttachRegistrant = async () => {
        if (!selectedRegistrant || !selectedPinmark) return;

        try {
            setSaving(true);

            // Update pinmark with registrant_id
            const { error } = await supabase
                .from('pinmark_locations')
                .update({
                    registrant_id: selectedRegistrant.id
                })
                .eq('id', selectedPinmark.id);

            if (error) throw error;

            // Also update registrant's location_point for backward compatibility
            const { error: regError } = await supabase
                .from('registrants')
                .update({
                    location_point: selectedPinmark.location
                })
                .eq('id', selectedRegistrant.id);

            if (regError) console.warn('Could not update registrant location_point:', regError);

            showToast('success', 'Success', 'Successfully attached registrant to pinmark!');
            setShowAttachModal(false);
            setSelectedPinmark(null);
            setSelectedRegistrant(null);
            fetchPinmarks(); // Refresh
        } catch (error) {
            console.error('Error attaching registrant:', error);
            showToast('error', 'Error', 'Failed to attach registrant: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDetachRegistrant = async (pinmarkId) => {
        if (!confirm('Are you sure you want to detach this registrant from the pinmark?')) return;

        try {
            setSaving(true);
            const { error } = await supabase
                .from('pinmark_locations')
                .update({
                    registrant_id: null
                })
                .eq('id', pinmarkId);

            if (error) throw error;

            showToast('success', 'Success', 'Successfully detached registrant from pinmark');
            fetchPinmarks();
        } catch (error) {
            console.error('Error detaching registrant:', error);
            showToast('error', 'Error', 'Failed to detach: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeletePinmark = async (pinmarkId) => {
        if (!confirm('Are you sure you want to PERMANENTLY delete this pinmark? This action cannot be undone.')) return;

        try {
            setSaving(true);

            // Delete the pinmark
            // Constraints should set registrant_id to null or just delete the row.
            // If there's a registrant attached, we might surely need to clean it up if it has a `location_point` referencing this.

            // First get the pinmark to check for registrant
            const { data: pinmark, error: fetchError } = await supabase
                .from('pinmark_locations')
                .select('location')
                .eq('id', pinmarkId)
                .single();

            // We should clear the `location_point` on the registrant if it matches this pinmark's location
            // But checking geometry equality is hard.
            // Easier way: The registrant has `location_point`.
            // Wait, logic in `handleAttachRegistrant` sets `location_point`.
            // If we delete the pinmark, the `location_point` on registrant remains, which acts as "last known location".
            // That might be desired or not.
            // Given the user wants to "erase specific pinmark", we should just delete the pinmark.

            const { error: deleteError } = await supabase
                .from('pinmark_locations')
                .delete()
                .eq('id', pinmarkId);

            if (deleteError) throw deleteError;

            showToast('success', 'Success', 'Successfully deleted pinmark');
            setSelectedPinmark(null); // Close popup
            fetchPinmarks();
        } catch (error) {
            console.error('Error deleting pinmark:', error);
            showToast('error', 'Error', 'Failed to delete pinmark: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    // Filter registrants by search AND availability
    const filteredRegistrants = registrants.filter(registrant => {
        const searchLower = searchTerm.toLowerCase();

        // Check if registrant matches search
        const matchesSearch = (
            registrant.reference_no?.toLowerCase().includes(searchLower) ||
            registrant.first_name?.toLowerCase().includes(searchLower) ||
            registrant.surname?.toLowerCase().includes(searchLower)
        );

        if (!matchesSearch) return false;

        // Check if registrant is arguably "available"
        // A registrant is available if:
        // 1. They are not assigned to ANY pinmark
        // 2. OR they are assigned to the CURRENTLY selected pinmark (re-selecting same person is fine)
        const isAssignedToOther = pinmarks.some(p =>
            p.registrant_id === registrant.id && p.id !== selectedPinmark?.id
        );

        return !isAssignedToOther;
    });

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center h-screen">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-4xl text-primary mb-4"></i>
                    <p className={subTextClass}>Loading pinmarks...</p>
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
                                <i className="fas fa-map-marker-alt mr-2"></i>
                                Set Pinmark Info
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
                            <Button onClick={fetchPinmarks} variant="outline" size="sm" className="h-8">
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

                                    {pinmarks.map(pinmark => (
                                        pinmark.lat && pinmark.lng && (
                                            <Marker
                                                key={pinmark.id}
                                                position={[pinmark.lat, pinmark.lng]}
                                                // Strict check: Only show Green if we have the registrant data loaded
                                                icon={pinmark.hasRegistrant && pinmark.registrants ? greenPinIcon : bluePinIcon}
                                                eventHandlers={{
                                                    click: () => handlePinmarkClick(pinmark)
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
                                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                            <span className={`text-xs ${textClass}`}>Unassigned Pin</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                            <span className={`text-xs ${textClass}`}>Assigned Pin</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ClientOnly>
                    </CardContent>
                </Card>

                {/* Right Column: Info Panel */}
                <Card className={`bg-card border-0 shadow-md flex flex-col`}>
                    <CardHeader className="border-b border-border pb-3">
                        <CardTitle className={`text-lg ${textClass}`}>
                            {selectedPinmark ? 'Pinmark Details' : 'Select Pinmark'}
                        </CardTitle>
                        <p className={`text-xs ${subTextClass}`}>
                            {selectedPinmark
                                ? 'Review and manage pinmark assignment'
                                : 'Click a marker on the map to view details'}
                        </p>
                    </CardHeader>
                    <CardContent className="flex-1 p-4 overflow-y-auto">
                        {selectedPinmark ? (
                            <div className="space-y-6">
                                {/* Location Info */}
                                <div>
                                    <h4 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Location
                                    </h4>
                                    <div className="p-3 rounded-md bg-muted/50 border border-border">
                                        <p className={`font-medium text-lg ${textClass}`}>
                                            {selectedPinmark.location_name || 'Unnamed Location'}
                                        </p>
                                        <p className={`text-xs font-mono mt-1 ${subTextClass}`}>
                                            ID: {selectedPinmark.id.substring(0, 8)}...
                                        </p>
                                        <p className={`text-xs mt-1 ${subTextClass}`}>
                                            Coords: {selectedPinmark.lat?.toFixed(6)}, {selectedPinmark.lng?.toFixed(6)}
                                        </p>
                                    </div>
                                </div>

                                {/* Assignment Info */}
                                <div>
                                    <h4 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        Assignment Status
                                    </h4>

                                    {selectedPinmark.hasRegistrant && selectedPinmark.registrants ? (
                                        <div className="space-y-3">
                                            <div className="p-3 rounded-md border border-green-500/30 bg-green-500/10">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-xs font-bold text-green-600 uppercase">Attached Registrant</span>
                                                    <Badge className="bg-green-600">{selectedPinmark.registrants.registry}</Badge>
                                                </div>
                                                <p className={`text-base font-semibold ${textClass}`}>
                                                    {selectedPinmark.registrants.first_name} {selectedPinmark.registrants.surname}
                                                </p>
                                                <p className={`text-sm ${subTextClass}`}>
                                                    Ref: {selectedPinmark.registrants.reference_no}
                                                </p>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    className="flex-1"
                                                    onClick={() => setShowAttachModal(true)}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        ✏️ Change
                                                    </span>
                                                </Button>
                                                <Button
                                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                                    onClick={() => handleDetachRegistrant(selectedPinmark.id)}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        ❌ Detach
                                                    </span>
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="p-4 rounded-md border border-dashed border-blue-500/30 bg-blue-500/5 text-center">
                                                <p className={`text-sm ${subTextClass} mb-2`}>
                                                    No registrant is currently attached to this pin.
                                                </p>
                                                <Button
                                                    className="w-full bg-primary hover:bg-primary/90"
                                                    onClick={() => setShowAttachModal(true)}
                                                >
                                                    <i className="fas fa-link mr-2"></i>
                                                    Attach Registrant
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
                                        Permanently delete this pinmark from the database.
                                    </p>
                                    <Button
                                        variant="outline"
                                        className="w-full text-red-500 border-red-200 hover:bg-red-500/10 hover:text-red-700"
                                        onClick={() => handleDeletePinmark(selectedPinmark.id)}
                                    >
                                        <i className="fas fa-trash-alt mr-2"></i>
                                        Delete Pinmark
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-50">
                                <i className="fas fa-map-marked-alt text-6xl mb-4 text-muted-foreground"></i>
                                <p className="text-lg font-medium text-muted-foreground">No Pin Selected</p>
                                <p className="text-sm text-muted-foreground max-w-[200px]">
                                    Click any marker on the map to view its details or manage assignments.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Attach Registrant Modal - kept outside the grid */}
            {showAttachModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className={`${cardClass} max-w-2xl w-full mx-4`}>
                        <CardHeader>
                            <CardTitle className={textClass}>
                                Attach Registrant to Pinmark
                            </CardTitle>
                            <p className={subTextClass}>
                                {selectedPinmark?.location_name || 'Unnamed Location'}
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Search */}
                            <div>
                                <Input
                                    placeholder="Search by name or reference number..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={inputClass}
                                />
                            </div>

                            {/* Registrant List */}
                            <div className="max-h-96 overflow-y-auto space-y-2">
                                {filteredRegistrants.length === 0 ? (
                                    <p className={`text-center ${subTextClass} py-8`}>
                                        No registrants found
                                    </p>
                                ) : (
                                    filteredRegistrants.map(registrant => (
                                        <div
                                            key={registrant.id}
                                            onClick={() => setSelectedRegistrant(registrant)}
                                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedRegistrant?.id === registrant.id
                                                ? 'border-blue-500 bg-blue-500/10'
                                                : isDark
                                                    ? 'border-[#333333] hover:bg-[#252525]'
                                                    : 'border-border hover:bg-muted'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className={`font-medium ${textClass}`}>
                                                        {registrant.first_name} {registrant.middle_name} {registrant.surname}
                                                    </p>
                                                    <p className={`text-sm ${subTextClass}`}>
                                                        {registrant.reference_no}
                                                    </p>
                                                    <p className={`text-sm ${subTextClass}`}>
                                                        {registrant.mobile_number || 'No phone'}
                                                    </p>
                                                </div>
                                                <Badge className={registrant.registry === 'farmer' ? 'bg-green-500' : 'bg-blue-500'}>
                                                    {registrant.registry}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 justify-end">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setShowAttachModal(false);
                                        setSelectedRegistrant(null);
                                        setSearchTerm('');
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleAttachRegistrant}
                                    disabled={!selectedRegistrant || saving}
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
                                            Attach
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* QGIS Documentation Modal */}
            <QGISDocModal 
                isOpen={showDocModal} 
                onClose={() => setShowDocModal(false)} 
                type="pinmark" 
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
        </div>
    );
};

export default SetPinmarkInfoPage;
