import { useCallback, useEffect, useRef } from 'react';

const TASHKENT_CENTER = [41.2995, 69.2401];

export default function YandexAddressMap({
  mapContainerId,
  address,
  onAddressChange,
  mapClassName =
    'h-[250px] min-h-[250px] max-h-[250px] w-full shrink-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-stone-200/80',
}) {
  const mapRef = useRef(null);
  const placemarkRef = useRef(null);

  const applyCoords = useCallback(
    async (coords, zoom) => {
      const ymaps = window.ymaps;
      if (!ymaps || !mapRef.current) return;

      const map = mapRef.current;
      if (placemarkRef.current) {
        map.geoObjects.remove(placemarkRef.current);
      }
      placemarkRef.current = new ymaps.Placemark(
        coords,
        {},
        { preset: 'islands#orangeCircleDotIcon' }
      );
      map.geoObjects.add(placemarkRef.current);
      if (typeof zoom === 'number') {
        map.setCenter(coords, zoom);
      }

      try {
        const res = await ymaps.geocode(coords, { results: 1 });
        const first = res.geoObjects.get(0);
        const line = first ? first.getAddressLine() : '';
        onAddressChange(line);
      } catch (err) {
        console.error('Yandex geocode error:', err);
      }
    },
    [onAddressChange]
  );

  useEffect(() => {
    let cancelled = false;

    const initMap = () => {
      if (cancelled) return;
      if (!document.getElementById(mapContainerId) || mapRef.current) return;
      const ymaps = window.ymaps;
      if (!ymaps) return;

      ymaps.ready(() => {
        if (cancelled || mapRef.current) return;
        try {
          const map = new ymaps.Map(mapContainerId, {
            center: TASHKENT_CENTER,
            zoom: 13,
            controls: ['zoomControl'],
          });
          mapRef.current = map;

          map.events.add('click', (e) => {
            const coords = e.get('coords');
            void applyCoords(coords);
          });
        } catch (err) {
          console.error('Yandex map init:', err);
        }
      });
    };

    const loadScript = () => {
      if (cancelled) return;
      if (window.ymaps) {
        initMap();
        return;
      }

      const existing = Array.from(document.getElementsByTagName('script')).find(
        (s) => s.src && s.src.includes('api-maps.yandex.ru/2.1/')
      );
      if (existing) {
        if (window.ymaps) {
          initMap();
        } else {
          existing.addEventListener('load', () => {
            if (!cancelled) initMap();
          });
        }
        return;
      }

      const script = document.createElement('script');
      const key = import.meta.env.VITE_YANDEX_MAPS_KEY ?? '';
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${key}&lang=uz_UZ`;
      script.async = true;
      script.onload = () => {
        if (!cancelled) initMap();
      };
      script.onerror = () => {
        console.error('Yandex Maps script failed to load');
      };
      document.head.appendChild(script);
    };

    loadScript();

    return () => {
      cancelled = true;
      placemarkRef.current = null;
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch {
          /* ignore */
        }
        mapRef.current = null;
      }
      const mapEl = document.getElementById(mapContainerId);
      if (mapEl) mapEl.innerHTML = '';
    };
  }, [applyCoords, mapContainerId]);

  function handleMyLocation() {
    if (!navigator.geolocation) {
      window.alert("Joylashuv ruxsati berilmadi");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        void applyCoords(coords, 16);
      },
      () => {
        window.alert("Joylashuv ruxsati berilmadi");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <div className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">Xarita</span>
      <div
        id={mapContainerId}
        className={`mb-3 ${mapClassName}`}
        style={{ height: 250, minHeight: 250, maxHeight: 250 }}
      />
      <button
        type="button"
        onClick={handleMyLocation}
        className="w-full rounded-2xl border border-stone-200 bg-card py-3 text-sm font-bold text-ink shadow-sm transition hover:border-primary/30 hover:bg-surface active:scale-[0.99]"
      >
        📍 Mening joylashuvim
      </button>
      <p className="sr-only" aria-live="polite">
        {address ? `Tanlangan manzil: ${address}` : ''}
      </p>
    </div>
  );
}
