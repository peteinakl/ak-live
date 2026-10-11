// Render received observations smoothly by stable entity ID; never extrapolate.
export class MotionStore {
  constructor(duration = 10_000) {
    this.duration = duration;
    this.entries = new Map();
  }

  update(entities, key, now = performance.now(), reducedMotion = false) {
    const seen = new Set();
    for (const entity of entities) {
      const id = entity[key];
      seen.add(id);
      const previous = this.entries.get(id);
      const from = previous ? this.sample(previous, now) : entity;
      const jump = entity.positionQuality === 'rejected';
      this.entries.set(id, {
        entity, from: from.position, fromHeading: from.heading ?? from.bearing ?? 0,
        start: now, duration: reducedMotion || !previous || jump ? 0 : this.duration,
      });
    }
    for (const id of this.entries.keys()) if (!seen.has(id)) this.entries.delete(id);
  }

  sample(entry, now) {
    const t = entry.duration ? Math.min(1, Math.max(0, (now - entry.start) / entry.duration)) : 1;
    const targetHeading = entry.entity.heading ?? entry.entity.bearing ?? 0;
    const arc = ((targetHeading - entry.fromHeading + 540) % 360) - 180;
    return {
      ...entry.entity,
      position: entry.from.map((value, i) => value + (entry.entity.position[i] - value) * t),
      heading: (entry.fromHeading + arc * t + 360) % 360,
      bearing: (entry.fromHeading + arc * t + 360) % 360,
    };
  }

  get(now = performance.now()) {
    return [...this.entries.values()].map(entry => this.sample(entry, now));
  }

  isAnimating(now = performance.now()) {
    return [...this.entries.values()].some(entry => now < entry.start + entry.duration);
  }

  finish() {
    for (const entry of this.entries.values()) entry.duration = 0;
  }
}
