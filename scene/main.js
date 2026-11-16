import * as THREE from 'three';

import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';

import {
  TilesRenderer
} from '3d-tiles-renderer/three';

import {
  loadCoffeeMachine
} from './station.js';

import {
  bindTwin
} from './twin.js';


export const params =
  new URLSearchParams(
    location.search
  );


export const opt =
  new Set(
    (params.get('opt') ?? '')
      .split(',')
      .filter(Boolean)
  );


let errorTarget =
  Number(
    params.get('error')
  ) || 16;


export const renderer =
  new THREE.WebGLRenderer({
    antialias: true
  });


renderer.setPixelRatio(
  devicePixelRatio
);

renderer.setSize(
  innerWidth,
  innerHeight
);

document.body.append(
  renderer.domElement
);


export const scene =
  new THREE.Scene();


scene.background =
  new THREE.Color(
    0xd9e2e8
  );


const VIEWS = {
  near: {
    eye: [-6, 2.2, 1],
    look: [-6, 1.3, -4]
  },

  hall: {
    eye: [11, 8, 13],
    look: [0, 1.2, 0]
  },

  far: {
    eye: [60, 35, 60],
    look: [0, 0, 0]
  }
};


const selectedView =
  VIEWS[
    params.get('view')
  ] ??
  VIEWS.near;


export const camera =
  new THREE.PerspectiveCamera(
    60,
    innerWidth / innerHeight,
    0.1,
    4000
  );


camera.position.set(
  ...selectedView.eye
);


export const controls =
  new OrbitControls(
    camera,
    renderer.domElement
  );


controls.target.set(
  ...selectedView.look
);

controls.enableDamping =
  true;

controls.update();


scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x444444,
    2
  )
);


const sun =
  new THREE.DirectionalLight(
    0xffffff,
    3
  );


sun.position.set(
  10,
  15,
  8
);


scene.add(
  sun
);


export const tiles =
  new TilesRenderer(
    'tiles/site/v1/tileset.json'
  );


tiles.errorTarget =
  errorTarget;


tiles.lruCache.minBytesSize =
  24 * 2 ** 20;

tiles.lruCache.maxBytesSize =
  32 * 2 ** 20;


tiles.setCamera(
  camera
);


tiles.setResolutionFromRenderer(
  camera,
  renderer
);


tiles.group.rotation.x =
  -Math.PI / 2;


scene.add(
  tiles.group
);


const grid =
  new THREE.GridHelper(
    30,
    30
  );


grid.position.y =
  0.02;


scene.add(
  grid
);


export const station =
  await loadCoffeeMachine(
    scene,
    opt
  );


if (
  params.get('cull') === '0'
) {
  scene.traverse(
    object => {
      object.frustumCulled =
        false;
    }
  );
}


bindTwin(station).catch(error => {
  document.getElementById('connection').textContent = 'Телеметрія недоступна';
  console.warn(error);
});


const distanceElement =
  document.getElementById(
    'distance'
  );

const lodElement =
  document.getElementById(
    'lod'
  );

const statsElement =
  document.getElementById(
    'stats'
  );

const tileStatsElement =
  document.getElementById(
    'tile-stats'
  );

const error16Button =
  document.getElementById(
    'error16'
  );

const error32Button =
  document.getElementById(
    'error32'
  );


function updateButtons() {
  error16Button.classList.toggle(
    'active',
    errorTarget === 16
  );

  error32Button.classList.toggle(
    'active',
    errorTarget === 32
  );
}


function setErrorTarget(value) {
  errorTarget =
    value;

  tiles.errorTarget =
    value;

  updateButtons();
}


error16Button.addEventListener(
  'click',
  () => {
    setErrorTarget(16);
  }
);


error32Button.addEventListener(
  'click',
  () => {
    setErrorTarget(32);
  }
);


updateButtons();


function currentLod(
  distance
) {
  if (
    distance < 5
  ) {
    return 'LOD0 detailed';
  }

  if (
    distance < 15
  ) {
    return 'LOD1 simplified';
  }

  if (
    distance < 35
  ) {
    return 'LOD2 box';
  }

  return 'culled';
}

export const hooks =
  [];


let frames =
  0;


export function frame(
  time
) {
  controls.update();


  camera.updateMatrixWorld();


  if (
    frames > 0 ||
    !opt.has('defer')
  ) {
    tiles.update();
  }


  for (
    const hook of hooks
  ) {
    hook(
      time
    );
  }


  const distance =
    camera.position.distanceTo(
      station.primary.position
    );


  distanceElement.textContent =
    `Distance: ${distance.toFixed(1)} m`;


  if (
    opt.has('inst')
  ) {
    lodElement.textContent =
      'LOD: group instanced';
  } else {
    lodElement.textContent =
      `LOD: ${currentLod(distance)}`;
  }


  renderer.render(
    scene,
    camera
  );


  if (
    frames++ === 0
  ) {
    performance.mark(
      'first-frame'
    );


    station.afterFirstFrame().catch(console.warn);
  }


  const {
    calls,
    triangles
  } =
    renderer.info.render;


  statsElement.textContent =
    `Calls: ${calls} · ` +
    `Triangles: ${triangles}`;


  const tileStats =
    tiles.stats;


  tileStatsElement.textContent =
    `3D Tiles ρmax=${errorTarget} · ` +
    `visible: ${tiles.visibleTiles.size} · ` +
    `cache: ${tileStats.inCache} · ` +
    `downloading: ${tileStats.downloading}`;
}


renderer.setAnimationLoop(
  frame
);


addEventListener(
  'resize',
  () => {
    camera.aspect =
      innerWidth /
      innerHeight;


    camera.updateProjectionMatrix();


    renderer.setSize(
      innerWidth,
      innerHeight
    );


    tiles.setResolutionFromRenderer(
      camera,
      renderer
    );
  }
);

if (
  params.has('bench')
) {
  import(
    './bench.js'
  );
}

if (
  params.has('name')
) {
  import(
    './net.js'
  );
}