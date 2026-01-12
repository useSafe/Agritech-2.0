import React, { useState } from 'react';
import { X } from 'lucide-react';

const QGISDocModal = ({ isOpen, onClose, type = 'pinmark' }) => {
  const [copied, setCopied] = useState(false);
  
  if (!isOpen) return null;

  const isPinmark = type === 'pinmark';

  const handleCopySQL = (sql) => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card text-card-foreground rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-primary/5">
          <div>
            <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
              <i className="fas fa-info-circle"></i>
              QGIS to Supabase Guide
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isPinmark ? 'Import Pinmarks from QGIS' : 'Import Farm Polygons from QGIS'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-2 hover:bg-muted rounded-md"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          
          {/* Introduction */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm font-semibold">
              📍 <strong>Quick Steps:</strong> Draw {isPinmark ? 'points' : 'polygons'} in QGIS → Import to staging table → Run SQL to push to live database
            </p>
          </div>

          {/* Step 1 */}
          <section>
            <h3 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
              <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">1</span>
              Open Database Manager
            </h3>
            <div className="ml-10 space-y-2">
              <p className="text-sm">In QGIS, navigate to:</p>
              <div className="bg-muted/30 rounded-lg p-3 font-mono text-sm">
                Database → DB Manager → PostGIS → Agritech GIS
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section>
            <h3 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
              <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">2</span>
              Import Layer
            </h3>
            <div className="ml-10 space-y-3">
              <p className="text-sm">Click the <strong>Import Layer</strong> button (icon on top bar)</p>
              
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-sm font-semibold mb-2">Fill in these settings:</p>
                <div className="space-y-1 text-sm font-mono">
                  {isPinmark ? (
                    <>
                      <p><strong>Input:</strong> PinmarkLayer</p>
                      <p><strong>Schema:</strong> public</p>
                      <p><strong>Table:</strong> _staging_gis_pinmarks</p>
                      <p><strong>✓</strong> Create spatial index</p>
                    </>
                  ) : (
                    <>
                      <p><strong>Input:</strong> PolygonLayer</p>
                      <p><strong>Schema:</strong> public</p>
                      <p><strong>Table:</strong> _staging_farm_boundaries</p>
                      <p><strong>✓</strong> Create spatial index</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section>
            <h3 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
              <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">3</span>
              Run SQL Command
            </h3>
            <div className="ml-10 space-y-3">
              <p className="text-sm">Open <strong>SQL Window</strong> inside DB Manager</p>
              <p className="text-sm">Copy and paste this SQL code, then click <strong>Execute</strong>:</p>
              
              <div className="bg-slate-900 text-slate-200 rounded-lg p-4 relative">
                <button
                  onClick={() => {
                    let sql;
                    if (isPinmark) {
                      sql = `/* Copy only the new pins */
INSERT INTO public.pinmark_locations (location, location_name)
SELECT ST_SetSRID(geom, 4326), location_n
FROM   public._staging_gis_pinmarks  s
WHERE  NOT EXISTS (
        SELECT 1
        FROM   public.pinmark_locations p
        WHERE  ST_Equals(p.location, ST_SetSRID(s.geom, 4326))
      );

/* Clean up staging table */
DROP TABLE IF EXISTS public._staging_gis_pinmarks;`;
                    } else {
                      sql = `/* Copy only the new farm polygons */
INSERT INTO public.farm_boundaries
        (farm_parcel_id, boundary, notes, created_by, created_at)
SELECT gen_random_uuid(),
       ST_SetSRID(geom, 4326),
       COALESCE(notes, ''),
       gen_random_uuid(),
       now()
FROM   public._staging_farm_boundaries s
WHERE  NOT EXISTS (
        SELECT 1
        FROM   public.farm_boundaries p
        WHERE  ST_Equals(p.boundary, ST_SetSRID(s.geom, 4326))
      );

/* Clean up staging table */
DROP TABLE IF EXISTS public._staging_farm_boundaries;`;
                    }
                    handleCopySQL(sql);
                  }}
                  className={`absolute top-2 right-2 px-3 py-1 rounded text-xs font-medium transition-all ${
                    copied 
                      ? 'bg-green-600 text-white' 
                      : 'bg-primary text-white hover:opacity-90'
                  }`}
                >
                  {copied ? (
                    <>
                      <i className="fas fa-check mr-1"></i>
                      Copied!
                    </>
                  ) : (
                    'Copy SQL'
                  )}
                </button>
                <pre className="text-xs overflow-x-auto pr-20">
{isPinmark ? (
<code>{`/* Copy only the new pins */
INSERT INTO public.pinmark_locations (location, location_name)
SELECT ST_SetSRID(geom, 4326), location_n
FROM   public._staging_gis_pinmarks  s
WHERE  NOT EXISTS (
        SELECT 1
        FROM   public.pinmark_locations p
        WHERE  ST_Equals(p.location, ST_SetSRID(s.geom, 4326))
      );

/* Clean up staging table */
DROP TABLE IF EXISTS public._staging_gis_pinmarks;`}</code>
) : (
<code>{`/* Copy only the new farm polygons */
INSERT INTO public.farm_boundaries
        (farm_parcel_id, boundary, notes, created_by, created_at)
SELECT gen_random_uuid(),
       ST_SetSRID(geom, 4326),
       COALESCE(notes, ''),
       gen_random_uuid(),
       now()
FROM   public._staging_farm_boundaries s
WHERE  NOT EXISTS (
        SELECT 1
        FROM   public.farm_boundaries p
        WHERE  ST_Equals(p.boundary, ST_SetSRID(s.geom, 4326))
      );

/* Clean up staging table */
DROP TABLE IF EXISTS public._staging_farm_boundaries;`}</code>
)}
                </pre>
              </div>
            </div>
          </section>

          {/* Success Message */}
          <section className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h3 className="text-md font-bold text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
              <i className="fas fa-check-circle"></i>
              Changes Appear Instantly
            </h3>
            <p className="text-sm mb-2">
              After running the SQL, the new {isPinmark ? 'pins' : 'farm boundaries'} will appear in the web app <strong>immediately</strong>—no need to rebuild or redeploy.
            </p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Open your Agritech website</li>
              <li>Go to the map page</li>
              <li>Refresh the page → new {isPinmark ? 'points' : 'polygons'} appear automatically</li>
            </ul>
          </section>

          {/* Important Notes */}
          <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <h3 className="text-md font-bold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-2">
              <i className="fas fa-exclamation-triangle"></i>
              Important Notes
            </h3>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>The staging table is temporary and will be deleted after the import</li>
              <li>Only <strong>new</strong> {isPinmark ? 'pins' : 'polygons'} are added (duplicates are automatically skipped)</li>
              <li>If changes don't appear, try refreshing your browser with <strong>Ctrl + Shift + R</strong></li>
            </ul>
          </section>

        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-border bg-muted/20">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary text-white rounded-md hover:opacity-90 transition-opacity font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default QGISDocModal;
