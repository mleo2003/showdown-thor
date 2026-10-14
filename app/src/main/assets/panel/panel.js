// Showdown Thor bottom panel. thorUpdate(state) comes from the official client page (see inject/thor-inject.js);
// every button here sends {kind, name, value} back, which clicks the matching button in the page.
'use strict';

var state = null;
var focusKey = null;
// Coach: 'hints' (damage, speed, threats, a ★ pick), 'quiz' (you choose first, then it shows what it would have done), 'off'
var coachMode = 'hints';
try { coachMode = localStorage.getItem('thorCoach') || 'hints'; } catch (e) {}
var COACH_LABEL = { hints: '🎓 Hints', quiz: '🎓 Quiz', off: '🎓 Off' };
var quiz = null;      // { id, turn, choice, pick, analysis } once you choose in quiz mode
var quizLast = null;  // the previous turn's verdict
var quizScore = { id: '', agree: 0, total: 0 };
function coachOf(s) {
	if (coachMode === 'off' || !window.Coach || s.mode !== 'battle' || s.spectator || s.ended) return null;
	return Coach.analyze(s);
}
function quizOpen(s) { return coachMode === 'quiz' && !(quiz && quiz.id === s.id && quiz.turn === s.turn); }
var STAT_NAMES = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva' };
var BIG_BUTTONS = { skipTurn: 'Skip turn', goToEnd: 'Skip to end', undoChoice: 'Undo choice', clearChoice: 'Back',
	closeAndRematch: 'Rematch', saveReplay: 'Upload replay', instantReplay: 'Instant replay', openTimer: 'Timer',
	closeroom: 'Close battle', leaveRoom: 'Close battle', selectMove: 'Attack', selectSwitch: 'Switch', chooseShift: 'Shift' };

function esc(s) {
	return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
	});
}
function act(o) { return ' data-act="' + esc(JSON.stringify(o)) + '"'; }
function key(k) { return ' data-key="' + esc(k) + '"'; }
function iconSpan(style) { return style ? '<span class="icon" style="' + esc(style) + '"></span>' : ''; }
// Showdown's own type and category icons (bundled copies of sprites/types and sprites/categories)
function typeIcon(t) {
	var f = !t || t === '???' ? 'Unknown' : t;
	return '<img class="ti" src="img/types/' + esc(f) + '.png" alt="' + esc(t) + '" onerror="this.outerHTML=\'' + esc(t) + ' \'">';
}
function catIcon(c) { return c ? '<img class="ci" src="img/categories/' + esc(c) + '.png" alt="' + esc(c) + '">' : ''; }
function typeBadges(types) { return (types || []).map(typeIcon).join(''); }
function hpBar(pct) {
	var cls = pct > 50 ? '' : pct > 20 ? ' y' : ' r';
	return '<div class="hp' + cls + '"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>';
}
function boostText(b) {
	return Object.keys(b || {}).map(function (k) {
		var v = b[k];
		return '<span class="' + (v > 0 ? 'boost' : 'drop') + '">' + (v > 0 ? '+' : '') + v + ' ' + (STAT_NAMES[k] || k) + '</span>';
	}).join(' ');
}

function teamRow(side) {
	var team = (side.team || []).map(function (m) {
		return '<span class="icon' + (m.fainted ? ' f' : '') + '" style="' + esc(m.icon) + '" title="' + esc(m.species) + '"></span>';
	});
	for (var i = team.length; i < (side.total || 0); i++) team.push('<span class="icon q" title="not seen yet"></span>');
	return '<div class="team">' + team.join('') + '</div>';
}

function activeBlock(p, mine, compact) {
	var hp = p.exactHp ? p.hp + '/' + p.maxhp : p.pct + '%';
	var lines = [];
	if (!compact) {
		var extra = [];
		if (p.item) extra.push('<b>' + esc(p.item) + '</b>');
		if (p.ability) extra.push(esc(p.ability));
		if (p.tera) extra.push('Tera ' + esc(p.tera));
		else if (mine && p.teraType) extra.push('Tera type ' + esc(p.teraType));
		if (extra.length) lines.push('<div class="line">' + extra.join(' · ') + '</div>');
	} else if (p.tera) lines.push('<div class="line">Tera ' + esc(p.tera) + '</div>');
	var b = boostText(p.boosts);
	if (b || (p.volatiles && p.volatiles.length)) lines.push('<div class="line">' + b + (p.volatiles.length ? ' ' + esc(p.volatiles.join(', ')) : '') + '</div>');
	if (!mine && !compact && p.moves && p.moves.length) lines.push('<div class="line">Seen: <b>' + esc(p.moves.join(', ')) + '</b></div>');
	return '<div class="mon' + (compact ? ' sm' : '') + '">' + iconSpan(p.icon) + '<span>' + esc(p.species) + '</span><span class="lv">L' + esc(p.level || '') + '</span>' +
		(p.status ? '<span class="status ' + esc(p.status) + '">' + esc(p.status) + '</span>' : '') + '</div>' +
		'<div>' + typeBadges(p.types) + '<span class="line">' + esc(hp) + '</span></div>' + hpBar(p.pct) + lines.join('');
}

function card(label, side, mine, extra) {
	if (!side) return '<div class="card"><div class="who">' + esc(label) + '</div><div class="muted">—</div></div>';
	var active = (side.active || []).filter(function (p) { return p; });
	var total = side.total || (side.team || []).length;
	var left = total - (side.team || []).filter(function (m) { return m.fainted; }).length;
	// Doubles: both Pokémon on the field, compact; singles: the full card
	var body = active.length ? active.map(function (p) { return activeBlock(p, mine, active.length > 1); }).join('') :
		'<div class="muted">Team preview</div>';
	return '<div class="card"><div class="who">' + esc(label) + (total ? ' · ' + left + '/' + total + ' left' : '') + '</div>' +
		body + (extra || '') + teamRow(side) + '</div>';
}

function effBadge(e) {
	if (e == null || e === 1) return '';
	var cls = e === 0 ? 'e0' : e >= 4 ? 'e4' : e >= 2 ? 'e2' : e <= 0.25 ? 'e025' : 'e05';
	return '<span class="eff ' + cls + '">' + (e === 0 ? 'no effect' : '×' + e) + '</span>';
}

function dmgLine(d) {
	if (!d) return '';
	var cls = d.ohko === 'yes' ? 'ko' : d.ohko ? 'ko2' : '';
	return '<div class="d dmg ' + cls + '">≈ ' + d.min + '–' + d.max + '%' + (d.ko ? ' · ' + esc(d.ko) : '') + (d.prio > 0 ? ' · priority' : '') + '</div>';
}
function moveButton(m, co, showCoach) {
	var d = co && showCoach && co.moves ? co.moves[m.value] : null;
	var isPick = co && showCoach && co.pick && co.pick.kind === 'move' && String(co.pick.value) === String(m.value);
	var bits = [];
	if (m.bp) bits.push(m.bp + ' BP');
	bits.push(m.acc ? m.acc + '%' : '—');
	bits.push(esc(m.pp));
	return '<button class="move ' + esc(m.type) + (isPick ? ' pick' : '') + '"' + (m.disabled ? ' disabled' : '') +
		act({ kind: 'click', name: 'chooseMove', value: m.value, label: m.name }) + key('move' + m.value) + '>' +
		'<div class="n"><span>' + (isPick ? '★ ' : '') + esc(m.name) + '</span>' + (m.effs ? '<span class="effs">' + m.effs.map(function (e) {
			return effBadge(e) || '<span class="eff e1">×1</span>';
		}).join('') + '</span>' : effBadge(m.eff)) + '</div>' +
		'<div class="d">' + typeIcon(m.type) + catIcon(m.cat) + bits.join(' · ') + '</div>' +
		(d ? dmgLine(d) : m.desc ? '<div class="d">' + esc(m.desc) + '</div>' : '') + '</button>';
}

function partyButtons(list, name, big, pickIdx) {
	return '<div class="party' + (big ? ' big' : '') + '">' + list.map(function (s) {
		var a = s.disabled || !name ? '' : act({ kind: 'click', name: name, value: s.value, label: s.name });
		var idx = s.idx != null && s.idx >= 0 ? ' data-idx="' + s.idx + '"' : '';
		// Disabled for choosing still opens the teammate sheet (hold, or X on the controller)
		var info = (s.disabled || !name) && idx ? ' data-detail="1"' : '';
		var pk = pickIdx != null && s.idx === pickIdx && !s.disabled;
		return '<button class="mini' + (s.disabled ? ' off' : '') + (pk ? ' pick' : '') + '"' + idx + info + a + key((name || 'info') + s.value + s.name) + '>' +
			iconSpan(s.icon) + '<span>' + (pk ? '★ ' : '') + esc(s.name) + '</span>' + (s.pct != null ? hpBar(s.pct) : '') +
			(s.why && s.why !== 'disabled' ? '<span class="note">' + esc(s.why) + '</span>' : '') + '</button>';
	}).join('') + '</div>';
}

function logBox(lines) {
	return '<div class="log">' + lines.map(function (l) {
		return '<div class="' + (l.turn ? 'turn' : l.chat ? 'chat' : '') + '">' + esc(l.t) + '</div>';
	}).join('') + '</div>';
}

// ── coach ─────────────────────────────────────────────────────────────────────────
function likelyLine(co) {
	if (!co || !co.sets || !co.sets.length || !co.data) return '';
	var items = {}, abil = {};
	co.sets.forEach(function (x) { x.items.forEach(function (i) { items[i] = 1; }); x.abilities.forEach(function (a) { abil[a] = 1; }); });
	var bits = [];
	if (!co.revealed.item && !co.revealed.itemGone) bits.push(Object.keys(items).join(' / '));
	if (!co.revealed.ability) bits.push(Object.keys(abil).join(' / '));
	bits = bits.filter(Boolean);
	return bits.length ? '<div class="line likely">Likely: <b>' + esc(bits.join(' · ')) + '</b></div>' : '';
}
function speedText(sp) {
	if (!sp) return '';
	var tr = sp.trickRoom ? ' (Trick Room)' : '';
	if (sp.first === 'you' && sp.firstVsScarf === 'foe') return '⚡ You first' + tr + ' unless Choice Scarf · ' + sp.you + ' vs ' + sp.foe + ' (Scarf ' + sp.scarf + ')';
	if (sp.first === 'you') return '⚡ You move first' + tr + ' · ' + sp.you + ' vs ' + sp.foe;
	if (sp.first === 'foe') return '🐢 Foe moves first' + tr + ' · ' + sp.foe + ' vs ' + sp.you;
	return '⚖ Speed tie · ' + sp.you;
}
function pickText(p) {
	if (!p) return '';
	return p.kind === 'switch' ? '↻ Switch to ' + esc(p.name) + ': ' + esc(p.why) : '★ ' + esc(p.name) + ': ' + esc(p.why);
}
function coachStrip(s, co, open) {
	var html = '';
	if (!open) {
		html = '<div class="cl">🎓 Quiz: make your choice. The coach answers once you have.</div>' +
			(quizLast && quizLast.id === s.id ? '<div class="cl muted">Last turn: ' + (quizLast.same ? '✅ same as the coach' : 'you ' + esc(quizLast.choice.label) +
				', coach ' + esc(quizLast.pick ? quizLast.pick.name : '—')) + ' · score ' + quizScore.agree + '/' + quizScore.total + '</div>' : '');
	} else if (quiz && quiz.id === s.id && quiz.turn === s.turn && coachMode === 'quiz') {
		var same = quiz.pick && quiz.choice.kind === quiz.pick.kind && String(quiz.choice.value) === String(quiz.pick.kind === 'switch' ? quiz.pick.index : quiz.pick.value);
		html = '<div class="cl">' + (same ? '✅ Same as the coach' : '🎓 You: <b>' + esc(quiz.choice.label) + '</b>') + ' · score ' + quizScore.agree + '/' + quizScore.total + '</div>' +
			(same ? '' : '<div class="cl">' + pickText(quiz.pick) + '</div>');
	} else {
		var t = co.threats && co.threats[0], sp = co.speed;
		var spd = !sp ? '' : sp.first === 'you' ? (sp.firstVsScarf === 'foe' ? '⚡ First unless Scarf' : '⚡ You first') : sp.first === 'foe' ? '🐢 They go first' : '⚖ Speed tie';
		html = (co.forced ? '<div class="cl">Choose who comes in next:</div>' : '<div class="cl">' + spd + (t ? ' · <span class="' + (co.danger.length ? 'warn' : '') + '">⚠ ' + esc(t.name) + ' ≤' + t.max + '%' +
				(co.danger.length ? ' can KO' : '') + '</span>' : '') + '</div>') +
			(co.pick ? '<div class="cl pk">' + pickText(co.pick) + '</div>' : '');
	}
	return '<button class="coach"' + act({ kind: 'open-picker', type: 'coach' }) + key('coach') + '>' + html + '</button>';
}

function renderBattle(s) {
	var c = s.controls || {};
	var btns0 = '';
	var co = coachOf(s), open = !quizOpen(s);
	if (co && co.error) co = null;
	var showCoach = !!co && open;
	var html = '<div class="sides">' + card('Foe' + (s.foe && s.foe.name ? ' · ' + s.foe.name : ''), s.foe, false, showCoach ? likelyLine(co) : '') +
		card(s.spectator ? (s.you && s.you.name) || 'Player' : 'You', s.you, !s.spectator) + '</div>';
	var gim = (c.moves && c.moves.length && c.gimmicks && c.gimmicks.length) ? '<div class="gim">' + c.gimmicks.map(function (g) {
		return '<button class="' + (g.checked ? 'on' : '') + '"' + act({ kind: 'toggle', name: g.name }) + key('gim' + g.name) + '>' +
			(g.checked ? '✔ ' : '') + esc(g.label) + '</button>';
	}).join('') + '</div>' : '';
	// With the coach on, its two lines take the place of "What will X do?" (the bottom screen has no room to spare)
	var strip = co && (c.moves && c.moves.length || co.forced || (quiz && quiz.id === s.id && quiz.turn === s.turn)) ? coachStrip(s, co, open) : '';
	if (strip) html += '<div class="ask">' + strip + gim + '</div>';
	else if (c.whatdo || gim) html += '<div class="ask"><span class="whatdo">' + esc(c.whatdo) + '</span>' + gim + '</div>';

	if (c.preview && c.preview.length) {
		html += '<div class="note">Choose your lead:</div>' + partyButtons(c.preview.map(function (p) {
			return { value: p.value, name: p.name, icon: p.icon };
		}), 'chooseTeamPreview', true);
	} else if (c.targets && c.targets.length) {
		html += '<div class="note">Choose a target:</div>' + partyButtons(c.targets, 'chooseMoveTarget', true);
	} else if (c.moves && c.moves.length) {
		html += '<div class="moves">' + c.moves.map(function (m) { return moveButton(m, co, showCoach); }).join('') + '</div>';
		if (c.switches && c.switches.length) html += partyButtons(c.switches, 'chooseSwitch', false,
			showCoach && co.pick && co.pick.kind === 'switch' ? co.pick.index : null);
	} else if (c.switches && c.switches.length) {
		html += (strip ? '' : '<div class="note">Choose a Pokémon to switch in:</div>') + partyButtons(c.switches, 'chooseSwitch', true,
			showCoach && co.pick && co.pick.kind === 'switch' ? co.pick.index : null);
	} else if (!s.ended) {
		html += '<div class="note">' + (s.waiting ? 'Waiting for your opponent…' : 'Battle in progress…') + '</div>';
		html += '<div class="note legend">' + LEGEND + '</div>';
		if (s.big && s.log && s.log.length) html += logBox(s.log);
		if (s.team && s.team.length) html += partyButtons(s.team.map(function (t) {
			return { value: t.index, idx: t.index, name: t.name, icon: t.icon, pct: t.maxhp ? Math.round(100 * t.hp / t.maxhp) : 0,
				why: t.fainted ? 'fainted' : t.active ? 'active' : '' };
		}), null, false);
	}

	if (s.ended || s.spectator) btns0 = '<button' + act({ kind: 'leave' }) + key('leave') + '>Close battle</button>';
	var btns = (c.buttons || []).filter(function (b) {
		return BIG_BUTTONS[b.name] && b.name !== 'selectMove' && b.name !== 'selectSwitch' && b.name !== 'openTimer';
	});
	if (btns.length || btns0) {
		html += '<div class="row">' + btns0 + btns.map(function (b) {
			return '<button' + (b.disabled ? ' disabled' : '') + act({ kind: 'click', name: b.name, value: b.value }) + key('btn' + b.name) + '>' +
				esc(BIG_BUTTONS[b.name] || b.label) + '</button>';
		}).join('') + '</div>';
	}
	return html;
}

// ── Lobby, challenges, pickers, Watch a battle, friends ─────────────────────────
var picker = null; // { type: 'formats' | 'teams' | 'forfeit' | 'challenges', ctx }

function renderChallenge(c) {
	var head = c.state === 'incoming' ? '<b>' + esc(c.name) + '</b> wants to battle!' :
		c.state === 'compose' ? 'Challenge <b>' + esc(c.name) + '</b>?' :
		c.state === 'outgoing' ? 'Waiting for <b>' + esc(c.name) + '</b>…' : 'The challenge was cancelled.';
	var html = '<div class="chal ' + c.state + '"><div>⚔ ' + head + '</div>';
	if (c.state !== 'cancelled') {
		html += '<div class="chrow">' + (c.formatLocked || c.state !== 'compose' ? '<span class="pill">' + esc(c.format.name) + '</span>' :
			'<button class="fmt"' + act({ kind: 'open-picker', type: 'formats', ctx: c.user }) + key('chf' + c.user) + '>Format: <b>' + esc(c.format.name) + '</b> ▸</button>');
		if (c.team && (c.state === 'incoming' || c.state === 'compose') && c.format.needsTeam) {
			html += '<button class="fmt"' + act({ kind: 'open-picker', type: 'teams', ctx: c.user }) + key('cht' + c.user) + '>Team: <b>' + esc(c.team.label) + '</b> ▸</button>';
		}
		html += '</div>';
	}
	var btn = function (action, label, cls) {
		return '<button class="' + (cls || '') + '"' + act({ kind: 'ch', user: c.user, action: action }) + key('ch' + action + c.user) + '>' + label + '</button>';
	};
	html += '<div class="row">';
	if (c.state === 'incoming') html += btn('accept', '✔ Accept', 'go') + btn('reject', 'Reject');
	else if (c.state === 'compose') html += btn('make', '⚔ Challenge', 'go') + btn('dismiss', 'Cancel');
	else if (c.state === 'outgoing') html += btn('cancel', 'Cancel challenge');
	else html += btn('dismiss', 'OK');
	if (c.state === 'incoming' || c.state === 'compose') {
		html += '<button class="' + (c.private ? 'on' : '') + '"' + act({ kind: 'ch-private', user: c.user, on: !c.private }) + key('chp' + c.user) + '>' +
			(c.private ? '✔ ' : '') + 'No spectators</button>';
	}
	return html + '</div></div>';
}

function renderChallenges(s) {
	return (s.challenges || []).map(renderChallenge).join('');
}

function renderLobby(s) {
	var f = s.form;
	var html = renderChallenges(s);
	html += '<div class="note">' + (s.user && s.user.named ? 'Signed in as <b>' + esc(s.user.name) + '</b>' : 'Not signed in (choose a name on the top screen)') + '</div>';
	if (f) {
		html += '<div class="row"><button class="fmt"' + act({ kind: 'open-picker', type: 'formats', ctx: 'menu' }) + key('lfmt') + '>Format: <b>' + esc(f.format.name) + '</b> ▸</button>';
		if (f.format.needsTeam) html += '<button class="fmt"' + act({ kind: 'open-picker', type: 'teams', ctx: 'menu' }) + key('lteam') + '>Team: <b>' + esc(f.team ? f.team.label : 'Select a team') + '</b> ▸</button>';
		html += '</div>';
	}
	html += '<button class="big mm1" style="width:100%"' + act({ kind: 'search' }) + key('search') + '>' + ((f ? f.searching : s.searching) ? 'Searching… tap to cancel' : 'Battle!') + '</button>';
	html += '<div class="grid3">' +
		'<button class="mm2"' + act({ kind: 'room', id: 'teambuilder' }) + key('tb-open') + '>Teambuilder</button>' +
		'<button class="mm3"' + act({ kind: 'room', id: 'ladder' }) + key('ladder') + '>Ladder</button>' +
		'<button class="mm4"' + act({ kind: 'menu', name: 'battles' }) + key('watch') + '>Watch a battle</button>' +
		'<button class="mm5"' + act({ kind: 'menu', name: 'finduser' }) + key('finduser') + '>Find a user</button>' +
		'<button class="mm6"' + act({ kind: 'menu', name: 'friends' }) + key('friends') + '>Friends</button></div>';
	if (s.battles && s.battles.length) {
		html += '<div class="list">' + s.battles.map(function (b) {
			return '<button' + act({ kind: 'room', id: b.id }) + key('room' + b.id) + '>' + esc(b.title) + '</button>';
		}).join('') + '</div>';
	}
	return '<div class="scroll" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:6px">' + html + '</div>';
}

function renderBattlesList(s) {
	var html = renderChallenges(s);
	html += '<div class="tbhead"><button' + act({ kind: 'leave', room: 'battles' }) + key('bl-close') + '>◀ Home</button><b>Watch a battle</b>' +
		'<button' + act({ kind: 'battles-refresh' }) + key('bl-refresh') + '>⟳ Refresh</button></div>';
	html += '<div class="chips"><button class="' + (!s.format ? 'cur' : '') + '"' + act({ kind: 'battles-format', format: '' }) + key('blf-all') + '>All</button>' +
		s.formats.map(function (f) {
			return '<button class="' + (s.format === f.id ? 'cur' : '') + '"' + act({ kind: 'battles-format', format: f.id }) + key('blf' + f.id) + '>' +
				esc(f.name.replace(/^\[Gen \d+\]\s*/, '')) + ' <small>' + f.n + '</small></button>';
		}).join('') + '</div>';
	html += '<div class="results scroll">' + (s.list.length ? s.list.map(function (b) {
		return '<button class="res"' + act({ kind: 'room', id: b.id }) + key('bl' + b.id) + '><div class="d">' + esc(b.formatName) +
			(b.elo ? ' · rated ' + esc(b.elo) : '') + '</div><div class="n">' + esc(b.p1) + ' <span class="muted">vs.</span> ' + esc(b.p2) + '</div></button>';
	}).join('') : '<div class="note">No battles listed. Try ⟳ Refresh or another format.</div>') + '</div>';
	return html;
}

function renderFriends(s) {
	var html = renderChallenges(s);
	html += '<div class="tbhead"><button' + act({ kind: 'leave', room: s.page }) + key('fr-close') + '>◀ Home</button><b>Friends</b><span class="muted">' +
		s.friends.filter(function (f) { return f.online; }).length + ' online</span></div>';
	if (s.empty) html += '<div class="note">' + esc(s.empty) + '</div>';
	html += '<div class="results scroll">' + s.friends.slice().sort(function (a, b) { return b.online - a.online; }).map(function (f) {
		var btns = f.online ? '<div class="row">' +
			'<button' + act({ kind: 'pm', name: f.name }) + key('pm' + f.name) + '>💬 Message</button>' +
			'<button' + act({ kind: 'challengeUser', name: f.name }) + key('chu' + f.name) + '>⚔ Challenge</button>' +
			'<button' + act({ kind: 'watchUser', name: f.name }) + key('wu' + f.name) + '>👁 Watch</button></div>' : '';
		return '<div class="friend' + (f.online ? '' : ' off') + '"><div><b>' + esc(f.name) + '</b> <span class="muted">' + esc(f.status) + '</span></div>' + btns + '</div>';
	}).join('') + '</div>';
	return html;
}

function renderPicker(s) {
	if (!picker) return '';
	var body = '', title = '';
	if (picker.type === 'formats') {
		title = 'Choose a format';
		var list = picker.ctx === 'menu' ? s.formats : s.challengeFormats || s.formats;
		var cur = picker.ctx === 'menu' ? (s.form && s.form.format.id) : ((s.challenges || []).filter(function (c) { return c.user === picker.ctx; })[0] || { format: {} }).format.id;
		var section = null;
		(list || []).forEach(function (f) {
			if (f.section !== section) { section = f.section; body += '<div class="hdr">' + esc(section || 'Formats') + '</div>'; }
			body += '<button class="pick' + (f.id === cur ? ' cur' : '') + '"' + act(picker.ctx === 'menu' ? { kind: 'menu-format', format: f.id } :
				{ kind: 'ch-format', user: picker.ctx, format: f.id }) + key('pf' + f.id) + '>' + esc(f.name) + (f.team ? '' : ' <span class="muted">random team</span>') + '</button>';
		});
	} else if (picker.type === 'teams') {
		title = 'Choose a team';
		var src = picker.ctx === 'menu' ? s.form : (s.challenges || []).filter(function (c) { return c.user === picker.ctx; })[0];
		var teams = src ? src.teams || [] : [];
		body = teams.length ? teams.map(function (t) {
			return '<button class="pick' + (src.team && String(src.team.value) === String(t.i) ? ' cur' : '') + '"' +
				act(picker.ctx === 'menu' ? { kind: 'menu-team', i: t.i } : { kind: 'ch-team', user: picker.ctx, i: t.i }) + key('pt' + t.i) + '><b>' + esc(t.name) +
				'</b> <span class="muted">' + esc(t.format) + (t.match ? ' ✔' : '') + '</span></button>';
		}).join('') : '<div class="note">No teams yet: build one in the Teambuilder.</div>';
	} else if (picker.type === 'forfeit') {
		title = 'Forfeit this battle?';
		body = '<div class="note">Your opponent wins immediately.</div><div class="row"><button class="bad"' + act({ kind: 'forfeit' }) + key('ff-yes') + '>🏳 Forfeit</button></div>';
	} else if (picker.type === 'coach') {
		title = 'Coach';
		body = renderCoachSheet(s);
	} else if (picker.type === 'challenges') {
		title = 'Challenges';
		body = renderChallenges(s) || '<div class="note">No challenges right now.</div>';
	}
	return '<div class="sheet" id="sheet"><div class="tbhead"><b>' + esc(title) + '</b><button data-close="1"' + key('pk-close') + '>Close</button></div>' +
		'<div class="results scroll">' + body + '</div></div>';
}

function renderCoachSheet(s) {
	var co = window.Coach && Coach.analyze(s);
	if (!co || co.error) return '<div class="note">' + (co && co.error ? 'Coach error: ' + esc(co.error) : 'The coach works in singles Random Battles while it is your turn.') + '</div>';
	if (coachMode === 'quiz' && quizOpen(s)) return '<div class="note">Quiz mode: choose first, then open this again to compare.</div>';
	var h = '';
	if (co.pick) h += '<div class="hdr">Suggestion</div><div class="cbox">' + pickText(co.pick) + '</div>';
	if (co.speed) h += '<div class="hdr">Speed</div><div class="cbox">' + speedText(co.speed) + '</div>';
	h += '<div class="hdr">Your moves vs ' + esc(co.foeName) + ' L' + co.level + '</div><div class="ctab">' + Object.keys(co.moves).map(function (v) {
		var m = co.moves[v];
		return '<div><b>' + esc(m.name) + '</b><span>' + m.min + '–' + m.max + '%</span><i>' + esc(m.ko || '') + (m.prio > 0 ? ' · priority' : '') + '</i></div>';
	}).join('') + '</div>';
	h += '<div class="hdr">Their moves vs you</div><div class="ctab">' + co.threats.slice(0, 8).map(function (t) {
		return '<div class="' + (t.max >= 100 || co.danger.indexOf(t.name) >= 0 ? 'warn' : '') + '"><b>' + esc(t.name) + '</b><span>' + t.min + '–' + t.max + '%</span><i>' +
			(t.seen ? 'seen' : 'possible') + (t.prio > 0 ? ' · priority' : '') + '</i></div>';
	}).join('') + '</div>';
	if (co.bench && co.bench.length) h += '<div class="hdr">Switch-ins (worst hit taken · best hit back)</div><div class="ctab">' + co.bench.map(function (b) {
		return '<div><b>' + esc(b.name) + '</b><span>≤' + b.taken + '%</span><i>' + esc(b.takenBy) + ' · ' + b.dealt + '% ' + esc(b.dealtBy) + '</i></div>';
	}).join('') + '</div>';
	h += '<div class="hdr">' + (co.data ? 'Possible sets (Random Battle data)' : 'No set data for this format') + '</div>';
	h += co.sets.map(function (x) {
		return '<div class="cbox"><b>' + esc(x.name) + '</b><div class="note">' + esc(x.moves.join(', ')) + '</div><div class="note">' +
			esc([x.items.join(' / '), x.abilities.join(' / '), x.tera.length ? 'Tera ' + x.tera.join(' / ') : ''].filter(Boolean).join(' · ')) + '</div></div>';
	}).join('');
	if (co.revealed.item || co.revealed.ability || co.revealed.moves.length) h += '<div class="note">Revealed: ' + esc([co.revealed.item, co.revealed.ability, co.revealed.moves.join(', ')].filter(Boolean).join(' · ')) + '</div>';
	if (quizScore.total) h += '<div class="note">Quiz this battle: ' + quizScore.agree + '/' + quizScore.total + ' the same as the coach.</div>';
	h += '<div class="note">Damage: Smogon calc with Random Battle spreads; unknown items are guessed from the possible sets.</div>';
	return h;
}

// ── teammate sheet (hold a party slot, or X on it) ─────────────────────────────
var sheetIdx = null;
var STAT_ORDER = ['atk', 'def', 'spa', 'spd', 'spe'];
function renderSheet(s) {
	var t = (s.team || [])[sheetIdx];
	if (!t) { sheetIdx = null; return ''; }
	var sw = ((s.controls || {}).switches || []).filter(function (x) { return x.idx === sheetIdx && !x.disabled; })[0];
	var info = [];
	if (t.item) info.push('<b>' + esc(t.item) + '</b>');
	if (t.ability) info.push(esc(t.ability));
	if (t.teraType) info.push('Tera type ' + esc(t.teraType));
	var stats = t.stats ? STAT_ORDER.map(function (k) { return STAT_NAMES[k] + ' <b>' + t.stats[k] + '</b>'; }).join(' · ') : '';
	var moves = t.moves.map(function (m) {
		var bits = [];
		if (m.bp) bits.push(m.bp + ' BP');
		bits.push(m.acc ? m.acc + '%' : '—');
		return '<div class="smove ' + esc(m.type) + '"><div class="n"><span>' + esc(m.name) + '</span>' + effBadge(m.eff) + '</div>' +
			'<div class="d">' + typeIcon(m.type) + catIcon(m.cat) + bits.join(' · ') +
			(m.desc ? ' — ' + esc(m.desc) : '') + '</div></div>';
	}).join('');
	return '<div class="sheet" id="sheet"><div class="mon">' + iconSpan(t.icon) + '<span>' + esc(t.name) +
		(t.name !== t.species ? ' <span class="lv">(' + esc(t.species) + ')</span>' : '') + '</span><span class="lv">L' + esc(t.level) + '</span>' +
		(t.status ? '<span class="status ' + esc(t.status) + '">' + esc(t.status) + '</span>' : '') + '</div>' +
		'<div>' + typeBadges(t.types) + '<span class="line">' + t.hp + '/' + t.maxhp + '</span></div>' +
		hpBar(t.maxhp ? Math.round(100 * t.hp / t.maxhp) : 0) +
		(info.length ? '<div class="line">' + info.join(' · ') + '</div>' : '') +
		(stats ? '<div class="line">' + stats + '</div>' : '') +
		'<div class="smoves">' + moves + '</div>' +
		'<div class="row">' + (sw ? '<button' + act({ kind: 'click', name: 'chooseSwitch', value: sw.value }) + key('sheet-switch') + '>Switch in</button>' : '') +
		'<button data-close="1"' + key('sheet-close') + '>Close</button></div></div>';
}
function openSheet(idx) { sheetIdx = idx; focusKey = null; render(); }
function closeSheet() { sheetIdx = null; focusKey = null; render(); }


// ── Teambuilder ─────────────────────────────────────────────────────────────────
var FIELDS = [['pokemon', 'Pokémon'], ['item', 'Item'], ['ability', 'Ability'], ['stats', 'Stats'],
	['move1', 'Move 1'], ['move2', 'Move 2'], ['move3', 'Move 3'], ['move4', 'Move 4']];
var STAT_LABEL = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

function itemIcon(style) { return style ? '<span class="item-icon" style="' + esc(style) + '"></span>' : ''; }

function renderTeamList(s) {
	var html = '<div class="tbhead"><b>Teambuilder</b><span class="muted">' + s.teams.length + ' team' + (s.teams.length === 1 ? '' : 's') + '</span>' +
		'<button' + act({ kind: 'tb-click', name: 'newTop', value: 'team' }) + key('tb-new') + '>＋ New team</button></div>';
	html += '<div class="tblist scroll">' + (s.teams.length ? s.teams.map(function (t) {
		return '<button class="tbteam"' + act({ kind: 'tb-edit', i: t.i }) + key('team' + t.i) + '><b>' + esc(t.name) + '</b> <span class="muted">' +
			esc(t.format) + '</span><div class="icons">' + t.icons.map(iconSpan).join('') + '</div></button>';
	}).join('') : '<div class="note">No teams yet. Make one with "New team", or use "View teams uploaded to server" on the top screen.</div>') + '</div>';
	return html;
}

function renderTeam(s) {
	var t = s.team;
	var html = '<div class="tbhead"><button' + act({ kind: 'tb-click', name: 'back' }) + key('tb-back') + '>◀ Teams</button>' +
		'<span><b>' + esc(t.name) + '</b> <span class="muted">' + esc(t.format || 'no format') + '</span></span>' +
		'<button' + act({ kind: 'tb-click', name: 'validate' }) + key('tb-validate') + '>✔ Validate</button></div>';
	html += '<div class="sets">' + t.sets.map(function (x) {
		return '<button class="setbtn"' + act({ kind: 'tb-select', i: x.i }) + key('set' + x.i) + '><div class="n">' + iconSpan(x.icon) +
			'<span>' + esc(x.name && x.name !== x.species ? x.name : x.species || '(empty)') + '</span></div>' +
			'<div class="d">' + esc([x.item, x.ability].filter(Boolean).join(' · ')) + '</div>' +
			'<div class="d">' + esc(x.moves.map(function (m) { return m.name; }).join(', ')) + '</div></button>';
	}).join('') + '</div>';
	if (t.sets.length < 6) html += '<div class="row"><button' + act({ kind: 'tb-click', name: 'addPokemon' }) + key('tb-add') + '>＋ Add Pokémon</button></div>';
	if (window.renderTeamOverview) html += renderTeamOverview(t);
	return html;
}

function fieldValue(set, f) {
	if (f === 'pokemon') return set.species;
	if (f === 'item') return set.item;
	if (f === 'ability') return set.ability;
	if (f === 'stats') return set.nature || 'EVs / nature';
	var m = set.moves[+f.slice(4) - 1];
	return m ? m.name : '';
}

function resultCard(r) {
	if (r.h) return '<div class="hdr">' + esc(r.h) + '</div>';
	var a = act({ kind: 'tb-pick', entry: r.entry }) + key('res' + r.entry);
	if (r.k === 'pokemon') {
		var bs = r.bs ? ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(function (k) { return STAT_LABEL[k] + ' <b>' + r.bs[k] + '</b>'; }).join(' ') : '';
		return '<button class="res"' + a + '><div class="n">' + iconSpan(r.icon) + esc(r.name) + ' ' + typeBadges(r.types) +
			(r.tier ? '<span class="muted" style="font-size:12px;font-weight:400">' + esc(r.tier) + '</span>' : '') + '</div>' +
			'<div class="bsrow">' + bs + '</div><div class="d">' + esc(r.abil.join(' / ')) + '</div></button>';
	}
	if (r.k === 'move') {
		var bits = [];
		if (r.bp) bits.push(r.bp + ' BP');
		bits.push(r.acc ? r.acc + '%' : '—');
		if (r.pp) bits.push(r.pp + ' PP');
		return '<button class="res move ' + esc(r.type) + '"' + a + '><div class="n">' + esc(r.name) + ' ' + typeIcon(r.type) + catIcon(r.cat) +
			'<span style="font-size:12px;font-weight:normal;color:#555">' + bits.join(' · ') + '</span></div>' +
			(r.desc ? '<div class="d">' + esc(r.desc) + '</div>' : '') + '</button>';
	}
	return '<button class="res"' + a + '><div class="n">' + itemIcon(r.icon) + esc(r.name) + '</div>' +
		(r.desc ? '<div class="d">' + esc(r.desc) + '</div>' : '') + '</button>';
}

function renderSet(s) {
	var set = s.set;
	var html = '<div class="tbhead"><button' + act({ kind: 'tb-click', name: 'back' }) + key('tb-back') + '>◀ Team</button>' +
		'<span>' + iconSpan(set.icon) + '<b>' + esc(set.species || 'New Pokémon') + '</b> ' + typeBadges(set.types) + '</span>' +
		'<button' + act({ kind: 'kbd', on: !s.kbd }) + key('tb-kbd') + '>⌨ ' + (s.kbd ? 'Hide' : 'Keyboard') + '</button></div>';
	html += '<div class="tabs">' + FIELDS.map(function (f) {
		var v = fieldValue(set, f[0]);
		return '<button class="' + (s.field === f[0] ? 'cur' : '') + '"' + act({ kind: 'tb-focus', field: f[0] }) + key('field' + f[0]) + '>' +
			esc(f[1]) + '<b>' + esc(v || '—') + '</b></button>';
	}).join('') + '</div>';
	if (s.chart === 'stats' && window.renderStats) return html + renderStats(s);
	if (s.field && s.field !== 'details') {
		html += '<div class="query"><div class="q">' + (s.query ? esc(s.query) : '<i>type to search, or pick below</i>') + '</div>' +
			'<button' + act({ kind: 'key', key: 'back' }) + key('q-back') + '>⌫</button>' +
			'<button' + act({ kind: 'key', key: 'clear' }) + key('q-clear') + '>✕</button></div>';
		html += '<div class="results scroll" id="results">' + ((s.results || []).map(resultCard).join('') ||
			'<div class="note">No matches</div>') + '</div>';
	} else {
		html += '<div class="note">Pick a field above to search for it.</div>';
	}
	return html;
}

function renderTeambuilder(s) {
	if (s.view !== 'set' || s.chart !== 'stats') natureOpen = false;
	if (s.view === 'list') return renderTeamList(s);
	if (s.view === 'team') return '<div class="scroll" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:6px">' + renderTeam(s) + '</div>';
	return renderSet(s);
}


// ── Stats tab and team overview ─────────────────────────────────────────────────
var natureOpen = false;
function renderStats(s) {
	var set = s.set, cap = s.evCap || 252;
	if (!set.bs) return '<div class="note">Pick a Pokémon first.</div>';
	var stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
	var total = stats.reduce(function (t, k) { return t + (set.evs[k] || 0); }, 0);
	var nat = (s.natures || []).filter(function (n) { return n.name === set.nature; })[0] || {};
	if (natureOpen) {
		return '<div class="note">Nature (↑ raised, ↓ lowered):</div><div class="natures scroll">' + (s.natures || []).map(function (n) {
			var lbl = n.plus ? '↑' + STAT_LABEL[n.plus] + ' ↓' + STAT_LABEL[n.minus] : 'neutral';
			return '<button class="' + (n.name === set.nature ? 'cur' : '') + '" data-nature="' + esc(n.name) + '"' +
				act({ kind: 'tb-nature', nature: n.name }) + key('nat' + n.name) + '><b>' + esc(n.name) + '</b><span>' + lbl + '</span></button>';
		}).join('') + '</div>';
	}
	var step = cap > 32 ? 4 : 1; // EVs count in fours (stat points in Champions formats: ones)
	var rows = stats.map(function (k) {
		var ev = set.evs[k] || 0, iv = set.ivs[k] !== undefined ? set.ivs[k] : 31;
		var mark = nat.plus === k ? ' up' : nat.minus === k ? ' down' : '';
		return '<div class="srow"><span class="sl' + mark + '">' + STAT_LABEL[k] + '</span><span class="sb">' + set.bs[k] + '</span>' +
			'<button' + act({ kind: 'tb-ev', stat: k, value: 0 }) + key('ev0' + k) + '>0</button>' +
			'<button' + act({ kind: 'tb-ev', stat: k, value: Math.max(0, ev - step) }) + key('evm' + k) + '>−</button>' +
			'<span class="ev">' + ev + '</span>' +
			'<button' + act({ kind: 'tb-ev', stat: k, value: Math.min(cap, ev + step) }) + key('evp' + k) + '>+</button>' +
			'<button' + act({ kind: 'tb-ev', stat: k, value: cap }) + key('evmax' + k) + '>' + cap + '</button>' +
			'<button class="iv"' + act({ kind: 'tb-iv', stat: k, value: iv === 31 ? 0 : 31 }) + key('iv' + k) + '>IV ' + iv + '</button>' +
			'<span class="sf">' + (set.stats ? set.stats[k] : '') + '</span></div>';
	}).join('');
	var max = cap > 32 ? 510 : 66;
	return '<div class="stats">' + rows + '</div><div class="row"><span class="note" style="align-self:center">EVs ' + total + ' / ' + max +
		(total > max ? ' (too many)' : '') + '</span><button data-natures="1"' + key('nature') + '>Nature: ' +
		esc(set.nature || 'Serious') + '</button></div>';
}

function renderTeamOverview(t) {
	var o = t.overview;
	if (!o || !t.sets.some(function (x) { return x.species; })) return '';
	var weak = o.weak.map(function (w) {
		var bad = w.weak >= 3 && w.resist + w.immune === 0 ? ' bad' : w.weak > w.resist + w.immune ? ' warn' : '';
		return '<div class="wt' + bad + '">' + typeIcon(w.type) +
			'<span>' + (w.weak ? '<b class="w">' + w.weak + '</b>' : '·') + ' ' + (w.resist ? '<b class="r">' + w.resist + '</b>' : '·') +
			(w.immune ? ' <b class="i">' + w.immune + '</b>' : '') + '</span></div>';
	}).join('');
	var speed = o.speed.map(function (m) { return iconSpan(m.icon) + '<b>' + m.spe + '</b>'; }).join(' ');
	return '<div class="ov"><div class="hdr">Weak / resist / immune per attacking type</div><div class="weak">' + weak + '</div>' +
		(speed ? '<div class="hdr">Speed (final stat)</div><div class="spd">' + speed + '</div>' : '') +
		(o.noCover ? '<div class="hdr">No super-effective move vs</div><div>' + (o.noCover.length ? typeBadges(o.noCover) : 'none — full coverage') + '</div>' : '') +
		'</div>';
}

// The keyboard is built once and only shown or hidden, so a key press is never lost to a redraw. It types into
// whichever text box is selected on the top screen (chat, messages, prompts, Teambuilder).
var KBD_ROWS = { abc: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'], num: ['1234567890', '-/:;()\'"', '.,?!@&'] };
var kbdMode = 'abc', kbdShift = false;
function buildKeyboard() {
	var rows = KBD_ROWS[kbdMode];
	var k = function (t) {
		var c = kbdShift ? t.toUpperCase() : t;
		return '<button' + act({ kind: 'type', text: c }) + key('k' + t) + '>' + esc(c) + '</button>';
	};
	var html = '<div id="kbdline"></div>' + rows.map(function (r, i) {
		return '<div class="kr">' + (i === 2 && kbdMode === 'abc' ? '<button class="w2' + (kbdShift ? ' on' : '') + '" data-kbdshift="1"' + key('kshift') + '>⇧</button>' : '') +
			r.split('').map(k).join('') +
			(i === rows.length - 1 ? '<button class="w2"' + act({ kind: 'key', key: 'back' }) + key('kback') + '>⌫</button>' : '') + '</div>';
	}).join('');
	html += '<div class="kr"><button class="w2" data-kbdmode="1"' + key('kmode') + '>' + (kbdMode === 'abc' ? '123' : 'abc') + '</button>' +
		'<button class="w2"' + act({ kind: 'key', key: 'done' }) + key('kdone') + '>Done</button>' +
		'<button class="w5"' + act({ kind: 'type', text: ' ' }) + key('kspace') + '>space</button>' +
		'<button class="w2 enter"' + act({ kind: 'key', key: 'enter' }) + key('kenter') + '><span id="kenter">OK</span></button></div>';
	document.getElementById('kbd').innerHTML = html;
}
function showKeyboard(typing) {
	var el = document.getElementById('kbd');
	if (typing && !el.innerHTML) buildKeyboard();
	el.classList.toggle('on', !!typing);
	if (!typing) return;
	var line = document.getElementById('kbdline');
	var v = typing.value || '';
	if (v.length > 60) v = '…' + v.slice(-60);
	line.innerHTML = '<span class="lbl">' + esc(typing.label || 'Typing') + '</span><span class="val">' + esc(v) + '<i>▏</i></span>' +
		'<button' + act({ kind: 'kbd', on: false }) + key('k-off') + ' title="Use Android\'s keyboard instead">⌨✕</button>';
	document.getElementById('kenter').textContent = typing.enter || 'OK';
}

var lastViewHtml = '';
// Teambuilder updates arrive with every key press: only redraw when the content changed, and keep the results scroll
function setView(html) {
	if (html === lastViewHtml) return;
	var view = document.getElementById('view');
	var res = document.getElementById('results'), top = res ? res.scrollTop : 0, sameField = lastViewHtml.split('id="results"')[0] === html.split('id="results"')[0];
	lastViewHtml = html;
	view.innerHTML = html;
	var res2 = document.getElementById('results');
	if (res2 && sameField) res2.scrollTop = top;
}

function render() {
	var s = state || { mode: 'loading' };
	var view = document.getElementById('view');
	if (s.mode !== 'teambuilder') lastViewHtml = '';
	var title = 'Showdown Thor';
	if (s.mode === 'battle') {
		title = (s.tier || 'Battle') + (s.turn ? ' · Turn ' + s.turn : '') + (s.ended ? ' · Ended' : '');
		view.innerHTML = renderBattle(s);
		if (sheetIdx != null) view.insertAdjacentHTML('beforeend', renderSheet(s));
	} else if (s.mode === 'teambuilder') {
		title = 'Teambuilder';
		setView(renderTeambuilder(s));
	} else if (s.mode === 'battles') {
		title = 'Watch a battle';
		view.innerHTML = renderBattlesList(s);
	} else if (s.mode === 'friends') {
		title = 'Friends';
		view.innerHTML = renderFriends(s);
	} else if (s.mode === 'lobby') {
		view.innerHTML = renderLobby(s);
	} else if (s.mode === 'error') {
		view.innerHTML = '<div class="center muted">Panel error: ' + esc(s.error) + '</div>';
	} else {
		view.innerHTML = '<div class="center muted">Loading Pokémon Showdown…</div>';
	}
	document.getElementById('title').textContent = title;
	if (picker && s.mode !== 'teambuilder') view.insertAdjacentHTML('beforeend', renderPicker(s));
	if (s.note) view.insertAdjacentHTML('afterbegin', '<div class="toast">' + esc(s.note) + '</div>');
	showKeyboard(s.kbd && s.typing ? s.typing : null);
	// The battle timer lives in the header: rarely needed, and the move screen is full
	var timer = s.mode === 'battle' && (s.controls && s.controls.buttons || []).filter(function (b) { return b.name === 'openTimer'; })[0];
	var tools = '';
	if (s.mode === 'battle') tools += '<button' + act({ kind: 'layout', big: !s.big }) + key('layout') + '>' + (s.big ? '☰ With log' : '⛶ Full battle') + '</button>';
	if (s.mode === 'battle' && !s.spectator) tools += '<button data-coachmode="1"' + key('coachmode') + '>' + COACH_LABEL[coachMode] + '</button>';
	if (s.mode === 'battle' && !s.ended && !s.spectator) tools += '<button' + act({ kind: 'open-picker', type: 'forfeit' }) + key('forfeit') + '>🏳</button>';
	if ((s.mode === 'battle' || s.mode === 'teambuilder') && s.challenges && s.challenges.length) tools += '<button class="alert"' +
		act({ kind: 'open-picker', type: 'challenges' }) + key('chals') + '>⚔ ' + s.challenges.length + '</button>';
	if (timer) tools += '<button' + act({ kind: 'click', name: 'openTimer', value: timer.value }) + key('timer') + '>⏱ Timer</button>';
	if (s.mode === 'lobby' && window.ThorPanel && ThorPanel.hideAds) tools += '<button data-hideads="1"' + key('hideads') + '>' + (ThorPanel.hideAds() ? 'Ads: hidden' : 'Ads: shown') + '</button>';
	document.getElementById('tools').innerHTML = tools;
	refocus();
}

// ── controller focus ────────────────────────────────────────────────────────────
function focusables() {
	var root = document.getElementById('sheet') || document;
	return Array.prototype.slice.call(root.querySelectorAll('button[data-act]:not([disabled]), button[data-detail], button[data-close], button[data-natures], button[data-kbdmode], button[data-coachmode], button[data-hideads]'));
}
function refocus() {
	var list = focusables();
	// Keep the focused button across updates; otherwise start on the main choice (first move, Pokémon, lead)
	var cur = list.filter(function (b) { return b.getAttribute('data-key') === focusKey; })[0] ||
		(document.getElementById('sheet') ? null : document.querySelector('.move:not([disabled]), .party button[data-act]:not([disabled]), .list button')) ||
		list[0] || null;
	list.forEach(function (b) { b.classList.toggle('focus', b === cur); });
	if (cur && cur.closest('.scroll')) cur.scrollIntoView({ block: 'nearest' });
	focusKey = cur ? cur.getAttribute('data-key') : null;
	if (window.ThorPanel) ThorPanel.wantKeys(list.length > 0);
}
function current() { return document.querySelector('button.focus'); }
function move(dir) {
	var cur = current(), list = focusables();
	if (!cur) { refocus(); return; }
	// Nearest button past this one's edge in that direction; ones lined up with it (overlapping across the
	// direction) win over closer ones off to the side.
	var a = cur.getBoundingClientRect(), best = null, bestScore = 1e9;
	list.forEach(function (b) {
		if (b === cur) return;
		var r = b.getBoundingClientRect(), along, across;
		if (dir === 'right') { along = r.left - a.right; across = Math.max(0, r.top - a.bottom, a.top - r.bottom); }
		else if (dir === 'left') { along = a.left - r.right; across = Math.max(0, r.top - a.bottom, a.top - r.bottom); }
		else if (dir === 'down') { along = r.top - a.bottom; across = Math.max(0, r.left - a.right, a.left - r.right); }
		else { along = a.top - r.bottom; across = Math.max(0, r.left - a.right, a.left - r.right); }
		if (along < -2) return;
		var score = along + across * 3;
		if (score < bestScore) { bestScore = score; best = b; }
	});
	if (best) { focusKey = best.getAttribute('data-key'); refocus(); }
}
function press(b) {
	if (!b) return;
	if (b.hasAttribute('data-close')) { if (picker) { picker = null; focusKey = null; render(); } else closeSheet(); return; }
	var a0 = b.getAttribute('data-act');
	if (a0 && a0.indexOf('"open-picker"') >= 0) { var o = JSON.parse(a0); picker = { type: o.type, ctx: o.ctx }; focusKey = null; render(); return; }
	if (picker && a0 && picker.type !== 'challenges') picker = null;
	if (b.hasAttribute('data-natures') || b.hasAttribute('data-kbdmode') || b.hasAttribute('data-coachmode') || b.hasAttribute('data-hideads')) { b.click(); return; }
	if (b.hasAttribute('data-detail')) { openSheet(parseInt(b.getAttribute('data-idx'), 10)); return; }
	if (sheetIdx != null) sheetIdx = null; // choosing from the sheet closes it
	var a = b.getAttribute('data-act');
	if (a && coachMode === 'quiz' && state && state.mode === 'battle') quizRecord(JSON.parse(a));
	if (a && window.ThorPanel) ThorPanel.act(a);
}
// Quiz: what you chose against what the coach would have chosen, scored per battle
function quizRecord(o) {
	if (o.kind !== 'click' || (o.name !== 'chooseMove' && o.name !== 'chooseSwitch')) return;
	var s = state, co = window.Coach && Coach.analyze(s);
	if (!co || co.error || (quiz && quiz.id === s.id && quiz.turn === s.turn)) return;
	var choice = { kind: o.name === 'chooseMove' ? 'move' : 'switch', value: o.name === 'chooseMove' ? o.value : null, label: o.label || '' };
	if (choice.kind === 'switch') {
		var sw = ((s.controls || {}).switches || []).filter(function (x) { return String(x.value) === String(o.value); })[0];
		choice.value = sw ? sw.idx : o.value;
	}
	if (quizScore.id !== s.id) quizScore = { id: s.id, agree: 0, total: 0 };
	var pick = co.pick;
	var same = !!pick && choice.kind === pick.kind && String(choice.value) === String(pick.kind === 'switch' ? pick.index : pick.value);
	quizScore.total++; if (same) quizScore.agree++;
	quiz = { id: s.id, turn: s.turn, choice: choice, pick: pick, analysis: co, same: same };
	quizLast = quiz;
}

function pressNamed(names) {
	for (var i = 0; i < names.length; i++) {
		var b = focusables().filter(function (x) { return (x.getAttribute('data-act') || '').indexOf('"' + names[i] + '"') >= 0; })[0];
		if (b) { press(b); return true; }
	}
	return false;
}
// A = choose, B = undo / close, X = details of the highlighted Pokémon, Y = Terastallize (or the battle's other
// gimmick), R1 = skip the turn's animations
var LEGEND = '🎮 A choose · B undo · X details · Y Tera · R1 skip turn';
window.thorKey = function (k) {
	if (state && state.mode === 'teambuilder') {
		// Teambuilder: B = delete a letter while searching, else back; X = keyboard on/off
		if (k === 'b') { if (state.view === 'set' && state.query) ThorPanel.act(JSON.stringify({ kind: 'key', key: 'back' })); else pressNamed(['back']); return; }
		if (k === 'x') { if (state.view === 'set') ThorPanel.act(JSON.stringify({ kind: 'kbd', on: !state.kbd })); return; }
	}
	// The coach sheet is mostly reading: up/down scroll it
	if (picker && picker.type === 'coach' && (k === 'up' || k === 'down')) {
		var rs = document.querySelector('#sheet .results'); if (rs) rs.scrollTop += k === 'down' ? 120 : -120; return;
	}
	if (k === 'up' || k === 'down' || k === 'left' || k === 'right') move(k);
	else if (k === 'a') press(current());
	else if (k === 'b') { if (picker) { picker = null; focusKey = null; render(); } else if (sheetIdx != null) closeSheet(); else pressNamed(['undoChoice', 'clearChoice']); }
	else if (k === 'x') {
		var cur = current();
		if (cur && cur.hasAttribute('data-idx')) openSheet(parseInt(cur.getAttribute('data-idx'), 10));
		else if (state && state.team) {
			var active = state.team.filter(function (t) { return t.active; })[0];
			if (active) openSheet(active.index);
		}
	}
	else if (k === 'y') { var g = document.querySelector('.gim button[data-act]'); if (g) press(g); }
	else if (k === 'r1') pressNamed(['skipTurn', 'goToEnd']);
};

var lastPhase = '';
window.thorUpdate = function (s) {
	// A new decision (next turn, forced switch, team preview) starts back on its main choice
	var c = (s && s.controls) || {};
	var phase = s && s.mode === 'teambuilder' ? 'tb:' + s.view + ':' + (s.field || '') : s ? s.mode + ':' + s.id + ':' + s.turn + ':' + (c.preview && c.preview.length ? 'p' : c.targets && c.targets.length ? 't' :
		c.moves && c.moves.length ? 'm' : c.switches && c.switches.length ? 's' : 'w') : '';
	if (phase !== lastPhase) { focusKey = null; sheetIdx = null; }
	lastPhase = phase;
	if (s && s.theme) applyTheme(s.theme);
	state = s;
	render();
};

// The page's theme: Light/Dark, the background picked in Options, and the Home menu colours Showdown derives from it
var lastTheme = '';
function applyTheme(t) {
	var k = JSON.stringify(t);
	if (k === lastTheme) return;
	lastTheme = k;
	var st = document.body.style;
	document.body.classList.toggle('dark', !!t.dark);
	if (t.bg) st.setProperty('--bgimg', t.bg); else st.removeProperty('--bgimg');
	if (t.bgc) st.setProperty('--page', t.bgc);
	(t.menu || []).forEach(function (m, i) {
		if (!m || !m.bg) return;
		st.setProperty('--mm' + (i + 1), m.bg);
		st.setProperty('--mm' + (i + 1) + 'b', m.border);
	});
}

var holdTimer = null, held = false;
document.addEventListener('pointerdown', function (e) {
	var b = e.target.closest && e.target.closest('button[data-idx]');
	held = false;
	if (!b) return;
	holdTimer = setTimeout(function () { held = true; openSheet(parseInt(b.getAttribute('data-idx'), 10)); }, 450);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
	document.addEventListener(ev, function () { clearTimeout(holdTimer); });
});
document.addEventListener('click', function (e) {
	if (held) { held = false; return; } // that was a hold: the sheet is open, don't also switch
	var b = e.target.closest && e.target.closest('button[data-act], button[data-detail], button[data-close]');
	if (!b) { if (sheetIdx != null && !(e.target.closest && e.target.closest('#sheet'))) closeSheet(); return; }
	if (b.disabled) return;
	focusKey = b.getAttribute('data-key');
	press(b);
});
document.addEventListener('click', function (e) {
	var n = e.target.closest && e.target.closest('[data-natures], [data-nature]');
	if (!n) return;
	natureOpen = n.hasAttribute('data-natures');
	lastViewHtml = '';
	render();
});
document.addEventListener('click', function (e) {
	var m = e.target.closest && e.target.closest('[data-kbdmode], [data-kbdshift]');
	if (!m) return;
	if (m.hasAttribute('data-kbdshift')) kbdShift = !kbdShift; else kbdMode = kbdMode === 'abc' ? 'num' : 'abc';
	buildKeyboard();
	if (state) showKeyboard(state.kbd && state.typing ? state.typing : null);
});
document.addEventListener('click', function (e) {
	var m = e.target.closest && e.target.closest('[data-coachmode]');
	if (!m) return;
	coachMode = coachMode === 'hints' ? 'quiz' : coachMode === 'quiz' ? 'off' : 'hints';
	try { localStorage.setItem('thorCoach', coachMode); } catch (err) {}
	focusKey = 'coachmode';
	render();
});
// "Hide ads" (lobby toolbar): saved by the app, which reloads the top screen so the change applies from the start
document.addEventListener('click', function (e) {
	var m = e.target.closest && e.target.closest('[data-hideads]');
	if (!m || !window.ThorPanel || !ThorPanel.setHideAds) return;
	ThorPanel.setHideAds(!ThorPanel.hideAds());
	focusKey = 'hideads';
	setTimeout(render, 300);
});
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// Battery next to the clock (from the app: "<percent>,<charging>")
window.thorBattery = function (v) {
	var parts = String(v).split(','), pct = parseInt(parts[0], 10), charging = parts[1] === 'true';
	var el = document.getElementById('battery');
	if (isNaN(pct)) { el.textContent = ''; return; }
	el.textContent = (charging ? '⚡' : '🔋') + pct + '%';
	el.className = !charging && pct <= 15 ? 'low' : '';
};

function tick() {
	var d = new Date();
	document.getElementById('clock').textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
}
setInterval(tick, 15000);
tick();
if (window.ThorPanel) ThorPanel.ready();
