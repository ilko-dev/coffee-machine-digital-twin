import {
  Document,
  NodeIO
} from '@gltf-transform/core';

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';


const SIZE = 2048;
const DEPTH = 4;
const N = 64;

const G0 =
  SIZE / N;

const OUT =
  'tiles/site/v1';

const io =
  new NodeIO();


function height(x, y) {
  const distance =
    Math.hypot(x, y);

  const outer =
    Math.min(
      1,
      Math.max(
        0,
        (distance - 60) / 140
      )
    );

  return (
    -0.2 +
    outer *
      (
        10 *
        Math.sin(x / 190) *
        Math.cos(y / 240)
        +
        3 *
        Math.sin(x / 41 + 1) *
        Math.sin(y / 57)
      )
  );
}


async function tile(
  level,
  ix,
  iy
) {
  const size =
    SIZE / 2 ** level;

  const x0 =
    -SIZE / 2 + ix * size;

  const y0 =
    -SIZE / 2 + iy * size;


  const positions =
    new Float32Array(
      (N + 1) ** 2 * 3
    );

  const colors =
    new Uint8Array(
      (N + 1) ** 2 * 4
    );


  let low =
    Infinity;

  let high =
    -Infinity;


  for (
    let j = 0, vertex = 0;
    j <= N;
    j++
  ) {
    for (
      let i = 0;
      i <= N;
      i++, vertex++
    ) {
      const x =
        x0 + i * size / N;

      const y =
        y0 + j * size / N;

      const h =
        height(x, y);


      positions.set(
        [x, h, -y],
        vertex * 3
      );


      const t =
        Math.min(
          1,
          Math.max(
            0,
            (h + 5) / 20
          )
        );

      colors.set(
        [
          70 + 80 * t,
          115 + 20 * t,
          65 + 20 * t,
          255
        ],
        vertex * 4
      );


      low =
        Math.min(low, h);

      high =
        Math.max(high, h);
    }
  }


  const indices =
    new Uint16Array(
      N * N * 6
    );


  for (
    let j = 0, k = 0;
    j < N;
    j++
  ) {
    for (
      let i = 0;
      i < N;
      i++
    ) {
      const a =
        j * (N + 1) + i;

      const b =
        a + N + 1;

      indices.set(
        [
          a,
          a + 1,
          b,
          b,
          a + 1,
          b + 1
        ],
        k
      );

      k += 6;
    }
  }


  const document =
    new Document();

  const buffer =
    document.createBuffer();


  const accessor =
    (array, type) =>
      document
        .createAccessor()
        .setArray(array)
        .setType(type)
        .setBuffer(buffer);


  const primitive =
    document
      .createPrimitive()

      .setIndices(
        accessor(
          indices,
          'SCALAR'
        )
      )

      .setAttribute(
        'POSITION',
        accessor(
          positions,
          'VEC3'
        )
      )

      .setAttribute(
        'COLOR_0',
        accessor(
          colors,
          'VEC4'
        ).setNormalized(true)
      );


  const material =
    document
      .createMaterial('ground')
      .setRoughnessFactor(1)
      .setMetallicFactor(0);


  primitive.setMaterial(
    material
  );


  const mesh =
    document
      .createMesh()
      .addPrimitive(primitive);


  document
    .createScene()
    .addChild(
      document
        .createNode()
        .setMesh(mesh)
    );


  const uri =
    `${level}/${ix}_${iy}.glb`;


  writeFileSync(
    `${OUT}/${uri}`,
    await io.writeBinary(
      document
    )
  );


  const description = {
    boundingVolume: {
      box: [
        x0 + size / 2,
        y0 + size / 2,
        (low + high) / 2,

        size / 2, 0, 0,
        0, size / 2, 0,
        0, 0,
        Math.max(
          (high - low) / 2,
          0.5
        )
      ]
    },

    geometricError:
      level < DEPTH
        ? G0 / 2 ** level
        : 0,

    content: {
      uri
    }
  };


  if (level < DEPTH) {
    description.children = [];

    for (
      const [dx, dy]
      of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1]
      ]
    ) {
      description.children.push(
        await tile(
          level + 1,
          2 * ix + dx,
          2 * iy + dy
        )
      );
    }
  }


  return description;
}


for (
  let level = 0;
  level <= DEPTH;
  level++
) {
  mkdirSync(
    `${OUT}/${level}`,
    {
      recursive: true
    }
  );
}


const root =
  await tile(
    0,
    0,
    0
  );


root.refine =
  'REPLACE';


writeFileSync(
  `${OUT}/tileset.json`,

  JSON.stringify(
    {
      asset: {
        version: '1.1',
        tilesetVersion: 'v1'
      },

      geometricError:
        2 * G0,

      root
    },

    null,
    2
  )
);


console.log(
  `Created ${OUT}/tileset.json`
);

console.log(
  'Tiles: 341'
);