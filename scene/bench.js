import {
  renderer,
  scene,
  camera,
  controls,
  tiles,
  frame,
  opt,
  params
} from './main.js';


const DURATION =
  Number(params.get('bench')) || 30;

const WARMUP =
  3;

const BUDGET =
  1000 /
  (Number(params.get('hz')) || 60);

const label =
  params.get('label') ?? 'run';


performance.setResourceTimingBufferSize(
  10000
);


renderer.setPixelRatio(1);

renderer.setSize(
  1920,
  1080,
  false
);

camera.aspect =
  16 / 9;

camera.updateProjectionMatrix();

tiles.setResolutionFromRenderer(
  camera,
  renderer
);


const gl =
  renderer.getContext();

const timer =
  gl.getExtension(
    'EXT_disjoint_timer_query_webgl2'
  );

const pending = [];

const rec = {
  period: [],
  cpu: [],
  gpu: [],
  calls: [],
  tris: []
};

let start = null;
let last = null;


function path(seconds) {
  const angle =
    (2 * Math.PI * seconds) /
    20;

  const radius =
    8 +
    150 *
    (
      1 -
      Math.cos(
        (2 * Math.PI * seconds) /
        30
      )
    );

  camera.position.set(
    radius * Math.cos(angle),
    2 + 0.4 * radius,
    radius * Math.sin(angle)
  );

  controls.target.set(
    0,
    0.5,
    0
  );

  camera.lookAt(
    controls.target
  );
}


// GPU measurements повертаються
// асинхронно, тому перевіряємо готові query.
function pollGpu() {
  while (
    pending.length &&
    gl.getQueryParameter(
      pending[0][0],
      gl.QUERY_RESULT_AVAILABLE
    )
  ) {
    const [query, index] =
      pending.shift();

    if (
      !gl.getParameter(
        timer.GPU_DISJOINT_EXT
      )
    ) {
      rec.gpu[index] =
        gl.getQueryParameter(
          query,
          gl.QUERY_RESULT
        ) / 1e6;
    }

    gl.deleteQuery(
      query
    );
  }
}


renderer.setAnimationLoop(
  time => {
    start ??=
      time;

    const seconds =
      (time - start) / 1000;

    path(
      seconds
    );


    const index =
      rec.cpu.length;

    const measure =
      seconds >= WARMUP && seconds < WARMUP + DURATION;


    const query =
      measure && timer
        ? gl.createQuery()
        : null;


    if (query) {
      gl.beginQuery(
        timer.TIME_ELAPSED_EXT,
        query
      );
    }


    const cpuStart =
      performance.now();

    frame(
      time
    );

    const cpu =
      performance.now() -
      cpuStart;


    if (query) {
      gl.endQuery(
        timer.TIME_ELAPSED_EXT
      );

      pending.push(
        [
          query,
          index
        ]
      );
    }


    if (timer) {
      pollGpu();
    }


    if (measure) {
      if (last !== null && rec.cpu.length) {
        rec.period.push(
          time - last
        );
      }

      rec.cpu.push(
        cpu
      );

      rec.calls.push(
        renderer.info.render.calls
      );

      rec.tris.push(
        renderer.info.render.triangles
      );
    }


    last =
      time;


    if (
      seconds >=
      WARMUP +
      DURATION +
      0.5
    ) {
      finish();
    }
  }
);


function percentile(
  values,
  value
) {
  const sorted =
    values
      .filter(
        item =>
          item !== undefined
      )
      .sort(
        (a, b) =>
          a - b
      );

  if (!sorted.length) {
    return null;
  }

  return Number(
    sorted[
      Math.min(
        sorted.length - 1,
        Math.floor(
          value *
          sorted.length
        )
      )
    ].toFixed(2)
  );
}


function megabytes(bytes) {
  return Number(
    (bytes / 1e6)
      .toFixed(2)
  );
}


function textureBytes() {
  const seen =
    new Set();

  let bytes =
    0;


  scene.traverse(
    object => {
      for (
        const texture of
        Object.values(
          object.material ?? {}
        )
      ) {
        if (
          !texture?.isTexture ||
          seen.has(texture)
        ) {
          continue;
        }


        seen.add(
          texture
        );


        if (
          texture.isCompressedTexture
        ) {
          bytes +=
            texture.mipmaps.reduce(
              (sum, mipmap) =>
                sum +
                mipmap.data.byteLength,
              0
            );
        } else if (
          texture.image?.width &&
          texture.image?.height
        ) {
          bytes +=
            (
              texture.image.width *
              texture.image.height *
              4 *
              4
            ) /
            3;
        }
      }
    }
  );


  return bytes;
}


function finish() {
  renderer.setAnimationLoop(
    null
  );


  const firstFrameEntry =
    performance
      .getEntriesByName(
        'first-frame'
      )[0];

  const firstFrame =
    firstFrameEntry
      ?.startTime ?? 0;


  const resources =
    performance
      .getEntriesByType(
        'resource'
      );


  const sum =
    list =>
      list.reduce(
        (total, resource) =>
          total +
          resource.encodedBodySize,
        0
      );


  const work =
    rec.cpu.map(
      (cpu, index) =>
        rec.gpu[index] === undefined ? null : Math.max(cpu, rec.gpu[index])
    );


  const inBudget =
    work.length && work.every(value => value !== null)
      ? Number(
          (
            100 *
            work.filter(
              value =>
                value <= BUDGET
            ).length /
            work.length
          ).toFixed(1)
        )
      : null;


  const result = {
    label,

    opt:
      [...opt].join(','),

    budget_ms:
      Number(
        BUDGET.toFixed(2)
      ),

    frames: rec.cpu.length,
    gpu_samples: rec.gpu.filter(Number.isFinite).length,

    fps:
      Number(
        (
          rec.cpu.length /
          DURATION
        ).toFixed(1)
      ),

    frame_p50_ms:
      percentile(
        rec.period,
        0.5
      ),

    frame_p99_ms:
      percentile(
        rec.period,
        0.99
      ),

    cpu_p50_ms:
      percentile(
        rec.cpu,
        0.5
      ),

    cpu_p99_ms:
      percentile(
        rec.cpu,
        0.99
      ),

    gpu_p50_ms:
      percentile(
        rec.gpu,
        0.5
      ),

    gpu_p99_ms:
      percentile(
        rec.gpu,
        0.99
      ),

    in_budget_pct:
      inBudget,

    calls_p50:
      percentile(
        rec.calls,
        0.5
      ),

    calls_max:
      Math.max(
        ...rec.calls
      ),

    triangles_p50:
      percentile(
        rec.tris,
        0.5
      ),

    triangles_max:
      Math.max(
        ...rec.tris
      ),

    textures_mb:
      megabytes(
        textureBytes()
      ),

    first_frame_ms:
      Math.round(
        firstFrame
      ),

    data_first_frame_mb:
      megabytes(
        sum(
          resources.filter(
            resource =>
              resource.responseEnd <=
              firstFrame
          )
        )
      ),

    data_total_mb:
      megabytes(
        sum(resources)
      ),

    requests:
      resources.length
  };


  const json =
    JSON.stringify(
      result,
      null,
      2
    );


  console.log(
    json
  );


  const link =
    document.createElement(
      'a'
    );

  link.href =
    URL.createObjectURL(
      new Blob(
        [json],
        {
          type:
            'application/json'
        }
      )
    );

  link.download =
    `perf-${label}.json`;

  link.textContent =
    `Зберегти ${link.download}`;


  const output =
    document.createElement(
      'pre'
    );

  output.textContent =
    json;

  output.style.maxHeight =
    '420px';

  output.style.overflow =
    'auto';

  output.style.fontSize =
    '12px';


  document
    .getElementById('stats')
    .replaceChildren(
      link,
      output
    );
}