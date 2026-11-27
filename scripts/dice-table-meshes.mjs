export const MESH_DICE = Object.freeze([2, 4, 8, 10, 12, 20, 100]);

const SIGNS = [-1, 1];
const EPSILON = 1e-6;
const PHI = (1 + Math.sqrt(5)) / 2;
const meshes = new Map();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a, b) => a.map((v, index) => v - b[index]);
const cross = ([a, b, c], [x, y, z]) => [b * z - c * y, c * x - a * z, a * y - b * x];
const length = vector => Math.hypot(...vector);
const unit = vector => {
  const magnitude = length(vector);
  return vector.map(value => value / magnitude);
};
const mean = points => [0, 1, 2].map(i => points.reduce((sum, point) => sum + point[i], 0) / points.length);

function faceBasis(normal) {
  const up = Math.abs(normal[1]) > .94 ? [0, 0, -1] : [0, -1, 0];
  const x = unit(cross(normal, up));
  return [x, cross(normal, x), normal];
}

function convexFaces(vertices) {
  const faces = new Map();
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      for (let k = j + 1; k < vertices.length; k++) {
        const vector = cross(minus(vertices[j], vertices[i]), minus(vertices[k], vertices[i]));
        if (length(vector) < EPSILON) continue;
        let normal = unit(vector);
        const distances = vertices.map(point => dot(normal, minus(point, vertices[i])));
        const positive = distances.some(distance => distance > EPSILON);
        if (positive && distances.some(distance => distance < -EPSILON)) continue;
        if (positive) normal = normal.map(value => -value);
        const indices = distances.flatMap((distance, index) => Math.abs(distance) < EPSILON ? [index] : []);
        const key = indices.join(",");
        if (!faces.has(key)) faces.set(key, {normal, points: indices.map(index => vertices[index]), numbered: true});
      }
    }
  }
  return [...faces.values()];
}

function coinMesh() {
  const sides = 24;
  const rim = Array.from({length: sides}, (_, i) => {
    const angle = i * 2 * Math.PI / sides;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const front = rim.map(([x, y]) => [x, y, .14]);
  const back = rim.map(([x, y]) => [x, y, -.14]);
  return [
    {normal: [0, 0, 1], points: front, numbered: true},
    {normal: [0, 0, -1], points: back, numbered: true},
    ...rim.map((_, i) => {
      const next = (i + 1) % sides;
      const angle = (i + .5) * 2 * Math.PI / sides;
      return {normal: [Math.cos(angle), Math.sin(angle), 0], points: [front[i], front[next], back[next], back[i]], numbered: false};
    })
  ];
}

function verticesFor(faces) {
  const triples = (a, b) => SIGNS.flatMap(i => SIGNS.flatMap(j => [[0, i * a, j * b], [j * b, 0, i * a], [i * a, j * b, 0]]));
  const cube = SIGNS.flatMap(x => SIGNS.flatMap(y => SIGNS.map(z => [x, y, z])));
  switch (faces) {
    case 4: return cube.filter(([x, y, z]) => x * y * z === 1);
    case 8: return SIGNS.flatMap(sign => [[sign, 0, 0], [0, sign, 0], [0, 0, sign]]);
    case 10: {
      // Alternating-height ring vertices meet the poles in ten coplanar kites.
      const height = .116;
      const c = Math.cos(Math.PI / 5);
      const pole = height * (1 + c) / (1 - c);
      return [
        ...Array.from({length: 10}, (_, i) => [Math.cos(i * Math.PI / 5), Math.sin(i * Math.PI / 5), i % 2 ? height : -height]),
        [0, 0, pole], [0, 0, -pole]
      ];
    }
    case 12: return [...cube, ...triples(1 / PHI, PHI)];
    case 20: return triples(1, PHI);
  }
}

function meshFor(faces) {
  if (!meshes.has(faces)) {
    const surfaces = faces === 2 ? coinMesh() : convexFaces(verticesFor(faces));
    const radius = Math.max(...surfaces.flatMap(face => face.points.map(length)));
    meshes.set(faces, {surfaces, radius});
  }
  return meshes.get(faces);
}

export function diceMeshParts(die, label, faceLabels) {
  if (!MESH_DICE.includes(die.faces)) return [];
  if (die.faces !== 100) return [{faces: die.faces, label,
    ...(faceLabels ? {faceLabels, faceIndex: die.value - 1} : {})}];
  if (!Number.isInteger(die.value) || die.value < 1 || die.value > 100 || label !== String(die.value)) {
    return [{faces: 10, label}];
  }
  const result = die.value % 100;
  return [
    {faces: 10, label: String(Math.floor(result / 10) * 10).padStart(2, "0"), percentile: "tens"},
    {faces: 10, label: String(result % 10), percentile: "ones"}
  ];
}

export function layoutDiceMesh({faces, label, percentile, faceLabels, faceIndex}, size) {
  const {surfaces, radius} = meshFor(faces);
  const labels = faceLabels ? [...faceLabels] : Array.from({length: faces}, (_, i) => {
    if (percentile === "tens") return String(i * 10).padStart(2, "0");
    return String(percentile === "ones" ? i : i + 1);
  });
  const resultIndex = faceIndex ?? Math.max(0, labels.indexOf(label));
  labels[resultIndex] = label;
  const view = faceBasis(surfaces[resultIndex].normal);
  const rotate = point => view.map(axis => dot(axis, point));
  const scale = size * .51 / radius;
  return surfaces.map(({normal, points, numbered}, index) => {
    const n = rotate(normal);
    const basis = faceBasis(n);
    const center = rotate(mean(points)).map(value => value * scale);
    const polygon = points.map(point => {
      const offset = minus(rotate(point).map(value => value * scale), center);
      return basis.slice(0, 2).map(axis => dot(axis, offset));
    }).sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
    return {basis, center, polygon, label: numbered ? labels[index] : "", rim: !numbered, result: index === resultIndex};
  });
}
