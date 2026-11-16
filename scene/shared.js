export const PORT = 8091;

export const T_SN = 50;

export const PROFILES = {
  lan: {
    rtt: 2,
    jitter: 1,
    loss: 0,
    m: 0
  },

  city: {
    rtt: 20,
    jitter: 5,
    loss: 0.005,
    m: 1
  },

  mobile: {
    rtt: 60,
    jitter: 30,
    loss: 0.02,
    m: 1
  }
};


// Траєкторія бота:
// коло радіусом 6 м,
// швидкість 1.5 м/с,
// кожні 10 с зупинка на 2 с.
const R = 6;
const V = 1.5;
const CYCLE = 10;
const STOP = 2;


export function walk(ms) {
  const seconds =
    ms / 1000;

  const cycle =
    Math.floor(
      seconds / CYCLE
    );

  const current =
    seconds -
    cycle * CYCLE;


  const distance =
    (
      cycle *
      (CYCLE - STOP) +
      Math.min(
        current,
        CYCLE - STOP
      )
    ) *
    V;


  const angle =
    (
      distance %
      (2 * Math.PI * R)
    ) /
    R;


  return {
    p: [
      R * Math.cos(angle),
      1.7,
      R * Math.sin(angle)
    ],

    steady:
      current > 1 &&
      current < CYCLE - STOP
  };
}