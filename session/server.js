import { randomUUID } from 'node:crypto';
import {
  WebSocketServer
} from 'ws';

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';

import {
  PORT,
  T_SN,
  PROFILES
} from '../scene/shared.js';


const results = new URL('../results/', import.meta.url);
const poses =
  new Map();

const marks =
  [];

let markId =
  0;

let sent =
  0;


// Модель мережі:
// RTT/2 + jitter.
//
// Якщо сегмент умовно "втрачено",
// додаємо ще один RTT,
// імітуючи повторне передавання TCP.
function link({
  rtt,
  jitter,
  loss
}) {
  let last =
    0;


  return deliver => {
    let delay =
      rtt / 2 +
      Math.random() * jitter;


    if (
      Math.random() < loss
    ) {
      delay +=
        rtt;
    }


    last =
      Math.max(
        Date.now() + delay,
        last
      );


    setTimeout(
      deliver,
      Math.max(0, last - Date.now())
    );
  };
}


const wss =
  new WebSocketServer({
    host: '127.0.0.1',
    port: PORT
  });


function broadcast(message) {
  for (
    const client of
    wss.clients
  ) {
    client.post?.(
      message
    );
  }
}


wss.on(
  'connection',
  (ws, request) => {
    const query =
      new URL(
        request.url,
        'http://localhost'
      ).searchParams;


    const name =
      query
        .get('name')
        ?.slice(0, 20) ||
      'guest';


    const requestedProfile =
      query.get('profile');


    const profile =
      Object.hasOwn(PROFILES, requestedProfile)
        ? requestedProfile
        : 'lan';


    const up =
      link(
        PROFILES[profile]
      );

    const down =
      link(
        PROFILES[profile]
      );


    const id = randomUUID();
    ws.id = id;


    ws.post =
      message => {
        down(() => {
          if (
            ws.readyState !==
            ws.OPEN
          ) {
            return;
          }


          const data =
            JSON.stringify(
              message
            );


          ws.send(
            data
          );


          sent +=
            Buffer.byteLength(data);
        });
      };


    ws.on(
      'message',
      raw => {
        up(() => {
          if (
            ws.readyState ===
            ws.OPEN
          ) {
            handle(
              raw
            );
          }
        });
      }
    );


    ws.on(
      'close',
      () => {
        poses.delete(id);

        console.log(
          `- ${name}, учасників: ${wss.clients.size}`
        );
      }
    );


    ws.post({ type: 'welcome', id });
    ws.post({
      type: 'marks',
      marks
    });


    console.log(
      `+ ${name} (${profile}), учасників: ${wss.clients.size}`
    );


    function handle(raw) {
      let message;


      try {
        message =
          JSON.parse(
            raw
          );
      } catch {
        console.log(
          `Відкинуто некоректне повідомлення: ${name}`
        );

        return;
      }


      if (!message || typeof message !== 'object') return;

      const validPosition =
        Array.isArray(
          message.p
        ) &&
        message.p.length === 3 &&
        message.p.every(
          value =>
            Number.isFinite(value) &&
            Math.abs(value) < 1100
        );


      if (
        message.type === 'pose' &&
        validPosition &&
        Array.isArray(message.q) &&
        message.q.length === 4 &&
        message.q.every(Number.isFinite) &&
        Math.abs(Math.hypot(...message.q) - 1) < 0.01
      ) {
        poses.set(id, { name, p: message.p, q: message.q });

        return;
      }


      if (
        message.type === 'ping'
      ) {
        ws.post({
          type: 'pong',
          t: message.t
        });

        return;
      }


      if (
        message.type === 'mark' &&
        validPosition &&
        typeof message.text ===
          'string' &&
        message.text.length <= 80
      ) {
        marks.push({
          id: ++markId,
          author: name,
          owner: id,
          text: message.text,
          p: message.p
        });


        broadcast({
          type: 'marks',
          marks
        });

        return;
      }


      if (
        message.type === 'unmark'
      ) {
        const index =
          marks.findIndex(
            mark =>
              mark.id ===
                message.id &&
              mark.owner === id
          );


        if (
          index >= 0
        ) {
          marks.splice(
            index,
            1
          );
        }


        broadcast({
          type: 'marks',
          marks
        });

        return;
      }


      if (message.type === 'report' && ['interp', 'extrap'].includes(message.mode)) {
        const file = new URL(`net-${profile}-${message.mode}.json`, results);
        mkdirSync(results, { recursive: true });
        writeFileSync(file, JSON.stringify(message, null, 2) + '\n');
        console.log(`Звіт ${name}: ${file.pathname}`);
      }
    }
  }
);


setInterval(
  () => {
    const time =
      Date.now();


    for (
      const client of
      wss.clients
    ) {
      const avatars =
        Object.fromEntries(
          [...poses]
            .filter(
              ([who]) =>
                who !==
                client.id
            )
        );


      client.post?.({
        type: 'snap',
        t: time,
        avatars
      });
    }
  },
  T_SN
);


setInterval(
  () => {
    if (
      wss.clients.size
    ) {
      console.log(
        `Учасників ${wss.clients.size}, ` +
        `Rс = ${(
          8 *
          sent /
          5000
        ).toFixed(1)} кбіт/с`
      );
    }


    sent =
      0;
  },
  5000
);


console.log(
  `Сервер сеансу: ws://127.0.0.1:${PORT}`
);