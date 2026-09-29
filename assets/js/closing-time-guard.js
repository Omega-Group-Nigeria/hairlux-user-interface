/**
 * closing-time-guard.js -- Hairlux (admin portal, staff portal, customer website)
 * The SAME file ships in hairlux-admin-interface and hairlux-user-interface --
 * keep the two copies identical.
 *
 * Before a booking is created, asks the API whether start time + the
 * services' estimated completion time runs past that branch's closing time
 * for that date (POST /bookings/closing-time-check). If it does, shows a
 * BLOCKING prompt (no close button, no click-outside, no Escape) with two
 * choices:
 *   1. Reschedule to the next open day and pick a time
 *   2. Start today (or on the chosen day) and complete the next day
 *
 * Usage:
 *   const decision = await ClosingTimeGuard.check({ branchId, date, time, services: [{ serviceId, quantity }] });
 *   if (decision.action === 'reschedule') { set date = decision.date, clear the time, ask for a new time; stop }
 *   else payload.continuesNextDay = decision.continuesNextDay;   // action === 'proceed'
 *
 * Fails open: if the check itself can't be reached, the booking is not
 * blocked (a network hiccup shouldn't stop the salon taking bookings).
 * Transport: Auth.fetch (admin/staff portal) or APIHelper.request (customer
 * website), whichever the page has loaded. No other dependencies.
 */
var ClosingTimeGuard = window.ClosingTimeGuard || (function () {
    var STYLE_ID = 'ctg-style';
    var CSS = [
        '.ctg-backdrop{position:fixed;inset:0;background:rgba(15,15,15,.55);z-index:20000;display:flex;align-items:center;justify-content:center;padding:16px}',
        '.ctg-dialog{background:var(--tblr-bg-surface,#fff);color:var(--tblr-body-color,#1d273b);border-radius:12px;max-width:520px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden;font-family:inherit}',
        '.ctg-head{padding:18px 22px 6px;display:flex;gap:12px;align-items:flex-start}',
        '.ctg-icon{flex:0 0 auto;width:36px;height:36px;border-radius:50%;background:#fff4e5;color:#b45309;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}',
        '.ctg-title{font-size:17px;font-weight:700;margin:6px 0 0}',
        '.ctg-body{padding:6px 22px 4px 70px;font-size:14px;line-height:1.55}',
        '.ctg-facts{margin:12px 0 0;padding:10px 12px;border-radius:8px;background:var(--tblr-bg-surface-secondary,#f6f7f9);font-size:13px;display:grid;grid-template-columns:auto 1fr;gap:4px 12px}',
        '.ctg-facts dt{font-weight:600;opacity:.8}.ctg-facts dd{margin:0}',
        '.ctg-actions{padding:16px 22px 20px;display:flex;flex-direction:column;gap:8px}',
        '.ctg-btn{border:0;border-radius:8px;padding:11px 14px;font-size:14px;font-weight:600;cursor:pointer;text-align:left;line-height:1.35}',
        '.ctg-btn small{display:block;font-weight:400;opacity:.85;margin-top:2px}',
        '.ctg-btn-primary{background:var(--tblr-primary,#111);color:#fff}',
        '.ctg-btn-secondary{background:transparent;color:inherit;border:1.5px solid var(--tblr-border-color,#d9dee6)}',
        '.ctg-btn:focus-visible{outline:3px solid rgba(32,107,196,.35);outline-offset:2px}',
        // Customer website dark theme (admin/staff use Tabler variables, which already follow the theme)
        '[data-theme="dark"] .ctg-dialog{background:#1c1c1e;color:#f0ede6}',
        '[data-theme="dark"] .ctg-facts{background:#26262a}',
        '[data-theme="dark"] .ctg-btn-primary{background:#f0ede6;color:#111}',
        '[data-theme="dark"] .ctg-btn-secondary{border-color:#3a3a40}',
    ].join('\n');

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function to12h(hhmm) {
        if (!hhmm) return '';
        var p = hhmm.split(':').map(Number);
        return (p[0] % 12 || 12) + ':' + String(p[1]).padStart(2, '0') + ' ' + (p[0] >= 12 ? 'PM' : 'AM');
    }

    /** "2026-09-29" -> "Tue, 29 Sep" (calendar date, no timezone shift) */
    function niceDate(dateStr) {
        var d = new Date(dateStr + 'T00:00:00Z');
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    }

    /** Today's calendar date in Lagos, YYYY-MM-DD */
    function todayLagos() {
        return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
    }

    function hoursText(h) {
        return h + (h === 1 ? ' hour' : ' hours');
    }

    async function fetchCheck(input) {
        if (typeof Auth !== 'undefined' && Auth.fetch) {
            var res = await Auth.fetch('/bookings/closing-time-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });
            var raw = await res.json().catch(function () { return {}; });
            if (!res.ok) throw new Error(raw.message || ('Closing time check failed (' + res.status + ')'));
            return raw.data !== undefined ? raw.data : raw;
        }
        if (typeof APIHelper !== 'undefined' && APIHelper.request) {
            var body = await APIHelper.request(API_CONFIG.ENDPOINTS.BOOKINGS + '/closing-time-check', {
                method: 'POST',
                body: JSON.stringify(input),
            });
            return body && body.data !== undefined ? body.data : body;
        }
        throw new Error('No API client on this page');
    }

    /** Shows the blocking prompt; resolves with the decision. */
    function prompt(result) {
        ensureStyle();
        return new Promise(function (resolve) {
            var isToday = result.date === todayLagos();
            var next = result.nextOpenDay;
            var startLabel = isToday
                ? 'Start today and complete tomorrow'
                : 'Start on ' + niceDate(result.date) + ' and complete the next day';
            var rescheduleLabel = next
                ? 'Reschedule to ' + (next.date === addDaysStr(todayLagos(), 1) ? 'tomorrow' : niceDate(next.date)) + ' and select a time'
                : 'Choose another date and time';

            var backdrop = document.createElement('div');
            backdrop.className = 'ctg-backdrop';
            backdrop.setAttribute('role', 'alertdialog');
            backdrop.setAttribute('aria-modal', 'true');
            backdrop.setAttribute('aria-labelledby', 'ctg-title');
            backdrop.setAttribute('aria-describedby', 'ctg-message');
            backdrop.innerHTML =
                '<div class="ctg-dialog">' +
                '<div class="ctg-head"><div class="ctg-icon" aria-hidden="true">!</div>' +
                '<div class="ctg-title" id="ctg-title">This booking runs past closing time</div></div>' +
                '<div class="ctg-body"><div id="ctg-message">' + esc(result.message) + '</div>' +
                '<dl class="ctg-facts">' +
                '<dt>Starts</dt><dd>' + esc(niceDate(result.date)) + ', ' + esc(to12h(result.startTime)) + '</dd>' +
                '<dt>Estimated time</dt><dd>' + esc(hoursText(result.estimatedHours)) + '</dd>' +
                '<dt>Estimated finish</dt><dd>' + esc(to12h(result.estimatedEndTime)) + (result.endsOnLaterDay ? ' (after midnight)' : '') + '</dd>' +
                '<dt>Closing time</dt><dd>' + esc(to12h(result.closing && result.closing.closeTime)) + (result.branch ? ' · ' + esc(result.branch.name) : '') + '</dd>' +
                (next ? '<dt>Next open day</dt><dd>' + esc(niceDate(next.date)) + (next.openTime ? ', opens ' + esc(to12h(next.openTime)) : '') + '</dd>' : '') +
                '</dl></div>' +
                '<div class="ctg-actions">' +
                '<button type="button" class="ctg-btn ctg-btn-primary" data-choice="reschedule">' + esc(rescheduleLabel) +
                '<small>Keep everything else and pick a new time.</small></button>' +
                '<button type="button" class="ctg-btn ctg-btn-secondary" data-choice="continue">' + esc(startLabel) +
                '<small>The booking is marked as continuing the next day.</small></button>' +
                '</div></div>';

            // Blocking: swallow Escape, ignore backdrop clicks, keep focus inside.
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); }
                if (e.key === 'Tab') {
                    var btns = backdrop.querySelectorAll('button');
                    var first = btns[0], last = btns[btns.length - 1];
                    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            }
            document.addEventListener('keydown', onKey, true);

            backdrop.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-choice]');
                if (!btn) return;
                document.removeEventListener('keydown', onKey, true);
                backdrop.remove();
                if (btn.dataset.choice === 'reschedule') {
                    resolve({ action: 'reschedule', date: next ? next.date : null, openTime: next ? next.openTime : null, closeTime: next ? next.closeTime : null, result: result });
                } else {
                    resolve({ action: 'proceed', continuesNextDay: true, result: result });
                }
            });

            document.body.appendChild(backdrop);
            backdrop.querySelector('button').focus();
        });
    }

    function addDaysStr(dateStr, days) {
        var d = new Date(dateStr + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    }

    /**
     * @param {{branchId?:string, date:string, time:string, services:Array<{serviceId:string, quantity?:number}>}} input
     * @returns {Promise<{action:'proceed', continuesNextDay:boolean} | {action:'reschedule', date:string|null, openTime:string|null}>}
     */
    async function check(input) {
        var services = (input.services || []).filter(function (s) { return s && s.serviceId; });
        if (!input.date || !input.time || !services.length) return { action: 'proceed', continuesNextDay: false };
        var result;
        try {
            result = await fetchCheck({
                branchId: input.branchId || undefined,
                date: input.date,
                time: String(input.time).slice(0, 5),
                services: services.map(function (s) { return { serviceId: s.serviceId, quantity: s.quantity || 1 }; }),
            });
        } catch (err) {
            console.warn('[ClosingTimeGuard] check unavailable, not blocking the booking:', err && err.message);
            return { action: 'proceed', continuesNextDay: false };
        }
        if (!result || !result.exceedsClosing) return { action: 'proceed', continuesNextDay: false, result: result };
        return prompt(result);
    }

    return { check: check, prompt: prompt };
})();
window.ClosingTimeGuard = ClosingTimeGuard;
