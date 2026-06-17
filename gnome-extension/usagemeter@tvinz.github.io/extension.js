import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const API_URL = 'http://127.0.0.1:7777/api/usage';
const DASH_URL = 'http://127.0.0.1:7777/';
const POLL_SECONDS = 60;
const SEGMENTS = 14;

function colorFor(u) {
    if (u >= 90) return '#ff4d4f';
    if (u >= 70) return '#f5a623';
    return '#4a9eff';
}

function barText(u) {
    const f = Math.max(0, Math.min(SEGMENTS, Math.round((u / 100) * SEGMENTS)));
    return '█'.repeat(f) + '░'.repeat(SEGMENTS - f);
}

function ago(ms) {
    if (!ms) return 'never';
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s} sec ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    return `${Math.floor(m / 60)} hr ago`;
}

function relReset(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return 'now';
    const min = Math.floor(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h} hr ${m} min` : `${m} min`;
}

function absReset(iso) {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function resetText(w) {
    if (!w || !w.resetsAt) return '';
    return w.reltime ? `Resets in ${relReset(w.resetsAt)}` : `Resets ${absReset(w.resetsAt)}`;
}

const UsageIndicator = GObject.registerClass(
class UsageIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'usagemeter');

        // Panel: "5h <s%> · 7d <w%>" — dimmed window labels, each % colored by its own severity.
        const DIM = 'color: #9aa0a6;';
        this._panelBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
        const lbl5 = new St.Label({ text: '5h ', y_align: Clutter.ActorAlign.CENTER });
        lbl5.set_style(DIM);
        this._sPct = new St.Label({ text: '…', y_align: Clutter.ActorAlign.CENTER });
        const sep = new St.Label({ text: '  ·  ', y_align: Clutter.ActorAlign.CENTER });
        sep.set_style(DIM);
        const lbl7 = new St.Label({ text: '7d ', y_align: Clutter.ActorAlign.CENTER });
        lbl7.set_style(DIM);
        this._wPct = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER });
        [lbl5, this._sPct, sep, lbl7, this._wPct].forEach((c) => this._panelBox.add_child(c));
        this.add_child(this._panelBox);

        this._rows = {};
        this._rows.five_hour = this._addRow('Current session');
        this._rows.seven_day = this._addRow('Weekly · All models');
        this._rows.seven_day_sonnet = this._addRow('Weekly · Sonnet only');

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._updated = new PopupMenu.PopupMenuItem('Loading…', { reactive: false });
        this.menu.addMenuItem(this._updated);

        const open = new PopupMenu.PopupMenuItem('Open dashboard');
        open.connect('activate', () => Gio.AppInfo.launch_default_for_uri(DASH_URL, null));
        this.menu.addMenuItem(open);

        this._http = new Soup.Session();
        this._http.timeout = 8;

        // Refresh from the backend's cache on open (no forced Anthropic call — the
        // reset countdown is computed client-side from resetsAt, so it stays accurate).
        this.menu.connect('open-state-changed', (_m, isOpen) => {
            if (isOpen) this._refresh(false);
        });

        this._refresh(false);
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, POLL_SECONDS, () => {
            this._refresh(false);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _addRow(name) {
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        const box = new St.BoxLayout({ vertical: true, x_expand: true });
        box.set_style('min-width: 280px;');

        const head = new St.BoxLayout({ x_expand: true });
        head.add_child(new St.Label({ text: name, x_expand: true }));
        const pctLbl = new St.Label({ text: '—' });
        head.add_child(pctLbl);

        const barLbl = new St.Label({ text: barText(0) });
        barLbl.set_style('font-family: monospace;');

        const resetLbl = new St.Label({ text: '' });
        resetLbl.set_style('color: #9aa0a6; padding-top: 2px;');

        box.add_child(head);
        box.add_child(barLbl);
        box.add_child(resetLbl);
        item.add_child(box);
        this.menu.addMenuItem(item);
        return { pctLbl, barLbl, resetLbl };
    }

    _setRow(key, w) {
        const row = this._rows[key];
        if (!row) return;
        const u = Math.round(w ? w.utilization : 0);
        row.pctLbl.text = `${u}%`;
        row.barLbl.text = barText(u);
        row.barLbl.set_style(`font-family: monospace; color: ${colorFor(u)};`);
        row.resetLbl.text = resetText(w);
    }

    _refresh(force) {
        const url = force ? `${API_URL}?refresh=1` : API_URL;
        const msg = Soup.Message.new('GET', url);
        this._http.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (session, res) => {
            try {
                const bytes = session.send_and_read_finish(res);
                if (msg.get_status() !== Soup.Status.OK) throw new Error(`HTTP ${msg.get_status()}`);
                const text = new TextDecoder().decode(bytes.get_data());
                this._render(JSON.parse(text));
            } catch (_e) {
                this._renderOffline();
            }
        });
    }

    _render(d) {
        const byKey = {};
        for (const w of d.windows || []) byKey[w.key] = w;
        const s = byKey.five_hour ? Math.round(byKey.five_hour.utilization) : 0;
        const wk = byKey.seven_day ? Math.round(byKey.seven_day.utilization) : 0;

        this._sPct.text = `${s}%`;
        this._sPct.set_style(`color: ${colorFor(s)};`);
        this._wPct.text = `${wk}%`;
        this._wPct.set_style(`color: ${colorFor(wk)};`);

        for (const key of ['five_hour', 'seven_day', 'seven_day_sonnet'])
            this._setRow(key, byKey[key]);

        this._updated.label.text = `Updated ${ago(d.fetchedAt)}${d.stale ? ' (stale)' : ''}`;
    }

    _renderOffline() {
        this._sPct.text = '—';
        this._sPct.set_style('color: #f5a623;');
        this._wPct.text = '—';
        this._wPct.set_style('color: #f5a623;');
        for (const key of ['five_hour', 'seven_day', 'seven_day_sonnet']) {
            const row = this._rows[key];
            if (row) {
                row.pctLbl.text = '—';
                row.resetLbl.text = '';
            }
        }
        this._updated.label.text = 'usagemeter backend not running';
    }

    destroy() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = null;
        }
        super.destroy();
    }
});

export default class UsagemeterExtension extends Extension {
    enable() {
        this._indicator = new UsageIndicator();
        Main.panel.addToStatusArea('usagemeter', this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
