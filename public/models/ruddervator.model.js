/* flight-recall-model */
// PLACEHOLDER: replace this file with your own ruddervator.model.js (same name) in public/models/.
export default {
  name: 'Ruddervator (V-Tail)',
  category: 'Control Surfaces',
  sub: 'Ruddervators',
  info: 'Placeholder model. Copy your real model file over this one.',
  adjusters: [
    { id: 'left', label: 'Left surface', min: -30, max: 30, value: 0, unit: '°', sweep: true },
    { id: 'right', label: 'Right surface', min: -30, max: 30, value: 0, unit: '°', sweep: true }
  ],
  parts: [
    { id: 'wing', label: 'Fixed wing', info: 'The main lifting surface' },
    { id: 'l', label: 'Left control surface', info: 'Positive = trailing edge down' },
    { id: 'r', label: 'Right control surface', info: 'Positive = trailing edge down' }
  ],
  build(THREE) {
    const g = new THREE.Group();
    const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: .6 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, .06, .7), mat(0xcf5f27)); wing.userData.part = 'wing'; g.add(wing);
    const mk = (side, id) => {
      const pivot = new THREE.Group(); pivot.position.set(side * .6, 0, .35); pivot.userData.ex = [0, 0, .5];
      const s = new THREE.Mesh(new THREE.BoxGeometry(.9, .05, .25), mat(0x4b8a5a)); s.position.z = .125; s.userData.part = id; pivot.add(s);
      pivot.userData.part = id; pivot.name = id; g.add(pivot); return pivot;
    };
    g.userData.L = mk(-1, 'l'); g.userData.R = mk(1, 'r');
    return g;
  },
  update(g, v) { g.userData.L.rotation.x = (v.left || 0) * Math.PI / 180; g.userData.R.rotation.x = (v.right || 0) * Math.PI / 180; },
  readout: v => [['Left', (v.left || 0) + '°'], ['Right', (v.right || 0) + '°']]
};
