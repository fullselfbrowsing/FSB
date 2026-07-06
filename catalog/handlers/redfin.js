(function (global) {
  'use strict';

  /**
   * Redfin same-origin Stingray READ head.
   *
   * Redfin's web API uses first-party GET endpoints under www.redfin.com and a
   * per-session RF_AUTH cookie copied to x-rf-secure. The handler declares that
   * cookie-to-header requirement through executeBoundSpec csrfSource; it never
   * reads cookies or storage directly. All current Redfin descriptors are reads.
   */

  var REDFIN_ORIGIN = 'https://www.redfin.com';
  var REDFIN_SERVICE = 'redfin.com';
  var INT_LIMIT = 9007199254740991;

  var EMPTY_PARAMS = schema({}, []);
  var PROPERTY_ID_PARAMS = schema({
    property_id: integerSchema('Redfin property ID')
  }, ['property_id']);
  var FAVORITES_PARAMS = schema({
    market_status: {
      type: 'string',
      enum: ['all', 'on_market', 'off_market'],
      description: 'Filter by market status'
    }
  }, []);
  var LOCATION_PARAMS = schema({
    query: { type: 'string', minLength: 1, description: 'Location search text' },
    count: integerSchema('Maximum number of results', 1, 20)
  }, ['query']);
  var SEARCH_PARAMS = schema({
    region_id: integerSchema('Region ID from search_locations'),
    region_type: integerSchema('Region type from search_locations'),
    num_homes: integerSchema('Maximum number of results', 1, 50),
    status: integerSchema('Listing status filter'),
    min_price: { type: 'number', description: 'Minimum listing price in dollars' },
    max_price: { type: 'number', description: 'Maximum listing price in dollars' },
    min_beds: integerSchema('Minimum bedrooms'),
    max_beds: integerSchema('Maximum bedrooms'),
    min_baths: integerSchema('Minimum bathrooms'),
    min_sqft: { type: 'number', description: 'Minimum square footage' },
    max_sqft: { type: 'number', description: 'Maximum square footage' },
    property_type: { type: 'string', description: 'Property type filter codes, comma-separated' }
  }, ['region_id', 'region_type']);
  var COMPARABLE_RENTALS_PARAMS = schema({
    property_id: integerSchema('Redfin property ID'),
    latitude: { type: 'number', description: 'Property latitude' },
    longitude: { type: 'number', description: 'Property longitude' },
    rent_estimate: { type: 'number', description: 'Estimated monthly rent in dollars' }
  }, ['property_id', 'latitude', 'longitude']);

  function integerSchema(description, min, max) {
    return {
      type: 'integer',
      minimum: min === undefined ? -INT_LIMIT : min,
      maximum: max === undefined ? INT_LIMIT : max,
      description: description
    };
  }

  function schema(properties, required) {
    var out = {
      type: 'object',
      properties: properties || {},
      additionalProperties: false
    };
    if (required && required.length) { out.required = required; }
    return out;
  }

  function typedRecipeError(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  function fallback(slug, reason) {
    return typedRecipeError('RECIPE_DOM_FALLBACK_PENDING', {
      slug: slug,
      reason: reason || 'redfin-stingray-shape-mismatch',
      fellBackToDom: true
    });
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function arrayValue(value) {
    return Array.isArray(value) ? value : [];
  }

  function numberValue(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function stringValue(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function boolValue(value) {
    return value === true;
  }

  function wrappedValue(value) {
    return isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')
      ? value.value
      : undefined;
  }

  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < (pairs || []).length; i++) {
      var key = pairs[i][0];
      var value = pairs[i][1];
      if (value === undefined || value === null || value === '') { continue; }
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  function buildApiSpec(path, pairs) {
    return {
      url: REDFIN_ORIGIN + path + buildQuery(pairs || []),
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      body: null,
      query: {},
      authStrategy: 'same-origin-cookie',
      csrfSource: { from: 'cookie', selector: 'RF_AUTH', header: 'x-rf-secure' },
      origin: REDFIN_ORIGIN,
      extract: null
    };
  }

  function parseEnvelopeText(text) {
    if (typeof text !== 'string' || !text) { return null; }
    var trimmed = text.indexOf('{}&&') === 0 ? text.slice(4) : text;
    try {
      var parsed = JSON.parse(trimmed);
      return isObject(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function envelopeFromResult(result) {
    if (isObject(result && result.data)
        && (Object.prototype.hasOwnProperty.call(result.data, 'resultCode')
          || Object.prototype.hasOwnProperty.call(result.data, 'payload'))) {
      return result.data;
    }
    if (typeof (result && result.data) === 'string') {
      return parseEnvelopeText(result.data);
    }
    return parseEnvelopeText(result && result.text);
  }

  function payloadFromResult(result, slug) {
    if (!result || result.success !== true) {
      return result || fallback(slug, 'redfin-empty-response');
    }
    var status = Number(result.status || 0);
    if (result.redirected || status === 401 || status === 403 || status >= 400) {
      return fallback(slug, 'redfin-auth-or-http-error');
    }
    var envelope = envelopeFromResult(result);
    if (!isObject(envelope)) { return fallback(slug, 'redfin-stingray-shape-mismatch'); }
    if (Number(envelope.resultCode) !== 0) {
      return fallback(slug, Number(envelope.resultCode) === 4
        ? 'redfin-auth-required'
        : 'redfin-stingray-error-' + stringValue(envelope.resultCode));
    }
    if (!Object.prototype.hasOwnProperty.call(envelope, 'payload')) {
      return fallback(slug, 'redfin-stingray-payload-missing');
    }
    return envelope.payload || {};
  }

  async function readPayload(slug, ctx, path, pairs) {
    if (!ctx || typeof ctx.executeBoundSpec !== 'function') {
      return fallback(slug, 'redfin-execute-bound-spec-unavailable');
    }
    var result = await ctx.executeBoundSpec(buildApiSpec(path, pairs || []), ctx.tabId);
    return payloadFromResult(result, slug);
  }

  function mapLocation(raw) {
    var l = isObject(raw) ? raw : {};
    return {
      id: stringValue(l.id),
      name: stringValue(l.name),
      sub_name: stringValue(l.subName),
      type: stringValue(l.type),
      url: stringValue(l.url),
      active: boolValue(l.active)
    };
  }

  function mapPropertyListing(raw) {
    var p = isObject(raw) ? raw : {};
    var latLong = isObject(p.latLong) && isObject(p.latLong.value) ? p.latLong.value : {};
    return {
      property_id: numberValue(p.propertyId),
      listing_id: numberValue(p.listingId),
      mls_id: stringValue(wrappedValue(p.mlsId)),
      street_line: stringValue(wrappedValue(p.streetLine)),
      city: stringValue(p.city),
      state: stringValue(p.state),
      zip: stringValue(p.zip || wrappedValue(p.postalCode)),
      price: numberValue(wrappedValue(p.price)),
      beds: numberValue(p.beds),
      baths: numberValue(p.baths),
      sqft: numberValue(wrappedValue(p.sqFt)),
      lot_size: numberValue(wrappedValue(p.lotSize)),
      year_built: numberValue(wrappedValue(p.yearBuilt)),
      hoa: numberValue(wrappedValue(p.hoa)),
      price_per_sqft: numberValue(wrappedValue(p.pricePerSqFt)),
      days_on_market: numberValue(wrappedValue(p.dom)),
      property_type: numberValue(p.propertyType),
      latitude: numberValue(latLong.latitude),
      longitude: numberValue(latLong.longitude),
      url: stringValue(p.url),
      listing_remarks: stringValue(p.listingRemarks).slice(0, 500),
      is_hot: boolValue(p.isHot),
      is_new_construction: boolValue(p.isNewConstruction),
      has_virtual_tour: boolValue(p.hasVirtualTour),
      search_status: numberValue(p.searchStatus)
    };
  }

  function mapPropertyDetail(payload, propertyId) {
    var p = isObject(payload) ? payload : {};
    var addr = isObject(p.addressSectionInfo) ? p.addressSectionInfo : {};
    var street = isObject(addr.streetAddress) ? addr.streetAddress : {};
    var price = isObject(addr.priceInfo) ? addr.priceInfo : {};
    var avm = isObject(addr.avmInfo) ? addr.avmInfo : {};
    var latLong = isObject(addr.latLong) ? addr.latLong : {};
    var media = isObject(p.mediaBrowserInfo) ? p.mediaBrowserInfo : {};
    var photos = media.photos;
    var photoCount = Array.isArray(photos) ? photos.length : (isObject(photos) ? Object.keys(photos).length : 0);
    return {
      property_id: numberValue(propertyId),
      street_address: stringValue(street.assembledAddress),
      city: stringValue(addr.city),
      state: stringValue(addr.state),
      zip: stringValue(addr.zip),
      beds: numberValue(addr.beds),
      baths: numberValue(addr.baths),
      sqft: numberValue(wrappedValue(addr.sqFt)),
      lot_size: numberValue(addr.lotSize),
      year_built: numberValue(addr.yearBuilt),
      property_type: numberValue(addr.propertyType),
      price_label: stringValue(price.label),
      price_amount: numberValue(price.amount),
      estimated_value: numberValue(avm.predictedValue),
      latitude: numberValue(latLong.latitude),
      longitude: numberValue(latLong.longitude),
      url: stringValue(addr.url),
      status_label: stringValue(addr.homeStatusLabel),
      photo_count: photoCount
    };
  }

  function mapHistoryEvent(raw) {
    var e = isObject(raw) ? raw : {};
    return {
      date: stringValue(e.eventDateString),
      description: stringValue(e.eventDescription),
      price: numberValue(e.priceDisplayLevel) === 1 ? numberValue(e.price) : 0,
      source: stringValue(e.source)
    };
  }

  function mapEstimate(payload) {
    var p = isObject(payload) ? payload : {};
    var street = isObject(p.streetAddress) ? p.streetAddress : {};
    return {
      predicted_value: numberValue(p.predictedValue),
      num_beds: numberValue(p.numBeds),
      num_baths: numberValue(p.numBaths),
      sqft: numberValue(wrappedValue(p.sqFt)),
      street_address: stringValue(street.assembledAddress)
    };
  }

  function mapComparable(raw) {
    var c = isObject(raw) ? raw : {};
    var street = isObject(c.streetAddress) ? c.streetAddress : {};
    return {
      property_id: numberValue(c.propertyId),
      street_address: stringValue(street.assembledAddress),
      beds: numberValue(c.beds),
      baths: numberValue(c.baths),
      sqft: numberValue(wrappedValue(c.sqFt)),
      price: numberValue(wrappedValue(c.lastSoldPrice)),
      predicted_value: numberValue(c.predictedValue)
    };
  }

  function mapFavoriteOnMarket(raw) {
    var f = isObject(raw) ? raw : {};
    var property = isObject(f.property) ? f.property : {};
    var address = isObject(f.address_data) ? f.address_data : {};
    return {
      property_id: numberValue(property.id || property.propertyId),
      street_address: stringValue(address.display || address.streetAddress),
      city: stringValue(address.city),
      state: stringValue(address.state),
      zip: stringValue(address.zip),
      price: numberValue(f.price),
      beds: numberValue(f.beds),
      baths: numberValue(f.baths),
      sqft: numberValue(f.sqft),
      year_built: numberValue(f.year_built),
      url: stringValue(f.URL),
      favorite_date: stringValue(f.favoriteDate),
      on_market: true
    };
  }

  function mapFavoriteOffMarket(raw) {
    var f = isObject(raw) ? raw : {};
    var address = isObject(f.address_data) ? f.address_data : {};
    var listing = isObject(f.listing) ? f.listing : {};
    return {
      property_id: numberValue(f.id),
      street_address: stringValue(address.streetAddress),
      city: stringValue(address.city),
      state: stringValue(address.state),
      zip: stringValue(address.zip),
      price: numberValue(listing.price),
      beds: numberValue(f.beds),
      baths: numberValue(f.baths),
      sqft: numberValue(f.sqft),
      year_built: numberValue(f.year_built),
      url: stringValue(f.URL),
      favorite_date: stringValue(f.favoriteDate),
      on_market: false
    };
  }

  function mapSchool(raw) {
    var s = isObject(raw) ? raw : {};
    return {
      name: stringValue(s.name),
      rating: numberValue(s.rating),
      grades: stringValue(s.gradeRanges),
      type: stringValue(s.schoolType),
      distance: stringValue(s.distance || (s.distanceInMiles !== undefined ? s.distanceInMiles + ' mi' : ''))
    };
  }

  function mapRiskFactor(type, raw) {
    var d = isObject(raw) ? raw : {};
    var summary = isObject(d.expandableSummary) ? d.expandableSummary : {};
    return {
      type: type,
      score: numberValue(d[type + 'Factor']),
      label: stringValue(d.expandableHeading),
      description: stringValue(summary.value)
    };
  }

  function mapComparableRental(raw) {
    var r = isObject(raw) ? raw : {};
    var home = isObject(r.homeData) ? r.homeData : {};
    var address = isObject(home.addressInfo) ? home.addressInfo : {};
    var ext = isObject(r.rentalExtension) ? r.rentalExtension : {};
    var beds = isObject(ext.bedRange) ? ext.bedRange : {};
    var baths = isObject(ext.bathRange) ? ext.bathRange : {};
    var rent = isObject(ext.rentPriceRange) ? ext.rentPriceRange : {};
    return {
      property_id: stringValue(home.propertyId),
      street_address: stringValue(address.formattedStreetLine),
      city: stringValue(address.city),
      state: stringValue(address.state),
      zip: stringValue(address.zip),
      beds_min: numberValue(beds.min),
      beds_max: numberValue(beds.max),
      baths_min: numberValue(baths.min),
      baths_max: numberValue(baths.max),
      rent_min: numberValue(rent.min),
      rent_max: numberValue(rent.max),
      description: stringValue(ext.description).slice(0, 300),
      url: stringValue(home.url)
    };
  }

  function mapUserProfile(raw) {
    var u = isObject(raw) ? raw : {};
    return {
      login_id: numberValue(u.loginId),
      first_name: stringValue(u.firstName),
      photo_url: stringValue(u.userPhotoUrl)
    };
  }

  function mapAmenities(payload) {
    var data = isObject(payload) ? payload : {};
    var info = isObject(data.amenitiesInfo) ? data.amenitiesInfo : {};
    var groups = [];
    var superGroups = arrayValue(info.superGroups);
    for (var i = 0; i < superGroups.length; i++) {
      var superGroup = isObject(superGroups[i]) ? superGroups[i] : {};
      var amenityGroups = arrayValue(superGroup.amenityGroups);
      for (var j = 0; j < amenityGroups.length; j++) {
        var group = isObject(amenityGroups[j]) ? amenityGroups[j] : {};
        var entries = arrayValue(group.amenityEntries);
        var amenities = [];
        for (var k = 0; k < entries.length; k++) {
          var item = isObject(entries[k]) ? entries[k] : {};
          amenities.push({
            name: stringValue(item.amenityName || item.referenceName),
            values: arrayValue(item.amenityValues).map(stringValue)
          });
        }
        if (amenities.length > 0) {
          groups.push({
            group_name: stringValue(group.groupTitle || superGroup.titleString),
            amenities: amenities
          });
        }
      }
    }
    return {
      groups: groups,
      total_amenities: numberValue(info.totalAmenities)
    };
  }

  function marketStatusFavorites(data, args) {
    var filter = stringValue(args && args.market_status) || 'all';
    var onMarket = arrayValue(data.onMarket).map(mapFavoriteOnMarket);
    var offMarket = arrayValue(data.offMarket).map(mapFavoriteOffMarket);
    var favorites = filter === 'on_market' ? onMarket : (filter === 'off_market' ? offMarket : onMarket.concat(offMarket));
    return {
      favorites: favorites,
      on_market_count: onMarket.length,
      off_market_count: offMarket.length
    };
  }

  function redfinRead(slug, params, path, pairsForArgs, mapper) {
    return {
      tier: 'T1a',
      origin: REDFIN_ORIGIN,
      sideEffectClass: 'read',
      params: params,
      async handle(args, ctx) {
        var payload = await readPayload(slug, ctx, path, pairsForArgs ? pairsForArgs(args || {}) : []);
        if (payload && payload.success === false) { return payload; }
        return { success: true, data: mapper ? mapper(payload || {}, args || {}) : (payload || {}) };
      }
    };
  }

  function propertyRead(slug, mapper) {
    return redfinRead(slug, PROPERTY_ID_PARAMS, '/stingray/api/home/details/aboveTheFold', function(args) {
      return [['propertyId', args.property_id], ['accessLevel', 3]];
    }, mapper);
  }

  var handlers = {
    'redfin.get_current_user': redfinRead(
      'redfin.get_current_user',
      EMPTY_PARAMS,
      '/stingray/do/api-get-header-user-menu',
      null,
      function(data) { return { user: mapUserProfile(isObject(data.data) ? data.data : {}) }; }
    ),
    'redfin.get_favorites': redfinRead(
      'redfin.get_favorites',
      FAVORITES_PARAMS,
      '/stingray/do/api-get-favorites',
      null,
      marketStatusFavorites
    ),
    'redfin.get_property_details': propertyRead(
      'redfin.get_property_details',
      function(data, args) { return { property: mapPropertyDetail(data, args.property_id) }; }
    ),
    'redfin.get_property_estimate': redfinRead(
      'redfin.get_property_estimate',
      PROPERTY_ID_PARAMS,
      '/stingray/api/home/details/avm',
      function(args) { return [['propertyId', args.property_id], ['accessLevel', 3]]; },
      function(data) { return { estimate: mapEstimate(data), comparables: arrayValue(data.comparables).map(mapComparable) }; }
    ),
    'redfin.get_property_amenities': redfinRead(
      'redfin.get_property_amenities',
      PROPERTY_ID_PARAMS,
      '/stingray/api/home/details/belowTheFold',
      function(args) { return [['propertyId', args.property_id], ['accessLevel', 3]]; },
      mapAmenities
    ),
    'redfin.get_property_history': redfinRead(
      'redfin.get_property_history',
      PROPERTY_ID_PARAMS,
      '/stingray/api/home/details/belowTheFold',
      function(args) { return [['propertyId', args.property_id], ['accessLevel', 3]]; },
      function(data) {
        var info = isObject(data.propertyHistoryInfo) ? data.propertyHistoryInfo : {};
        return {
          events: arrayValue(info.events).map(mapHistoryEvent),
          has_history: boolValue(info.hasPropertyHistory)
        };
      }
    ),
    'redfin.get_property_parcel_info': redfinRead(
      'redfin.get_property_parcel_info',
      PROPERTY_ID_PARAMS,
      '/stingray/api/home/details/propertyParcelInfo',
      function(args) { return [['propertyId', args.property_id], ['accessLevel', 3]]; },
      function(data) {
        var latLong = isObject(data.latLong) ? data.latLong : {};
        return {
          fips_code: stringValue(data.fipsCode),
          apn: stringValue(data.apn),
          latitude: numberValue(latLong.latitude),
          longitude: numberValue(latLong.longitude),
          time_zone: stringValue(data.timeZone)
        };
      }
    ),
    'redfin.get_property_risk_factors': redfinRead(
      'redfin.get_property_risk_factors',
      PROPERTY_ID_PARAMS,
      '/stingray/api/home/details/belowTheFold',
      function(args) { return [['propertyId', args.property_id], ['accessLevel', 3]]; },
      function(data) {
        var risks = isObject(data.riskFactorData) ? data.riskFactorData : {};
        return {
          risk_factors: [
            mapRiskFactor('flood', risks.floodData),
            mapRiskFactor('fire', risks.fireData),
            mapRiskFactor('heat', risks.heatData),
            mapRiskFactor('wind', risks.windData),
            mapRiskFactor('air', risks.airData)
          ]
        };
      }
    ),
    'redfin.get_property_schools': redfinRead(
      'redfin.get_property_schools',
      PROPERTY_ID_PARAMS,
      '/stingray/api/home/details/belowTheFold',
      function(args) { return [['propertyId', args.property_id], ['accessLevel', 3]]; },
      function(data) {
        var info = isObject(data.schoolsAndDistrictsInfo) ? data.schoolsAndDistrictsInfo : {};
        return {
          schools: arrayValue(info.servingThisHomeSchools).map(mapSchool),
          total_schools: numberValue(info.totalSchoolsServiced)
        };
      }
    ),
    'redfin.search_locations': redfinRead(
      'redfin.search_locations',
      LOCATION_PARAMS,
      '/stingray/do/location-autocomplete',
      function(args) { return [['location', args.query], ['v', 2], ['count', args.count === undefined ? 10 : args.count]]; },
      function(data) {
        var rows = [];
        if (isObject(data.exactMatch)) { rows.push(data.exactMatch); }
        var sections = arrayValue(data.sections);
        for (var i = 0; i < sections.length; i++) {
          var section = isObject(sections[i]) ? sections[i] : {};
          var sectionRows = arrayValue(section.rows);
          for (var j = 0; j < sectionRows.length; j++) { rows.push(sectionRows[j]); }
        }
        return { locations: rows.map(mapLocation) };
      }
    ),
    'redfin.search_properties': redfinRead(
      'redfin.search_properties',
      SEARCH_PARAMS,
      '/stingray/api/gis',
      function(args) {
        return [
          ['al', 1],
          ['region_id', args.region_id],
          ['region_type', args.region_type],
          ['num_homes', args.num_homes === undefined ? 20 : args.num_homes],
          ['status', args.status === undefined ? 9 : args.status],
          ['sf', args.property_type || '1,2,3,4,5,6,7'],
          ['min_price', args.min_price],
          ['max_price', args.max_price],
          ['min_beds', args.min_beds],
          ['max_beds', args.max_beds],
          ['min_baths', args.min_baths],
          ['min_sqft', args.min_sqft],
          ['max_sqft', args.max_sqft]
        ];
      },
      function(data) {
        var median = isObject(data.searchMedian) ? data.searchMedian : {};
        return {
          properties: arrayValue(data.homes).map(mapPropertyListing),
          median_price: numberValue(median.homePrice),
          median_sqft: numberValue(median.sqFt),
          median_dom: numberValue(median.dom)
        };
      }
    ),
    'redfin.get_comparable_rentals': redfinRead(
      'redfin.get_comparable_rentals',
      COMPARABLE_RENTALS_PARAMS,
      '/stingray/api/home/comparable-rentals',
      function(args) {
        var estimate = args.rent_estimate === undefined ? 3000 : args.rent_estimate;
        return [
          ['propertyId', args.property_id],
          ['latitude', args.latitude],
          ['longitude', args.longitude],
          ['rentEstimateLow', estimate],
          ['rentEstimateHigh', estimate]
        ];
      },
      function(data) {
        return {
          rentals: arrayValue(data.homes).map(mapComparableRental),
          total_matched: numberValue(data.numMatchedHomes)
        };
      }
    )
  };

  if (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog
      && typeof FsbCapabilityCatalog.registerHandler === 'function') {
    for (var slug in handlers) {
      if (Object.prototype.hasOwnProperty.call(handlers, slug)) {
        FsbCapabilityCatalog.registerHandler(slug, {
          tier: 'T1a',
          handler: handlers[slug],
          origin: handlers[slug].origin,
          params: handlers[slug].params,
          descriptor: {
            slug: slug,
            service: REDFIN_SERVICE,
            sideEffectClass: handlers[slug].sideEffectClass,
            params: handlers[slug].params
          }
        });
      }
    }
  }

  global.FsbHandlerRedfin = handlers;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = handlers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
