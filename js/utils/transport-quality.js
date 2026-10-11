// GTFS speeds are m/s. Estimate interval-average speed using observation time,
// not receipt time, so repeated polls cannot manufacture movement or acceleration.
export function distanceMetres(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function classifyRoute(routeId) {
  const r = String(routeId ?? '').toUpperCase();
  if (r.includes('FERRY')) return 'ferry';
  if (['EAST', 'WEST', 'SOUTH', 'ONE', 'PUK'].some(t => r.includes(t))) return 'train';
  return 'unknown'; // Bus-like route codes alone do not reliably identify mode.
}

export function observationTime(value) {
  const time = Number(value);
  return Number.isFinite(time) && time > 0 ? (time < 1e12 ? time * 1000 : time) : null;
}

export class TransportQuality {
  constructor() { this.history = new Map(); }

  process(vehicles, now = Date.now()) {
    const seen = new Set();
    const result = vehicles.map(vehicle => {
      seen.add(vehicle.id);
      return this.processVehicle(vehicle, now);
    });
    // Keep state through brief feed dropouts, but bound its lifetime.
    for (const [id, entry] of this.history) {
      if (!seen.has(id) && now - entry.receivedAt > 180_000) this.history.delete(id);
    }
    return result;
  }

  processVehicle(vehicle, now) {
    const timestamp = observationTime(vehicle.timestamp);
    const previous = this.history.get(vehicle.id);
    const fresh = timestamp !== null && now - timestamp <= 120_000 && timestamp <= now + 10_000;
    const base = { ...vehicle, timestamp, speed: null, speedSource: 'unavailable',
      speedNote: 'Waiting for two recent GPS observations', positionQuality: 'observed' };
    if (!fresh) return { ...base, speedNote: timestamp ? 'Observation is stale or has an invalid time' : 'Observation time is missing' };

    if (previous && timestamp <= previous.timestamp) {
      // Preserve an established estimate only while the underlying observation is fresh.
      return { ...base, position: previous.position, speed: previous.speed,
        speedSource: previous.speed === null ? 'unavailable' : 'estimated',
        speedNote: timestamp < previous.timestamp ? 'Older GPS update ignored' : previous.speedNote,
        timestamp: previous.timestamp };
    }

    let speed = null;
    let speedNote = base.speedNote;
    if (previous) {
      const dt = (timestamp - previous.timestamp) / 1000;
      const distance = distanceMetres(previous.position, vehicle.position);
      // Broad plausibility ceilings, not road speed limits. Unknown modes use
      // the existing conservative 140 km/h ceiling without claiming a bus type.
      const mode = classifyRoute(vehicle.routeId);
      const maxSpeed = mode === 'ferry' ? 25 : mode === 'train' ? 45 : 38.9;
      const derived = distance <= 12 ? 0 : distance / dt;
      const acceleration = previous.speed === null ? 0 : Math.abs(derived - previous.speed) / dt;
      const jump = dt < 5 || derived > maxSpeed || acceleration > 3.5;
      if (jump && dt <= 120) {
        // Do not drag trails or the camera across a bad fix. Keeping the last good
        // anchor lets the next valid observation recover without a return spike.
        const reanchor = now - previous.receivedAt > 120_000;
        if (!reanchor) return { ...base, position: previous.position, timestamp: previous.timestamp,
          positionQuality: 'rejected', speedNote: 'GPS jump rejected; speed unavailable' };
      } else if (dt <= 120) {
        const samples = [...previous.samples, derived].slice(-3);
        // The median rejects isolated speed outliers; a genuine stop takes effect
        // immediately instead of lingering at the previous moving speed.
        speed = derived === 0 ? 0 : [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
        speedNote = 'GPS estimate · recent observation intervals';
        base.samples = samples;
      }
    }
    this.history.set(vehicle.id, { position: vehicle.position, timestamp, speed,
      speedNote, samples: base.samples ?? [], receivedAt: now });
    delete base.samples;
    return { ...base, speed, speedSource: speed === null ? 'unavailable' : 'estimated', speedNote };
  }
}
