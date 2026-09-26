import {
  type EventSubEventDefinition,
  type EventSubField,
} from './eventsub-registry';

/**
 * Renders the Node-RED editor file for one EventSub node. Every node used to ship
 * a hand-written HTML file that differed only in the type, label and help text;
 * this turns the registry entry into the same file at build time.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A JS string literal (with its surrounding quotes) safe to embed in an inline
 * `<script>`. JSON.stringify covers quotes, backslashes and control characters;
 * the extra replacements stop a value from closing the script block or breaking
 * the JS parser with a line/paragraph separator.
 */
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function fieldKey(field: EventSubField): string {
  return typeof field === 'string' ? field : field.key;
}

function helpFieldList(definition: EventSubEventDefinition): string {
  const keys = definition.fields.map(fieldKey);
  if (!keys.length) return '';
  const items = keys
    .map((key) => `      <li><code>${escapeHtml(key)}</code></li>`)
    .join('\n');
  return [
    '  <h3>Payload properties</h3>',
    '  <ul>',
    items,
    '  </ul>',
  ].join('\n');
}

export function renderEditorHtml(definition: EventSubEventDefinition): string {
  const type = escapeHtml(definition.type);
  const label = jsString(definition.label);
  const description = escapeHtml(definition.description || definition.label);

  return `<script type="text/javascript">
  RED.nodes.registerType(${jsString(definition.type)}, {
    category: ${jsString(definition.category)},
    color: '#b9a3e3',
    defaults: {
      name: { value: '' },
      config: { type: 'twitch-api-config', required: true }
    },
    inputs: 0,
    outputs: 1,
    icon: 'twitch-icon.svg',
    paletteLabel: ${label},
    label: function () {
      if (this.name) return this.name;
      var config = RED.nodes.node(this.config);
      return ${label} + (config ? ' (' + (config.name || '') + ')' : '');
    }
  });
</script>

<script type="text/html" data-template-name="${type}">
  <div class="form-row">
    <label for="node-input-config"><i class="fa fa-cog"></i> Config</label>
    <input type="text" id="node-input-config" />
  </div>
  <div class="form-row">
    <label for="node-input-name"><i class="fa fa-tag"></i> Name</label>
    <input type="text" id="node-input-name" placeholder="Name" />
  </div>
</script>

<script type="text/html" data-help-name="${type}">
  <p>${description}</p>
  <h3>Outputs</h3>
  <dl class="message-properties">
    <dt>payload <span class="property-type">object</span></dt>
    <dd>The ${escapeHtml(definition.label)} event data.${
      definition.fields.some((f) => fieldKey(f) === 'rawEvent')
        ? ' Includes <code>rawEvent</code> with the full unmodified event.'
        : ''
    }</dd>
  </dl>
${helpFieldList(definition)}
</script>
`;
}
