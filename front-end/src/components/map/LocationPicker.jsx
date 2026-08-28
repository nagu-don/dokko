import { useEffect, useRef, useState } from 'react';
import { useContext } from 'react';
import { Map, AttributionControl, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Context } from '../../context/Context';
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

const SAVED_KEY = 'dokkoSavedPlaces';

const loadSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
  } catch {
    return [];
  }
};

/*
 * Full-screen OpenFreeMap picker.
 * The crosshair is fixed at the centre of the map — the user moves the map
 * underneath it and confirms. `initial` preselects a location (GPS or the
 * preferred drop-off); without one the map centres on Kathmandu.
 */
const LocationPicker = ({ initial, title, onConfirm, onClose }) => {
  const { t, lang, theme } = useContext(Context);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // one labeled pin per saved place, kept in sync with the `saved` list
  const pinsRef = useRef({});
  const [center, setCenter] = useState(
    initial ? { lat: initial.lat, lng: initial.lng } : KATHMANDU
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState('idle'); // idle | loading | done | error
  const [saved, setSaved] = useState(loadSaved);
  const [placeName, setPlaceName] = useState('');
  // the saved place currently selected — its exact coords win on confirm
  const [selectedPlace, setSelectedPlace] = useState(
    initial?.label ? { ...initial } : null
  );
  const [gpsNote, setGpsNote] = useState('');

  // shared helper — used by the search list, saved-place pins and "locate me"
  const flyTo = (lat, lng, name = '', zoom = 16) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom });
    setSelectedPlace(name ? { lat, lng, name } : null);
  };

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
      // moving the map manually drops any saved-place selection
      setSelectedPlace(null);
      setCenter({ lat: c.lat, lng: c.lng });
    };
    map.on('move', onMove);

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the labeled pins in sync with the saved-places list
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // drop pins for deleted places
    for (const [id, marker] of Object.entries(pinsRef.current)) {
      if (!saved.some((p) => p.id === id)) {
        marker.remove();
        delete pinsRef.current[id];
      }
    }

    // add a pin (icon + the user's saved text) for every saved place
    for (const place of saved) {
      if (pinsRef.current[place.id]) continue;

      const el = document.createElement('div');
      el.className = 'lp-pin';
      el.innerHTML = `
        <span class='lp-pin-label'></span>
        <svg width='26' height='34' viewBox='0 0 26 34'>
          <path d='M13 1C6.4 1 1 6.4 1 13c0 8.4 10.3 18.6 11.2 19.5a1.1 1.1 0 0 0 1.6 0C14.7 31.6 25 21.4 25 13 25 6.4 19.6 1 13 1z' fill='#f96004' stroke='#fff' stroke-width='1.5'/>
          <circle cx='13' cy='13' r='4.2' fill='#fff'/>
        </svg>`;
      el.querySelector('.lp-pin-label').textContent = place.name;
      el.title = place.name;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        flyTo(place.lat, place.lng, place.name);
      });

      pinsRef.current[place.id] = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
    }
  }, [saved]);

  // clean up every pin when the picker unmounts
  useEffect(
    () => () => {
      for (const marker of Object.values(pinsRef.current)) marker.remove();
      pinsRef.current = {};
    },
    []
  );

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => flyTo(pos.coords.latitude, pos.coords.longitude, '', 16),
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

  const saveCurrentPlace = () => {
    const name = placeName.trim() || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
    const entry = {
      id: Date.now().toString(36),
      name,
      lat: Number(center.lat.toFixed(6)),
      lng: Number(center.lng.toFixed(6)),
    };
    const next = [entry, ...saved].slice(0, 20); // keep it reasonable
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    setPlaceName('');
    setSelectedPlace(entry);
  };

  const removeSaved = (id) => {
    const next = saved.filter((p) => p.id !== id);
    setSaved(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    if (selectedPlace && next.every((p) => p.id !== selectedPlace.id)) {
      setSelectedPlace(null);
    }
  };

  const confirm = () => {
    // a selected saved place wins — otherwise take the crosshair position
    const spot = selectedPlace ?? {
      lat: Number(center.lat.toFixed(6)),
      lng: Number(center.lng.toFixed(6)),
      name: '',
    };
    onConfirm({
      lat: Number(spot.lat.toFixed(6)),
      lng: Number(spot.lng.toFixed(6)),
      label: spot.name || '',
    });
  };

  const displayLabel =
    selectedPlace?.name || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;

  return (
    <div className='lp-overlay'>
      <div className='lp-dialog'>
        <div className='lp-head'>
          <div>
            <h3>{title || t('pickLocationTitle')}</h3>
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
              <li
                key={r.place_id}
                onClick={() => {
                  flyTo(Number(r.lat), Number(r.lon), r.display_name.split(',')[0]);
                  setResults([]);
                  setQuery(r.display_name.split(',')[0]);
                }}
              >
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

          <span className='lp-coords'>{displayLabel}</span>
        </div>

        {gpsNote && (
          <p className='lp-note lp-gps-note'>
            {gpsNote}
            <button type='button' onClick={() => setGpsNote('')}>×</button>
          </p>
        )}

        <div className='lp-saved'>
          <h4>{t('savedPlaces')}</h4>

          <div className='lp-save-row'>
            <input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder={t('placeNamePlaceholder')}
            />
            <button type='button' onClick={saveCurrentPlace}>{t('saveBtn')}</button>
          </div>

          {saved.length === 0 ? (
            <p className='lp-empty'>{t('noSavedPlaces')}</p>
          ) : (
            <ul>
              {saved.map((p) => (
                <li key={p.id}>
                  <button
                    type='button'
                    className='lp-place'
                    onClick={() => flyTo(p.lat, p.lng, p.name)}
                  >
                    <strong>{p.name}</strong>
                    <small>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</small>
                  </button>
                  <button
                    type='button'
                    className='lp-del'
                    onClick={() => removeSaved(p.id)}
                    aria-label='Delete'
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
