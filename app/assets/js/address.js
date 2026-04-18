
    document.addEventListener('DOMContentLoaded', function () {

      // ── State ───────────────────────────────────────────────────
      var addresses = [];
      var pendingDeleteId = null;
      var mapsLoaderPromise = null;
      var mapInstance = null;
      var mapMarker = null;
      var mapGeocoder = null;
      var mapAutocompleteService = null;
      var mapPlacesService = null;
      var predictionDebounceTimer = null;
      var defaultMapCenter = { lat: 6.5244, lng: 3.3792 };
      var mapMeta = {
        placeId: '',
        streetAddress: '',
        city: '',
        state: '',
        country: 'Nigeria'
      };

      // ── DOM refs ────────────────────────────────────────────────
      var addrGrid       = document.getElementById('addrGrid');
      var btnAddAddress  = document.getElementById('btnAddAddress');
      var modalOverlay   = document.getElementById('modalOverlay');
      var confirmOverlay = document.getElementById('confirmOverlay');
      var addrForm       = document.getElementById('addrForm');
      var editAddressId  = document.getElementById('editAddressId');
      var modalTitle     = document.getElementById('modalTitle');
      var btnSave        = document.getElementById('btnSave');

      var fieldLabel       = document.getElementById('fieldLabel');
      var fieldAddressLine = document.getElementById('fieldAddressLine');
      var fieldCity        = document.getElementById('fieldCity');
      var fieldState       = document.getElementById('fieldState');
      var fieldCountry     = document.getElementById('fieldCountry');
      var fieldPlaceId     = document.getElementById('fieldPlaceId');
      var fieldIsDefault   = document.getElementById('fieldIsDefault');
      var addressSuggestions = document.getElementById('addressSuggestions');
      var addressMap       = document.getElementById('addressMap');
      var mapStatus        = document.getElementById('mapStatus');

      // ── Populate nav profile ────────────────────────────────────
      (function populateNav() {
        try {
          var raw = localStorage.getItem(API_CONFIG.STORAGE_KEYS.USER_DATA);
          if (!raw) return;
          var user = JSON.parse(raw);
          var first = (user.firstName || '').trim();
          var last  = (user.lastName  || '').trim();
          var full  = [first, last].filter(Boolean).join(' ');
          if (full) {
            var nameEl   = document.getElementById('navName');
            var avatarEl = document.getElementById('navAvatar');
            if (nameEl)   nameEl.textContent   = full;
            if (avatarEl) avatarEl.textContent = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'U';
          }
        } catch (_) { /* ignore */ }
      })();

      // ── Render ──────────────────────────────────────────────────
      function labelIcon(label) {
        var l = (label || '').toLowerCase();
        if (l.includes('home'))   return '🏠';
        if (l.includes('office') || l.includes('work')) return '🏢';
        if (l.includes('salon'))  return '💇';
        return '📍';
      }

      function updateStats() {
        var totalEl   = document.getElementById('statTotal');
        var defaultEl = document.getElementById('statDefault');
        if (totalEl)   totalEl.textContent   = addresses.length;
        var def = addresses.find(function(a){ return a.isDefault; });
        var shortAddress = def ? (def.fullAddress || def.addressLine || '').split(' ').slice(0, 2).join(' ') : '';
        if (defaultEl) defaultEl.textContent = def ? escHtml(def.label || shortAddress || 'Address') : '—';
      }

      function renderGrid() {
        updateStats();

        if (!addresses.length) {
          addrGrid.innerHTML = `
            <div class="addr-empty">
              <span class="addr-empty-icon">📍</span>
              <h3>No saved addresses yet</h3>
              <p class="p-regular">Add your first address to make booking easier and faster.</p>
            </div>`;
          return;
        }

        addrGrid.innerHTML = addresses.map(function (addr) {
          var fullAddress = addr.fullAddress || addr.addressLine || '';
          var locationLine = [addr.city, addr.state, addr.country].filter(Boolean).join(', ');
          var lines = [
            fullAddress,
            locationLine
          ].filter(function (line, idx, allLines) {
            return line && allLines.indexOf(line) === idx;
          });

          return `
            <div class="addr-card${addr.isDefault ? ' is-default' : ''}" data-id="${addr.id}">
              <div class="addr-card-top">
                <div class="addr-label-row">
                  <div class="addr-icon">${labelIcon(addr.label)}</div>
                  <div>
                    <div class="addr-label">${escHtml(addr.label || 'Address')}</div>
                    ${addr.isDefault ? '<span class="badge-default">✓ Default</span>' : ''}
                  </div>
                </div>
              </div>
              <div class="addr-divider"></div>
              <div class="addr-body">
                ${lines.map(function (l) { return `<span class="addr-line">${escHtml(l)}</span>`; }).join('')}
              </div>
              <div class="addr-actions">
                <button class="btn-addr-action btn-edit" type="button"
                  data-action="edit" data-id="${addr.id}">
                  <svg width="12" height="12" fill="none" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M8.5 1l2.5 2.5L4 11H1.5V8.5L8.5 1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  </svg>
                  Edit
                </button>
                <button class="btn-addr-action btn-delete" type="button"
                  data-action="delete" data-id="${addr.id}">
                  <svg width="12" height="12" fill="none" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M1.5 3h9M4.5 3V2h3v1M2.5 3l.5 7h6l.5-7H2.5zM5 5.5v3M7 5.5v3"
                      stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Delete
                </button>
              </div>
            </div>`;
        }).join('');
      }

      // ── Load ────────────────────────────────────────────────────
      async function loadAddresses() {
        addrGrid.innerHTML = '<div class="addr-skeleton"></div><div class="addr-skeleton"></div>';
        try {
          addresses = await AddressAPI.getAll();
        } catch (err) {
          addresses = [];
          var msg = (err && err.message) || 'Unable to load addresses.';
          if (Array.isArray(msg)) msg = msg.join(', ');
          UIHelper.showToast(msg, 'error');
        }
        renderGrid();
      }

      // ── Modal helpers ───────────────────────────────────────────
      var modalSubtitle = document.getElementById('modalSubtitle');

      function setMapStatus(message, tone) {
        if (!mapStatus) return;
        mapStatus.textContent = message || '';
        mapStatus.classList.remove('is-error', 'is-success');
        if (tone === 'error') mapStatus.classList.add('is-error');
        if (tone === 'success') mapStatus.classList.add('is-success');
      }

      function clearAddressSuggestions() {
        if (!addressSuggestions) return;
        addressSuggestions.innerHTML = '';
        addressSuggestions.classList.remove('is-open');
      }

      function escAttr(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function renderAddressSuggestions(predictions) {
        if (!addressSuggestions) return;

        if (!Array.isArray(predictions) || !predictions.length) {
          clearAddressSuggestions();
          return;
        }

        addressSuggestions.innerHTML = predictions.map(function (prediction) {
          var structured = prediction.structured_formatting || {};
          var main = structured.main_text || prediction.description || '';
          var sub = structured.secondary_text || '';

          return '' +
            '<button type="button" class="address-suggestion-item" ' +
            'data-place-id="' + escAttr(prediction.place_id || '') + '" ' +
            'data-description="' + escAttr(prediction.description || '') + '">' +
            '<div class="address-suggestion-main">' + escHtml(main) + '</div>' +
            (sub ? '<div class="address-suggestion-sub">' + escHtml(sub) + '</div>' : '') +
            '</button>';
        }).join('');

        addressSuggestions.classList.add('is-open');
      }

      function requestAddressPredictions(inputValue) {
        var query = String(inputValue || '').trim();
        if (!query || query.length < 3) {
          clearAddressSuggestions();
          return;
        }

        if (!mapAutocompleteService || !window.google || !window.google.maps || !window.google.maps.places) {
          clearAddressSuggestions();
          return;
        }

        mapAutocompleteService.getPlacePredictions({
          input: query,
          types: ['geocode'],
          componentRestrictions: { country: 'ng' },
          region: 'ng'
        }, function (predictions, status) {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions || !predictions.length) {
            clearAddressSuggestions();
            return;
          }
          var nigeriaPredictions = predictions.filter(function (prediction) {
            var description = String((prediction && prediction.description) || '').toLowerCase();
            return description.indexOf('nigeria') !== -1 || description.indexOf(', ng') !== -1;
          });

          renderAddressSuggestions((nigeriaPredictions.length ? nigeriaPredictions : predictions).slice(0, 6));
        });
      }

      function selectAddressPrediction(placeId, fallbackDescription) {
        return new Promise(function (resolve, reject) {
          if (!mapPlacesService) {
            reject(new Error('Places service is not initialized yet.'));
            return;
          }

          mapPlacesService.getDetails({
            placeId: placeId,
            fields: ['address_components', 'formatted_address', 'geometry', 'place_id']
          }, function (place, status) {
            if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place || !place.geometry || !place.geometry.location) {
              reject(new Error('Unable to load details for this address suggestion.'));
              return;
            }

            if (!isNigeriaResult(place)) {
              reject(new Error('Please select an address within Nigeria.'));
              return;
            }

            applyGeocodeResult({
              place_id: place.place_id,
              formatted_address: place.formatted_address || fallbackDescription || '',
              address_components: place.address_components,
              geometry: place.geometry
            }, false);
            clearAddressSuggestions();
            setMapStatus('Address selected. You can drag the pin to refine it.', 'success');
            resolve(place);
          });
        });
      }

      function syncMapMetaToFields() {
        if (fieldCity) fieldCity.value = mapMeta.city || '';
        if (fieldState) fieldState.value = mapMeta.state || '';
        if (fieldCountry) fieldCountry.value = mapMeta.country || 'Nigeria';
        if (fieldPlaceId) fieldPlaceId.value = mapMeta.placeId || '';
      }

      function resetMapMeta() {
        mapMeta.placeId = '';
        mapMeta.streetAddress = '';
        mapMeta.city = '';
        mapMeta.state = '';
        mapMeta.country = 'Nigeria';
        syncMapMetaToFields();
      }

      function toLatLngLiteral(position) {
        if (!position) return null;
        if (typeof position.lat === 'function' && typeof position.lng === 'function') {
          return { lat: Number(position.lat()), lng: Number(position.lng()) };
        }
        if (typeof position.lat === 'number' && typeof position.lng === 'number') {
          return { lat: position.lat, lng: position.lng };
        }
        return null;
      }

      function pickAddressComponent(components, types) {
        if (!Array.isArray(components)) return '';
        for (var i = 0; i < components.length; i += 1) {
          var comp = components[i];
          if (!comp || !Array.isArray(comp.types)) continue;
          var matched = types.some(function (type) { return comp.types.indexOf(type) !== -1; });
          if (matched) return String(comp.long_name || comp.short_name || '').trim();
        }
        return '';
      }

      function parseAddressComponents(components) {
        var streetNumber = pickAddressComponent(components, ['street_number']);
        var route = pickAddressComponent(components, ['route']);

        return {
          streetAddress: [streetNumber, route].filter(Boolean).join(' ').trim(),
          city: pickAddressComponent(components, ['locality', 'postal_town', 'sublocality', 'sublocality_level_1']),
          state: pickAddressComponent(components, ['administrative_area_level_1']),
          country: pickAddressComponent(components, ['country']) || 'Nigeria'
        };
      }

      function isNigeriaResult(result) {
        if (!result) return false;

        var parsed = parseAddressComponents(result.address_components || []);
        var country = String(parsed.country || '').trim().toLowerCase();
        if (country === 'nigeria' || country === 'ng') return true;

        var formatted = String(result.formatted_address || '').toLowerCase();
        return formatted.indexOf('nigeria') !== -1;
      }

      function applyGeocodeResult(result, keepManualInput) {
        if (!result) return;

        var parsed = parseAddressComponents(result.address_components || []);
        var formattedAddress = String(result.formatted_address || '').trim();

        if (!keepManualInput || !fieldAddressLine.value.trim()) {
          fieldAddressLine.value = formattedAddress;
        }

        mapMeta.placeId = String(result.place_id || '').trim();
        mapMeta.streetAddress = parsed.streetAddress || formattedAddress;
        mapMeta.city = parsed.city;
        mapMeta.state = parsed.state;
        mapMeta.country = parsed.country || 'Nigeria';
        syncMapMetaToFields();

        if (result.geometry && result.geometry.location && mapInstance && mapMarker) {
          var latLng = toLatLngLiteral(result.geometry.location);
          if (latLng) {
            mapMarker.setPosition(latLng);
            mapInstance.panTo(latLng);
            mapInstance.setZoom(16);
          }
        }
      }

      function getGoogleMapsPublicKey() {
        var key = API_CONFIG && API_CONFIG.MAPS ? API_CONFIG.MAPS.GOOGLE_PUBLIC_KEY : '';
        return String(key || '').trim();
      }

      function loadGoogleMapsScript() {
        if (window.google && window.google.maps && window.google.maps.places) {
          return Promise.resolve();
        }

        if (mapsLoaderPromise) return mapsLoaderPromise;

        mapsLoaderPromise = new Promise(function (resolve, reject) {
          var key = getGoogleMapsPublicKey();
          if (!key) {
            reject(new Error('Google Maps key is missing. Set window.__HAIRLUX_PUBLIC_CONFIG__.googleMapsKey before loading this page.'));
            return;
          }

          var script = document.createElement('script');
          script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&libraries=places&v=weekly';
          script.async = true;
          script.defer = true;
          script.setAttribute('data-maps-loader', 'hairlux-address');
          script.onload = function () {
            if (window.google && window.google.maps && window.google.maps.places) {
              resolve();
              return;
            }
            reject(new Error('Google Maps loaded, but Places library is unavailable.'));
          };
          script.onerror = function () {
            reject(new Error('Unable to load Google Maps. Check key restrictions and billing setup.'));
          };
          document.head.appendChild(script);
        });

        return mapsLoaderPromise;
      }

      function geocodeAddressText(addressText, keepManualInput) {
        return new Promise(function (resolve, reject) {
          if (!mapGeocoder) {
            reject(new Error('Geocoder is not initialized yet.'));
            return;
          }

          mapGeocoder.geocode({
            address: addressText,
            componentRestrictions: { country: 'NG' },
            region: 'NG'
          }, function (results, status) {
            if (status !== 'OK' || !Array.isArray(results) || !results.length) {
              reject(new Error('We could not resolve that address on the map.'));
              return;
            }
            var topResult = results.find(function (result) {
              return isNigeriaResult(result);
            });
            if (!topResult) {
              reject(new Error('Please enter an address within Nigeria.'));
              return;
            }
            applyGeocodeResult(topResult, keepManualInput);
            resolve(topResult);
          });
        });
      }

      function reverseGeocodePosition(latLng) {
        return new Promise(function (resolve, reject) {
          if (!mapGeocoder) {
            reject(new Error('Geocoder is not initialized yet.'));
            return;
          }

          mapGeocoder.geocode({ location: latLng }, function (results, status) {
            if (status !== 'OK' || !Array.isArray(results) || !results.length) {
              reject(new Error('Unable to fetch address details for this map position.'));
              return;
            }
            var topResult = results.find(function (result) {
              return isNigeriaResult(result);
            });
            if (!topResult) {
              reject(new Error('Selected location appears to be outside Nigeria.'));
              return;
            }
            resolve(topResult);
          });
        });
      }


      function refreshMapViewport() {
        if (!mapInstance || !window.google || !window.google.maps) return;
        setTimeout(function () {
          window.google.maps.event.trigger(mapInstance, 'resize');
          var pos = mapMarker ? mapMarker.getPosition() : null;
          if (pos) mapInstance.panTo(pos);
        }, 120);
      }

      function initMapTools() {
        if (mapInstance && mapMarker && mapGeocoder) {
          refreshMapViewport();
          return Promise.resolve();
        }

        return loadGoogleMapsScript().then(function () {
          if (!addressMap) return;

          mapInstance = new window.google.maps.Map(addressMap, {
            center: defaultMapCenter,
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false
          });

          mapGeocoder = new window.google.maps.Geocoder();
          mapAutocompleteService = new window.google.maps.places.AutocompleteService();
          mapPlacesService = new window.google.maps.places.PlacesService(mapInstance);
          mapMarker = new window.google.maps.Marker({
            map: mapInstance,
            position: defaultMapCenter,
            draggable: true,
            title: 'Drag to exact address'
          });

          mapMarker.addListener('dragend', async function () {
            try {
              var pos = toLatLngLiteral(mapMarker.getPosition());
              if (!pos) return;
              var result = await reverseGeocodePosition(pos);
              applyGeocodeResult(result, false);
              setMapStatus('Map pin moved. Address has been updated.', 'success');
            } catch (err) {
              setMapStatus((err && err.message) || 'Could not update address from pin.', 'error');
            }
          });

          mapInstance.addListener('click', async function (event) {
            var pos = toLatLngLiteral(event && event.latLng);
            if (!pos || !mapMarker) return;

            mapMarker.setPosition(pos);
            try {
              var result = await reverseGeocodePosition(pos);
              applyGeocodeResult(result, false);
              setMapStatus('Map pin set from click. Address has been updated.', 'success');
            } catch (err) {
              setMapStatus((err && err.message) || 'Could not update address from map click.', 'error');
            }
          });

          setMapStatus('Search for an address and drag the pin for precision.');
          refreshMapViewport();
        });
      }

      async function ensureAddressMetadata() {
        var fullAddress = fieldAddressLine.value.trim();
        if (!fullAddress) return;

        var hasMeta = Boolean(fieldPlaceId.value.trim() || fieldCity.value.trim() || fieldState.value.trim());
        if (hasMeta) return;

        try {
          await initMapTools();
          await geocodeAddressText(fullAddress, true);
        } catch (_) {
          // Keep manual full address when geocoding is unavailable.
        }
      }

      function openModal(title, subtitle) {
        modalTitle.textContent   = title;
        if (modalSubtitle) modalSubtitle.textContent = subtitle || '';
        modalOverlay.classList.add('open');
        setTimeout(function () { fieldAddressLine.focus(); }, 50);
        initMapTools()
          .then(function () {
            refreshMapViewport();
            if (fieldAddressLine.value.trim()) {
              return geocodeAddressText(fieldAddressLine.value.trim(), true).catch(function () {
                setMapStatus('Address map preview is unavailable for this value yet.');
              });
            }
          })
          .catch(function (err) {
            var msg = (err && err.message) || 'Google Maps is unavailable right now.';
            setMapStatus(msg, 'error');
          });
      }

      function closeModal() {
        modalOverlay.classList.remove('open');
        addrForm.reset();
        editAddressId.value = '';
        if (predictionDebounceTimer) {
          clearTimeout(predictionDebounceTimer);
          predictionDebounceTimer = null;
        }
        clearAddressSuggestions();
        resetMapMeta();
        if (mapMarker) mapMarker.setPosition(defaultMapCenter);
        if (mapInstance) {
          mapInstance.setCenter(defaultMapCenter);
          mapInstance.setZoom(13);
        }
        setMapStatus('');
      }

      function openConfirm(id) {
        pendingDeleteId = id;
        confirmOverlay.classList.add('open');
      }

      function closeConfirm() {
        pendingDeleteId = null;
        confirmOverlay.classList.remove('open');
      }

      function populateForm(addr) {
        editAddressId.value    = addr.id || '';
        fieldLabel.value       = addr.label || '';
        fieldAddressLine.value = addr.fullAddress || addr.addressLine || '';
        mapMeta.placeId        = addr.placeId || '';
        mapMeta.streetAddress  = addr.streetAddress || '';
        mapMeta.city           = addr.city || '';
        mapMeta.state          = addr.state || '';
        mapMeta.country        = addr.country || 'Nigeria';
        syncMapMetaToFields();
        fieldIsDefault.checked = Boolean(addr.isDefault);
      }

      function getFormPayload() {
        var fullAddress = fieldAddressLine.value.trim();
        var addressComponents = {
          streetAddress: mapMeta.streetAddress || undefined,
          city: fieldCity.value.trim() || mapMeta.city || undefined,
          state: fieldState.value.trim() || mapMeta.state || undefined,
          country: fieldCountry.value.trim() || mapMeta.country || 'Nigeria'
        };

        Object.keys(addressComponents).forEach(function (key) {
          if (!addressComponents[key]) delete addressComponents[key];
        });

        return {
          label:         fieldLabel.value.trim() || undefined,
          fullAddress:   fullAddress,
          streetAddress: addressComponents.streetAddress || fullAddress,
          city:          addressComponents.city || undefined,
          state:         addressComponents.state || undefined,
          country:       addressComponents.country || 'Nigeria',
          placeId:       fieldPlaceId.value.trim() || undefined,
          addressComponents: Object.keys(addressComponents).length ? addressComponents : undefined,
          isDefault:     fieldIsDefault.checked
        };
      }

      function validateForm(payload) {
        if (!payload.fullAddress) return 'Full address is required.';
        return null;
      }

      // ── Events: open add modal ───────────────────────────────────
      btnAddAddress.addEventListener('click', function () {
        addrForm.reset();
        editAddressId.value = '';
        resetMapMeta();
        openModal('Add Address', 'Fill in the details below to save a new address.');
      });

      fieldAddressLine.addEventListener('input', function () {
        mapMeta.placeId = '';
        mapMeta.streetAddress = '';
        mapMeta.city = '';
        mapMeta.state = '';
        mapMeta.country = 'Nigeria';
        if (fieldPlaceId) fieldPlaceId.value = '';
        syncMapMetaToFields();

        if (predictionDebounceTimer) clearTimeout(predictionDebounceTimer);
        predictionDebounceTimer = setTimeout(function () {
          requestAddressPredictions(fieldAddressLine.value);
        }, 220);
      });

      if (addressSuggestions) {
        addressSuggestions.addEventListener('click', async function (e) {
          var btn = e.target.closest('[data-place-id]');
          if (!btn) return;

          try {
            await initMapTools();
            await selectAddressPrediction(
              btn.getAttribute('data-place-id'),
              btn.getAttribute('data-description') || ''
            );
          } catch (err) {
            var msg = (err && err.message) || 'Could not apply selected suggestion.';
            setMapStatus(msg, 'error');
          }
        });
      }

      document.addEventListener('click', function (e) {
        if (!addressSuggestions || !addressSuggestions.classList.contains('is-open')) return;
        if (e.target === fieldAddressLine) return;
        if (addressSuggestions.contains(e.target)) return;
        clearAddressSuggestions();
      });

      // ── Events: close modal ──────────────────────────────────────
      document.getElementById('modalClose').addEventListener('click', closeModal);
      document.getElementById('modalCancel').addEventListener('click', closeModal);
      modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal();
      });

      // ── Events: close confirm ────────────────────────────────────
      document.getElementById('confirmNo').addEventListener('click', closeConfirm);
      document.getElementById('confirmClose').addEventListener('click', closeConfirm);
      confirmOverlay.addEventListener('click', function (e) {
        if (e.target === confirmOverlay) closeConfirm();
      });

      // ── Events: card action delegation ──────────────────────────
      addrGrid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        var id     = btn.getAttribute('data-id');

        if (action === 'edit') {
          var addr = addresses.find(function (a) { return a.id === id; });
          if (!addr) return;
          populateForm(addr);
          openModal('Edit Address', 'Update the details for this address.');
        }

        if (action === 'delete') {
          openConfirm(id);
        }
      });

      // ── Events: save (add / edit) ────────────────────────────────
      addrForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        await ensureAddressMetadata();
        var payload  = getFormPayload();
        var error    = validateForm(payload);
        if (error) {
          UIHelper.showToast(error, 'error');
          return;
        }

        UIHelper.setButtonLoading(btnSave, true);
        try {
          var isEdit = Boolean(editAddressId.value);
          if (isEdit) {
            var updated = await AddressAPI.update(editAddressId.value, payload);
            var idx = addresses.findIndex(function (a) { return a.id === updated.id; });
            if (idx !== -1) addresses[idx] = updated;
            // If new default, clear other defaults locally
            if (updated.isDefault) {
              addresses.forEach(function (a) { if (a.id !== updated.id) a.isDefault = false; });
            }
            UIHelper.showToast('Address updated.', 'success');
          } else {
            var created = await AddressAPI.create(payload);
            // If new default, clear others
            if (created.isDefault) {
              addresses.forEach(function (a) { a.isDefault = false; });
            }
            addresses.unshift(created);
            UIHelper.showToast('Address added.', 'success');
          }
          closeModal();
          renderGrid();
        } catch (err) {
          var msg = (err && err.message) || 'Something went wrong.';
          if (Array.isArray(msg)) msg = msg.join(', ');
          UIHelper.showToast(msg, 'error');
        } finally {
          UIHelper.setButtonLoading(btnSave, false);
        }
      });

      // ── Events: confirm delete ───────────────────────────────────
      document.getElementById('confirmYes').addEventListener('click', async function () {
        if (!pendingDeleteId) return;
        var delBtn = document.getElementById('confirmYes');
        UIHelper.setButtonLoading(delBtn, true);
        try {
          await AddressAPI.remove(pendingDeleteId);
          addresses = addresses.filter(function (a) { return a.id !== pendingDeleteId; });
          closeConfirm();
          renderGrid();
          UIHelper.showToast('Address deleted.', 'success');
        } catch (err) {
          var msg = (err && err.message) || 'Could not delete the address.';
          if (Array.isArray(msg)) msg = msg.join(', ');
          UIHelper.showToast(msg, 'error');
          closeConfirm();
        } finally {
          UIHelper.setButtonLoading(delBtn, false);
        }
      });

      // ── ESC key closes any open modal ────────────────────────────
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closeModal();
          closeConfirm();
        }
      });

      // ── Utility ─────────────────────────────────────────────────
      function escHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // ── Bootstrap ───────────────────────────────────────────────
      loadAddresses();
    });