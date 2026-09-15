export const ROLES = { employee: '社員', guest: 'お客様', delivery: '配達' };
export const validVector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

export function matchFace(vector, people) {
  if (!validVector(vector, 128)) return null;
  const ranked = people.filter(p => ROLES[p.role]).map(p => {
    const samples = (p.descriptors || []).filter(v => validVector(v, 128));
    const centroid = samples.length ? samples[0].map((_, i) => samples.reduce((sum, v) => sum + v[i], 0) / samples.length) : null;
    return { person: p, distance: Math.min(...samples.map(v => distance(vector, v)), centroid ? distance(vector, centroid) : Infinity) };
  }).sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  // A conservative threshold and a margin against other registered people.
  if (!best || best.distance > 0.45 || (ranked[1] && ranked[1].distance - best.distance < 0.08)) return null;
  return { ...best.person, source: 'face', distance: best.distance };
}

export function clothingSignature(pixels) {
  const bins = Array(19).fill(0);
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]].map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!max || d / max < 0.18) { bins[max > 0.75 ? 16 : max < 0.3 ? 18 : 17]++; continue; }
    let hue = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    bins[Math.floor(hue / 22.5)]++;
  }
  const norm = Math.hypot(...bins);
  return norm ? bins.map(v => v / norm) : null;
}

export function matchClothing(vector, uniforms) {
  if (!validVector(vector, 19)) return null;
  // Plain white/gray/black tops alone are not evidence of delivery work.
  if (Math.hypot(...vector.slice(0, 16)) < 0.25) return null;
  const ranked = uniforms.map(p => ({ person: p, score: Math.max(...p.signatures
    .filter(v => validVector(v, 19)).map(v => v.reduce((sum, x, i) => sum + x * vector[i], 0)))
  })).sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score < 0.94 || (ranked[1] && ranked[0].score - ranked[1].score < 0.04)) return null;
  return { ...ranked[0].person, role: 'delivery', source: 'clothing' };
}

export function greetingForIdentity(person, defaultKey) {
  if (!person) return defaultKey;
  if (person.source === 'clothing' || person.role === 'delivery') return 'calling';
  // Only explicit, registered names may select an existing name-specific recording.
  const name = person.name.normalize('NFKC').replace(/\s/g, '').replace(/さん$/, '');
  if (person.role === 'employee') {
    if (name === '佐藤') return 'employeeSato';
    if (name === '田中') return 'employeeTanaka';
    return 'employeeGeneric';
  }
  if (name === '福田') return ({ greetingMorningArrival: 'fukudaMorning', greetingDayArrival: 'fukudaDay', greetingEveningArrival: 'fukudaEvening' })[defaultKey] || 'visitor';
  return 'visitor';
}

export function receptionPlan(person, defaultKey, demoKey = null) {
  const role = demoKey?.startsWith('employee') ? 'employee'
    : demoKey === 'calling' ? 'delivery'
      : person?.source === 'clothing' ? 'delivery' : person?.role || 'guest';
  const named = !demoKey && person?.source === 'face';
  const greeting = demoKey || (named ? role === 'employee' ? 'employeeGeneric' : role === 'delivery' ? 'calling' : 'visitor' : greetingForIdentity(person, defaultKey));
  return {
    role,
    identity: named ? person : null,
    // Registered guests already have a complete greeting; do not ask their purpose twice.
    greeting: named ? ['registeredName', greeting] : !person && !demoKey ? ['welcome', greeting] : [greeting],
    idle: role === 'guest' ? ['idleRequest', 'idleServices', 'idleAppointment'] : [],
    goodbye: role === 'employee' ? 'employeeGoodbye' : 'goodbye',
  };
}
