import * as THREE from 'three';

import {
  GLTFLoader
} from 'three/addons/loaders/GLTFLoader.js';


const loader =
  new GLTFLoader();


const SLOTS = [
  [-6, 0, -4],
  [-2, 0, -4],
  [ 2, 0, -4],
  [ 6, 0, -4],

  [-6, 0,  4],
  [-2, 0,  4],
  [ 2, 0,  4],
  [ 6, 0,  4]
];


function elementOf(object) {
  while (
    object &&
    object.userData.element === undefined
  ) {
    object =
      object.parent;
  }

  return object?.userData.element;
}


function createBox(model) {
  const bounds =
    new THREE.Box3()
      .setFromObject(model);

  const size =
    bounds.getSize(
      new THREE.Vector3()
    );

  const center =
    bounds.getCenter(
      new THREE.Vector3()
    );


  const geometry =
    new THREE.BoxGeometry(
      size.x,
      size.y,
      size.z
    );

  geometry.translate(
    center.x,
    center.y,
    center.z
  );


  return new THREE.Mesh(
    geometry,

    new THREE.MeshStandardMaterial({
      color: 0x777777
    })
  );
}


function createInstanced(model) {
  const group =
    new THREE.Group();

  const matrix =
    new THREE.Matrix4();

  const translation =
    new THREE.Matrix4();


  model.updateMatrixWorld(
    true
  );


  model.traverse(object => {
    if (!object.isMesh) {
      return;
    }


    const mesh =
      new THREE.InstancedMesh(
        object.geometry,
        object.material.clone(),
        SLOTS.length
      );


    mesh.name =
      elementOf(object) ?? '';


    const baseColor =
      object.material.color
        ?.clone() ??
      new THREE.Color(0xffffff);


    mesh.material.color.set(
      0xffffff
    );


    SLOTS.forEach(
      (position, index) => {
        translation.makeTranslation(
          ...position
        );

        matrix.multiplyMatrices(
          translation,
          object.matrixWorld
        );

        mesh.setMatrixAt(
          index,
          matrix
        );

        mesh.setColorAt(
          index,
          baseColor
        );
      }
    );


    mesh.instanceMatrix.needsUpdate =
      true;

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate =
        true;
    }


    group.add(
      mesh
    );
  });


  return group;
}


function replaceLevel0(
  lod,
  object
) {
  const old =
    lod.levels[0].object;

  lod.remove(
    old
  );

  lod.levels[0].object =
    object;

  lod.add(
    object
  );
}


export async function loadCoffeeMachine(
  scene,
  opt = new Set()
) {
  const lod1Url =
    'models/coffee-machine-lod1.glb';

  const detailUrl =
    opt.has('simp')
      ? lod1Url
      : 'models/coffee-machine.glb';


  const lod1Result =
    await loader.loadAsync(
      lod1Url
    );

  const lod1 =
    lod1Result.scene;


  let detail =
    null;


  if (!opt.has('defer')) {
    if (detailUrl === lod1Url) {
      detail =
        lod1;
    } else {
      detail =
        (
          await loader.loadAsync(
            detailUrl
          )
        ).scene;
    }
  }


  const initialDetail =
    detail ?? lod1;


  const box =
    createBox(
      lod1
    );


  const group =
    new THREE.Group();

  group.name =
    'coffee-machines';


  const primary =
    new THREE.Object3D();

  primary.position.set(
    ...SLOTS[0]
  );


  if (opt.has('inst')) {
    const lod =
      new THREE.LOD();

    lod.name =
      'machines-instanced';


    lod.addLevel(
      createInstanced(
        initialDetail
      ),
      0
    );


    lod.addLevel(
      createInstanced(
        lod1
      ),
      10,
      0.1
    );


    lod.addLevel(
      createInstanced(
        box
      ),
      30,
      0.1
    );


    lod.addLevel(
      new THREE.Object3D(),
      70
    );


    group.add(
      lod
    );
  } else {
    SLOTS.forEach(
      (position, index) => {
        const lod =
          new THREE.LOD();

        lod.name =
          `machine-${index + 1}`;


        lod.addLevel(
          initialDetail.clone(true),
          0
        );


        lod.addLevel(
          lod1.clone(true),
          5,
          0.1
        );


        lod.addLevel(
          box.clone(),
          15,
          0.1
        );


        lod.addLevel(
          new THREE.Object3D(),
          35
        );


        lod.position.set(
          ...position
        );


        group.add(
          lod
        );
      }
    );
  }


  scene.add(
    group
  );


  const colors = new Map();

  function paint(
    unit,
    element,
    color,
    remember = true
  ) {
    const machineIndex =
      Number(
        unit.split('-')[1]
      ) - 1;


    if (
      machineIndex < 0 ||
      machineIndex >= SLOTS.length
    ) {
      return false;
    }


    if (remember) colors.set(`${unit}:${element}`, { unit, element, color: color.clone() });

    let found = false;


    if (opt.has('inst')) {
      group.traverse(object => {
        if (
          !object.isInstancedMesh ||
          object.name !== element
        ) {
          return;
        }


        object.setColorAt(
          machineIndex,
          color
        );


        if (object.instanceColor) {
          object.instanceColor.needsUpdate =
            true;
        }


        found =
          true;
      });


      return found;
    }


    const machine =
      group.getObjectByName(
        unit
      );


    if (!machine) {
      return false;
    }


    machine.traverse(object => {
      if (
        !object.isMesh ||
        elementOf(object) !== element
      ) {
        return;
      }


      if (!object.userData.ownMaterial) {
        object.material =
          object.material.clone();

        object.userData.ownMaterial =
          true;
      }


      object.material.color.copy(
        color
      );


      found =
        true;
    });


    return found;
  }


  async function afterFirstFrame() {
    if (!opt.has('defer')) {
      return;
    }


    if (detailUrl === lod1Url) {
      return;
    }


    const result =
      await loader.loadAsync(
        detailUrl
      );

    const loadedDetail =
      result.scene;


    if (opt.has('inst')) {
      const lod =
        group.children[0];

      replaceLevel0(
        lod,
        createInstanced(
          loadedDetail
        )
      );

    } else {
      for (const lod of group.children) {
        replaceLevel0(lod, loadedDetail.clone(true));
      }
    }

    for (const { unit, element, color } of colors.values()) {
      paint(unit, element, color, false);
    }
  }


  return {
    group,
    primary,
    paint,
    afterFirstFrame
  };
}