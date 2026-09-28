import {
  effectiveFields,
  selectValues,
  defaultActionName,
  type HelixAction,
  type HelixField,
  type HelixSpec,
} from './define';

/**
 * Renders the Node-RED editor file (.html) for one Helix spec. The EventSub
 * nodes use the same idea (`eventsub-editor.ts`): the registry is the source of
 * truth and the repetitive editor boilerplate is generated at build time.
 *
 * An action node gets an Action dropdown and only the selected action's fields
 * are shown; shared fields stay visible for every action.
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

function fieldWidget(field: HelixField, dataActions?: string[]): string {
  const id = `node-input-${field.name}`;
  const label = `<label for="${id}"><i class="fa ${escapeHtml(faIcon(field))}"></i> ${escapeHtml(field.label)}</label>`;
  const placeholder = field.hint ? ` placeholder="${escapeHtml(field.hint)}"` : '';
  const dataAttr = dataActions && dataActions.length
    ? ` data-action="${escapeHtml(dataActions.join(','))}"`
    : '';

  if (field.kind === 'bool') {
    return [
      `  <div class="form-row"${dataAttr}>`,
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
      `  <div class="form-row"${dataAttr}>`,
      `    ${label}`,
      `    <select id="${id}">`,
      options,
      '    </select>',
      '  </div>',
    ].join('\n');
  }

  return [
    `  <div class="form-row"${dataAttr}>`,
    `    ${label}`,
    `    <input type="text" id="${id}"${placeholder} />`,
    '  </div>',
  ].join('\n');
}

interface EditorField {
  field: HelixField;
  /** Actions that own this field; `null` means it is shared by all. */
  actions: string[] | null;
}

/** Merges two definitions of the same field name, unioning select options. */
function mergeField(base: EditorField, incoming: EditorField): void {
  if (base.field.kind === 'select' && incoming.field.kind === 'select') {
    const values = selectValues(base.field);
    const extra = (incoming.field.options ?? []).filter(
      (option) => values.indexOf(typeof option === 'string' ? option : option.value) === -1
    );
    base.field = { ...base.field, options: [...(base.field.options ?? []), ...extra] };
  }
}

/** Every field the editor must render, de-duplicated by name for action nodes. */
function editorFields(spec: HelixSpec): EditorField[] {
  if (!spec.actions) {
    return effectiveFields(spec).map((field) => ({ field, actions: null }));
  }

  const byName = new Map<string, EditorField>();
  for (const field of spec.fields) {
    byName.set(field.name, { field, actions: null });
  }

  for (const [name, action] of Object.entries(spec.actions) as Array<[string, HelixAction]>) {
    for (const field of effectiveFields(spec, action)) {
      const existing = byName.get(field.name);
      if (!existing) {
        byName.set(field.name, { field, actions: [name] });
        continue;
      }
      if (existing.actions) {
        existing.actions.push(name);
      }
      mergeField(existing, { field, actions: [name] });
    }
  }

  return [...byName.values()];
}

function renderDefaults(spec: HelixSpec, fields: EditorField[]): string {
  const rows: string[] = [];
  if (spec.actions) {
    rows.push(`      "action": { value: ${JSON.stringify(defaultActionName(spec) ?? '')} },`);
  }
  for (const { field } of fields) {
    rows.push(`      ${JSON.stringify(field.name)}: { value: ${defaultLiteral(field)} },`);
  }
  return [
    '    defaults: {',
    "      name: { value: '' },",
    "      config: { type: 'twitch-api-config', required: true },",
    ...rows,
    '    },',
  ].join('\n');
}

function numericValidation(fields: EditorField[]): string {
  const numeric = fields
    .filter(({ field }) => field.kind === 'int')
    .map(({ field }) => field.name);
  if (!numeric.length) return '';
  return [
    `      ${JSON.stringify(numeric)}.forEach(function (field) {`,
    "        $('#node-input-' + field).on('change', function () {",
    '          var value = String($(this).val()).trim();',
    "          if (value && !/^\\d+$/.test(value)) RED.notify(field + ' must be a whole number', 'warning');",
    '        });',
    '      });',
  ].join('\n');
}

function renderOnEditPrepare(spec: HelixSpec, fields: EditorField[]): string {
  const blocks: string[] = [];
  const numeric = numericValidation(fields);

  if (spec.actions) {
    blocks.push([
      '      var toggleAction = function () {',
      "        var action = String($('#node-input-action').val() || '');",
      "        $('[data-action]').each(function () {",
      "          var names = String($(this).attr('data-action') || '').split(',');",
      '          $(this).toggle(names.indexOf(action) !== -1);',
      '        });',
      '      };',
      "      $('#node-input-action').on('change', toggleAction);",
      '      toggleAction();',
    ].join('\n'));
  }
  if (numeric) blocks.push(numeric);
  if (spec.oneditprepare) blocks.push(`      ${spec.oneditprepare}`);

  if (!blocks.length) return '';
  return [
    '    oneditprepare: function () {',
    blocks.join('\n'),
    '    },',
  ].join('\n');
}

function renderFieldDl(fields: HelixField[]): string {
  return fields
    .map((field) => {
      const names = [field.name, ...(field.aliases ?? [])].join(' | ');
      const required = field.required ? ' Required.' : ' Optional.';
      const hint = field.hint ? ` ${escapeHtml(field.hint)}.` : '';
      const primary = field.primary ? ' <code>msg.payload</code> overrides this.' : '';
      return [
        `      <dt>${escapeHtml(names)} <span class="property-type">${propertyType(field)}</span></dt>`,
        `      <dd>${escapeHtml(field.label)}.${required}${hint}${primary}</dd>`,
      ].join('\n');
    })
    .join('\n');
}

function scopeList(scopes: string[]): string {
  return scopes.length
    ? scopes.map((scope) => `      <li><code>${escapeHtml(scope)}</code></li>`).join('\n')
    : '      <li>None.</li>';
}

function renderHelp(spec: HelixSpec, fields: EditorField[]): string {
  const lines: string[] = [
    `<script type="text/html" data-help-name="${escapeHtml(spec.type)}">`,
    `  <p>${escapeHtml(spec.help)}</p>`,
  ];

  if (spec.actions) {
    const shared = fields.filter((entry) => entry.actions === null).map((entry) => entry.field);
    if (shared.length) {
      lines.push('  <h3>Common inputs</h3>', '  <dl class="message-properties">', renderFieldDl(shared), '  </dl>');
    }
    for (const [name, action] of Object.entries(spec.actions)) {
      const own = effectiveFields(spec, action).filter(
        (field) => !shared.some((sharedField) => sharedField.name === field.name)
      );
      lines.push(
        `  <h3>Action: ${escapeHtml(action.label)} (${escapeHtml(name)})</h3>`,
        `  <p>${escapeHtml(action.help)}</p>`
      );
      if (own.length) {
        lines.push('  <dl class="message-properties">', renderFieldDl(own), '  </dl>');
      }
      lines.push(
        '  <p><strong>Scopes</strong> <span class="property-type">' +
          (action.scopes.length ? action.scopes.map((s) => `<code>${escapeHtml(s)}</code>`).join(', ') : 'none') +
          '</span></p>'
      );
    }
  } else {
    lines.push(
      '  <h3>Inputs</h3>',
      '  <dl class="message-properties">',
      renderFieldDl(effectiveFields(spec)),
      '  </dl>'
    );
  }

  lines.push(
    '  <h3>Outputs</h3>',
    '  <dl class="message-properties">',
    '    <dt>payload <span class="property-type">object | array</span></dt>',
    '    <dd>The result as a plain object (or array for list actions).',
    '      List actions also set <code>msg.pagination</code> and <code>msg.total</code>.</dd>',
    '  </dl>'
  );

  if (!spec.actions) {
    lines.push('  <h3>Scopes</h3>', '  <ul>', scopeList(spec.scopes), '  </ul>');
  }

  lines.push('</script>');
  return lines.join('\n');
}

export function renderEditorHtml(spec: HelixSpec): string {
  const fields = editorFields(spec);
  const label = jsString(spec.label);
  const oneditprepare = renderOnEditPrepare(spec, fields);

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

  const templateLines = [
    `<script type="text/html" data-template-name="${escapeHtml(spec.type)}">`,
    '  <div class="form-row">',
    '    <label for="node-input-name"><i class="fa fa-tag"></i> Name</label>',
    '    <input type="text" id="node-input-name" placeholder="Name" />',
    '  </div>',
    '  <div class="form-row">',
    '    <label for="node-input-config"><i class="fa fa-cog"></i> Config</label>',
    '    <input type="text" id="node-input-config" />',
    '  </div>',
  ];

  if (spec.actions) {
    const options = Object.entries(spec.actions)
      .map(([name, action]) => `      <option value="${escapeHtml(name)}">${escapeHtml(action.label)}</option>`)
      .join('\n');
    templateLines.push(
      '  <div class="form-row">',
      '    <label for="node-input-action"><i class="fa fa-bolt"></i> Action</label>',
      '    <select id="node-input-action">',
      options,
      '    </select>',
      '  </div>'
    );
  }

  for (const { field, actions } of fields) {
    if (field.hidden) continue;
    templateLines.push(fieldWidget(field, actions ?? undefined));
  }
  templateLines.push('</script>');

  return `${register}\n\n${templateLines.join('\n')}\n\n${renderHelp(spec, fields)}\n`;
}
