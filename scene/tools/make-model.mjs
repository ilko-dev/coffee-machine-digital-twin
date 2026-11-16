import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdirSync, writeFileSync } from 'node:fs';

const SEGMENTS = 96;

function box(width, height, depth) {
  return new THREE.BoxGeometry(width, height, depth);
}

function cylinder(radius, height, segments = SEGMENTS) {
  return new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    segments
  );
}

function at(geometry, x, y, z) {
  geometry.translate(x, y, z);
  return geometry;
}

async function createModel() {
  const doc = new Document();
  const buffer = doc.createBuffer();

  const scene = doc.createScene('CoffeeMachine');
  const root = doc.createNode('coffee-machine');

  scene.addChild(root);

  const accessor = (array, type) =>
    doc.createAccessor()
      .setArray(array)
      .setType(type)
      .setBuffer(buffer);

  const material = (
    name,
    rgb,
    metallic = 0.2,
    roughness = 0.6
  ) =>
    doc.createMaterial(name)
      .setBaseColorFactor([...rgb, 1])
      .setMetallicFactor(metallic)
      .setRoughnessFactor(roughness);

  function part(name, geometry, mat) {
    const attributes = geometry.attributes;

    const primitive = doc
      .createPrimitive()
      .setMaterial(mat)
      .setAttribute(
        'POSITION',
        accessor(attributes.position.array, 'VEC3')
      )
      .setAttribute(
        'NORMAL',
        accessor(attributes.normal.array, 'VEC3')
      );

    if (attributes.uv) {
      primitive.setAttribute(
        'TEXCOORD_0',
        accessor(attributes.uv.array, 'VEC2')
      );
    }

    if (geometry.index) {
      primitive.setIndices(
        accessor(
          new Uint32Array(geometry.index.array),
          'SCALAR'
        )
      );
    }

    const mesh = doc
      .createMesh(name)
      .addPrimitive(primitive);

    root.addChild(
      doc.createNode(name)
        .setMesh(mesh)
        .setExtras({ element: name })
    );
  }

  const dark = material(
    'body',
    [0.13, 0.14, 0.16],
    0.25,
    0.5
  );

  const steel = material(
    'steel',
    [0.55, 0.58, 0.62],
    0.75,
    0.3
  );

  const blue = material(
    'water',
    [0.12, 0.42, 0.82],
    0.05,
    0.35
  );

  const red = material(
    'heater',
    [0.78, 0.18, 0.1],
    0.25,
    0.45
  );

  const green = material(
    'pump',
    [0.15, 0.6, 0.25],
    0.3,
    0.45
  );

  const orange = material(
    'brewing',
    [0.85, 0.48, 0.08],
    0.2,
    0.45
  );

  const black = material(
    'panel',
    [0.025, 0.025, 0.035],
    0.05,
    0.3
  );

  // Відкритий корпус: задня, бокові та верхня панелі.
  // Передня частина навмисно відкрита, щоб були видимі вузли двійника.
  const bodyGeometry = mergeGeometries([
    at(box(2.4, 2.8, 0.12), 0, 1.4, -0.82),
    at(box(0.12, 2.8, 1.7), -1.14, 1.4, 0),
    at(box(0.12, 2.8, 1.7), 1.14, 1.4, 0),
    at(box(2.4, 0.12, 1.7), 0, 2.74, 0),
    at(box(2.4, 0.12, 1.7), 0, 0.06, 0)
  ]);

  part(
    'body',
    bodyGeometry,
    dark
  );

  // Резервуар
  part(
    'water-tank',
    at(
      box(0.62, 1.55, 0.72),
      -0.72,
      1.42,
      -0.15
    ),
    blue
  );

  // Насос
  const pumpGeometry =
    cylinder(0.23, 0.72, 64);

  pumpGeometry.rotateZ(Math.PI / 2);

  part(
    'pump',
    at(
      pumpGeometry,
      0,
      0.48,
      0.05
    ),
    green
  );

  // Нагрівач
  part(
    'heater',
    at(
      cylinder(0.31, 0.82, 64),
      0.68,
      1.25,
      -0.08
    ),
    red
  );

  // Заварювальний вузол
  part(
    'brewing-unit',
    at(
      box(0.68, 0.72, 0.62),
      0.12,
      1.82,
      0.12
    ),
    orange
  );

  // Вихід кави
  part(
    'outlet',
    at(
      box(0.48, 0.4, 0.32),
      0.12,
      1.35,
      0.72
    ),
    steel
  );

  // Панель керування
  part(
    'control-panel',
    at(
      box(1.15, 0.48, 0.1),
      0,
      2.38,
      0.84
    ),
    black
  );

  // Піддон
  part(
    'cup-tray',
    at(
      box(1.18, 0.1, 0.82),
      0.15,
      0.18,
      0.48
    ),
    steel
  );

  mkdirSync('models', { recursive: true });

  const binary =
    await new NodeIO().writeBinary(doc);

  writeFileSync(
    'models/coffee-machine.glb',
    binary
  );

  console.log(
    'Created models/coffee-machine.glb'
  );
}

await createModel();