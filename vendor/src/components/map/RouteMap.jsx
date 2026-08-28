import { useEffect, useRef, useState } from 'react';
import { Map, Marker, Popup, AttributionControl, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';
import { useUi } from '../../context/UiContext';
import './RouteMap.css';

/* ---------- arrow SVG marker helpers ---------- */

const ARROW_SVG = `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
  <circle cx="18" cy="18" r="17" fill="#1971c2" stroke="#fff" stroke-width="2"/>
  <path d="M18 6 L26 26 L18 21 L10 26 Z" fill="#fff"/>
</svg>`;

const createArrowEl = () => {
  const el = document.createElement('div');
  el.className = 'rt-arrow-marker';
  el.innerHTML = ARROW_SVG;
  return el;
};

/** Haversine bearing (degrees CW from north) between two {lat,lng} points. */
const bearingFrom = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const METERS_PER_DEG_LAT = 111_320;
const minMovedMeters = 5;

// OpenStreetMap tiles + public OSRM demo server for the driving route
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
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

const KATHMANDU = { lat: 27.7172, lng: 85.324 };

/*
 * Shows the drive from the vendor's current GPS position to the customer's
 * drop-off point. Falls back to the saved working location when the device
 * has no GPS, and to a straight dashed line when routing fails.
 */
const RouteMap = ({ url, token, dropoff }) => {
  const { t, num } = useUi();
  const containerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | routeless
  const [summary, setSummary] = useState(null); // { distanceKm, minutes }
  const [startPoint, setStartPoint] = useState(null);

  useEffect(() => {
    let map;
    let cancelled = false;
    let cleanupOrientation = null;
    let cleanupWatchId = null;

    const destination = dropoff
      ? [dropoff.lng, dropoff.lat]
      : KATHMANDU;

    // resolve where the vendor currently is
    const getStart = () =>
      new Promise((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setStartPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude, live: true });
              resolve([pos.coords.longitude, pos.coords.latitude]);
            },
            async () => {
              // no GPS permission/fix — fall back to the saved working location
              try {
                const { data } = await axios.get(`${url}/api/vendors/me`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const loc = data.data?.location;
                if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) {
                  setStartPoint({ lat: loc.lat, lng: loc.lng, live: false });
                  resolve([loc.lng, loc.lat]);
                  return;
                }
              } catch {
                /* ignore and use Kathmandu */
              }
              setStartPoint({ ...KATHMANDU, live: false });
              resolve([KATHMANDU.lng, KATHMANDU.lat]);
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        } else {
          setStartPoint({ ...KATHMANDU, live: false });
          resolve([KATHMANDU.lng, KATHMANDU.lat]);
        }
      });

    (async () => {
      const start = await getStart();
      if (cancelled) return;

      map = new Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: start,
        zoom: 13,
      });

      map.addControl(new AttributionControl({ compact: true }));

      const bounds = new LngLatBounds();
      bounds.extend(start);
      bounds.extend(destination);

      map.on('load', async () => {
        // --- vendor arrow marker (replaces static blue dot) ---
        const arrowEl = createArrowEl();
        new Marker({ element: arrowEl, anchor: 'center' })
          .setLngLat(start)
          .setPopup(new Popup().setText(t('navYou')))
          .addTo(map);

        new Marker({ color: '#e8590c' })
          .setLngLat(destination)
          .setPopup(new Popup().setText(dropoff?.label || t('navDropoff')))
          .addTo(map);

        // --- heading tracking refs (shared by both sources) ---
        let lastHeading = null;
        let watchId = null;
        let lastGpsPos = null;
        let orientationActive = false;

        const applyHeading = (heading) => {
          if (cancelled || heading === lastHeading) return;
          lastHeading = heading;
          arrowEl.style.transform = `rotate(${heading}deg)`;
        };

        // --- 1) Device Orientation (compass) ---
        const onOrientation = (e) => {
          // e.alpha: 0-360, degrees device is rotated around z-axis (compass heading)
          const heading = e.alpha != null ? (360 - e.alpha) % 360 : null;
          if (heading != null) applyHeading(heading);
        };

        const startOrientation = async () => {
          // iOS 13+ requires explicit permission
          if (
            typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function'
          ) {
            try {
              const perm = await DeviceOrientationEvent.requestPermission();
              if (perm !== 'granted') return;
            } catch {
              return;
            }
          }
          if (cancelled) return;
          window.addEventListener('deviceorientation', onOrientation, true);
          window.addEventListener('deviceorientationabsolute', onOrientation, true);
          orientationActive = true;
          cleanupOrientation = () => {
            window.removeEventListener('deviceorientation', onOrientation, true);
            window.removeEventListener('deviceorientationabsolute', onOrientation, true);
          };
        };

        await startOrientation();

        // --- 2) GPS movement fallback (if orientation never fires) ---
        if (!cancelled && navigator.geolocation?.watchPosition) {
          const toRad = (d) => (d * Math.PI) / 180;

          const onGpsMove = (pos) => {
            if (cancelled || orientationActive) {
              // orientation took over — stop GPS tracking
              if (watchId != null) navigator.geolocation.clearWatch(watchId);
              return;
            }
            const cur = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (lastGpsPos) {
              const dist =
                Math.sqrt(
                  ((cur.lat - lastGpsPos.lat) * METERS_PER_DEG_LAT) ** 2 +
                  ((cur.lng - lastGpsPos.lng) *
                    METERS_PER_DEG_LAT *
                    Math.cos(toRad(cur.lat))) ** 2
                );
              if (dist >= minMovedMeters) {
                applyHeading(bearingFrom(lastGpsPos, cur));
              }
            }
            lastGpsPos = cur;
          };

          watchId = navigator.geolocation.watchPosition(onGpsMove, () => {}, {
            enableHighAccuracy: true,
          });
          cleanupWatchId = watchId;
        }

        // ask OSRM for a driving route
        try {
          const { data } = await axios.get(
            `${OSRM_URL}/${start[0]},${start[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`
          );

          const route = data.routes?.[0];
          if (!route) throw new Error('no route');

          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: route.geometry,
            },
          });

          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#f96004',
              'line-width': 5,
              'line-opacity': 0.9,
            },
          });

          setSummary({
            distanceKm: Math.round((route.distance / 1000) * 10) / 10,
            minutes: Math.max(1, Math.round(route.duration / 60)),
          });
          setStatus('ready');
        } catch {
          // routing unavailable — draw a straight dashed fallback line
          map.addSource('fallback', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [start, destination],
              },
            },
          });
          map.addLayer({
            id: 'fallback-line',
            type: 'line',
            source: 'fallback',
            layout: {},
            paint: {
              'line-color': '#f96004',
              'line-width': 3,
              'line-dasharray': [2, 2],
            },
          });
          setStatus('routeless');
        }

        map.fitBounds(bounds, { padding: 60, duration: 800 });
      });
    })();

    return () => {
      cancelled = true;
      cleanupOrientation?.();
      if (cleanupWatchId != null) navigator.geolocation.clearWatch(cleanupWatchId);
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className='rt-wrap'>
      <div ref={containerRef} className='rt-map' />

      <div className='rt-info'>
        <div className='rt-endpoint'>
          <span className='dot from' />
          <span>
            {startPoint
              ? `${startPoint.live ? t('navFromGps') : t('navFromSaved')} (${num(startPoint.lat.toFixed(5))}, ${num(startPoint.lng.toFixed(5))})`
              : '…'}
          </span>
        </div>
        <div className='rt-endpoint'>
          <span className='dot to' />
          <span>{dropoff?.label || `${num(dropoff?.lat?.toFixed(5))}, ${num(dropoff?.lng?.toFixed(5))}`}</span>
        </div>

        {summary && (
          <p className='rt-summary'>
            {t('navDistanceEta', { km: summary.distanceKm, min: summary.minutes })}
          </p>
        )}
      </div>
    </div>
  );
};

export default RouteMap;
