import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from '../services/api';
import PinmarkMap from './PinmarkPage';
import FarmBoundaryMap from './FarmBoundaryMap';

const MapPage = () => {
  // === MAP STATES ===
  const [mapMode, setMapMode] = useState('purok'); // 'purok' (Pinmarks) | 'farm' (Polygons)
  const [selectedPinmark, setSelectedPinmark] = useState(null);
  const [selectedBoundary, setSelectedBoundary] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // === FILTER STATES ===
  const [filterType, setFilterType] = useState('All Pinmarks');
  const [filterFarmStatus, setFilterFarmStatus] = useState('All Farms');
  const [filterBarangay, setFilterBarangay] = useState('All');
  const [filterPurok, setFilterPurok] = useState('All');

  // Constants
  const PUROKS = ['1', '2', '3', '4', '5', '6A', '6B', '7', '8', '9A', '9B', '10', '11'];

  // Handlers
  const handlePinSelect = (pin) => {
    setSelectedPinmark(pin);
    setSelectedBoundary(null);
  };

  const handleBoundarySelect = (boundary) => {
    setSelectedBoundary(boundary);
    setSelectedPinmark(null);
  };

  const handleMapSwitch = (mode) => {
    setMapMode(mode);
    setSelectedPinmark(null);
    setSelectedBoundary(null);
  };

  const getAddress = (registrant) => {
    if (!registrant?.addresses?.length) return 'N/A';
    const addr = registrant.addresses[0];
    return {
      purok: addr.purok || '',
      barangay: addr.barangay || '',
      municipality_city: addr.municipality_city || '',
      province: addr.province || '',
      region: addr.region || ''
    };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[3fr,1fr] gap-6">
        {/* MAP CONTAINER */}
        <Card className="bg-card border-0 shadow-md h-[720px] map-container flex flex-col">
          <CardHeader className="py-3 border-b border-border shrink-0">

            <div className="flex flex-col xl:flex-row items-center gap-4 w-full">
              {/* 1. Search Bar (Left) */}
              <div className="relative w-full xl:w-72 shrink-0">
                <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-xs"></i>
                <input
                  type="text"
                  placeholder="Search locations or names..."
                  className="w-full pl-9 pr-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* 2. Filters (Middle - Inline) */}
              <div className="flex flex-1 flex-wrap items-center gap-2 justify-start xl:justify-center w-full">
                {/* Type Filter */}
                {mapMode === 'purok' ? (
                  <select
                    className="bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary flex-1 xl:flex-none min-w-[120px]"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option>All Pinmarks</option>
                    <option>All Registrants</option>
                    <option>Farmer</option>
                    <option>Fisherfolk</option>
                    <option>Unassigned Pin</option>
                  </select>
                ) : (
                  <select
                    className="bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary flex-1 xl:flex-none min-w-[120px]"
                    value={filterFarmStatus}
                    onChange={(e) => setFilterFarmStatus(e.target.value)}
                  >
                    <option>All Farms</option>
                    <option>Assigned Farm</option>
                    <option>Unassigned Farm</option>
                  </select>
                )}

                {/* Barangay Filter */}
                <select
                  className="bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary flex-1 xl:flex-none min-w-[140px]"
                  value={filterBarangay}
                  onChange={(e) => setFilterBarangay(e.target.value)}
                >
                  <option value="All">All Barangays</option>
                  <option value="Upper Jasaan">Upper Jasaan (5-10)</option>
                  <option value="Lower Jasaan">Lower Jasaan (1-4, 11)</option>
                </select>

                {/* Purok Filter */}
                <select
                  className="bg-background border border-border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary flex-1 xl:flex-none min-w-[100px]"
                  value={filterPurok}
                  onChange={(e) => setFilterPurok(e.target.value)}
                >
                  <option value="All">All Puroks</option>
                  {PUROKS.map(p => (
                    <option key={p} value={p}>Purok {p}</option>
                  ))}
                </select>
              </div>

              {/* 3. Mode Toggles (Right) */}
              <div className="flex bg-muted/50 p-1 rounded-lg border border-border shrink-0 w-full xl:w-auto overflow-hidden">
                <button
                  onClick={() => handleMapSwitch('purok')}
                  className={`flex-1 xl:flex-none px-4 py-2 text-sm font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${mapMode === 'purok'
                    ? 'bg-red-500 text-white shadow-lg'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                >
                  <i className="fas fa-map-marker-alt"></i>
                  Pinmarks
                </button>
                <button
                  onClick={() => handleMapSwitch('farm')}
                  className={`flex-1 xl:flex-none px-4 py-2 text-sm font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${mapMode === 'farm'
                    ? 'bg-green-500 text-white shadow-lg'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                >
                  <i className="fas fa-draw-polygon"></i>
                  Polygons
                </button>
              </div>
            </div>

          </CardHeader>
          <CardContent className="flex-1 p-0 relative overflow-hidden">
            {mapMode === 'purok' ? (
              <PinmarkMap
                onMarkerClick={handlePinSelect}
                selectedFarmerId={selectedPinmark?.id}
                searchTerm={searchTerm}
                filterType={filterType}
                filterBarangay={filterBarangay}
                filterPurok={filterPurok}
              />
            ) : (
              <FarmBoundaryMap
                onBoundaryClick={handleBoundarySelect}
                selectedBoundaryId={selectedBoundary?.id}
                searchTerm={searchTerm}
                filterStatus={filterFarmStatus}
                filterBarangay={filterBarangay}
                filterPurok={filterPurok}
              />
            )}
          </CardContent>
        </Card>

        {/* DETAILS SIDEBAR - RESTORED FULL VIEW */}
        <Card className="bg-card border-0 shadow-md h-[720px] flex flex-col">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-lg text-foreground">
              {(() => {
                if (selectedPinmark) {
                  const reg = selectedPinmark.fullData?.registrants;
                  return reg ? `${reg.first_name} ${reg.surname}` : 'Unassigned Pin';
                }
                if (selectedBoundary) {
                  return selectedBoundary.farm_parcels?.farm_location || 'Farm Boundary';
                }
                return 'Details';
              })()}
            </CardTitle>
            <CardDescription className="line-clamp-1">
              {(() => {
                if (selectedPinmark) {
                  const reg = selectedPinmark.fullData?.registrants;
                  return reg ? `Ref: ${reg.reference_no}` : 'No registrant data linked';
                }
                if (selectedBoundary) {
                  const reg = selectedBoundary.farm_parcels?.registrants;
                  return reg ? `Owner: ${reg.first_name} ${reg.surname}` : 'No owner assigned';
                }
                return 'Select an item to view details';
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 custom-scrollbar">

            {/* === PINMARK DETAILS (Restored) === */}
            {mapMode === 'purok' && selectedPinmark && (
              <div className="space-y-6">
                {selectedPinmark.fullData?.registrants ? (
                  <>
                    {/* 1. Personal Info */}
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2 border-b border-border pb-1">
                        <i className="fas fa-user"></i> Personal Info
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Reference No:</span>
                          <span className="font-mono">{selectedPinmark.fullData.registrants.reference_no}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Registry Type:</span>
                          <Badge variant="outline" className={selectedPinmark.fullData.registrants.registry === 'farmer' ? 'text-green-600 border-green-600' : 'text-blue-600 border-blue-600'}>
                            {selectedPinmark.fullData.registrants.registry?.toUpperCase() || 'N/A'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Civil Status:</span>
                          <span>{selectedPinmark.fullData.registrants.civil_status || 'N/A'}</span>
                        </div>
                        {selectedPinmark.fullData.registrants.civil_status === 'Married' && (
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Spouse:</span>
                            <span>{selectedPinmark.fullData.registrants.spouse_name || 'N/A'}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Sex:</span>
                          <span>{selectedPinmark.fullData.registrants.sex || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Birth Date:</span>
                          <span>{selectedPinmark.fullData.registrants.date_of_birth || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Place of Birth:</span>
                          <span>{selectedPinmark.fullData.registrants.place_of_birth || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Mother's Name:</span>
                          <span>{selectedPinmark.fullData.registrants.mother_full_name || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* 2. Contact Info */}
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2 border-b border-border pb-1">
                        <i className="fas fa-address-book"></i> Contact Info
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Mobile:</span>
                          <span>{selectedPinmark.fullData.registrants.mobile_number || 'N/A'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Emergency:</span>
                          <span>{selectedPinmark.fullData.registrants.emergency_contact_name || 'N/A'}</span>
                        </div>
                        <div className="col-span-2 pt-2">
                          <span className="text-muted-foreground text-xs block mb-1">Address:</span>
                          <div className="pl-2 border-l-2 border-border text-xs">
                            {(() => {
                              const addr = getAddress(selectedPinmark.fullData.registrants);
                              return <div>{addr.purok}, {addr.barangay}, {addr.municipality_city}, {addr.province}</div>;
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 3. Household */}
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2 border-b border-border pb-1">
                        <i className="fas fa-home"></i> Household
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Household Head:</span>
                          <span>{selectedPinmark.fullData.registrants.is_household_head ? 'Yes' : 'No'}</span>
                        </div>
                        {!selectedPinmark.fullData.registrants.is_household_head && (
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Head Name:</span>
                            <span>{selectedPinmark.fullData.registrants.household_head_name || 'N/A'}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-muted-foreground text-xs">Members:</span>
                          <span>{selectedPinmark.fullData.registrants.household_members_count || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* 4. IDs & Benefits */}
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2 border-b border-border pb-1">
                        <i className="fas fa-id-card"></i> IDs & Benefits
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex gap-2 flex-wrap">
                          {selectedPinmark.fullData.registrants.is_pwd && <Badge variant="secondary">PWD</Badge>}
                          {selectedPinmark.fullData.registrants.is_4ps && <Badge variant="secondary">4Ps</Badge>}
                          {selectedPinmark.fullData.registrants.is_indigenous && <Badge variant="secondary">IP</Badge>}
                        </div>
                      </div>
                    </div>

                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>This location pin has no assigned registrant data.</p>
                    <Badge variant="destructive" className="mt-2">Unassigned</Badge>
                  </div>
                )}
              </div>
            )}

            {/* === FARM BOUNDARY DETAILS (Restored Full) === */}
            {mapMode === 'farm' && selectedBoundary && (
              <div className="space-y-6">

                {/* Farm Image */}
                {selectedBoundary.farm_image_url ? (
                  <div className="mb-4">
                    <img
                      src={selectedBoundary.farm_image_url}
                      alt="Farm"
                      className="w-full h-48 object-cover rounded-lg border border-border shadow-sm"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                ) : null}

                {/* Owner Info */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2 border-b border-border pb-1">
                    <i className="fas fa-user-tag"></i> Owner Info
                  </h4>
                  {selectedBoundary.farm_parcels?.registrants ? (
                    <div className="space-y-2 text-sm">
                      <div className="font-medium text-lg">
                        {selectedBoundary.farm_parcels.registrants.first_name} {selectedBoundary.farm_parcels.registrants.surname}
                      </div>
                      <div className="text-muted-foreground text-xs font-mono mb-2">
                        Ref: {selectedBoundary.farm_parcels.registrants.reference_no}
                      </div>
                      <div className="grid grid-cols-2 gap-1 border-t border-border pt-2 mt-2">
                        <span className="text-muted-foreground text-xs">Mobile:</span>
                        <span>{selectedBoundary.farm_parcels.registrants.mobile_number || 'N/A'}</span>
                      </div>
                    </div>
                  ) : (
                    <Badge variant="secondary">Unassigned Boundary</Badge>
                  )}
                </div>

                {/* Farm Data */}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2 border-b border-border pb-1">
                    <i className="fas fa-tractor"></i> Farm Data
                  </h4>
                  <div className="space-y-3 text-sm">
                    {selectedBoundary.farm_parcels ? (
                      <div className="space-y-4">

                        {/* Main Details (Restored Full) */}
                        <div className="grid grid-cols-1 gap-2 bg-muted/20 p-2 rounded">
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Farmers in Rotation:</span>
                            <span>{selectedBoundary.farm_parcels.farmers_in_rotation || 'N/A'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Farm Location:</span>
                            <span className="truncate" title={selectedBoundary.farm_parcels.farm_location}>{selectedBoundary.farm_parcels.farm_location || 'N/A'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">GIS Area:</span>
                            <span className="font-semibold">{selectedBoundary.area_hectares?.toFixed(4)} ha</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Perimeter:</span>
                            <span>{selectedBoundary.perimeter_meters?.toFixed(2)} m</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Registered Area:</span>
                            <span>{selectedBoundary.farm_parcels.total_farm_area_ha} ha</span>
                          </div>

                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Ownership Type:</span>
                            <span>{selectedBoundary.farm_parcels.ownership || 'N/A'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Ownership Doc:</span>
                            <span>{selectedBoundary.farm_parcels.ownership_document || 'N/A'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Doc Number:</span>
                            <span className="break-all font-mono text-xs">{selectedBoundary.farm_parcels.ownership_document_no || selectedBoundary.farm_parcels.document_number || 'N/A'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">Ancestral Domain:</span>
                            <span>{selectedBoundary.farm_parcels.within_ancestral_domain ? 'Yes' : 'No'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <span className="text-muted-foreground text-xs">ARB:</span>
                            <span>{selectedBoundary.farm_parcels.agrarian_reform_beneficiary ? 'Yes' : 'No'}</span>
                          </div>
                        </div>

                        {/* Simplified Parcel Infos Display (Kept as improved visual) */}
                        {selectedBoundary.farm_parcels.parcel_infos?.length > 0 ? (
                          <div className="pt-2">
                            <h5 className="text-xs font-bold text-muted-foreground uppercase mb-2">Production / Activities</h5>
                            <div className="space-y-2 bg-background rounded border border-border p-3 shadow-sm">
                              {selectedBoundary.farm_parcels.parcel_infos.map((info, pIdx) => (
                                <div key={pIdx} className="flex items-center justify-between text-xs border-b border-border pb-2 last:border-0 last:pb-0 mb-2 last:mb-0">

                                  {/* Left: Name and Type */}
                                  <div className="flex items-center gap-3">
                                    {/* Icon based on commodity */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${(info.crop_commodity === 'Crops' || info.commodity === 'Crops') ? 'bg-green-100 text-green-600' :
                                        (info.crop_commodity === 'Livestock' || info.commodity === 'Livestock') ? 'bg-orange-100 text-orange-600' :
                                          'bg-blue-100 text-blue-600'
                                      }`}>
                                      <i className={`fas ${(info.crop_commodity === 'Crops' || info.commodity === 'Crops') ? 'fa-seedling' :
                                          (info.crop_commodity === 'Livestock' || info.commodity === 'Livestock') ? 'fa-piggy-bank' :
                                            'fa-egg'
                                        }`}></i>
                                    </div>
                                    <div>
                                      <div className="font-semibold text-foreground">
                                        {info.crop_name || info.animal_name || 'Unknown'}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {info.crop_commodity || info.commodity || info.commodity_type}
                                        {info.corn_type && ` (${info.corn_type})`}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right: Quantity */}
                                  <div className="text-right">
                                    {(info.size_ha || info.size) && (
                                      <div className="font-bold">{info.size_ha || info.size} ha</div>
                                    )}
                                    {(info.head_count || info.heads) && (
                                      <div className="font-bold">{info.head_count || info.heads} heads</div>
                                    )}
                                    {info.organic === 'Yes' && (
                                      <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 text-green-600 border-green-200">Organic</Badge>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs italic text-muted-foreground text-center">No production data recorded</div>
                        )}
                      </div>
                    ) : (
                      <Badge variant="secondary">Unassigned Boundary</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* No Selection State */}
            {!selectedPinmark && !selectedBoundary && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground opacity-50 p-6">
                <i className={`fas ${mapMode === 'purok' ? 'fa-map-marker-alt' : 'fa-draw-polygon'} text-4xl mb-4`}></i>
                <p>Select a {mapMode === 'purok' ? 'location pin' : 'farm boundary'} on the map to view details.</p>
              </div>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MapPage;