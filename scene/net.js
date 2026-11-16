import * as THREE from 'three';

import {
  scene,
  camera,
  renderer,
  hooks,
  params
} from './main.js';

import {
  PORT,
  T_SN,
  PROFILES,
  walk
} from './shared.js';


const name =
  params.get('name') || 'guest';

const mode =
  params.get('mode') === 'extrap' ? 'extrap' : 'interp';

const requestedProfile =
  params.get('profile');

const profile =
  Object.hasOwn(PROFILES, requestedProfile)
    ? requestedProfile
    : 'lan';

const {
  m,
  jitter
} = PROFILES[profile];


// Буфер інтерполяції.
const D_INT =
  (m + 1) * T_SN +
  jitter;


const ws =
  new WebSocket(
    `ws://127.0.0.1:${PORT}/?name=${encodeURIComponent(name)}&profile=${profile}`
  );


function send(message) {
  if (
    ws.readyState ===
    WebSocket.OPEN
  ) {
    ws.send(
      JSON.stringify(
        message
      )
    );
  }
}


const hud =
  document.getElementById(
    'hud'
  );

hud.insertAdjacentHTML(
  'beforeend',
  `
    <hr>
    <div>
      Session:
      <b id="session-name"></b>
      · ${profile}
      · ${mode}
    </div>

    <div id="session-status">
      WebSocket connecting...
    </div>

    <div>
      Participants:
      <span id="participant-count">0</span>
    </div>

    <ul id="marks"></ul>
  `
);

document.getElementById('session-name').textContent = name;

const statusElement =
  document.getElementById(
    'session-status'
  );

const participantElement =
  document.getElementById(
    'participant-count'
  );

const marksElement =
  document.getElementById(
    'marks'
  );


ws.addEventListener(
  'open',
  () => {
    statusElement.textContent =
      'WebSocket connected';
  }
);


ws.addEventListener(
  'close',
  () => {
    statusElement.textContent =
      'WebSocket disconnected';
  }
);


ws.addEventListener(
  'error',
  () => {
    statusElement.textContent =
      'WebSocket error';
  }
);


const snaps =
  [];

const offsets =
  [];

const avatars =
  new Map();


let clientId;
let measuring = Number(params.get('measure')) > 0;
const stat = {
  rtt: [],
  delay: [],
  off: [],
  frames: 0,
  starved: 0
};


ws.addEventListener(
  'message',
  event => {
    const message =
      JSON.parse(
        event.data
      );


    if (message.type === 'welcome') {
      clientId = message.id;
      return;
    }

    if (
      message.type === 'snap'
    ) {
      snaps.push(
        message
      );


      if (
        snaps.length > 40
      ) {
        snaps.shift();
      }


      offsets.push(
        message.t -
        Date.now()
      );


      if (
        offsets.length > 100
      ) {
        offsets.shift();
      }


      participantElement.textContent =
        Object.keys(
          message.avatars
        ).length;


      return;
    }


    if (
      message.type === 'pong'
    ) {
      if (!measuring) return;
      stat.rtt.push(
        Date.now() -
        message.t
      );

      return;
    }


    if (
      message.type === 'marks'
    ) {
      showMarks(
        message.marks
      );
    }
  }
);


// Власна поза → сервер,
// 20 разів за секунду.
setInterval(
  () => {
    send({
      type: 'pose',

      p:
        camera.position.toArray(),

      q:
        camera.quaternion.toArray()
    });
  },

  T_SN
);


setInterval(
  () => {
    send({
      type: 'ping',
      t: Date.now()
    });
  },

  1000
);


function avatar(who) {
  if (
    !avatars.has(who)
  ) {
    const material =
      new THREE.MeshStandardMaterial({
        color:
          new THREE.Color()
            .setHSL(
              Math.random(),
              0.7,
              0.5
            )
      });


    const head =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.35,
          20,
          12
        ),

        material
      );


    const nose =
      new THREE.Mesh(
        new THREE.ConeGeometry(
          0.15,
          0.5,
          16
        ),

        material
      );


    nose.rotation.x =
      -Math.PI / 2;

    nose.position.z =
      -0.45;


    head.add(
      nose
    );

    head.name =
      `avatar-${who}`;


    scene.add(
      head
    );


    avatars.set(
      who,
      head
    );
  }


  return avatars.get(
    who
  );
}


const pa =
  new THREE.Vector3();

const pb =
  new THREE.Vector3();

const qa =
  new THREE.Quaternion();

const qb =
  new THREE.Quaternion();


function place(
  who,
  a,
  b,
  k
) {
  const object =
    avatar(who);

  const A =
    a.avatars[who];

  const B =
    b.avatars[who];


  if (!A || !B) {
    object.position.fromArray((B ?? A).p);
    object.quaternion.fromArray((B ?? A).q);
    return;
  }


  object.position.lerpVectors(
    pa.fromArray(A.p),
    pb.fromArray(B.p),
    k
  );


  object.quaternion
    .slerpQuaternions(
      qa.fromArray(A.q),
      qb.fromArray(B.q),
      Math.min(k, 1)
    );
}


hooks.push(
  () => {
    if (
      snaps.length < 2 ||
      offsets.length === 0
    ) {
      return;
    }


    const now =
      Date.now();


    // Оцінка часу сервера:
    // беремо найменш затриманий snapshot.
    const serverTime =
      now +
      Math.max(
        ...offsets
      );


    const targetTime =
      mode === 'interp'
        ? serverTime - D_INT
        : serverTime;


    let index =
      snaps.findIndex(
        snapshot =>
          snapshot.t >
          targetTime
      );


    const starved =
      index < 0;


    if (starved) {
      index =
        snaps.length - 1;
    }


    const a =
      snaps[
        Math.max(
          index - 1,
          0
        )
      ];


    const b =
      snaps[
        Math.max(
          index,
          1
        )
      ];


    const interval =
      Math.max(
        b.t - a.t,
        1
      );


    let k =
      Math.max(
        0,
        (
          targetTime -
          a.t
        ) /
        interval
      );


    if (
      mode === 'interp'
    ) {
      k =
        Math.min(
          k,
          1
        );
    } else {
      // Екстраполяція максимум 250 ms.
      k =
        Math.min(
          k,
          1 +
          250 /
          interval
        );
    }


    for (const who of Object.keys(b.avatars)) {
      place(who, a, b, k);
    }

    for (const [who, object] of avatars) {
      object.visible = Object.hasOwn(b.avatars, who);
    }

    const botId = Object.keys(b.avatars).find(id => b.avatars[id].name === 'bot');
    if (measuring && botId && Object.hasOwn(a.avatars, botId)) {
      measure(now, starved, avatars.get(botId).position);
    }
  }
);


function measure(now, starved, shown) {
  let best =
    0;

  let minimum =
    Infinity;


  for (
    let tau = 0;
    tau <= 600;
    tau += 2
  ) {
    const expected =
      walk(
        now - tau
      ).p;


    const distance =
      shown.distanceTo(
        pb.fromArray(
          expected
        )
      );


    if (
      distance < minimum
    ) {
      minimum =
        distance;

      best =
        tau;
    }
  }


  stat.frames++;

  if (starved) {
    stat.starved++;
  }


  stat.off.push(
    minimum
  );


  if (
    walk(now).steady
  ) {
    stat.delay.push(
      best
    );
  }
}


const marksGroup =
  new THREE.Group();

marksGroup.name =
  'shared-marks';

scene.add(
  marksGroup
);


function showMarks(list) {
  for (const pin of marksGroup.children) {
    pin.geometry.dispose();
    pin.material.dispose();
  }
  marksGroup.clear();
  marksElement.replaceChildren();

  for (const mark of list) {
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.6, 16),
      new THREE.MeshBasicMaterial({ color: 0xd32f2f })
    );
    pin.rotation.x = Math.PI;
    pin.position.fromArray(mark.p);
    pin.position.y += 0.3;
    marksGroup.add(pin);

    const item = document.createElement('li');
    item.textContent = `${mark.author}: ${mark.text}`;
    if (mark.owner === clientId) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.id = mark.id;
      remove.textContent = '×';
      item.append(' ', remove);
    }
    marksElement.append(item);
  }
}


marksElement.addEventListener(
  'click',
  event => {
    const id =
      event.target.dataset.id;


    if (!id) {
      return;
    }


    event.preventDefault();


    send({
      type: 'unmark',
      id: Number(id)
    });
  }
);


// Подвійний клік по геометрії
// створює спільну позначку.
const ray =
  new THREE.Raycaster();


renderer.domElement.addEventListener(
  'dblclick',
  event => {
    const rect =
      renderer.domElement
        .getBoundingClientRect();


    const pointer =
      new THREE.Vector2(
        (
          (
            event.clientX -
            rect.left
          ) /
          rect.width
        ) *
        2 -
        1,

        -(
          (
            event.clientY -
            rect.top
          ) /
          rect.height
        ) *
        2 +
        1
      );


    ray.setFromCamera(
      pointer,
      camera
    );


    const hits =
      ray.intersectObjects(
        scene.children,
        true
      );


    const hit =
      hits.find(
        item =>
          !item.object.name
            ?.startsWith(
              'avatar-'
            )
      );


    if (!hit) {
      return;
    }


    const text =
      prompt(
        'Текст позначки',
        'Перевірити'
      );


    if (!text) {
      return;
    }


    send({
      type: 'mark',
      text,
      p:
        hit.point.toArray()
    });
  }
);


function percentile(
  values,
  percentileValue
) {
  const sorted =
    [...values]
      .sort(
        (a, b) =>
          a - b
      );


  if (!sorted.length) {
    return null;
  }


  return Number(
    sorted[
      Math.floor(
        percentileValue *
        (
          sorted.length - 1
        )
      )
    ].toFixed(3)
  );
}


const seconds =
  Number(
    params.get(
      'measure'
    )
  );


if (measuring) {
  setTimeout(
    () => {
      measuring = false;
      const report = {
        type: 'report',
        profile,
        mode,

        d_int_ms:
          mode === 'interp'
            ? D_INT
            : 0,

        rtt_p50_ms:
          percentile(
            stat.rtt,
            0.5
          ),

        delay_p50_ms:
          percentile(
            stat.delay,
            0.5
          ),

        delay_p95_ms:
          percentile(
            stat.delay,
            0.95
          ),

        off_max_m:
          percentile(
            stat.off,
            1
          ),

        starved_pct:
          stat.frames
            ? Number(
                (
                  100 *
                  stat.starved /
                  stat.frames
                ).toFixed(1)
              )
            : 0,

        frames:
          stat.frames
      };


      send(
        report
      );


      marksElement.textContent =
        JSON.stringify(
          report,
          null,
          2
        );
    },

    seconds * 1000
  );
}