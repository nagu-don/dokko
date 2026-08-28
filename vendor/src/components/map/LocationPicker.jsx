import { useEffect, useRef, useState } from 'react';
import { Map, AttributionControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useUi } from '../../context/UiContext';
import './LocationPicker.css';

// OpenStreetMap standard raster tiles — free, no API key needed
const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
};

// Kathmandu, Nepal — default centre when GPS is unavailable
const KATHMANDU = { lat: 27.7172, lng: 85.324 };

// bounding box that limits search results to the Kathmandu valley
const KT_VIEWBOX = '85.00,27.90,85.60,27.40';

/*
 * Full-screen OpenFreeMap picker used to set the vendor "working at" spot.
 * The crosshair is fixed at the centre of the map — the user moves the map
 * underneath it and confirms. `initial` preselects a location (GPS or the
 * saved working point); without one the map centres on Kathmandu.
 */
const LocationPicker = ({ initial, title, onConfirm, onClose }) => {
  const { t, lang, theme, num } = useUi();

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [center, setCenter] = useState(
    initial ? { lat: initial.lat, lng: initial.lng } : KATHMANDU
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState('idle'); // idle | loading | done | error
  const [gpsNote, setGpsNote] = useState('');

  // create the map once
  useEffect(() => {
    const map = new Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [center.lng, center.lat],
      zoom: initial ? 16 : 12,
    });
    mapRef.current = map;

    map.addControl(new AttributionControl({ compact: true }));

    // try to preselect the device GPS when nothing was passed in
    if (!initial && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setCenter(coords);
          map.flyTo({ center: [coords.lng, coords.lat], zoom: 16 });
        },
        (err) => {
          setGpsNote(err.code === err.PERMISSION_DENIED ? t('gpsDenied') : t('gpsFailed'));
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    const onMove = () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    };
    map.on('move', onMove);

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 16,
        }),
      (err) =>
        setGpsNote(err.code === err.PERMISSION_DENIED ? t('gpsDenied') : t('gpsFailed')),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const search = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearchState('loading');
    try {
      const params = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '6',
        viewbox: KT_VIEWBOX,
        bounded: '1',
        'accept-language': lang === 'np' ? 'ne,en' : 'en',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      const data = await res.json();
      setResults(data);
      setSearchState('done');
    } catch {
      setSearchState('error');
    }
  };

  const pickResult = (r) => {
    mapRef.current?.flyTo({
      center: [Number(r.lon), Number(r.lat)],
      zoom: 16,
    });
    setResults([]);
    setQuery(r.display_name.split(',')[0]);
  };

  const confirm = () => {
    onConfirm({
      lat: Number(center.lat.toFixed(6)),
      lng: Number(center.lng.toFixed(6)),
    });
  };

  return (
    <div className='lp-overlay'>
      <div className='lp-dialog'>
        <div className='lp-head'>
          <div>
            <h3>{title}</h3>
            <p className='lp-hint'>{t('moveMapHint')}</p>
          </div>
          <button className='lp-close' onClick={onClose} aria-label={t('cancel')}>
            ×
          </button>
        </div>

        <form className='lp-search' onSubmit={search}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
          />
          <button type='submit' disabled={searchState === 'loading'}>
            <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
              <circle cx='11' cy='11' r='7' />
              <path d='m20 20-3.8-3.8' />
            </svg>
          </button>
        </form>

        {(results.length > 0 || searchState === 'done') && (
          <ul className='lp-results'>
            {searchState === 'done' && results.length === 0 && (
              <li className='lp-empty'>{t('noResults')}</li>
            )}
            {results.map((r) => (
              <li key={r.place_id} onClick={() => pickResult(r)}>
                {r.display_name}
              </li>
            ))}
          </ul>
        )}
        {searchState === 'error' && (
          <p className='lp-note'>{t('searchFailed')}</p>
        )}

        <div className={`lp-map-wrap ${theme === 'dark' ? 'lp-dark-map' : ''}`}>
          <div ref={containerRef} className='lp-map' />

          {/* fixed crosshair at the centre of the viewport */}
          <div className='lp-crosshair' aria-hidden='true'>
            <svg width='44' height='44' viewBox='0 0 44 44'>
              <circle cx='22' cy='22' r='7' className='ch-ring' />
              <line x1='22' y1='2' x2='22' y2='14' className='ch-line' />
              <line x1='22' y1='30' x2='22' y2='42' className='ch-line' />
              <line x1='2' y1='22' x2='14' y2='22' className='ch-line' />
              <line x1='30' y1='22' x2='42' y2='22' className='ch-line' />
            </svg>
          </div>

          {/* zoom + locate controls */}
          <div className='lp-controls'>
            <button onClick={() => mapRef.current?.zoomIn()} aria-label='Zoom in'>+</button>
            <button onClick={() => mapRef.current?.zoomOut()} aria-label='Zoom out'>−</button>
            <button onClick={locateMe} aria-label={t('locateMe')} title={t('locateMe')}>
              <svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
                <circle cx='12' cy='12' r='3.4' />
                <path d='M12 2v3M12 19v3M2 12h3M19 12h3' />
              </svg>
            </button>
          </div>

          <span className='lp-coords'>
            {num(center.lat.toFixed(5))}, {num(center.lng.toFixed(5))}
          </span>
        </div>

        {gpsNote && (
          <p className='lp-note lp-gps-note'>
            {gpsNote}
            <button type='button' onClick={() => setGpsNote('')}>×</button>
          </p>
        )}

        <div className='lp-footer'>
          <button className='lp-cancel' onClick={onClose}>{t('cancel')}</button>
          <button className='lp-confirm' onClick={confirm}>
            {t('confirmLocation')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
