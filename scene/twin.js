import * as THREE from 'three';

const $ = (id) =>
  document.getElementById(id);

export async function bindTwin(station) {
  const config =
    await fetch('binding.json')
      .then(response => response.json());

  $('thing').textContent =
    config.thing;

  for (const binding of config.bindings) {
    $('vals').insertAdjacentHTML(
      'beforeend',
      `
        <tr>
          <td>${binding.title}</td>
          <td id="value-${binding.node}">—</td>
          <td>${binding.unit}</td>
        </tr>
      `
    );
  }

  const color =
    new THREE.Color();

  let sourceTimestamp = 0;
  let revision = -1;

  function apply(thing) {
    if (Number.isInteger(thing._revision)) {
      if (thing._revision < revision) return;
      revision = thing._revision;
    }
    const features =
      thing.features ?? {};

    let bound = 0;

    for (const binding of config.bindings) {
      const value =
        features[binding.feature]
          ?.properties
          ?.[binding.property];

      if (
        value === undefined ||
        typeof value !== 'number'
      ) {
        continue;
      }

      $(`value-${binding.node}`)
        .textContent =
        value.toFixed(2);

      let normalized =
        THREE.MathUtils.clamp(
          (value - binding.min) /
          (binding.max - binding.min),
          0,
          1
        );

      if (binding.invert) {
        normalized =
          1 - normalized;
      }

      color.setHSL(
        0.33 * (1 - normalized),
        0.8,
        0.45
      );

      if (
        station.paint(
        config.unit,
        binding.node,
        color
        )
      ) {
        bound++;
      }
    }

    $('bound').textContent =
      `${bound} з ${config.bindings.length}`;

    if (thing._revision !== undefined) {
      $('rev').textContent =
        thing._revision;
    }

    const ts =
      features.sync
        ?.properties
        ?.ts;

    if (typeof ts === 'number') {
      sourceTimestamp = ts;
    }
  }

  const api =
    '/api/2/things';

  async function refresh() {
    const response = await fetch(`${api}/${config.thing}?fields=features,_revision`, {
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Ditto GET: HTTP ${response.status}`);
    apply(await response.json());
  }

  refresh().catch(console.warn);
  const events =
    new EventSource(
      `${api}?ids=${config.thing}&fields=features,_revision`
    );

  events.onmessage = event => {
    if (!event.data.trim()) return;
    try {
      apply(JSON.parse(event.data));
    } catch (error) {
      console.warn('Некоректна подія SSE:', error);
    }
  };

  events.onerror = () => {
    $('connection').textContent =
      'SSE reconnecting...';
  };

  events.onopen = () => {
    $('connection').textContent =
      'SSE connected';
    refresh().catch(console.warn);
  };

  setInterval(
    () => {
      if (!sourceTimestamp)
        return;

      const age =
        (Date.now() - sourceTimestamp) /
        1000;

      $('age').textContent =
        `${age.toFixed(1)} s`;

      $('age').className =
        age < 2
          ? ''
          : 'stale';
    },
    250
  );
}