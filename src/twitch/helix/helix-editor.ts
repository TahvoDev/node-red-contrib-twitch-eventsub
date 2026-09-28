import { effectiveFields, selectValues, type HelixField, type HelixSpec } from './define';

/**
 * Renders the Node-RED editor file (.html) for one Helix spec. The EventSub
 * nodes use the same idea (`eventsub-editor.ts`): the registry is the source of
 * truth and the repetitive editor boilerplate is generated at build time.
 */

const CATEGORY = 'twitch api';
const COLOR = '#b9a3e3';
const DEFAULT_ICON = 'twitch-icon.svg';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A JS string literal safe to embed in an inline <script>. */
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function propertyType(field: HelixField): string {
  switch (field.kind) {
    case 'bool':
      return 'boolean';
    case 'int':
      return 'number | string';
    case 'idList':
      return 'string | array';
    default:
      return 'string';
  }
}

function faIcon(field: HelixField): string {
  if (field.faIcon) return field.faIcon;
  switch (field.kind) {
    case 'user':
      return 'fa-user';
    case 'int':
      return 'fa-hashtag';
    case 'bool':
      return 'fa-check-square-o';
    case 'select':
      return 'fa-caret-down';
    case 'idList':
      return 'fa-list';
    default:
      return 'fa-font';
  }
}

function defaultLiteral(field: HelixField): string {
  const value = field.default;
  if (value === undefined) return field.kind === 'bool' ? 'false' : "''";
  if (field.kind === 'int') return JSON.stringify(String(value));
  return JSON.stringify(value);
}

function fieldWidget(field: HelixField): string {
  const id = `node-input-${field.name}`;
  const label = `<label for="${id}"><i class="fa ${escapeHtml(faIcon(field))}"></i> ${escapeHtml(field.label)}</label>`;
  const placeholder = field.hint ? ` placeholder="${escapeHtml(field.hint)}"` : '';

  if (field.kind === 'bool') {
    return [
      '  <div class="form-row">',
      `    ${label}`,
      `    <input type="checkbox" id="${id}" style="display:inline-block; width:auto;" />`,
      '  </div>',
    ].join('\n');
  }

  if (field.kind === 'select') {
    const options = (field.options ?? [])
      .map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const text = typeof option === 'string' ? option : option.label ?? option.value;
        return `      <option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
      })
      .join('\n');
    return [
      '  <div class="form-row">',
      `    ${label}`,
      `    <select id="${id}">`,
      options,
      '    </select>',
      '  </div>',
    ].join('\n');
  }

  return [
    '  <div class="form-row">',
    `    ${label}`,
    `    <input type="text" id="${id}"${placeholder} />`,
    '  </div>',
  ].join('\n');
}

function renderDefaults(spec: HelixSpec, fields: HelixField[]): string {
  const rows = fields
    .map((field) => `      ${JSON.stringify(field.name)}: { value: ${defaultLiteral(field)} },`)
    .join('\n');
  return [
    '    defaults: {',
    "      name: { value: '' },",
    "      config: { type: 'twitch-api-config', required: true },",
    rows,
    '    },',
  ].join('\n');
}

function renderOnEditPrepare(fields: HelixField[]): string {
  const numeric = fields.filter((field) => field.kind === 'int').map((field) => field.name);
  const extra: string[] = [];
  if (numeric.length) {
    extra.push('      ' + [
      `${JSON.stringify(numeric)}.forEach(function (field) {`,
      "        $('#node-input-' + field).on('change', function () {",
      '          var value = String($(this).val()).trim();',
      "          if (value && !/^\\d+$/.test(value)) RED.notify(field + ' must be a whole number', 'warning');",
      '        });',
      '      });',
    ].join('\n'));
  }
  if (!extra.length) return '';
  return [
    '    oneditprepare: function () {',
    extra.join('\n'),
    '    },',
  ].join('\n');
}

function renderHelp(spec: HelixSpec, fields: HelixField[]): string {
  const inputs = fields
    .map((field) => {
      const names = [field.name, ...(field.aliases ?? [])].join(' | ');
      const required = field.required ? ' Required.' : ' Optional.';
      const hint = field.hint ? ` ${escapeHtml(field.hint)}.` : '';
      const primary = field.primary ? ' <code>msg.payload</code> overrides this.' : '';
      return [
        `    <dt>${escapeHtml(names)} <span class="property-type">${propertyType(field)}</span></dt>`,
        `    <dd>${escapeHtml(field.label)}.${required}${hint}${primary}</dd>`,
      ].join('\n');
    })
    .join('\n');

  const scopes = spec.scopes.length
    ? spec.scopes.map((scope) => `    <li><code>${escapeHtml(scope)}</code></li>`).join('\n')
    : '    <li>None.</li>';

  return [
    `<script type="text/html" data-help-name="${escapeHtml(spec.type)}">`,
    `  <p>${escapeHtml(spec.help)}</p>`,
    '  <h3>Inputs</h3>',
    '  <dl class="message-properties">',
    inputs,
    '  </dl>',
    '  <h3>Outputs</h3>',
    '  <dl class="message-properties">',
    '    <dt>payload <span class="property-type">object | array</span></dt>',
    '    <dd>The result as a plain object (or array for list endpoints).',
    '      List endpoints also set <code>msg.pagination</code> and <code>msg.total</code>.</dd>',
    '  </dl>',
    '  <h3>Scopes</h3>',
    '  <ul>',
    scopes,
    '  </ul>',
    '</script>',
  ].join('\n');
}

export function renderEditorHtml(spec: HelixSpec): string {
  const fields = effectiveFields(spec);
  const formFields = fields.filter((field) => !field.hidden);
  const label = jsString(spec.label);
  const oneditprepare = renderOnEditPrepare(fields);

  const register = [
    '<script type="text/javascript">',
    `  RED.nodes.registerType(${jsString(spec.type)}, {`,
    `    category: ${jsString(CATEGORY)},`,
    `    color: ${jsString(COLOR)},`,
    renderDefaults(spec, fields),
    '    inputs: 1,',
    '    outputs: 1,',
    `    icon: ${jsString(spec.icon ?? DEFAULT_ICON)},`,
    `    paletteLabel: ${label},`,
    '    label: function () {',
    '      if (this.name) return this.name;',
    '      var config = RED.nodes.node(this.config);',
    `      return ${label} + (config ? ' (' + (config.name || '') + ')' : '');`,
    '    },',
    "    labelStyle: function () { return this.name ? 'node_label_italic' : ''; },",
    oneditprepare,
    '  });',
    '</script>',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const template = [
    `<script type="text/html" data-template-name="${escapeHtml(spec.type)}">`,
    '  <div class="form-row">',
    '    <label for="node-input-name"><i class="fa fa-tag"></i> Name</label>',
    '    <input type="text" id="node-input-name" placeholder="Name" />',
    '  </div>',
    '  <div class="form-row">',
    '    <label for="node-input-config"><i class="fa fa-cog"></i> Config</label>',
    '    <input type="text" id="node-input-config" />',
    '  </div>',
    ...formFields.map(fieldWidget),
    '</script>',
  ].join('\n');

  return `${register}\n\n${template}\n\n${renderHelp(spec, fields)}\n`;
}
