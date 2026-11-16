import WebSocket
  from 'ws';

import {
  PORT,
  walk
} from '../scene/shared.js';


const ws =
  new WebSocket(
    `ws://127.0.0.1:${PORT}/?name=bot&profile=lan`
  );


let timer;
ws.on('close', () => clearInterval(timer));

ws.on(
  'open',
  () => {
    console.log(
      'Бот у сеансі. Ctrl+C — зупинка'
    );


    timer = setInterval(
      () => {
        const pose =
          walk(
            Date.now()
          );


        ws.send(
          JSON.stringify({
            type: 'pose',
            p: pose.p,
            q: [
              0,
              0,
              0,
              1
            ]
          })
        );
      },
      49
    );
  }
);


ws.on(
  'error',
  error => {
    console.error(
      'Немає сервера сеансу:',
      error.message
    );
  }
);