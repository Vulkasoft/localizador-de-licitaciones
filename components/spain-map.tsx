'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { CCAA_DATA, getScoreColor } from '@/lib/spain-geo';

interface MapMarker {
  id: string;
  title: string;
  score: number;
  regionCcaa: string | null;
  latitude: number | null;
  longitude: number | null;
  budgetAmount: number | null;
  classification: string | null;
}

interface MapRegion {
  ccaa: string;
  count: number;
  budget: number;
  avgScore: number;
}

export default function SpainMap({ markers, regions }: { markers: MapMarker[]; regions: MapRegion[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [viewMode, setViewMode] = useState<'markers' | 'heatmap'>('markers');

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap',
          },
        },
        layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm-tiles' }],
      },
      center: [-3.7, 39.5],
      zoom: 5.3,
      maxZoom: 12,
      minZoom: 3,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Remove old markers
    const existingMarkers = document.querySelectorAll('.tender-marker, .region-marker');
    existingMarkers.forEach((el: any) => el?.remove?.());

    if (viewMode === 'markers') {
      (markers ?? []).forEach((m: MapMarker) => {
        if (!m?.latitude || !m?.longitude) return;
        const el = document.createElement('div');
        el.className = 'tender-marker';
        el.style.cssText = `width:28px;height:28px;border-radius:50%;border:3px solid white;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);background:${getScoreColor(m?.score ?? 0)};display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:bold;`;
        el.textContent = String(m?.score ?? 0);

        const popup = new maplibregl.Popup({ offset: 15, maxWidth: '280px' })
          .setHTML(`<div style="font-family:system-ui;padding:4px;"><strong style="font-size:13px;line-height:1.3;display:block;margin-bottom:6px;">${m?.title ?? ''}</strong><div style="display:flex;gap:8px;font-size:11px;color:#666;"><span>⭐ ${m?.score ?? 0}/100</span><span>${(m?.budgetAmount ?? 0).toLocaleString('es-ES')}€</span></div><a href="/tenders/${m?.id}" style="display:inline-block;margin-top:8px;font-size:11px;color:#0ea5e9;">Ver detalle →</a></div>`);

        new maplibregl.Marker({ element: el })
          .setLngLat([m.longitude, m.latitude])
          .setPopup(popup)
          .addTo(map.current!);
      });
    } else {
      // Heatmap mode - region bubbles
      const maxCount = Math.max(...(regions ?? []).map((r: MapRegion) => r?.count ?? 0), 1);
      (regions ?? []).forEach((r: MapRegion) => {
        const ccaaInfo = CCAA_DATA[r?.ccaa ?? ''];
        if (!ccaaInfo) return;
        const size = 30 + ((r?.count ?? 0) / maxCount) * 50;
        const opacity = 0.3 + ((r?.count ?? 0) / maxCount) * 0.5;

        const el = document.createElement('div');
        el.className = 'region-marker';
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:rgba(14,165,233,${opacity});border:2px solid rgba(14,165,233,0.8);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:bold;box-shadow:0 2px 12px rgba(14,165,233,0.3);`;
        el.textContent = String(r?.count ?? 0);

        const popup = new maplibregl.Popup({ offset: 15 })
          .setHTML(`<div style="font-family:system-ui;padding:4px;"><strong>${r?.ccaa ?? ''}</strong><br/><span style="font-size:12px;color:#666;">${r?.count ?? 0} licitaciones · ${((r?.budget ?? 0) / 1000).toFixed(0)}K€ · Puntuación media: ${r?.avgScore ?? 0}</span></div>`);

        new maplibregl.Marker({ element: el })
          .setLngLat([ccaaInfo.lng, ccaaInfo.lat])
          .setPopup(popup)
          .addTo(map.current!);
      });
    }
  }, [markers, regions, viewMode]);

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setViewMode('markers')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'markers' ? 'bg-sky-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Marcadores</button>
        <button onClick={() => setViewMode('heatmap')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'heatmap' ? 'bg-sky-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>Mapa de Calor</button>
      </div>
      <div ref={mapContainer} className="w-full h-[500px] rounded-xl overflow-hidden" />
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Alta puntuación (≥70)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" /> Media (40-69)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> Baja (&lt;40)</span>
      </div>
    </div>
  );
}
